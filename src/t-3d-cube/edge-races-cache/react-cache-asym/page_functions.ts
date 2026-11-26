import type { PageFunctions } from "dinou";

const pageConfig: PageFunctions = {
  ppr: true,
  revalidate: 3600,
  getCacheTags: () => ["er-rc-asym-page"],
};

export default pageConfig;
