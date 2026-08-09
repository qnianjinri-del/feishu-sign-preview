import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Onboarding } from "../src/components/Onboarding/Onboarding";
import { resetTaskStoreForTests, useTaskStore } from "../src/stores/taskStore";
import { createDefaultState } from "../src/utils/defaults";
import { checkSyncService, verifySyncConnection } from "../src/services/syncCoordinator";

vi.mock("../src/services/syncCoordinator", () => ({
  checkSyncService: vi.fn(),
  runTaskSync: vi.fn(() => Promise.resolve()),
  verifySyncConnection: vi.fn(),
}));

describe("Onboarding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetTaskStoreForTests(createDefaultState());
    vi.mocked(checkSyncService).mockResolvedValue({ status: 200, syncConfigured: true });
    vi.mocked(verifySyncConnection).mockResolvedValue({
      version: "remote-version",
      warnings: [],
      tasks: [{ id: "remote", text: "飞书任务", status: "todo", order: 0, remoteRecordId: "rec-remote" }],
    });
  });

  it("starts locally without making a network request", async () => {
    const onClose = vi.fn();
    render(<Onboarding onClose={onClose} />);
    await userEvent.click(screen.getByRole("button", { name: /仅本地使用/ }));
    expect(checkSyncService).not.toHaveBeenCalled();
    expect(useTaskStore.getState().settings.onboardingCompleted).toBe(true);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("probes an existing gateway, validates the token, and asks before replacing local tasks", async () => {
    render(<Onboarding onClose={() => undefined} />);
    await userEvent.click(screen.getByRole("button", { name: /连接飞书/ }));
    await userEvent.clear(screen.getByLabelText("向导同步服务地址"));
    await userEvent.type(screen.getByLabelText("向导同步服务地址"), "http://127.0.0.1:3000");
    await userEvent.click(screen.getByRole("button", { name: "检查连接" }));
    await waitFor(() => expect(screen.getByText("网关已就绪，可以验证令牌")).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: "下一步" }));
    await userEvent.type(screen.getByLabelText("向导 Client token"), "x".repeat(32));
    await userEvent.click(screen.getByRole("button", { name: /验证并启用同步/ }));
    await waitFor(() => expect(screen.getByText("本地和飞书中都有任务，请选择第一次同步的处理方式。")).toBeInTheDocument());
    expect(useTaskStore.getState().syncRuntime.conflictKind).toBe("initial");
    await userEvent.click(screen.getByRole("button", { name: "采用飞书" }));
    expect(useTaskStore.getState().tasks[0]?.text).toBe("飞书任务");
    expect(useTaskStore.getState().settings.onboardingCompleted).toBe(true);
  });

  it("does not request a token when the reachable gateway is not configured", async () => {
    vi.mocked(checkSyncService).mockResolvedValueOnce({ status: 200, syncConfigured: false });
    render(<Onboarding onClose={() => undefined} />);
    await userEvent.click(screen.getByRole("button", { name: /连接飞书/ }));
    await userEvent.click(screen.getByRole("button", { name: "检查连接" }));
    expect(await screen.findByText(/网关可以访问，但尚未配置/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "下一步" })).not.toBeInTheDocument();
    expect(verifySyncConnection).not.toHaveBeenCalled();
  });

  it("keeps the wizard open and reports an invalid token", async () => {
    vi.mocked(verifySyncConnection).mockRejectedValueOnce(new Error("同步令牌无效"));
    render(<Onboarding onClose={() => undefined} />);
    await userEvent.click(screen.getByRole("button", { name: /连接飞书/ }));
    await userEvent.click(screen.getByRole("button", { name: "检查连接" }));
    await userEvent.click(await screen.findByRole("button", { name: "下一步" }));
    await userEvent.type(screen.getByLabelText("向导 Client token"), "x".repeat(32));
    await userEvent.click(screen.getByRole("button", { name: /验证并启用同步/ }));
    expect(await screen.findByText("同步令牌无效")).toBeInTheDocument();
    expect(useTaskStore.getState().settings.onboardingCompleted).toBe(false);
  });
});
