import type { LayoutFunctions } from "dinou";

const layoutConfig: LayoutFunctions = {
  ppr: true,
  revalidate: 3600,
  getCacheTags: () => ["er-l1"],
};

export default layoutConfig;
