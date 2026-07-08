"use client";

import { useState } from "react";

export default function RandomFact({ fact }: { fact: string }) {
  const [liked, setLiked] = useState(false);

  return (
    <div className="rounded-xl bg-slate-800 border border-slate-700 p-5 space-y-3">
      <p className="text-slate-200 text-sm leading-relaxed">"{fact}"</p>
      <div className="flex items-center gap-3">
        <button
          onClick={() => setLiked((l) => !l)}
          className={`text-lg transition-transform active:scale-125 cursor-pointer ${
            liked ? "text-rose-400" : "text-slate-500 hover:text-rose-400"
          }`}
          title={liked ? "Unlike" : "Like"}
        >
          {liked ? "❤️" : "🤍"}
        </button>
        <span className="text-xs text-slate-500">
          {liked ? "Liked! (client state)" : "Like this fact?"}
        </span>
      </div>
      <p className="text-xs text-emerald-400 font-mono">
        ← This card is a Client Component returned by a Server Function
      </p>
    </div>
  );
}
