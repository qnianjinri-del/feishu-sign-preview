interface EmptyStateProps {
  onAdd: () => void;
}

export function EmptyState({ onAdd }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <strong>今天没有任务</strong>
      <span>写下一件需要完成的事</span>
      <button type="button" className="text-button" onClick={onAdd}>＋ 添加任务</button>
    </div>
  );
}
