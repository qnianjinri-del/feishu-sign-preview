import { Bell } from "lucide-react";
import { useEffect, useState } from "react";
import { checkReminderPermission, sendTestReminder, type ReminderPermission } from "../../services/notifications";
import { useTaskStore } from "../../stores/taskStore";

export function ReminderSettings() {
  const remindersEnabled = useTaskStore((state) => state.settings.remindersEnabled);
  const setRemindersEnabled = useTaskStore((state) => state.setRemindersEnabled);
  const showError = useTaskStore((state) => state.showError);
  const [permission, setPermission] = useState<ReminderPermission>("unavailable");

  useEffect(() => {
    void checkReminderPermission().then(setPermission);
  }, []);

  return (
    <fieldset>
      <legend>系统提醒</legend>
      <label className="setting-row"><span>启用任务提醒</span><input type="checkbox" checked={remindersEnabled} onChange={(event) => setRemindersEnabled(event.target.checked)} /></label>
      <div className={`notification-status ${permission}`}>
        <Bell size={14} />
        <span>{permission === "granted" ? "macOS 通知已授权" : permission === "not-granted" ? "提醒未授权；时间仍会保存" : "仅桌面应用支持系统提醒"}</span>
      </div>
      <div className="data-actions">
        <button type="button" className="secondary-button" onClick={() => void checkReminderPermission().then(setPermission)}>重新检查</button>
        <button type="button" className="secondary-button" onClick={() => void sendTestReminder().then((nextPermission) => {
          setPermission(nextPermission);
          if (nextPermission !== "granted") showError("macOS 通知未授权，请在系统设置中允许 FloatList 通知");
        })}>发送测试通知</button>
      </div>
    </fieldset>
  );
}
