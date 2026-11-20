const SPY_KEY = Symbol.for("dinou.e2e.pf.prec.static.defaultCalls");

export default {
  revalidate: () => {
    (globalThis as any)[SPY_KEY] = ((globalThis as any)[SPY_KEY] || 0) + 1;
    return 60;
  },
};

export const revalidate = false;
