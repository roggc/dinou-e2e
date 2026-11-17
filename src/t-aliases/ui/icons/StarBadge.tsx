// Decoy file inside src/t-aliases/ui/icons/:
// Must NEVER be picked for "@alias-ui/icons/StarBadge" because "@alias-ui/icons/*"
// has a longer prefix than "@alias-ui/*" even though "@alias-ui/*" is declared first!
export const STAR_BADGE_SOURCE = "WRONG_GENERIC_UI_FALLBACK";

export function StarBadge() {
  return (
    <span data-testid="alias-star-badge" data-badge-source={STAR_BADGE_SOURCE}>
      {STAR_BADGE_SOURCE}
    </span>
  );
}

