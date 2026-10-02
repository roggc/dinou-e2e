export function revalidate() {
  return 3;
}

export function validateParams(params: { id: string }) {
  // Only allow numeric IDs
  return /^\d+$/.test(params.id);
}
