const SPY_REV_KEY = Symbol.for("dinou.e2e.lf.prec.defaultRevCalls");
const SPY_ISG_KEY = Symbol.for("dinou.e2e.lf.prec.defaultIsgCalls");

export const getStaticPaths = ["valid"];

export default {
  revalidate: async () => {
    (globalThis as any)[SPY_REV_KEY] = ((globalThis as any)[SPY_REV_KEY] || 0) + 1;
    return 3600;
  },
  allowISG: async () => {
    (globalThis as any)[SPY_ISG_KEY] = ((globalThis as any)[SPY_ISG_KEY] || 0) + 1;
    return true;
  },
};

export const revalidate = 0;
export const allowISG = false;
