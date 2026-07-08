"use client";

import { useRouter } from "dinou";

export default function DynamicNav({
  current,
  slugs,
}: {
  current: string;
  slugs: string[];
}) {
  const { push } = useRouter();

  return (
    <div className="flex flex-wrap gap-2">
      {slugs.map((slug) => (
        <button
          key={slug}
          onClick={() => push(`/demo/dynamic/${slug}`)}
          className={`px-3 py-1.5 rounded-lg text-sm font-mono transition-all cursor-pointer ${
            slug === current
              ? "bg-indigo-600 text-white"
              : "bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700"
          }`}
        >
          /{slug}
        </button>
      ))}
    </div>
  );
}
