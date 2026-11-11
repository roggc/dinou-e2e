import type { PageFunctions } from "./dinou";

export const getStaticPaths: PageFunctions["getStaticPaths"] = () => [
  { slug: "acme" },
  { slug: "beta" },
];

