const SPY_KEY = Symbol.for("dinou.e2e.pf.prec.dyn.defaultCalls");

export default {
  revalidate: async () => {
    (globalThis as any)[SPY_KEY] = ((globalThis as any)[SPY_KEY] || 0) + 1;
    return 3600;
  },
};

export const revalidate = 0;
