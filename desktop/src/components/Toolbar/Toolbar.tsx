import { useState } from "react";
import { Check, Contrast, Eye, EyeOff, Minus, MoreHorizontal, Pin, PinOff } from "lucide-react";
import { useTaskStore } from "../../stores/taskStore";
import { hideWindow } from "../../services/tauriWindow";
import { quitApp } from "../../services/tray";
import { OpacityControl } from "../OpacityControl/OpacityControl";

interface ToolbarProps {
  onOpenSettings: () => void;
}

export function Toolbar({ onOpenSettings }: ToolbarProps) {
  const [open, setOpen] = useState<"opacity" | "more" | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const settings = useTaskStore((state) => state.settings);
  const completedCount = useTaskStore((state) => state.tasks.filter((task) => task.status === "done").length);
  const setAlwaysOnTop = useTaskStore((state) => state.setAlwaysOnTop);
  const setShowCompleted = useTaskStore((state) => state.setShowCompleted);
  const setCompactMode = useTaskStore((state) => state.setCompactMode);
  const setTheme = useTaskStore((state) => state.setTheme);
  const clearCompleted = useTaskStore((state) => state.clearCompleted);
  const persist = useTaskStore((state) => state.persist);

  return (
    <div className="toolbar">
      <div className="window-drag-region" data-tauri-drag-region />
      <div className="toolbar-actions">
        <button
          type="button"
          className={`icon-button${settings.alwaysOnTop ? " active" : ""}`}
          aria-label={settings.alwaysOnTop ? "关闭始终置顶" : "开启始终置顶"}
          onClick={() => void setAlwaysOnTop(!settings.alwaysOnTop)}
        >
          {settings.alwaysOnTop ? <Pin size={14} /> : <PinOff size={14} />}
        </button>
        <div className="popover-anchor">
          <button
            type="button"
            className={`icon-button${open === "opacity" ? " active" : ""}`}
            aria-label="调整透明度"
            onClick={() => setOpen(open === "opacity" ? null : "opacity")}
          >
            <Contrast size={14} />
          </button>
          {open === "opacity" && <OpacityControl />}
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label={settings.showCompleted ? "隐藏已完成任务" : "显示已完成任务"}
          onClick={() => setShowCompleted(!settings.showCompleted)}
        >
          {settings.showCompleted ? <Eye size={14} /> : <EyeOff size={14} />}
        </button>
        <div className="popover-anchor">
          <button
            type="button"
            className={`icon-button${open === "more" ? " active" : ""}`}
            aria-label="更多选项"
            onClick={() => {
              setOpen(open === "more" ? null : "more");
              setConfirmClear(false);
            }}
          >
            <MoreHorizontal size={15} />
          </button>
          {open === "more" && (
            <div className="more-menu popover" role="menu">
              <button type="button" role="menuitemcheckbox" aria-checked={settings.showCompleted} onClick={() => setShowCompleted(!settings.showCompleted)}>
                <span>{settings.showCompleted && <Check size={13} />}</span> 显示已完成任务
              </button>
              {confirmClear ? (
                <div className="confirm-clear">
                  <p>确定删除 {completedCount} 个已完成任务吗？</p>
                  <div><button type="button" onClick={() => setConfirmClear(false)}>取消</button><button type="button" className="danger-text" onClick={() => { clearCompleted(); setConfirmClear(false); setOpen(null); }}>删除</button></div>
                </div>
              ) : (
                <button type="button" role="menuitem" disabled={!completedCount} onClick={() => setConfirmClear(true)}><span /> 清除已完成任务</button>
              )}
              <button type="button" role="menuitemcheckbox" aria-checked={settings.compactMode} onClick={() => setCompactMode(!settings.compactMode)}>
                <span>{settings.compactMode && <Check size={13} />}</span> 紧凑模式
              </button>
              <div className="menu-separator" />
              <button type="button" role="menuitemradio" aria-checked={settings.theme === "system"} onClick={() => setTheme("system")}><span>{settings.theme === "system" && <Check size={13} />}</span> 跟随系统主题</button>
              <button type="button" role="menuitemradio" aria-checked={settings.theme === "dark"} onClick={() => setTheme("dark")}><span>{settings.theme === "dark" && <Check size={13} />}</span> 暗色主题</button>
              <button type="button" role="menuitemradio" aria-checked={settings.theme === "light"} onClick={() => setTheme("light")}><span>{settings.theme === "light" && <Check size={13} />}</span> 亮色主题</button>
              <div className="menu-separator" />
              <button type="button" role="menuitem" onClick={() => { setOpen(null); onOpenSettings(); }}><span /> 设置…</button>
              <button type="button" role="menuitem" onClick={() => void persist().finally(() => quitApp())}><span /> 退出 FloatList</button>
            </div>
          )}
        </div>
        <button type="button" className="icon-button" aria-label="隐藏窗口" onClick={() => void hideWindow()}>
          <Minus size={15} />
        </button>
      </div>
    </div>
  );
}
