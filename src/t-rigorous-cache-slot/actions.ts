"use server";

import { revalidateTag } from "dinou/server";

const STAMPEDE_KEY = Symbol.for("dinou.e2e.rigorous.slot.stampede.counter");
if (typeof (globalThis as any)[STAMPEDE_KEY] !== "number") {
  (globalThis as any)[STAMPEDE_KEY] = 0;
}

export async function invalidateSlotTag(tag: string) {
  await revalidateTag(tag);
  return { ok: true, invalidatedTag: tag, at: Date.now() };
}

export async function pingFromInsideSlot(label: string) {
  return {
    ok: true,
    echo: `pong:${label}`,
    serverTime: Date.now(),
  };
}

export async function resetStampedeCounter() {
  (globalThis as any)[STAMPEDE_KEY] = 0;
  await revalidateTag("rig-tag-stampede");
  return { count: 0 };
}

export async function getStampedeCounter() {
  return { count: (globalThis as any)[STAMPEDE_KEY] || 0 };
}

