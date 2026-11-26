import type { PageFunctions } from "dinou";

const pageConfig: PageFunctions = {
  ppr: false,
  revalidate: 3600,
  getCacheTags: () => ["er-sub1-slots"],
};

export default pageConfig;
