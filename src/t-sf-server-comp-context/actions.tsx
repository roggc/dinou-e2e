"use server";

import AsyncContextCard from "./AsyncContextCard";

export async function loadAsyncServerCompWithContext(
  tag: string,
  delayMs = 80
) {
  await new Promise((resolve) => setTimeout(resolve, 15));
  return <AsyncContextCard tag={tag} delayMs={delayMs} />;
}
