// Only the outer layout declares ppr = true.
// Its @sidebar/page.tsx parallel slot inherits ppr = true from this layout segment,
// whereas unconfigured page.tsx and nested sub/layout.tsx (+ sub/@panel/page.tsx) default to ppr = false in Dinou 9.4.0.
export const ppr = true;

