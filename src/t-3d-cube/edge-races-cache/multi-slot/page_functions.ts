import type { PageFunctions } from "dinou";

const pageConfig: PageFunctions = {
  ppr: false,
  revalidate: 3600,
  getCacheTags: () => ["er-multi-slot"],
};

export default pageConfig;
