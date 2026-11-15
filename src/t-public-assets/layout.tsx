import type { ReactNode } from "react";
import { PublicExportLayoutShell } from "./layout-state";

export default function PublicAssetsLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <PublicExportLayoutShell>{children}</PublicExportLayoutShell>;
}

