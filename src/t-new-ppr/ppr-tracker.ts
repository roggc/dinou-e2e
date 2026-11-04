// src/test-ppr/ppr-tracker.ts
// Tracks how many times each Server Component in /test-ppr executes during build vs runtime.

const TRACKER_KEY = Symbol.for("dinou.test.ppr.tracker");

export interface PprTrackerState {
  counts: Record<string, number>;
}

export function getTracker(): PprTrackerState {
  const g = globalThis as any;
  if (!g[TRACKER_KEY]) {
    g[TRACKER_KEY] = {
      counts: {},
    };
  }
  return g[TRACKER_KEY];
}

export function incrementRenderCount(name: string): number {
  const tracker = getTracker();
  tracker.counts[name] = (tracker.counts[name] || 0) + 1;
  return tracker.counts[name];
}

export function getRenderCount(name: string): number {
  return getTracker().counts[name] || 0;
}

