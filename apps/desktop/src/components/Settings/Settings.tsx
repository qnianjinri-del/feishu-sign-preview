import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Cloud, Download, RefreshCw, Trash2, Upload, X } from "lucide-react";
import {
  removeSyncClientToken,
  runTaskSync,
} from "../../services/syncCoordinator";
import { useTaskStore } from "../../stores/taskStore";
import { ReminderSettings } from "./ReminderSettings";

interface SettingsProps {
  onClose: () => void;
  onRunOnboarding: () => void;
}

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function Settings({ onClose, onRunOnboarding }: SettingsProps) {
  const settings = useTaskStore((state) => state.settings);
  const tasks = useTaskStore((state) => state.tasks);
  const shortcutStatus = useTaskStore((state) => state.shortcutStatus);
  const sync = useTaskStore((state) => state.sync);
  const syncRuntime = useTaskStore((state) => state.syncRuntime);
  const setTheme = useTaskStore((state) => state.setTheme);
  const setAlwaysOnTop = useTaskStore((state) => state.setAlwaysOnTop);
  const setShowCompleted = useTaskStore((state) => state.setShowCompleted);
  const setCompactMode = useTaskStore((state) => state.setCompactMode);
  const setClickThrough = useTaskStore((state) => state.setClickThrough);
  const setLaunchAtLogin = useTaskStore((state) => state.setLaunchAtLogin);
  const setShortcuts = useTaskStore((state) => state.setShortcuts);
  const setSyncEnabled = useTaskStore((state) => state.setSyncEnabled);
  const setSyncConfig = useTaskStore((state) => state.setSyncConfig);
  const acceptRemoteSnapshot = useTaskStore((state) => state.acceptRemoteSnapshot);
  const rebaseLocalChanges = useTaskStore((state) => state.rebaseLocalChanges);
  const mergeLocalWithRemote = useTaskStore((state) => state.mergeLocalWithRemote);
  const importState = useTaskStore((state) => state.importState);
  const showError = useTaskStore((state) => state.showError);
  const inputRef = useRef<HTMLInputElement>(null);
  const [windowShortcut, setWindowShortcut] = useState(settings.toggleWindowShortcut);
  const [clickShortcut, setClickShortcut] = useState(settings.toggleClickThroughShortcut);
  const [quickAddShortcut, setQuickAddShortcut] = useState(settings.quickAddShortcut);
  const [serviceUrl, setServiceUrl] = useState(settings.syncServiceUrl);
  const [pollInterval, setPollInterval] = useState(String(settings.syncPollIntervalSeconds));

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [onClose]);


  const onImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as { tasks?: unknown }).tasks)) throw new Error();
      importState(parsed);
    } catch {
      showError("导入失败：请选择有效的 FloatList JSON 文件");
    }
  };

  const saveSyncSettings = () => {
    const seconds = Number(pollInterval);
    if (!serviceUrl.trim()) {
      showError("请填写同步服务地址");
      return;
    }
    setSyncConfig(serviceUrl, Number.isFinite(seconds) ? seconds : 10);
    void runTaskSync();
  };

  const removeToken = async () => {
    try {
      await removeSyncClientToken();
      setSyncEnabled(false);
      showError("同步令牌已从 macOS 钥匙串移除");
    } catch (error) {
      showError(error instanceof Error ? error.message : "同步令牌移除失败");
    }
  };

  const toggleSync = (enabled: boolean) => {
    if (enabled && !syncRuntime.tokenConfigured) {
      showError("请先保存同步 client token");
      return;
    }
    setSyncEnabled(enabled);
    if (enabled) void runTaskSync();
  };

  const syncStatusText = syncRuntime.status === "syncing"
    ? "正在同步"
    : syncRuntime.status === "offline"
      ? "离线，修改已保留"
      : syncRuntime.status === "attention"
        ? "需要选择"
        : syncRuntime.status === "error"
          ? "同步异常"
          : settings.syncEnabled
            ? "已连接"
            : "未启用";

  return (
    <div className="settings-backdrop" role="dialog" aria-modal="true" aria-label="设置">
      <section className="settings-panel">
        <header><h2>设置</h2><button type="button" className="icon-button" aria-label="关闭设置" onClick={onClose}><X size={16} /></button></header>
        <div className="settings-scroll">
          <fieldset>
            <legend>外观</legend>
            <label className="setting-row"><span>主题</span><select value={settings.theme} onChange={(event) => setTheme(event.target.value as "system" | "light" | "dark")}><option value="system">跟随系统</option><option value="dark">暗色</option><option value="light">亮色</option></select></label>
            <label className="setting-row"><span>始终置顶</span><input type="checkbox" checked={settings.alwaysOnTop} onChange={(event) => void setAlwaysOnTop(event.target.checked)} /></label>
            <label className="setting-row"><span>显示已完成</span><input type="checkbox" checked={settings.showCompleted} onChange={(event) => setShowCompleted(event.target.checked)} /></label>
            <label className="setting-row"><span>紧凑模式</span><input type="checkbox" checked={settings.compactMode} onChange={(event) => setCompactMode(event.target.checked)} /></label>
          </fieldset>
          <fieldset>
            <legend>系统</legend>
            <label className="setting-row"><span>点击穿透</span><input type="checkbox" checked={settings.clickThrough} disabled={!shortcutStatus.clickThrough && !settings.clickThrough} onChange={(event) => void setClickThrough(event.target.checked)} /></label>
            <label className="setting-row"><span>开机启动</span><input type="checkbox" checked={settings.launchAtLogin} onChange={(event) => void setLaunchAtLogin(event.target.checked)} /></label>
          </fieldset>
          <fieldset>
            <legend>全局快捷键</legend>
            <label className="shortcut-row"><span>显示/隐藏窗口</span><input aria-label="显示隐藏窗口快捷键" value={windowShortcut} onChange={(event) => setWindowShortcut(event.target.value)} /></label>
            <label className="shortcut-row"><span>切换点击穿透</span><input aria-label="点击穿透快捷键" value={clickShortcut} onChange={(event) => setClickShortcut(event.target.value)} /></label>
            <label className="shortcut-row"><span>快速新增任务</span><input aria-label="快速新增任务快捷键" value={quickAddShortcut} onChange={(event) => setQuickAddShortcut(event.target.value)} /></label>
            <button type="button" className="secondary-button" onClick={() => setShortcuts(windowShortcut.trim(), clickShortcut.trim(), quickAddShortcut.trim())}>应用快捷键</button>
            <div className="shortcut-registration-summary" aria-label="全局快捷键注册状态">
              <span className={shortcutStatus.window ? "ready" : "failed"}>窗口 {shortcutStatus.window ? "已启用" : "不可用"}</span>
              <span className={shortcutStatus.clickThrough ? "ready" : "failed"}>穿透 {shortcutStatus.clickThrough ? "已启用" : "不可用"}</span>
              <span className={shortcutStatus.quickAdd ? "ready" : "failed"}>快速新增 {shortcutStatus.quickAdd ? "已启用" : "不可用"}</span>
            </div>
            {shortcutStatus.errors.map((error) => <p className="setting-error" key={error}>{error}</p>)}
          </fieldset>
          <ReminderSettings />
          <fieldset>
            <legend>飞书同步</legend>
            <div className={`sync-summary status-${syncRuntime.status}`}>
              <strong>{syncStatusText}</strong>
              <span>{sync.outbox.length ? `${sync.outbox.length} 项修改待提交` : "没有待提交修改"}</span>
              {sync.lastSuccessfulSyncAt && (
                <span>上次成功：{new Date(sync.lastSuccessfulSyncAt).toLocaleString()}</span>
              )}
              {syncRuntime.message && <span>{syncRuntime.message}</span>}
            </div>
            <div className="data-actions">
              <button type="button" className="primary-button" onClick={onRunOnboarding}>
                <Cloud size={14} /> 运行连接向导
              </button>
              <button
                type="button"
                className="secondary-button"
                disabled={!settings.syncEnabled || !syncRuntime.tokenConfigured || syncRuntime.status === "syncing"}
                onClick={() => void runTaskSync()}
              >
                <RefreshCw size={14} /> 立即同步
              </button>
            </div>
            <label className="setting-row">
              <span>启用同步</span>
              <input
                type="checkbox"
                checked={settings.syncEnabled}
                onChange={(event) => toggleSync(event.target.checked)}
              />
            </label>
            <details className="advanced-settings">
              <summary>高级同步设置</summary>
              <label className="shortcut-row">
                <span>同步服务地址</span>
                <input
                  aria-label="同步服务地址"
                  value={serviceUrl}
                  placeholder="https://sync.example.com"
                  onChange={(event) => setServiceUrl(event.target.value)}
                />
              </label>
              <label className="shortcut-row">
                <span>可见时轮询间隔（秒）</span>
                <input
                  aria-label="同步轮询间隔"
                  type="number"
                  min={5}
                  max={300}
                  value={pollInterval}
                  onChange={(event) => setPollInterval(event.target.value)}
                />
              </label>
              <div className="data-actions">
                <button type="button" className="secondary-button" onClick={saveSyncSettings}>保存高级设置</button>
                {syncRuntime.tokenConfigured && (
                  <button type="button" className="secondary-button danger-text" onClick={() => void removeToken()}>
                    <Trash2 size={14} /> 移除钥匙串令牌
                  </button>
                )}
              </div>
            </details>
            {syncRuntime.status === "attention" && (
              <div className="sync-decision">
                <p>
                  {syncRuntime.conflictKind === "initial"
                    ? "采用飞书会替换当前本地清单；合并会把本地独有事项上传到飞书。"
                    : "请选择采用飞书快照，或保留本地待提交修改并基于最新版本重试。"}
                </p>
                <button type="button" className="secondary-button" onClick={acceptRemoteSnapshot}>采用飞书</button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => {
                    if (syncRuntime.conflictKind === "initial") mergeLocalWithRemote();
                    else rebaseLocalChanges();
                    void runTaskSync();
                  }}
                >
                  {syncRuntime.conflictKind === "initial" ? "合并本地事项" : "保留本地并重试"}
                </button>
              </div>
            )}
            {syncRuntime.warnings.map((warning) => (
              <p className="setting-error" key={`${warning.code}-${warning.taskIds.join("-")}`}>{warning.message}</p>
            ))}
          </fieldset>
          <fieldset>
            <legend>数据</legend>
            <div className="data-actions">
              <button type="button" className="secondary-button" onClick={() => downloadJson(`floatlist-${new Date().toISOString().slice(0, 10)}.json`, { schemaVersion: 5, tasks, settings })}><Download size={14} /> 导出 JSON</button>
              <button type="button" className="secondary-button" onClick={() => inputRef.current?.click()}><Upload size={14} /> 导入 JSON</button>
              <input ref={inputRef} className="visually-hidden" type="file" accept="application/json,.json" onChange={onImport} />
            </div>
          </fieldset>
        </div>
      </section>
    </div>
  );
}
