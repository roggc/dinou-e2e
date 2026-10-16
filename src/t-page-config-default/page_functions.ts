import type { PageFunctions } from "dinou";

const pageConfig: PageFunctions = {
  getProps: async () => ({
    pageTitle: "Default Page Independent Title",
    page: 42,
  }),
  revalidate: 3600,
  getCacheTags: () => ["default-page-test-tag"],
};

export default pageConfig;
