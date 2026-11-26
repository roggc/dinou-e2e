export const ppr = false;
export const revalidate = 3600;
export function getStaticPaths() {
  return ["warm"];
}
export function getCacheTags() {
  return ["hh-cold-isg"];
}
