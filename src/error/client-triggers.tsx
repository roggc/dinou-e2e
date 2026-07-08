"use client";

import { useState } from "react";
import { throwServerFunctionError } from "./actions";

export default function ClientTriggers() {
  const [clientCrash, setClientCrash] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState(false);

  // Case 3: Client Component crash during rendering
  if (clientCrash) {
    throw new Error("💥 Client Component crashed during render pass!");
  }

  // Case 4: Client Component event handler error
  const triggerEventHandlerError = () => {
    try {
      throw new Error("💥 Client Event Handler uncaught exception!");
    } catch (e: any) {
      alert(`Caught locally: ${e.message}\n(Event handler errors must be caught locally or bound to state)`);
    }
  };

  // Case 5: Server Function action error
  const handleServerAction = async () => {
    setActionPending(true);
    setActionError(null);
    try {
      await throwServerFunctionError();
    } catch (err: any) {
      setActionError(err.message || String(err));
    } finally {
      setActionPending(false);
    }
  };

  return (
    <div className="grid md:grid-cols-2 gap-6">
      {/* Card 1: Server Components Errors */}
      <div className="bg-slate-900/30 border border-slate-900 hover:border-slate-800 rounded-xl p-5 transition-all space-y-4">
        <h3 className="font-semibold text-rose-400 flex items-center gap-2 text-sm">
          <span className="w-2 h-2 rounded-full bg-rose-500"></span>
          Server Components Errors
        </h3>
        <p className="text-xs text-slate-400 leading-relaxed">
          Test failures thrown inside Server Components. This validates if the router falls back to the layout's custom <code>error.tsx</code> page.
        </p>
        <div className="flex flex-col gap-2 pt-2">
          <a
            href="/error?ssr_crash=true"
            className="w-full text-center px-4 py-2.5 rounded-lg bg-rose-950/60 hover:bg-rose-900/60 text-rose-200 border border-rose-900/50 hover:border-rose-700/60 transition-all font-medium text-xs cursor-pointer text-decoration-none"
          >
            1. Trigger SSR Crash (Hard Reload)
          </a>
          <a
            href="/error?ssr_crash=true&double_crash=true"
            className="w-full text-center px-4 py-2.5 rounded-lg bg-rose-950/30 hover:bg-rose-950/50 text-rose-300 border border-rose-900/30 hover:border-rose-900/60 transition-all font-medium text-[10px] cursor-pointer text-decoration-none"
          >
            1b. Trigger SSR Double Crash (Crashes custom error page)
          </a>
          <a
            href="/error?soft_crash=true"
            className="w-full text-center px-4 py-2.5 rounded-lg bg-rose-950/60 hover:bg-rose-900/60 text-rose-200 border border-rose-900/50 hover:border-rose-700/60 transition-all font-medium text-xs cursor-pointer text-decoration-none"
          >
            2. Trigger Soft Navigation Crash
          </a>
          <a
            href="/error?soft_crash=true&double_crash=true"
            className="w-full text-center px-4 py-2.5 rounded-lg bg-rose-950/30 hover:bg-rose-950/50 text-rose-300 border border-rose-900/30 hover:border-rose-900/60 transition-all font-medium text-[10px] cursor-pointer text-decoration-none"
          >
            2b. Trigger Soft Nav Double Crash (Crashes custom error page)
          </a>
        </div>
      </div>

      {/* Card 2: Client Components Errors */}
      <div className="bg-slate-900/30 border border-slate-900 hover:border-slate-800 rounded-xl p-5 transition-all space-y-4">
        <h3 className="font-semibold text-rose-400 flex items-center gap-2 text-sm">
          <span className="w-2 h-2 rounded-full bg-rose-500"></span>
          Client Components Errors
        </h3>
        <p className="text-xs text-slate-400 leading-relaxed">
          Test failures originating in Client Components. This validates the client-side <code>ErrorBoundary</code> hydration and navigation reset.
        </p>
        <div className="flex flex-col gap-2 pt-2">
          <button
            onClick={() => setClientCrash(true)}
            className="w-full px-4 py-2.5 rounded-lg bg-rose-950/60 hover:bg-rose-900/60 text-rose-200 border border-rose-900/50 hover:border-rose-700/60 transition-all font-medium text-xs cursor-pointer"
          >
            3. Trigger Client Render Crash
          </button>
          <button
            onClick={triggerEventHandlerError}
            className="w-full px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 hover:border-slate-600 transition-all font-medium text-xs cursor-pointer"
          >
            4. Trigger Event Handler Exception
          </button>
        </div>
      </div>

      {/* Card 3: Server Functions (Actions) */}
      <div className="bg-slate-900/30 border border-slate-900 hover:border-slate-800 rounded-xl p-5 transition-all space-y-4 md:col-span-2">
        <h3 className="font-semibold text-rose-400 flex items-center gap-2 text-sm">
          <span className="w-2 h-2 rounded-full bg-rose-500"></span>
          Server Functions (Actions) Errors
        </h3>
        <p className="text-xs text-slate-400 leading-relaxed">
          Call a server-side action that throws an error. This verifies that the error bubbles up back to the client action caller for custom runtime recovery without crashing the router.
        </p>
        <div className="pt-2 flex flex-col sm:flex-row gap-4 items-center">
          <button
            onClick={handleServerAction}
            disabled={actionPending}
            className="w-full sm:w-auto px-5 py-2.5 rounded-lg bg-rose-700 hover:bg-rose-600 disabled:bg-rose-800 disabled:opacity-50 transition-all text-white font-semibold text-xs cursor-pointer"
          >
            {actionPending ? "Calling Server Action..." : "5. Call Server Function Action"}
          </button>
          {actionError && (
            <div className="flex-1 bg-rose-950/40 border border-rose-900/50 px-4 py-2.5 rounded-lg text-rose-300 text-xs font-mono">
              <strong>Action Rejected:</strong> {actionError}
            </div>
          )}
        </div>
      </div>

      {/* Nested Route Bubbling Navigation */}
      <div className="bg-slate-900/30 border border-slate-900 hover:border-slate-800 rounded-xl p-5 transition-all space-y-4 md:col-span-2 text-center">
        <h3 className="font-semibold text-slate-200 text-sm">Nested Route Error Boundaries</h3>
        <p className="text-xs text-slate-400">
          Verify error boundary nesting! If you click below, you'll go to a nested page that crashes, showing how parent boundaries bubble.
        </p>
        <a
          href="/error/nested"
          className="inline-block px-5 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white transition-all font-semibold text-xs cursor-pointer text-decoration-none"
        >
          Go to Nested Error Page (/error/nested)
        </a>
      </div>
    </div>
  );
}
