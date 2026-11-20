import { DinouCacheSlot } from "dinou/server";
import { type PageProps } from "./dinou";
import { SlotComboControls } from "../controls";

const SCOPED_STORE_KEY = Symbol.for("dinou.e2e.slot.combo.scoped.store");

function readScopedVal(kind: "id" | "combo", scope: string, fallback: string) {
  const store = (globalThis as any)[SCOPED_STORE_KEY];
  return store?.[kind]?.[scope] || fallback;
}

function ScopedIdOnlyDisplay({ scope }: { scope: string }) {
  const val = readScopedVal("id", scope, `id-v1-${scope}`);
  return <div data-testid="id-only-slot-value">{val}</div>;
}

function ScopedComboTagDisplay({ scope }: { scope: string }) {
  const val = readScopedVal("combo", scope, `combo-v1-${scope}`);
  return <div data-testid="combo-slot-value">{val}</div>;
}

export default function ScopedSlotComboPage({ params }: PageProps) {
  const scope = params.scope;
  return (
    <main data-testid="slot-combo-page" data-scope={scope}>
      <h1>Slot Tag &amp; Cold ID Revalidation ({scope})</h1>
      <DinouCacheSlot id={`e2e-id-only-slot-${scope}`} revalidate={false}>
        <ScopedIdOnlyDisplay scope={scope} />
      </DinouCacheSlot>
      <DinouCacheSlot
        id={`e2e-combo-slot-${scope}`}
        tag={`e2e-combo-primary-${scope}`}
        tags={[`e2e-combo-secondary-${scope}`]}
        revalidate={false}
      >
        <ScopedComboTagDisplay scope={scope} />
      </DinouCacheSlot>
      <SlotComboControls scope={scope} />
    </main>
  );
}
