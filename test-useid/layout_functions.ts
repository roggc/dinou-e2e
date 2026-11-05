import type { LayoutFunctions } from "dinou/server";

export const ppr: LayoutFunctions["ppr"] = true;
export const revalidate: LayoutFunctions["revalidate"] = 3600;
export const getCacheTags: LayoutFunctions["getCacheTags"] = ["test-useid-layout"];

