"use client";

import type { ReactNode } from "react";

const colorMap: Record<string, string> = {
  RSC: "bg-indigo-900 text-indigo-300 border-indigo-700",
  Client: "bg-sky-900 text-sky-300 border-sky-700",
  "use server": "bg-emerald-900 text-emerald-300 border-emerald-700",
  Mixed: "bg-violet-900 text-violet-300 border-violet-700",
  "[slug]": "bg-orange-900 text-orange-300 border-orange-700",
  FormData: "bg-rose-900 text-rose-300 border-rose-700",
};

export default function Badge({ children }: { children: ReactNode }) {
  const key = String(children);
  const cls = colorMap[key] ?? "bg-slate-800 text-slate-300 border-slate-600";
  return (
    <span
      className={`text-xs font-mono px-2 py-0.5 rounded-full border whitespace-nowrap ${cls}`}
    >
      {children}
    </span>
  );
}
