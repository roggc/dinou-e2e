export const ppr = true;
export const revalidate = 3600;
export function getStaticPaths() {
  return [
    { category: "café", slug: "crème brûlée" },
    { category: "hello world", slug: "c++ guide" },
  ];
}
export function getCacheTags(params: { category: string; slug: string }) {
  return [`enc-page-${params.category}-${params.slug}`];
}
