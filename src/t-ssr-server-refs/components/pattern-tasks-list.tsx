"use client";

export interface PatternTaskItem {
  id: string;
  text: string;
}

// Intentionally exported as `export default` to exercise Rollup's `${fileUrl}#default`
// client manifest registration when returned from `fetchPatternTasks(scope)`.
export default function PatternTasksList({
  tasks,
  passAReadCount,
}: {
  tasks: PatternTaskItem[];
  passAReadCount: number;
}) {
  return (
    <div data-testid="tasks-list-wrapper">
      <span data-testid="pass-a-read-count">{`PassAReads:${passAReadCount}`}</span>
      {tasks.length === 0 ? (
        <p data-testid="tasks-empty">No tasks yet. Add one above!</p>
      ) : (
        <ul data-testid="tasks-list">
          {tasks.map((task) => (
            <li key={task.id} data-testid="task-item">
              {task.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

