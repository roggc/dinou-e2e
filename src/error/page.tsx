import { getContext } from "dinou";
import ClientTriggers from "./client-triggers";

export default function Page() {
  const ctx = getContext();
  const query = ctx?.req?.query || {};
  const isSsrCrash = query.ssr_crash === "true";
  const isSoftCrash = query.soft_crash === "true";

  // Case 1: Server Component error during initial SSR rendering
  if (isSsrCrash) {
    throw new Error("💥 Simulated Critical Server Component Crash during SSR (Initial Load)!");
  }

  // Case 2: Server Component error during soft navigation rendering
  if (isSoftCrash) {
    throw new Error("💥 Simulated Server Component Crash during Client-Side Soft Navigation!");
  }

  return (
    <div className="space-y-6">
      <section className="bg-slate-900/40 border border-slate-900 rounded-2xl p-6 backdrop-blur-sm">
        <h2 className="text-2xl font-bold text-white mb-2">Error Handling Lab</h2>
        <p className="text-slate-400 text-sm leading-relaxed">
          Welcome to the comprehensive Dinou Error Testing suite. Use the interactive triggers below to evaluate and verify how Dinou captures, isolates, and recovers from errors across various phases (SSR, soft navigation, client runtime, server functions, and parallel slots).
        </p>
      </section>

      {/* Main interactive triggers */}
      <ClientTriggers />
    </div>
  );
}
