import { useTaskStore } from "../stores/taskStore";
import {
  SyncClientError,
  deleteSyncClientToken,
  fetchTaskSnapshot,
  hasSyncClientToken,
  probeSyncService,
  saveSyncClientToken,
  sendTaskMutations,
} from "./bitableSync";
import type { SyncProbeResult } from "./bitableSync";
import type { TaskSnapshot } from "../types/sync";

let activeSync: Promise<void> | null = null;

function canSync(): boolean {
  const state = useTaskStore.getState();
  return state.hydrated
    && state.settings.syncEnabled
    && Boolean(state.settings.syncServiceUrl)
    && state.syncRuntime.tokenConfigured
    && state.syncRuntime.status !== "attention";
}

async function performSync(): Promise<void> {
  if (!canSync()) return;
  useTaskStore.getState().markSyncStarted();

  try {
    for (let batchIndex = 0; batchIndex < 20; batchIndex += 1) {
      const state = useTaskStore.getState();
      const batch = state.sync.outbox.slice(0, 500);
      if (!batch.length) {
        const result = await fetchTaskSnapshot(
          state.settings.syncServiceUrl,
          state.sync.lastServerVersion,
        );
        if (result.notModified) state.markSyncUnchanged();
        else if (result.snapshot) state.applyRemoteSnapshot(result.snapshot);
        return;
      }

      const snapshot = await sendTaskMutations(
        state.settings.syncServiceUrl,
        state.sync.lastServerVersion,
        batch,
      );
      state.completeSync(snapshot, batch.map((mutation) => mutation.operationId));
      if (!useTaskStore.getState().sync.outbox.length) return;
    }
    useTaskStore.getState().markSyncFailure("待同步修改过多，将在下一轮继续");
  } catch (error) {
    if (error instanceof SyncClientError && error.kind === "conflict" && error.snapshot) {
      useTaskStore.getState().setSyncConflict(error.snapshot);
      return;
    }
    const message = error instanceof Error ? error.message : "同步失败";
    const offline = error instanceof SyncClientError && error.kind === "transport";
    useTaskStore.getState().markSyncFailure(message, offline);
  }
}

export function runTaskSync(): Promise<void> {
  if (!activeSync) {
    activeSync = performSync().finally(() => {
      activeSync = null;
    });
  }
  return activeSync;
}

export async function initializeSyncToken(): Promise<boolean> {
  try {
    const configured = await hasSyncClientToken();
    useTaskStore.getState().setSyncTokenConfigured(configured);
    return configured;
  } catch (error) {
    const state = useTaskStore.getState();
    if (state.settings.syncEnabled) {
      state.markSyncFailure(error instanceof Error ? error.message : "无法读取同步令牌");
    }
    return false;
  }
}

export async function configureSyncClientToken(token: string): Promise<void> {
  await saveSyncClientToken(token);
  useTaskStore.getState().setSyncTokenConfigured(true);
}

export async function removeSyncClientToken(): Promise<void> {
  await deleteSyncClientToken();
  useTaskStore.getState().setSyncTokenConfigured(false);
}

export async function checkSyncService(serviceUrl: string): Promise<SyncProbeResult> {
  return probeSyncService(serviceUrl);
}

export async function verifySyncConnection(serviceUrl: string, token: string): Promise<TaskSnapshot> {
  await saveSyncClientToken(token);
  try {
    const result = await fetchTaskSnapshot(serviceUrl);
    if (!result.snapshot) throw new SyncClientError("同步服务没有返回任务快照", "remote");
    useTaskStore.getState().setSyncTokenConfigured(true);
    return result.snapshot;
  } catch (error) {
    await deleteSyncClientToken().catch(() => undefined);
    useTaskStore.getState().setSyncTokenConfigured(false);
    throw error;
  }
}
