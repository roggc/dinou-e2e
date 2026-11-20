const SPY_KEY = Symbol.for("dinou.e2e.pf.prec.yesIsg.defaultCalls");

export const getStaticPaths = ["allowed"];

export default {
  allowISG: () => {
    (globalThis as any)[SPY_KEY] = ((globalThis as any)[SPY_KEY] || 0) + 1;
    return false;
  },
};

export const allowISG = true;
