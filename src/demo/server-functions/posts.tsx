"use server";

// Server function with args → returns server component
export async function fetchPost(id: number) {
  await delay(900);
  const posts = [
    { id: 1, title: "Understanding RSC", body: "React Server Components allow rendering on the server, streaming the result as a Flight payload to the client." },
    { id: 2, title: "The Two-Process Model", body: "Dinou forks a child process to render HTML. The RSC payload travels via fd4 pipe, HTML returns via stdout." },
    { id: 3, title: "Proxy-Based Bailout", body: "During SSG, cookie/header/query reads are detected via JS Proxy spies. If triggered, the page becomes dynamic." },
  ];
  const post = posts.find((p) => p.id === id) ?? posts[0];

  return (
    <article className="rounded-xl bg-slate-800 border border-slate-700 p-5 space-y-2">
      <h3 className="text-white font-semibold">#{post.id}: {post.title}</h3>
      <p className="text-slate-300 text-sm leading-relaxed">{post.body}</p>
      <p className="text-xs text-indigo-400 font-mono">Server Component — no JS sent to client for this card</p>
    </article>
  );
}

// Server function → returns a server component with nested async data
export async function statsPanel() {
  const [a, b, c] = await Promise.all([
    simulateFetch("components rendered", 247),
    simulateFetch("server functions called", 89),
    simulateFetch("ms avg response time", 42),
  ]);

  return (
    <div className="grid grid-cols-3 gap-4">
      <Stat label="Components Rendered" value={a} color="indigo" />
      <Stat label="Server Fn Calls" value={b} color="emerald" />
      <Stat label="Avg Response (ms)" value={c} color="amber" />
    </div>
  );
}

async function simulateFetch(label: string, value: number) {
  await delay(Math.random() * 500 + 300);
  return value;
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  const cls: Record<string, string> = {
    indigo: "text-indigo-400 border-indigo-800",
    emerald: "text-emerald-400 border-emerald-800",
    amber: "text-amber-400 border-amber-800",
  };
  return (
    <div className={`rounded-xl bg-slate-800 border p-4 text-center ${cls[color]}`}>
      <p className="text-3xl font-bold">{value}</p>
      <p className="text-slate-400 text-xs mt-1">{label}</p>
    </div>
  );
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
