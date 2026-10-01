import React from "react";

export default function Layout({
  children,
  layoutTitle,
  layoutMenu,
}: {
  children: React.ReactNode;
  layoutTitle?: string;
  layoutMenu?: string[];
}) {
  return (
    <div id="layout-functions-wrapper" style={{ padding: "20px" }}>
      <header>
        <h1 id="layout-title">{layoutTitle ?? "NO_LAYOUT_TITLE"}</h1>
        <ul id="layout-menu">
          {(layoutMenu ?? []).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </header>
      <main>{children}</main>
    </div>
  );
}
