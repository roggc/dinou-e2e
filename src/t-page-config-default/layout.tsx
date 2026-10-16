import React from "react";

export default function DefaultConfigLayout({
  children,
  layoutTitle,
  layoutMenu,
}: {
  children: React.ReactNode;
  layoutTitle?: string;
  layoutMenu?: string[];
}) {
  return (
    <div id="default-config-wrapper" style={{ padding: "20px" }}>
      <header>
        <h1 id="default-layout-title">{layoutTitle ?? "NO_LAYOUT_TITLE"}</h1>
        <ul id="default-layout-menu">
          {(layoutMenu ?? []).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </header>
      <main>{children}</main>
    </div>
  );
}
