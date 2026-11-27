import { DinouCacheSlot } from "dinou/server";
import SoakSpaControls from "./SoakSpaControls";

const slotRenderCounts = new Map<string, number>();

async function Z1SoakSlotBody({ id }: { id: string }) {
  const nextCount = (slotRenderCounts.get(id) || 0) + 1;
  // Keep even this test fixture map bounded so the fixture itself never leaks!
  if (slotRenderCounts.size > 500) {
    slotRenderCounts.clear();
  }
  slotRenderCounts.set(id, nextCount);
  return (
    <span data-testid="z1-slot-value" data-slot-id={id} data-slot-seq={nextCount}>
      {`z1-slot:${id}:seq=${nextCount}`}
    </span>
  );
}

export default function Z1SoakItemPage({ params }: { params: { id: string } }) {
  const id = String(params?.id ?? "0");
  return (
    <main data-testid="z1-item-page">
      <h1 data-testid="z1-item-id">{id}</h1>
      <DinouCacheSlot id={`z1-spa-slot-${id}`} revalidate={60}>
        <Z1SoakSlotBody id={id} />
      </DinouCacheSlot>
      <SoakSpaControls id={id} />
    </main>
  );
}
