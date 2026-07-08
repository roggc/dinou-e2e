"use client";

import { useRouter } from "dinou";
import { useState, useTransition } from "react";
import { setCookieAction, clearCookieAction } from "./actions";

export default function CookieManager() {
  const { refresh } = useRouter();
  const [isPending, startTransition] = useTransition();
  const [msg, setMsg] = useState("");

  const handleSet = () => {
    setMsg("Setting cookie...");
    startTransition(async () => {
      await setCookieAction();
      setMsg("Cookie set! Refreshing...");
      refresh();
      setMsg("");
    });
  };

  const handleClear = () => {
    setMsg("Clearing cookie...");
    startTransition(async () => {
      await clearCookieAction();
      setMsg("Cookie cleared! Refreshing...");
      refresh();
      setMsg("");
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button
          onClick={handleSet}
          disabled={isPending}
          className="px-4 py-2 text-sm rounded-lg bg-indigo-700 hover:bg-indigo-600 disabled:opacity-50 text-white font-medium transition cursor-pointer"
        >
          🔑 Set Session Cookie
        </button>
        <button
          onClick={handleClear}
          disabled={isPending}
          className="px-4 py-2 text-sm rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 font-medium transition border border-slate-700 cursor-pointer"
        >
          🗑️ Clear Cookie
        </button>
      </div>
      {msg && <p className="text-xs text-indigo-400 font-mono animate-pulse">{msg}</p>}
    </div>
  );
}
