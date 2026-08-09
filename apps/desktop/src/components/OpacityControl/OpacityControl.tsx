import { useTaskStore } from "../../stores/taskStore";

export function OpacityControl() {
  const opacity = useTaskStore((state) => state.settings.opacity);
  const setOpacity = useTaskStore((state) => state.setOpacity);
  return (
    <div className="opacity-popover popover" role="dialog" aria-label="面板透明度">
      <label htmlFor="opacity-range">透明度 <span>{Math.round(opacity * 100)}%</span></label>
      <input
        id="opacity-range"
        type="range"
        min="35"
        max="95"
        value={Math.round(opacity * 100)}
        onChange={(event) => setOpacity(Number(event.target.value) / 100)}
      />
      <div className="range-labels"><span>35%</span><span>95%</span></div>
    </div>
  );
}
