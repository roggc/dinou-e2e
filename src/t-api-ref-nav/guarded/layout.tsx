import type { LayoutProps } from "./dinou";

export default function ApiRefNavGuardedLayout({
  children,
  sidebar,
}: LayoutProps) {
  return (
    <div data-testid="api-nav-guarded-layout">
      {sidebar}
      {children}
    </div>
  );
}
