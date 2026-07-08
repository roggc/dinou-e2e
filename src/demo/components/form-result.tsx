"use client";

import { useState } from "react";

const LEVELS: Record<string, string> = {
  Expert: "text-yellow-400",
  Advanced: "text-indigo-400",
  Intermediate: "text-emerald-400",
};

export default function FormResult({
  name,
  language,
  experience,
  score,
  level,
}: {
  name: string;
  language: string;
  experience: string;
  score: number;
  level: string;
}) {
  const [copied, setCopied] = useState(false);

  const badge = `${name} — ${level} ${language} dev (score: ${score})`;

  function copyBadge() {
    navigator.clipboard.writeText(badge).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="rounded-2xl border border-emerald-800 bg-slate-900 p-6 space-y-4">
      <div className="flex items-center gap-3">
        <span className="text-3xl">🎉</span>
        <div>
          <p className="text-white font-semibold text-lg">{name}</p>
          <p className="text-slate-400 text-sm">
            {experience} of experience with {language}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex-1 h-3 bg-slate-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-indigo-600 to-emerald-500 rounded-full transition-all duration-700"
            style={{ width: `${score}%` }}
          />
        </div>
        <span className="text-2xl font-bold text-white tabular-nums">{score}</span>
      </div>

      <p className={`text-xl font-bold ${LEVELS[level] ?? "text-white"}`}>
        Level: {level}
      </p>

      <button
        onClick={copyBadge}
        className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 active:scale-95 transition text-sm text-slate-300 cursor-pointer"
      >
        {copied ? "✅ Copied!" : "📋 Copy badge"}
      </button>

      <p className="text-xs text-emerald-400 font-mono">
        ← Client Component returned by a Server Function (FormData)
      </p>
    </div>
  );
}
