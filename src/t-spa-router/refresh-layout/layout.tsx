import React from "react";

export default function RefreshLayout({ children }: { children: React.ReactNode }) {
  const layoutRandomId = Math.random().toString(36).substring(7);

  return (
    <div id="refresh-layout-wrapper" style={{ border: "2px solid purple", padding: "16px" }}>
      <p>
        Layout Random ID: <strong id="layout-random-id">{layoutRandomId}</strong>
      </p>
      {children}
    </div>
  );
}
