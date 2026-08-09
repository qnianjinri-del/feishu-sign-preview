import { useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";
import { Plus } from "lucide-react";
import { useTaskStore } from "../../stores/taskStore";

interface AddTaskProps {
  focusSignal: number;
}

export function AddTask({ focusSignal }: AddTaskProps) {
  const [editing, setEditing] = useState(focusSignal > 0);
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const addTask = useTaskStore((state) => state.addTask);
  const addTasks = useTaskStore((state) => state.addTasks);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing, focusSignal]);

  const submit = () => {
    const text = value.trim();
    if (!text) return;
    addTask(text);
    setValue("");
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    } else if (event.key === "Escape") {
      setValue("");
      setEditing(false);
    }
  };

  const onPaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const text = event.clipboardData.getData("text");
    if (!text.includes("\n")) return;
    event.preventDefault();
    addTasks(text.split(/\r?\n/));
    setValue("");
  };

  return (
    <div className="add-task">
      {editing ? (
        <div className="add-input-wrap">
          <Plus size={16} aria-hidden="true" />
          <input
            ref={inputRef}
            aria-label="新任务"
            value={value}
            maxLength={4000}
            placeholder="输入任务，按 Enter 添加"
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
          />
        </div>
      ) : (
        <button type="button" className="add-button" onClick={() => setEditing(true)}>
          <Plus size={16} aria-hidden="true" /> 添加任务
        </button>
      )}
    </div>
  );
}
