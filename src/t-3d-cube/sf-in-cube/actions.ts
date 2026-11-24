"use server";

import { getContext } from "dinou";
import { revalidateTag } from "dinou/server";
import { readCubeState, writeCubeState } from "../shared/cube-state";

export async function sfImportedPing(tag: string) {
  const s = readCubeState();
  return {
    ok: true,
    reply: `imported:${tag}:${s.sfActionNote}`,
  };
}

export async function sfFormActionState(
  prevState: { count: number; lastMsg: string },
  formData: FormData
) {
  const msg = String(formData.get("msg") || "empty");
  const nextSlotRaw = Number(formData.get("nextSlotSeq") || 0);
  const patch: Record<string, any> = { sfActionNote: msg };
  if (nextSlotRaw > 0) {
    patch.sfPageSlotSeq = nextSlotRaw;
  }
  writeCubeState(patch);
  await revalidateTag("cube-sf-page-slot-tag");
  return {
    count: (prevState?.count || 0) + 1,
    lastMsg: msg,
  };
}

export async function sfHoleMutateAndRedirect(formData: FormData) {
  const note = String(formData.get("note") || "redirected");
  const nextL1SlotRaw = Number(formData.get("nextL1SlotSeq") || 0);
  const patch: Record<string, any> = { sfRedirectNote: note };
  if (nextL1SlotRaw > 0) {
    patch.sfL1SlotSeq = nextL1SlotRaw;
  }
  writeCubeState(patch);
  await revalidateTag("cube-sf-l1-slot-tag");
  const ctx = getContext();
  if (ctx?.res?.redirect) {
    ctx.res.redirect("/t-3d-cube/sf-in-cube/done?from=hole");
  }
  return { redirected: true, note };
}
