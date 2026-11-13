import type { PageFunctions } from "./dinou";

export const getStaticPaths: PageFunctions["getStaticPaths"] = ["1"];
export const revalidate: PageFunctions["revalidate"] = 3600;

