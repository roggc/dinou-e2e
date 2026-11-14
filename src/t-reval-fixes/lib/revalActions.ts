"use server";

import { revalidateLayout, revalidateTag } from "dinou/server";

export async function actionRevalidateCurrentLayout(): Promise<string> {
  const ok = await revalidateLayout("./");
  return `layout-self:${String(ok)}`;
}

export async function actionRevalidateParentLayout(): Promise<string> {
  const ok = await revalidateLayout("..");
  return `layout-parent:${String(ok)}`;
}

export async function actionRevalidateSiblingBillingLayout(): Promise<string> {
  const ok = await revalidateLayout("../billing");
  return `layout-billing:${String(ok)}`;
}

export async function actionRevalidateByTag(tag: string): Promise<string> {
  await revalidateTag(tag);
  return `tag:${tag}`;
}
