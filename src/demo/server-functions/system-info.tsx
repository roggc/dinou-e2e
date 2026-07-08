"use server";

import { cpus, freemem, totalmem, platform, arch } from "os";

// Server function → returns a Server Component with system data
// Only available server-side: os module, process.version
export async function systemInfo() {
  await delay(600);
  const info = {
    node: process.version,
    platform: platform(),
    arch: arch(),
    cpus: cpus().length,
    freeMem: Math.round(freemem() / 1024 / 1024) + " MB",
    totalMem: Math.round(totalmem() / 1024 / 1024) + " MB",
  };

  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm" suppressHydrationWarning>
      {Object.entries(info).map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-slate-500 font-mono capitalize">{k}</dt>
          <dd className="text-slate-200 font-mono" suppressHydrationWarning>{String(v)}</dd>
        </div>
      ))}
    </dl>
  );
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
