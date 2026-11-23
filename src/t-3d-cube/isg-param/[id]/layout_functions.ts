export const ppr = true;
export const revalidate = 3600;
export function getCacheTags({ id }: { id: string }) {
  return [`cube-isg-l2-${id}`];
}
