"use client";

import { useEffect, useState } from "react";

export default function LiveClock() {
  const [time, setTime] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setTime(new Date().toLocaleTimeString());
    const id = setInterval(() => {
      setTime(new Date().toLocaleTimeString());
    }, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex flex-col items-center gap-1 p-4 rounded-xl bg-slate-800 border border-slate-700">
      <p className="text-4xl font-mono font-bold text-white tabular-nums">
        {mounted ? time : "--:--:--"}
      </p>
      <p className="text-xs text-emerald-400 font-mono">
        Client Component — setInterval running in browser
      </p>
      <p className="text-xs text-slate-500">
        Returned by a Server Function, interactive after hydration
      </p>
    </div>
  );
}
