import type { LayoutProps } from "./dinou";

export default function ParkedLayout({ children, banner }: LayoutProps) {
  return (
    <div data-testid="parked-layout">
      <header>{banner}</header>
      <main>{children}</main>
    </div>
  );
}

