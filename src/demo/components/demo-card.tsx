// Server Component — reusable card wrapper
import type { ReactNode } from "react";

export default function DemoCard({
  title,
  children,
  accent,
}: {
  title: string;
  children: ReactNode;
  accent?: string;
}) {
  return (
    <div
      className={`rounded-2xl border bg-slate-900 p-5 ${
        accent ? `border-${accent}-700` : "border-slate-800"
      }`}
    >
      <p className="text-xs text-slate-500 uppercase tracking-wider mb-3 font-mono">
        {title}
      </p>
      {children}
    </div>
  );
}
