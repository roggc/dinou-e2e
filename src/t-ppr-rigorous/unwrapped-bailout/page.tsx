import { getContext } from "dinou";

export default function UnwrappedBailoutPprPage() {
  const ctx = getContext();
  const directCookie = ctx?.req?.cookies?.ppr_user || "unwrapped-guest";
  const renderId = `unwrapped-${Math.random().toString(36).slice(2, 9)}`;

  return (
    <div
      data-testid="unwrapped-bailout-page"
      className="p-6 max-w-4xl mx-auto space-y-3"
    >
      <div className="p-4 rounded-xl bg-slate-900 border border-orange-500/40 space-y-2">
        <h1 className="text-lg font-bold text-orange-300">
          /t-ppr-rigorous/unwrapped-bailout (Dynamic Access Outside &lt;Suspense&gt; in PPR Page)
        </h1>
        <p className="text-xs text-slate-300 font-mono">
          directCookie (outside Suspense):{" "}
          <strong data-testid="unwrapped-cookie">{directCookie}</strong> | renderId:{" "}
          <strong data-testid="unwrapped-render-id">{renderId}</strong>
        </p>
      </div>
    </div>
  );
}

