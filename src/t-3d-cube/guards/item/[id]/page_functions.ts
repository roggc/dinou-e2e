import { redirect } from "dinou";

export const ppr = true;
export function revalidate() {
  return 3600;
}
export function getStaticPaths() {
  return ["allowed-1"];
}
export async function getProps({ id }: { id?: string }) {
  if (id === "bounce") {
    return redirect("/t-3d-cube/guards/landed");
  }
  return { itemId: String(id || "") };
}
