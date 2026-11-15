import type { ReactNode } from "react";

export default function PublicAssetsAboutLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <section data-testid="public-export-about-layout">{children}</section>
  );
}

