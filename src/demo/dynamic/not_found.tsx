export default function DynamicNotFound() {
  const validSlugs = ["react", "dinou", "nodejs", "express", "esbuild"];

  return (
    <div className="text-center py-20 space-y-5">
      <p className="text-6xl animate-bounce">🤔</p>
      <h1 className="text-3xl font-bold text-white">Dynamic Route Not Found</h1>
      <p className="text-slate-400 max-w-md mx-auto text-sm leading-relaxed">
        The requested dynamic parameter failed server-side validation or ISG rules. 
        Only pre-generated static paths are allowed on this route.
      </p>
      <div className="pt-2">
        <p className="text-xs text-slate-500 uppercase tracking-wider font-mono mb-3">
          Try one of the allowed slugs:
        </p>
        <div className="flex justify-center gap-3 flex-wrap max-w-md mx-auto">
          {validSlugs.map((slug) => (
            <a
              key={slug}
              href={`/demo/dynamic/${slug}`}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-950/70 border border-indigo-900/50 hover:bg-indigo-800 text-indigo-300 hover:text-white transition"
            >
              {slug}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
