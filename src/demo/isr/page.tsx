import DemoCard from "@/demo/components/demo-card";

export default function IsrPage() {
  const generatedTime = new Date().toLocaleTimeString();

  return (
    <div className="space-y-8">
      <section>
        <span className="text-xs font-mono text-emerald-400 bg-emerald-950/50 border border-emerald-900/60 px-2 py-1 rounded">
          🔄 ISR (Incremental Static Regeneration)
        </span>
        <h1 className="text-4xl font-bold text-white mt-3 mb-2">Background Revalidation</h1>
        <p className="text-slate-400">
          This page is pre-rendered statically on the server and cached. It is configured to revalidate at most once every 5 seconds.
        </p>
      </section>

      <div className="grid md:grid-cols-2 gap-6">
        <DemoCard title="ISR Generation Timestamp">
          <div className="text-center p-6 bg-slate-900/40 rounded-xl border border-slate-800 space-y-2">
            <p className="text-5xl font-mono font-bold text-emerald-400 tracking-wider">
              {generatedTime}
            </p>
            <p className="text-xs text-slate-500">
              Static HTML timestamp generated during SSR / Rebuild
            </p>
          </div>
        </DemoCard>

        <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-6 space-y-4 text-sm text-slate-300">
          <h3 className="font-semibold text-white">How to test Dinou's ISR engine:</h3>
          <ol className="list-decimal list-inside space-y-2 text-slate-400 font-mono text-xs">
            <li>
              Note the timestamp displayed on the left.
            </li>
            <li>
              Refreshed within 5 seconds: The timestamp remains <span className="text-emerald-400 font-semibold">exactly the same</span> (served directly from the static disk cache).
            </li>
            <li>
              Wait 5+ seconds and refresh: The page is still served from the <span className="text-emerald-400 font-semibold">stale cache</span>, but Dinou triggers a silent background re-compilation.
            </li>
            <li>
              Refresh again: You will see the <span className="text-emerald-400 font-semibold">updated timestamp</span> from the background compilation.
            </li>
          </ol>
        </div>
      </div>
    </div>
  );
}
