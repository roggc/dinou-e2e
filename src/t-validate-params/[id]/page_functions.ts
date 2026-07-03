export function revalidate() {
  return 3000;
}

export function validateParams(params: { id: string }) {
  // Only allow numeric IDs
  return /^\d+$/.test(params.id);
}
