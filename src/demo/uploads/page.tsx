"use client";

import { useState } from "react";
import { handleFileUpload } from "./actions";
import DemoCard from "@/demo/components/demo-card";

interface UploadResult {
  success: boolean;
  message?: string;
  name?: string;
  size?: number;
  type?: string;
  notes?: string;
  textContent?: string | null;
}

export default function UploadsPage() {
  const [result, setResult] = useState<UploadResult | null>(null);
  const [isPending, setIsPending] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsPending(true);
    setResult(null);
    try {
      const formData = new FormData(e.currentTarget);
      const res = await handleFileUpload(formData);
      setResult(res);
    } catch (err) {
      setResult({
        success: false,
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div className="space-y-8">
      <section>
        <span className="text-xs font-mono text-emerald-400 bg-emerald-950/50 border border-emerald-900/60 px-2 py-1 rounded">
          📁 File Uploads (multipart/form-data)
        </span>
        <h1 className="text-4xl font-bold text-white mt-3 mb-2">File Uploads</h1>
        <p className="text-slate-400">
          This route validates Dinou's file upload parsing in Server Functions.
        </p>
      </section>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Upload Form */}
        <DemoCard title="Upload Form">
          <form onSubmit={handleSubmit} className="space-y-4">
            <p className="text-sm text-slate-300">
              Select a text file (<code>.txt</code>, <code>.json</code>, <code>.md</code>) to upload. The Server Function will read its metadata and print its contents on the fly.
            </p>

            <div className="space-y-2">
              <label htmlFor="file" className="block text-xs font-mono text-slate-400">Select File:</label>
              <input
                id="file"
                type="file"
                name="file"
                required
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 text-sm focus:outline-none focus:border-emerald-500 file:mr-4 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-emerald-950 file:text-emerald-400 hover:file:bg-emerald-900 transition file:cursor-pointer"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="notes" className="block text-xs font-mono text-slate-400">Add Notes:</label>
              <input
                id="notes"
                type="text"
                name="notes"
                placeholder="Enter some custom notes..."
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 text-sm focus:outline-none focus:border-emerald-500 font-mono"
              />
            </div>

            <button
              type="submit"
              disabled={isPending}
              className="px-4 py-2 text-sm rounded-lg bg-emerald-700 hover:bg-emerald-600 active:scale-95 transition text-white font-medium cursor-pointer disabled:opacity-50 disabled:scale-100"
            >
              {isPending ? "Uploading & Reading..." : "📁 Upload File"}
            </button>
          </form>
        </DemoCard>

        {/* Upload Result */}
        <DemoCard title="Upload Result">
          {isPending && (
            <div className="flex flex-col items-center justify-center py-10 space-y-3">
              <div className="w-8 h-8 border-4 border-emerald-400 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-slate-400 font-mono animate-pulse">Processing file on server…</p>
            </div>
          )}

          {!isPending && !result && (
            <div className="text-center py-12 text-slate-500 font-mono text-sm border-2 border-dashed border-slate-850 rounded-xl">
              No files uploaded yet.
            </div>
          )}

          {!isPending && result && (
            <div className="space-y-4">
              {result.success ? (
                <>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 text-xs bg-emerald-950 border border-emerald-800 text-emerald-400 font-semibold font-mono rounded">
                      Success
                    </span>
                    <span className="text-xs text-slate-400 font-mono">Parsed via Multer</span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs font-mono bg-slate-950 p-4 rounded-xl border border-slate-850">
                    <div>
                      <span className="text-slate-500 block">Name:</span>
                      <span className="text-slate-300 font-semibold">{result.name}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Size:</span>
                      <span className="text-slate-300 font-semibold">{(result.size! / 1024).toFixed(2)} KB</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Type:</span>
                      <span className="text-slate-300 font-semibold">{result.type || "N/A"}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Notes:</span>
                      <span className="text-slate-300 font-semibold">{result.notes}</span>
                    </div>
                  </div>

                  {result.textContent && (
                    <div className="space-y-2">
                      <span className="text-xs text-slate-500 font-mono block">Text Content Preview (first 800 chars):</span>
                      <pre className="p-4 bg-slate-950 text-emerald-400 text-xs font-mono max-h-48 overflow-y-auto leading-relaxed border border-slate-850 rounded-xl whitespace-pre-wrap">
                        {result.textContent}
                      </pre>
                    </div>
                  )}
                </>
              ) : (
                <div className="p-4 rounded-xl border border-rose-950 bg-rose-950/20 text-rose-400 text-sm font-mono">
                  ❌ Error: {result.message}
                </div>
              )}
            </div>
          )}
        </DemoCard>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-6 space-y-4 text-sm text-slate-300">
        <h3 className="font-semibold text-white">How Dinou handles files in Server Functions:</h3>
        <ul className="list-disc list-inside space-y-2 text-xs text-slate-400 font-mono">
          <li>
            The client serializes the file data into standard <code>multipart/form-data</code>.
          </li>
          <li>
            The Express server parses the stream using <code>multer</code> and maps files to Node Buffers.
          </li>
          <li>
            The framework reconstructs standard <code>Blob</code> / <code>File</code> web API objects on the server and appends them to a new <code>FormData</code> instance.
          </li>
          <li>
            The <code>FormData</code> is passed as the first argument to the Server Function, keeping the code fully aligned with React Server Actions specifications.
          </li>
        </ul>
      </div>
    </div>
  );
}
