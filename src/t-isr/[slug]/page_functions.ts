export function revalidate() {
  return 3000;
}

export async function getProps() {
  return { timestamp: new Date().toISOString() };
}
