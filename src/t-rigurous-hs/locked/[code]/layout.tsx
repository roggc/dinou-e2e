import React from "react";

export default function HsLockedLayout({
  children,
  lockedLabel,
}: {
  children: React.ReactNode;
  lockedLabel?: string;
}) {
  return (
    <div id="hs-locked-layout">
      <div id="hs-locked-label">{lockedLabel}</div>
      {children}
    </div>
  );
}

