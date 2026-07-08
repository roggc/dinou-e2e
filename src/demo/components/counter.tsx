"use client";

import { useState } from "react";

export default function Counter({
  initialValue = 0,
  label = "Counter",
}: {
  initialValue?: number;
  label?: string;
}) {
  const [count, setCount] = useState(initialValue);

  return (
    <div className="flex flex-col items-center gap-3 p-4 rounded-xl bg-slate-800 border border-slate-700">
      <p className="text-xs text-slate-400 uppercase tracking-wider font-mono">
        {label}
      </p>
      <span className="text-4xl font-bold text-white tabular-nums">{count}</span>
      <div className="flex gap-2">
        <button
          onClick={() => setCount((c) => c - 1)}
          className="w-10 h-10 rounded-lg bg-slate-700 hover:bg-slate-600 active:scale-95 transition text-white text-xl font-bold cursor-pointer"
        >
          −
        </button>
        <button
          onClick={() => setCount(0)}
          className="px-4 h-10 rounded-lg bg-slate-700 hover:bg-slate-600 active:scale-95 transition text-slate-300 text-sm cursor-pointer"
        >
          Reset
        </button>
        <button
          onClick={() => setCount((c) => c + 1)}
          className="w-10 h-10 rounded-lg bg-indigo-600 hover:bg-indigo-500 active:scale-95 transition text-white text-xl font-bold cursor-pointer"
        >
          +
        </button>
      </div>
    </div>
  );
}
