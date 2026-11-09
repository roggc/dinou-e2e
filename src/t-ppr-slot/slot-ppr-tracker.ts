const SLOT_PPR_TRACKER_KEY = Symbol.for("dinou.test.slot.ppr.tracker");

export function incrementSlotPprCount(name: string): number {
  const g = globalThis as any;
  if (!g[SLOT_PPR_TRACKER_KEY]) {
    g[SLOT_PPR_TRACKER_KEY] = { counts: {} as Record<string, number> };
  }
  const counts = g[SLOT_PPR_TRACKER_KEY].counts;
  counts[name] = (counts[name] || 0) + 1;
  return counts[name];
}

