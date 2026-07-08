import { getContext } from "dinou";
import DemoCard from "@/demo/components/demo-card";
import CookieManager from "./cookie-manager";

export default function CookiesPage() {
  const ctx = getContext();
  const cookies = ctx?.req.cookies || {};
  const headers = ctx?.req.headers || {};

  // Extract some interesting headers to display
  const displayHeaders = {
    "user-agent": headers["user-agent"],
    "accept-language": headers["accept-language"],
    host: headers["host"],
    connection: headers["connection"],
  };

  return (
    <div className="space-y-8">
      <section>
        <span className="text-xs font-mono text-indigo-400 bg-indigo-950/50 border border-indigo-900/60 px-2 py-1 rounded">
          🕵️ Proxy-Based Bailout & Context
        </span>
        <h1 className="text-4xl font-bold text-white mt-3 mb-2">Cookies & Header Spies</h1>
        <p className="text-slate-400">
          This page demonstrates how Dinou reads request metadata and manipulates response headers/cookies.
          Reading from <code>getContext()</code> during SSR flags this route as dynamic, bypassing the static HTML cache.
        </p>
      </section>

      <div className="grid md:grid-cols-2 gap-6">
        <DemoCard title="Active Cookies (req.cookies)">
          <div className="space-y-4">
            <div className="p-4 bg-slate-900/40 rounded-xl border border-slate-800 font-mono text-xs overflow-x-auto">
              <span className="text-slate-500">// Cookies received from browser</span>
              <pre className="text-emerald-400 mt-2">
                {JSON.stringify(cookies, null, 2)}
              </pre>
            </div>
            
            <CookieManager />
          </div>
        </DemoCard>

        <DemoCard title="Selected Headers (req.headers)">
          <div className="p-4 bg-slate-900/40 rounded-xl border border-slate-800 font-mono text-xs overflow-x-auto">
            <span className="text-slate-500">// HTTP request headers (spied on by Dinou proxy)</span>
            <pre className="text-amber-400 mt-2">
              {JSON.stringify(displayHeaders, null, 2)}
            </pre>
          </div>
        </DemoCard>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-5 text-xs text-slate-400 space-y-2">
        <p className="font-semibold text-slate-300">💡 Under the hood:</p>
        <p>
          Dinou's compiler runs the page render tree against a <code>createBailoutProxy</code> during the static generation phase.
          Because this page accesses <code>ctx.req.cookies</code> and <code>ctx.req.headers</code>, the proxy detects the access, triggers a "dynamic bailout" signal, and skips static page caching. This ensures the page is always rendered dynamically on each user request.
        </p>
      </div>
    </div>
  );
}
