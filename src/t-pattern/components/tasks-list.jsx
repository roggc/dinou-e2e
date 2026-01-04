"use client";

export default function TasksList({ tasks }) {
  return tasks.map((t) => <div key={t}>{t}</div>);
}
