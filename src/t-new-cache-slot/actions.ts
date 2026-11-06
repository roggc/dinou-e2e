"use server";

import { revalidateTag } from "dinou/server";

const TRACKER_KEY = Symbol.for("dinou.test.cacheSlot.tracker");

export async function revalidateSuspenseSlotTagAction() {
  await revalidateTag("test-dyn-suspense-tag");
  return { ok: true, action: "revalidated-tag" };
}

export async function resetNewCacheSlotSuiteAction() {
  const g = globalThis as any;
  g[TRACKER_KEY] = {
    counts: {
      suspenseSlot: 0,
      unwrappedSlot: 0,
      noCacheSlot: 0,
    },
  };
  await revalidateTag("test-dyn-suspense-tag");
  await revalidateTag("test-dyn-unwrapped-tag");
  await revalidateTag("test-dyn-suspense-slot");
  await revalidateTag("test-dyn-unwrapped-slot");
  return { ok: true, action: "reset" };
}

