export const ppr = true;
export const allowISG = false;
export function revalidate() {
  return 3600;
}
export function getStaticPaths() {
  return ["known"];
}
