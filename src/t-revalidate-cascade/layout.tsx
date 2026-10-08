import React from "react";
import CascadeButtons from "./CascadeButtons";

export default function CascadeLayout({ children }: { children: React.ReactNode }) {
  return (
    <div id="cascade-layout-container" style={{ border: "2px solid green", padding: "10px" }}>
      <div data-testid="cascade-layout-timestamp">{new Date().toISOString()}</div>
      <CascadeButtons />
      {children}
    </div>
  );
}
