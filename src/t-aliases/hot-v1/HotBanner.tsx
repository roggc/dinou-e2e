export const HOT_ALIAS_MARKER = "HOT_ALIAS_TARGET_V1";

export function HotBanner() {
  return (
    <span data-testid="alias-hot-banner" data-hot-marker={HOT_ALIAS_MARKER}>
      {HOT_ALIAS_MARKER}
    </span>
  );
}

