"use server";

import {
  revalidateTag,
  revalidatePage,
  revalidateLayout,
  revalidatePath,
} from "dinou/server";
import {
  getHsPprState,
  writeHsPprState,
  resetHsPprState,
  type HsPprServerState,
} from "./hsppr-state";

export async function hspprBumpKeys(keys: (keyof HsPprServerState)[]) {
  const cur = getHsPprState();
  const patch: Partial<HsPprServerState> = {};
  for (const k of keys) {
    const val = cur[k];
    if (typeof val === "number") {
      (patch as any)[k] = val + 1;
    }
  }
  return writeHsPprState(patch);
}

export async function hspprMutateState(patch: Partial<HsPprServerState>) {
  return writeHsPprState(patch);
}

export async function hspprResetAll() {
  const state = resetHsPprState();
  await revalidateLayout("/t-rigurous-hs-ppr");
  await revalidateLayout("/t-rigurous-hs-ppr/nested");
  await revalidateLayout("/t-rigurous-hs-ppr/reset-ppr");
  await revalidateLayout("/t-rigurous-hs-ppr/team/alpha");
  await revalidatePage("/t-rigurous-hs-ppr");
  await revalidatePage("/t-rigurous-hs-ppr/ppr-b");
  await revalidatePage("/t-rigurous-hs-ppr/static-optout");
  await revalidatePage("/t-rigurous-hs-ppr/nested");
  await revalidatePage("/t-rigurous-hs-ppr/reset-ppr");
  await revalidatePage("/t-rigurous-hs-ppr/no-layout-ppr");
  await revalidatePage("/t-rigurous-hs-ppr/team/alpha");
  return state;
}

export async function hspprRunRevalidateTag(tag: string) {
  await revalidateTag(tag);
  return { ok: true, tag, state: getHsPprState() };
}

export async function hspprRunRevalidatePage(targetPath: string) {
  await revalidatePage(targetPath);
  return { ok: true, targetPath, state: getHsPprState() };
}

export async function hspprRunRevalidateLayout(targetPath: string) {
  await revalidateLayout(targetPath);
  return { ok: true, targetPath, state: getHsPprState() };
}

export async function hspprRunRevalidatePath(targetPath: string) {
  await revalidatePath(targetPath);
  return { ok: true, targetPath, state: getHsPprState() };
}

