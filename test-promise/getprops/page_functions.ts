export const revalidate = 0;

export function getProps() {
  // Strategy 12: Start query in getProps WITHOUT awaiting!
  const docPromise = new Promise<{ label: string; value: number }>((resolve) =>
    setTimeout(() => resolve({ label: "GetProps-Promise-OK", value: 99 }), 150)
  );
  return { docPromise };
}

