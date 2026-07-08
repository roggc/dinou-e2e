import { getContext, redirect } from "dinou";
import { triggerRedirectAction } from "./actions";
import DemoCard from "@/demo/components/demo-card";

export default function RedirectsPage() {
  const ctx = getContext();
  const query = ctx?.req.query || {};

  // 1. SSR Redirect Test (Runs during Server Component render)
  if (query.trigger === "ssr") {
    return redirect("/demo/cookies");
  }

  return (
    <div className="space-y-8">
      <section>
        <span className="text-xs font-mono text-indigo-400 bg-indigo-950/50 border border-indigo-900/60 px-2 py-1 rounded">
          🔀 Universal Redirections
        </span>
        <h1 className="text-4xl font-bold text-white mt-3 mb-2">Redirections</h1>
        <p className="text-slate-400">
          This page tests Dinou's redirection engine across SSR renders, RSC streams, and Server Functions.
        </p>
      </section>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Test 1: SSR Render Redirection */}
        <DemoCard title="SSR Render Redirection">
          <div className="space-y-4">
            <p className="text-sm text-slate-300">
              Clicking the button below requests this route with <code>?trigger=ssr</code>. The Server Component intercepts this on the server and issues a clean HTTP 302 redirect directly to <strong>Cookies & Spies</strong>.
            </p>
            <a
              href="/demo/redirects?trigger=ssr"
              className="inline-block px-4 py-2 text-sm rounded-lg bg-indigo-650 hover:bg-indigo-600 active:scale-95 transition text-white font-medium cursor-pointer"
            >
              🚀 Trigger SSR Redirect
            </a>
          </div>
        </DemoCard>

        {/* Test 2: Server Action Redirection */}
        <DemoCard title="Server Action Redirection">
          <form action={triggerRedirectAction} className="space-y-4">
            <p className="text-sm text-slate-300">
              Submitting the form calls a Server Function (Server Action). The Server Action processes the request and throws a redirect command, which the framework intercepts to navigate the browser client-side.
            </p>
            
            <div className="space-y-2">
              <label htmlFor="destination" className="block text-xs font-mono text-slate-400">Select Destination:</label>
              <select
                id="destination"
                name="destination"
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 text-sm focus:outline-none focus:border-indigo-500 font-mono"
              >
                <option value="/demo/mixed">Mixed Patterns (/demo/mixed)</option>
                <option value="/demo/client-components">Client Components (/demo/client-components)</option>
              </select>
            </div>

            <button
              type="submit"
              className="px-4 py-2 text-sm rounded-lg bg-indigo-650 hover:bg-indigo-600 active:scale-95 transition text-white font-medium cursor-pointer"
            >
              🔄 Submit Action & Redirect
            </button>
          </form>
        </DemoCard>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-6 space-y-4 text-sm text-slate-300">
        <h3 className="font-semibold text-white">How Dinou's Redirections work under the hood:</h3>
        <ul className="list-disc list-inside space-y-2 text-xs text-slate-400 font-mono">
          <li>
            <strong>SSR Phase</strong>: Before headers are sent, `redirect()` redirects using Express's `res.redirect()` for optimal SEO and loading speed.
          </li>
          <li>
            <strong>RSC Streaming</strong>: If the stream has started, the server injects a custom <code>&lt;ClientRedirect&gt;</code> component that triggers a client-side relocation.
          </li>
          <li>
            <strong>Server Actions</strong>: When a server function redirects, it throws an internal redirect packet, which Express catches and serializes in the RSC stream as a navigation command.
          </li>
        </ul>
      </div>
    </div>
  );
}
