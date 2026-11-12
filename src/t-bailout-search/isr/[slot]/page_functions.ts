import type { PageFunctions } from "./dinou";

export const getStaticPaths: PageFunctions["getStaticPaths"] = [
  "default",
  "chromium",
  "firefox",
  "webkit",
];
export const revalidate: PageFunctions["revalidate"] = 3;
