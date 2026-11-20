import { DinouCacheSlot } from "dinou/server";
import { SlotComboControls } from "./controls";

function IdOnlyDisplay() {
  const val = (globalThis as any).__E2E_ID_ONLY_SLOT_VAL__ || "id-v1";
  return <div data-testid="id-only-slot-value">{val}</div>;
}

function ComboTagDisplay() {
  const val = (globalThis as any).__E2E_COMBO_SLOT_VAL__ || "combo-v1";
  return <div data-testid="combo-slot-value">{val}</div>;
}

export default function SlotComboPage() {
  return (
    <main data-testid="slot-combo-page">
      <h1>Slot Tag &amp; Cold ID Revalidation</h1>
      <DinouCacheSlot id="e2e-id-only-slot" revalidate={false}>
        <IdOnlyDisplay />
      </DinouCacheSlot>
      <DinouCacheSlot
        id="e2e-combo-slot"
        tag="e2e-combo-primary"
        tags={["e2e-combo-secondary"]}
        revalidate={false}
      >
        <ComboTagDisplay />
      </DinouCacheSlot>
      <SlotComboControls />
    </main>
  );
}
