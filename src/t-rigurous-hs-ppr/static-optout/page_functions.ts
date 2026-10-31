// Explicit opt-out of PPR despite parent L1 Layout exporting ppr = true
export const ppr = false;

export function getCacheTags() {
  return ["hsppr-static-optout-tag"];
}

