import type { PageFunctions } from "dinou/server";

export const ppr: PageFunctions["ppr"] = true;
export const revalidate: PageFunctions["revalidate"] = 300;
export const getCacheTags: PageFunctions["getCacheTags"] = ["test-useid-page"];

