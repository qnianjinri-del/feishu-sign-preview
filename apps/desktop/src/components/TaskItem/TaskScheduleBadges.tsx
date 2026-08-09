import { useEffect, useState } from "react";
import { BellOff } from "lucide-react";
import type { Task } from "../../types/task";
import { checkReminderPermission, type ReminderPermission } from "../../services/notifications";
import { formatTaskDue, isTaskOverdue } from "../../utils/taskSchedule";

interface TaskScheduleBadgesProps {
  remindersEnabled: boolean;
  task: Task;
}

export function TaskScheduleBadges({ remindersEnabled, task }: TaskScheduleBadgesProps) {
  const [permission, setPermission] = useState<ReminderPermission>("unavailable");

  useEffect(() => {
    if (!task.reminderAt || !remindersEnabled) return;
    void checkReminderPermission().then(setPermission);
  }, [remindersEnabled, task.reminderAt]);

  if (task.priority === "none" && !task.dueDate && !task.reminderAt) return null;

  return (
    <div className="task-schedule-badges">
      {task.priority !== "none" && (
        <span className={`priority-badge ${task.priority}`}>
          {task.priority === "high" ? "高" : task.priority === "medium" ? "中" : "低"}
        </span>
      )}
      {task.dueDate && (
        <span className={`due-badge${isTaskOverdue(task) ? " overdue" : ""}`}>
          {formatTaskDue(task)}
        </span>
      )}
      {task.reminderAt && remindersEnabled && permission === "not-granted" && (
        <span className="reminder-warning"><BellOff size={10} />提醒未授权</span>
      )}
    </div>
  );
}
