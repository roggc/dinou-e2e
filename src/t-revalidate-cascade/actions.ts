"use server";

import { revalidatePath, revalidateTag } from "dinou/server";

export async function triggerRevalidateCascade() {
  await revalidatePath("/t-revalidate-cascade", { cascade: true });
}

export async function triggerRevalidateTagPage() {
  await revalidateTag("cascade-parent-tag");
}

export async function triggerRevalidateTagLayoutDefault() {
  await revalidateTag("cascade-layout-tag");
}

export async function triggerRevalidateTagLayoutCascade() {
  await revalidateTag("cascade-layout-tag", { cascade: true });
}

