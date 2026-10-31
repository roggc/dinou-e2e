"use server";

import {
  revalidateTag,
  revalidatePage,
  revalidateLayout,
  revalidatePath,
} from "dinou/server";
import {
  getHsCsState,
  writeHsCsState,
  resetHsCsState,
  type HsCsServerState,
} from "./hscs-state";

export async function hscsSlotServerAction(label: string) {
  const cur = getHsCsState();
  const next = writeHsCsState({ slotActionCalls: cur.slotActionCalls + 1 });
  return {
    ok: true,
    label,
    calls: next.slotActionCalls,
  };
}

export async function hscsBumpKeys(keys: (keyof HsCsServerState)[]) {
  const cur = getHsCsState();
  const patch: Partial<HsCsServerState> = {};
  for (const k of keys) {
    const val = cur[k];
    if (typeof val === "number") {
      (patch as any)[k] = val + 1;
    }
  }
  return writeHsCsState(patch);
}

export async function hscsMutateState(patch: Partial<HsCsServerState>) {
  return writeHsCsState(patch);
}

export async function hscsResetAll() {
  const state = resetHsCsState();
  const allSlotTags = [
    "hscs-l1-slot-tag",
    "hscs-sidebar-slot-tag",
    "hscs-shared-tag",
    "hscs-l1-outer-tag",
    "hscs-l1-inner-tag",
    "hscs-page-a-slot-tag",
    "hscs-page-a-outer-tag",
    "hscs-page-a-inner-tag",
    "hscs-page-b-slot-tag",
    "hscs-l2-slot-tag",
    "hscs-nested-page-slot-tag",
  ];
  for (const t of allSlotTags) {
    await revalidateTag(t);
  }
  await revalidateLayout("/t-rigurous-hs-cache-slot");
  await revalidateLayout("/t-rigurous-hs-cache-slot/nested");
  await revalidatePage("/t-rigurous-hs-cache-slot");
  await revalidatePage("/t-rigurous-hs-cache-slot/page-b");
  await revalidatePage("/t-rigurous-hs-cache-slot/nested");
  return state;
}

export async function hscsRunRevalidateTag(tag: string) {
  await revalidateTag(tag);
  return { ok: true, tag, state: getHsCsState() };
}

export async function hscsRunRevalidatePage(targetPath: string) {
  await revalidatePage(targetPath);
  return { ok: true, targetPath, state: getHsCsState() };
}

export async function hscsRunRevalidateLayout(targetPath: string) {
  await revalidateLayout(targetPath);
  return { ok: true, targetPath, state: getHsCsState() };
}

export async function hscsRunRevalidatePath(targetPath: string) {
  await revalidatePath(targetPath);
  return { ok: true, targetPath, state: getHsCsState() };
}
