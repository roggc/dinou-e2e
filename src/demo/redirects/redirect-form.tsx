"use client";

import { triggerRedirectAction } from "./actions";

export default function RedirectForm() {
  const handleActionSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    await triggerRedirectAction(formData);
  };

  return (
    <form onSubmit={handleActionSubmit} className="space-y-4">
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
  );
}
