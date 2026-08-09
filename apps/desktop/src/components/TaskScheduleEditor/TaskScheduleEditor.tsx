import { useMemo, useState } from "react";
import type { Task, TaskPriority } from "../../types/task";
import { ensureReminderPermission } from "../../services/notifications";
import { useTaskStore } from "../../stores/taskStore";
import {
  isoToLocalInput,
  localInputToIso,
  reminderForPreset,
  validateReminder,
} from "../../utils/taskSchedule";

interface TaskScheduleEditorProps {
  task: Task;
  onClose: () => void;
}

export function TaskScheduleEditor({ task, onClose }: TaskScheduleEditorProps) {
  const setTaskSchedule = useTaskStore((state) => state.setTaskSchedule);
  const remindersEnabled = useTaskStore((state) => state.settings.remindersEnabled);
  const showError = useTaskStore((state) => state.showError);
  const [priority, setPriority] = useState<TaskPriority>(task.priority);
  const [dueDate, setDueDate] = useState(task.dueDate ?? "");
  const [dueTime, setDueTime] = useState(task.dueTime ?? "");
  const [reminderInput, setReminderInput] = useState(isoToLocalInput(task.reminderAt));
  const [reminderDirty, setReminderDirty] = useState(false);
  const presets = dueTime
    ? [
      { value: "due", label: "到期时" },
      { value: "10m", label: "提前 10 分钟" },
      { value: "1h", label: "提前 1 小时" },
      { value: "1d", label: "提前 1 天" },
    ] as const
    : [
      { value: "day-0900", label: "当天 09:00" },
      { value: "previous-0900", label: "提前一天 09:00" },
    ] as const;

  const reminderAt = useMemo(() => localInputToIso(reminderInput), [reminderInput]);
  const validationError = reminderInput && !reminderAt
    ? "提醒时间无效"
    : validateReminder(reminderAt, { dueDate: dueDate || undefined, dueTime: dueTime || undefined });

  const save = async () => {
    let nextReminder = reminderAt;
    if (validationError) {
      const deadlineChanged = dueDate !== (task.dueDate ?? "") || dueTime !== (task.dueTime ?? "");
      if (task.reminderAt && !reminderDirty && deadlineChanged) {
        nextReminder = undefined;
        showError("截止时间已变化，原提醒已清除，请重新设置");
      } else {
        showError(validationError);
        return;
      }
    }
    setTaskSchedule(task.id, {
      priority,
      dueDate: dueDate || undefined,
      dueTime: dueDate && dueTime ? dueTime : undefined,
      reminderAt: nextReminder,
    });
    if (nextReminder && remindersEnabled) {
      const permission = await ensureReminderPermission();
      if (permission !== "granted") showError("提醒时间已保存，但 macOS 通知尚未授权");
    }
    onClose();
  };

  return (
    <section className="task-schedule-editor" aria-label="日期与提醒">
      <label>
        <span>优先级</span>
        <select value={priority} onChange={(event) => setPriority(event.target.value as TaskPriority)}>
          <option value="none">无</option>
          <option value="low">低</option>
          <option value="medium">中</option>
          <option value="high">高</option>
        </select>
      </label>
      <div className="schedule-grid">
        <label><span>截止日期</span><input type="date" value={dueDate} onChange={(event) => {
          const value = event.target.value;
          setDueDate(value);
          if (!value) setDueTime("");
        }} /></label>
        <label><span>时刻（可选）</span><input type="time" disabled={!dueDate} value={dueTime} onChange={(event) => setDueTime(event.target.value)} /></label>
      </div>
      {dueDate && (
        <div className="reminder-presets" role="group" aria-label="提醒预设">
          {presets.map((preset) => (
            <button key={preset.value} type="button" onClick={() => {
              const value = reminderForPreset(preset.value, dueDate, dueTime || undefined);
              setReminderInput(isoToLocalInput(value));
              setReminderDirty(true);
            }}>{preset.label}</button>
          ))}
        </div>
      )}
      <label>
        <span>自定义提醒（可独立设置）</span>
        <input type="datetime-local" value={reminderInput} onChange={(event) => {
          setReminderInput(event.target.value);
          setReminderDirty(true);
        }} />
      </label>
      {validationError && <p className="field-error">{validationError}</p>}
      <div className="task-detail-actions">
        <button type="button" className="primary-button" onClick={() => void save()}>保存</button>
        <button type="button" className="secondary-button" onClick={onClose}>取消</button>
      </div>
    </section>
  );
}
