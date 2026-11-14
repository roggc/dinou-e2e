// Intentionally NO "use client" directive!
// Exercises React Compiler automatic memoization on custom hooks without "use client"
// AND @babel/plugin-syntax-import-meta parity across Esbuild, Rollup & Webpack.

export interface CatalogFilterResult {
  normalizedPrefix: string;
  matchingItems: string[];
  hasImportMeta: boolean;
}

const CATALOG_SEED = [
  "pro-analytics",
  "pro-billing",
  "starter-basic",
  "vip-enterprise",
];

export function useCatalogFilter(prefix: string): CatalogFilterResult {
  const clean = prefix.trim().toLowerCase();
  const matchingItems = CATALOG_SEED.filter((item) => item.startsWith(clean));
  return {
    normalizedPrefix: clean.toUpperCase(),
    matchingItems,
    hasImportMeta: typeof import.meta === "object",
  };
}
