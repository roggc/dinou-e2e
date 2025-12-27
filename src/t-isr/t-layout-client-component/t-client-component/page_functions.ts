export function revalidate() {
  return 3000;
}

export async function getProps() {
  return { page: { timestamp: new Date().toISOString() } };
}
