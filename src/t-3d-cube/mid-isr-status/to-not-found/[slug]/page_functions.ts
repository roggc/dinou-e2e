import { readCubeState } from "../../../shared/cube-state";

export const ppr = true;
export const revalidate = 3600;

export function getStaticPaths() {
  return ["promo"];
}

export function getCacheTags({ slug }: { slug?: string }) {
  return ["cube-mis-nf", `cube-mis-nf-${slug || ""}`];
}

export function validateParams({ slug }: { slug?: string }) {
  if (slug !== "promo") return false;
  return !readCubeState().misNotFoundFlag;
}
