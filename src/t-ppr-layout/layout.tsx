import React from "react";

export const ppr = true;

export default function PprInheritedLayout({ children }: { children: React.ReactNode }) {
  return (
    <div id="ppr-layout-container" style={{ padding: 20 }}>
      <header id="ppr-layout-header">PPR Inherited Layout Header</header>
      <main>{children}</main>
    </div>
  );
}
