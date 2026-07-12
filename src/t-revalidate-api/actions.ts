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

export async function triggerRevalidatePathNonExistent() {
  await revalidatePath("/this-route-does-not-exist");
}

export async function triggerRevalidateTagNonExistent() {
  await revalidateTag("this-tag-does-not-exist");
}
