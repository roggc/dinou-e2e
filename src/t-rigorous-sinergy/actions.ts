"use server";

import { revalidateTag } from "dinou/server";

export async function invalidateSynergyTag(tag: string) {
  await revalidateTag(tag);
  return {
    ok: true,
    invalidatedTag: tag,
    at: Date.now(),
  };
}

export async function echoFromPprSlotAction(message: string) {
  return {
    ok: true,
    echo: `ppr-slot-ack:${message}`,
    at: Date.now(),
  };
}

