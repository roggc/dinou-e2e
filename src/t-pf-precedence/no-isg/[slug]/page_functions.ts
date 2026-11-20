const SPY_KEY = Symbol.for("dinou.e2e.pf.prec.noIsg.defaultCalls");

export const getStaticPaths = ["allowed"];

export default {
  allowISG: async () => {
    (globalThis as any)[SPY_KEY] = ((globalThis as any)[SPY_KEY] || 0) + 1;
    return true;
  },
};

export const allowISG = false;
