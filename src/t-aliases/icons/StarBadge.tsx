export const STAR_BADGE_SOURCE = "SPECIFIC_ICONS_OVERRIDE_OK";

export function StarBadge() {
  return (
    <span data-testid="alias-star-badge" data-badge-source={STAR_BADGE_SOURCE}>
      {STAR_BADGE_SOURCE}
    </span>
  );
}

