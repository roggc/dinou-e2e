"use server";

import LiveClock from "@/demo/components/live-clock";

// Server function → Client Component (LiveClock has setInterval)
export async function liveClock() {
  await delay(300);
  return <LiveClock />;
}

// Server function → Server Component with table data
export async function leaderboard() {
  await delay(700);
  const entries = [
    { rank: 1, name: "esbuild", score: 9800 },
    { rank: 2, name: "Rollup", score: 8500 },
    { rank: 3, name: "webpack", score: 7300 },
    { rank: 4, name: "Vite", score: 9200 },
    { rank: 5, name: "Parcel", score: 6100 },
  ].sort((a, b) => b.score - a.score).map((e, i) => ({ ...e, rank: i + 1 }));

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-slate-400 border-b border-slate-700">
          <th className="text-left py-2 pr-4 font-mono">#</th>
          <th className="text-left py-2 pr-4 font-mono">Bundler</th>
          <th className="text-right py-2 font-mono">Score</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((e) => (
          <tr key={e.rank} className="border-b border-slate-800 hover:bg-slate-800/50 transition-colors">
            <td className="py-2 pr-4 text-slate-400">{e.rank}</td>
            <td className="py-2 pr-4 text-white font-medium">{e.name}</td>
            <td className="py-2 text-right text-indigo-400 font-mono">{e.score.toLocaleString()}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
