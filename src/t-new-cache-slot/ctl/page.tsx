import { getContext, revalidateTag } from "dinou/server";

const TRACKER_KEY = Symbol.for("dinou.test.cacheSlot.tracker");

export default async function CacheSlotCtlPage() {
  const ctx = getContext();
  const op = String(ctx?.req?.query?.["op"] ?? "noop");

  if (op === "reset") {
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
  } else if (op === "revalidate-tag") {
    await revalidateTag("test-dyn-suspense-tag");
  }

  return <div data-testid="ctl-result">{op}:ok</div>;
}

