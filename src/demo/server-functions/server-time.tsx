"use server";

// Server function → returns a Server Component (plain JSX, no "use client")
export async function serverTime() {
  await delay(800);
  const now = new Date();
  return (
    <div className="flex flex-col gap-1" suppressHydrationWarning>
      <p className="text-slate-300 text-sm font-mono" suppressHydrationWarning>
        🕐 {now.toUTCString()}
      </p>
      <p className="text-slate-500 text-xs">
        Rendered on the server at request time
      </p>
    </div>
  );
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
