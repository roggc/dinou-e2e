import type { PageFunctions } from "dinou/server";

// Dynamic SSR route (ppr is NOT enabled; renders live on every request)
export const revalidate: PageFunctions["revalidate"] = 0;

