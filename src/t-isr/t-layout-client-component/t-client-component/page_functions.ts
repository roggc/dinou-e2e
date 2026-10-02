export function revalidate() {
  return 3;
}

export async function getProps() {
  return { timestamp: new Date().toISOString() };
}
