import { ROUTE, type LayoutProps } from "./dinou";
import type { SlugLayoutExtraProps } from "./layout_functions";

// Notice: NO route string generic needed!
// `LayoutProps` from "./dinou" automatically infers:
// - params: { slug: string }
// - sidebar?: ReactNode (from sibling @sidebar/page.tsx)
// - orgPlan: "pro" | "free" (from SlugLayoutExtraProps)
export default function ContextualSlugLayout({
  children,
  params,
  sidebar,
  orgPlan,
}: LayoutProps<SlugLayoutExtraProps>) {
  return (
    <div
      id="ctx-slug-layout"
      data-testid="ctx-slug-layout"
      data-layout-route={ROUTE}
      data-layout-slug={params.slug}
      data-layout-plan={orgPlan}
      style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: "16px" }}
    >
      <aside id="ctx-sidebar-container">{sidebar}</aside>
      <section id="ctx-main-container">{children}</section>
    </div>
  );
}

