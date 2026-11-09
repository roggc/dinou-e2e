import { incrementSlotPprCount } from "../slot-ppr-tracker";

export default async function SlotPprSubPage() {
  await new Promise((r) => setTimeout(r, 5));
  const count = incrementSlotPprCount("sub-page-shell");
  return (
    <div
      data-testid="slot-ppr-sub-page"
      data-render-count={String(count)}
      className="p-2 rounded border border-slate-500/40"
    >
      Nested Sub Page Under Unconfigured Sub Layout (Render #{count})
    </div>
  );
}

