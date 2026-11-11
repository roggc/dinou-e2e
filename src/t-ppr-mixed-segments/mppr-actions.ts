"use server";

import {
  revalidateTag,
  revalidatePage,
  revalidateLayout,
  revalidatePath,
} from "dinou/server";
import {
  getMpprState,
  writeMpprState,
  resetMpprState,
  type MpprState,
} from "./mppr-state";

export async function mpprMutateState(patch: Partial<MpprState>) {
  return writeMpprState(patch);
}

export async function mpprResetAll() {
  const state = resetMpprState();
  // Revalidate slots first so cached slot payloads reset to 100
  await revalidateTag("mppr-l1-slot-tag");
  await revalidateTag("mppr-l2-hole-slot-tag");
  await revalidateTag("mppr-ftf-page-slot-tag");
  await revalidateTag("mppr-l3-slot-tag");

  // Revalidate layouts top-down
  await revalidateLayout("/t-ppr-mixed-segments");
  await revalidateLayout("/t-ppr-mixed-segments/l2-optin");
  await revalidateLayout("/t-ppr-mixed-segments/l2-optin/l3-optout");

  // Revalidate pages
  await revalidatePage("/t-ppr-mixed-segments");
  await revalidatePage("/t-ppr-mixed-segments/l2-optin");
  await revalidatePage("/t-ppr-mixed-segments/l2-optin/page-ppr");
  await revalidatePage("/t-ppr-mixed-segments/l2-optin/l3-optout");
  await revalidatePage("/t-ppr-mixed-segments/l2-optin/l3-optout/static-leaf");

  return state;
}

export async function mpprRunRevalidateTag(tag: string) {
  await revalidateTag(tag);
  return { ok: true, tag, state: getMpprState() };
}

export async function mpprRunRevalidatePage(targetPath: string) {
  await revalidatePage(targetPath);
  return { ok: true, targetPath, state: getMpprState() };
}

export async function mpprRunRevalidateLayout(targetPath: string) {
  await revalidateLayout(targetPath);
  return { ok: true, targetPath, state: getMpprState() };
}

export async function mpprRunRevalidatePath(targetPath: string) {
  await revalidatePath(targetPath);
  return { ok: true, targetPath, state: getMpprState() };
}

