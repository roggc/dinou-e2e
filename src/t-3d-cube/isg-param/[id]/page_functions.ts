export const ppr = true;
export const revalidate = 3600;
export const allowISG = true;
export function getStaticPaths() {
  return [];
}
export function getCacheTags({ id }: { id: string }) {
  return [`cube-isg-page-${id}`];
}
