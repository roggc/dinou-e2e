// Dynamic route: /demo/dynamic/[slug]
// page_functions.tsx handles getStaticPaths
import Suspense from "react-enhanced-suspense";
import { fetchPost } from "@/demo/server-functions/posts";
import { systemInfo } from "@/demo/server-functions/system-info";
import DemoCard from "@/demo/components/demo-card";
import DynamicNav from "@/demo/components/dynamic-nav";

const techSlugs: Record<string, { title: string; description: string; color: string }> = {
  react: {
    title: "React",
    description: "A JavaScript library for building user interfaces. Powers the RSC model that Dinou is built on.",
    color: "sky",
  },
  dinou: {
    title: "Dinou",
    description: "An ejectable React meta-framework. Implements RSC, SSG, ISG, ISR, file-system routing, and server functions from scratch.",
    color: "indigo",
  },
  nodejs: {
    title: "Node.js",
    description: "JavaScript runtime built on V8. Dinou runs two Node.js processes per SSR render — parent (RSC) and child (HTML).",
    color: "emerald",
  },
  express: {
    title: "Express",
    description: "Minimal web framework for Node.js. Dinou uses it as the HTTP server layer, adding RSC rendering on top.",
    color: "amber",
  },
  esbuild: {
    title: "esbuild",
    description: "Extremely fast JavaScript bundler. One of three interchangeable client bundlers supported by Dinou.",
    color: "rose",
  },
  testisg: {
    title: "ISG Test Route",
    description: "This route is generated on-demand (ISG) on the first visit and then promoted to static.",
    color: "emerald",
  },
};

export default function DynamicPage({ params }: { params: { slug: string } }) {
  const { slug } = params;
  const tech = techSlugs[slug];

  if (!tech) {
    return (
      <div className="text-center py-20">
        <p className="text-4xl mb-4">🤔</p>
        <h1 className="text-2xl font-bold text-white mb-2">Unknown slug: {slug}</h1>
        <p className="text-slate-400">Try one of: {Object.keys(techSlugs).join(", ")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section>
        <div className="flex items-center gap-3 mb-2">
          <span className="text-xs font-mono text-slate-500 bg-slate-800 px-2 py-1 rounded">
            /demo/dynamic/<strong className="text-slate-300">{slug}</strong>
          </span>
          <span className="text-xs text-slate-600">← dynamic [slug] param</span>
        </div>
        <h1 className="text-4xl font-bold text-white mb-2">{tech.title}</h1>
        <p className="text-slate-400 max-w-xl">{tech.description}</p>
      </section>

      {/* Navigate between slugs */}
      <DynamicNav current={slug} slugs={Object.keys(techSlugs)} />

      {/* Server functions still work fine inside dynamic routes */}
      <div className="grid md:grid-cols-2 gap-4">
        <DemoCard title="fetchPost(1) — server function from dynamic route">
          <Suspense
            fallback={
              <div className="flex items-center gap-2 py-2">
                <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                <span className="text-slate-500 text-sm">Loading…</span>
              </div>
            }
          >
            {fetchPost(1)}
          </Suspense>
        </DemoCard>

        <DemoCard title="systemInfo() — server function from dynamic route">
          <Suspense
            fallback={
              <div className="flex items-center gap-2 py-2">
                <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                <span className="text-slate-500 text-sm">Loading…</span>
              </div>
            }
          >
            {systemInfo()}
          </Suspense>
        </DemoCard>
      </div>

      <div className="rounded-xl bg-slate-900 border border-slate-800 p-4">
        <p className="text-xs text-slate-500 font-mono mb-1">params received by server component:</p>
        <pre className="text-emerald-400 text-sm font-mono">
          {JSON.stringify(params, null, 2)}
        </pre>
      </div>

      <div className="rounded-xl bg-slate-900 border border-slate-800 p-4 space-y-1">
        <p className="text-xs text-slate-500 font-mono">ISG Promotion Timestamp:</p>
        <p className="text-emerald-400 text-lg font-mono font-bold">{new Date().toLocaleTimeString()}</p>
      </div>


      <div className="rounded-xl bg-slate-900/50 border border-indigo-900/40 p-5 space-y-3">
        <h3 className="text-sm font-semibold text-indigo-300 uppercase tracking-wider font-mono">
          🛡️ Parameter & ISG Validation Testing
        </h3>
        <p className="text-xs text-slate-400">
          This dynamic route uses <code>allowISG = false</code> and a <code>validateParams()</code> checker in its <code>page_functions.ts</code> to prevent unwanted URL scans. Try these test links:
        </p>
        <ul className="text-xs space-y-1 font-mono">
          <li>
            ❌ <a href="/demo/dynamic/invalid123" className="text-rose-400 hover:underline">/demo/dynamic/invalid123</a> (Blocked by regex: only lowercase letters allowed → 404)
          </li>
          <li>
            ❌ <a href="/demo/dynamic/webpack" className="text-rose-400 hover:underline">/demo/dynamic/webpack</a> (Valid format, but blocked by <code>allowISG = false</code> → 404)
          </li>
          <li>
            ✅ <a href="/demo/dynamic/react" className="text-emerald-400 hover:underline">/demo/dynamic/react</a> (Valid and pre-generated → 200)
          </li>
        </ul>
      </div>
    </div>
  );
}
