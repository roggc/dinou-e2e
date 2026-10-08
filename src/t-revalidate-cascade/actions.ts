"use server";

import { revalidatePath } from "dinou/server";

export async function triggerRevalidateCascade() {
  await revalidatePath("/t-revalidate-cascade", { cascade: true });
}
