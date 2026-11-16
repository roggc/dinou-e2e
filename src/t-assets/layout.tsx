import type { ReactNode } from "react";
import "./assets-style.css";

export default function AssetsPipelineLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <section data-testid="t-assets-layout">{children}</section>;
}

