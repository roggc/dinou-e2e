"use client";

import { useState, useRef } from "react";
import Suspense from "react-enhanced-suspense";
import { submitForm } from "@/demo/server-functions/submit-form";

export default function FormPage() {
  const [resultKey, setResultKey] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const formDataRef = useRef<FormData | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    formDataRef.current = fd;
    setSubmitting(true);
    setResultKey((k) => (k ?? 0) + 1);
    setSubmitting(false);
  }

  return (
    <div className="space-y-10">
      <section>
        <h1 className="text-3xl font-bold text-white mb-2">Form + Server Action</h1>
        <p className="text-slate-400 mb-6">
          Submitting a form to a server function that accepts{" "}
          <code className="text-rose-400 bg-slate-800 px-1.5 py-0.5 rounded text-xs">
            FormData
          </code>{" "}
          and returns a Client Component with the result. The server function
          runs server-side; the result is streamed back as an RSC payload.
        </p>
      </section>

      <div className="grid md:grid-cols-2 gap-8">
        {/* Form */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-lg font-semibold text-rose-300 mb-5">Developer Profile</h2>
          <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="name" className="block text-sm text-slate-400 mb-1">
                Your name <span className="text-rose-400">*</span>
              </label>
              <input
                id="name"
                name="name"
                type="text"
                placeholder="Ada Lovelace"
                required
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
              />
            </div>

            <div>
              <label htmlFor="language" className="block text-sm text-slate-400 mb-1">
                Favorite language
              </label>
              <select
                id="language"
                name="language"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500 transition"
              >
                <option value="TypeScript">TypeScript</option>
                <option value="JavaScript">JavaScript</option>
                <option value="Rust">Rust</option>
                <option value="Python">Python</option>
                <option value="Go">Go</option>
              </select>
            </div>

            <div>
              <label htmlFor="experience" className="block text-sm text-slate-400 mb-1">
                Years of experience
              </label>
              <select
                id="experience"
                name="experience"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500 transition"
              >
                <option value="&lt; 1 year">&lt; 1 year</option>
                <option value="1–3 years">1–3 years</option>
                <option value="3–5 years">3–5 years</option>
                <option value="5–10 years">5–10 years</option>
                <option value="10+ years">10+ years</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 rounded-lg bg-rose-700 hover:bg-rose-600 active:scale-95 transition text-white font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? "Submitting…" : "Submit to Server Function →"}
            </button>
          </form>
        </div>

        {/* Result area */}
        <div className="flex flex-col justify-center">
          {resultKey === null ? (
            <div className="rounded-2xl border border-dashed border-slate-700 p-8 text-center text-slate-500">
              <p className="text-3xl mb-3">📬</p>
              <p className="text-sm">Submit the form to see the result returned by the server function</p>
            </div>
          ) : (
            <Suspense
              fallback={
                <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8 flex items-center gap-3">
                  <div className="w-5 h-5 border-2 border-rose-500 border-t-transparent rounded-full animate-spin" />
                  <span className="text-slate-400 text-sm">Server function running…</span>
                </div>
              }
              resourceId={`form-result-${resultKey}`}
            >
              {() => submitForm(formDataRef.current!)}
            </Suspense>
          )}
        </div>
      </div>

      <div className="rounded-xl bg-slate-900 border border-slate-800 p-4">
        <p className="text-xs text-slate-500 font-mono mb-2">How it works:</p>
        <ol className="text-sm text-slate-400 space-y-1 list-decimal list-inside">
          <li>Form submits — <code className="text-rose-400">FormData</code> is captured client-side</li>
          <li>Client calls <code className="text-rose-400">submitForm(formData)</code> as a server function</li>
          <li>Dinou serializes the call as a POST to <code className="text-indigo-400">/____server_function____</code></li>
          <li>Server validates, runs the function, returns JSX as an RSC Flight payload</li>
          <li>Client deserializes the RSC payload → React renders the returned Client Component</li>
        </ol>
      </div>
    </div>
  );
}
