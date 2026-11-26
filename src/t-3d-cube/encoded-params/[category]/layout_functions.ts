export const ppr = true;
export const revalidate = 3600;
export function getStaticPaths() {
  return ["café", "hello world"];
}
export function getCacheTags(params: { category: string }) {
  return [`enc-cat-${params.category}`];
}
