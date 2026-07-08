import { getContext } from "dinou";
import ClientNestedTrigger from "./client-nested-trigger";

export default function NestedPage() {
  const ctx = getContext();
  const query = ctx?.req?.query || {};
  const isNestedCrash = query.nested_crash === "true";

  if (isNestedCrash) {
    throw new Error("💥 Crash inside nested route page component!");
  }

  return (
    <div className="bg-slate-900/40 border border-slate-900 rounded-xl p-5 space-y-4">
      <div className="space-y-1">
        <h3 className="text-lg font-bold text-white">Nested Route (/error/nested)</h3>
        <p className="text-xs text-slate-400">
          This page demonstrates how nested error boundaries intercept errors or bubble up.
        </p>
      </div>

      <ClientNestedTrigger />
    </div>
  );
}
