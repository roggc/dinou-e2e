import type { PageProps } from "./dinou";
import { nextRevalStamp } from "../../lib/revalStore";

export default function RevalDashboardIndexPage({ params }: PageProps) {
  const ws = params.ws;
  return (
    <main data-testid="dash-index-page-wrapper">
      <h1 data-testid="dash-index-page-stamp">
        {nextRevalStamp("DashIndexPage", ws)}
      </h1>
    </main>
  );
}
