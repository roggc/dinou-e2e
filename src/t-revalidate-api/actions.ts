"use server";

import { revalidatePath, revalidateTag } from "dinou/server";

export async function triggerRevalidatePath() {
  await revalidatePath("/t-revalidate-api");
}

export async function triggerRevalidateTag() {
  await revalidateTag("test-reval-tag");
}

export async function triggerRevalidatePathRelative() {
  await revalidatePath("./");
}
