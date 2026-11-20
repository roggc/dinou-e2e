"use server";

import { revalidateTag } from "dinou/server";

const SCOPED_STORE_KEY = Symbol.for("dinou.e2e.slot.combo.scoped.store");

function getScopedStore(): {
  id: Record<string, string>;
  combo: Record<string, string>;
} {
  if (!(globalThis as any)[SCOPED_STORE_KEY]) {
    (globalThis as any)[SCOPED_STORE_KEY] = { id: {}, combo: {} };
  }
  return (globalThis as any)[SCOPED_STORE_KEY];
}

export async function bumpIdOnlySlotAndRevalidate(nextValue: string) {
  (globalThis as any).__E2E_ID_ONLY_SLOT_VAL__ = nextValue;
  // Clear in-memory slotRegistry to simulate a cold server restart / sibling pod
  (globalThis as any)[Symbol.for("dinou.slot.registry")]?.clear?.();
  await revalidateTag("e2e-id-only-slot");
  return { ok: true, value: nextValue };
}

export async function bumpComboSlotAndRevalidateTagProp(nextValue: string) {
  (globalThis as any).__E2E_COMBO_SLOT_VAL__ = nextValue;
  // Revalidate via the singular `tag="e2e-combo-primary"` prop (coexisting with `tags={["e2e-combo-secondary"]}`)
  await revalidateTag("e2e-combo-primary");
  return { ok: true, value: nextValue };
}

export async function bumpScopedIdOnlySlotAndRevalidate(
  scope: string,
  nextValue: string
) {
  getScopedStore().id[scope] = nextValue;
  // Clear in-memory slotRegistry to simulate a cold server restart / sibling pod
  (globalThis as any)[Symbol.for("dinou.slot.registry")]?.clear?.();
  await revalidateTag(`e2e-id-only-slot-${scope}`);
  return { ok: true, scope, value: nextValue };
}

export async function bumpScopedComboSlotAndRevalidateTagProp(
  scope: string,
  nextValue: string
) {
  getScopedStore().combo[scope] = nextValue;
  await revalidateTag(`e2e-combo-primary-${scope}`);
  return { ok: true, scope, value: nextValue };
}
