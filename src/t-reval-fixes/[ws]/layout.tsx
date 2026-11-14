import type { LayoutProps } from "./dinou";

export default function RevalWorkspaceRootLayout({
  children,
  params,
}: LayoutProps) {
  return (
    <div data-testid="reval-ws-shell" data-ws={params.ws}>
      {children}
    </div>
  );
}

