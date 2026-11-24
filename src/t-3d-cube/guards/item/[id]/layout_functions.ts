export const ppr = true;
export function revalidate() {
  return 3600;
}
export function validateParams({ id }: { id?: string }) {
  return typeof id === "string" && /^[a-z0-9-]+$/.test(id) && id !== "forbidden";
}
