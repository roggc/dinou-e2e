import React from "react";

export default function HsLockedPage({ params }: { params: { code: string } }) {
  return <div id="hs-locked-page">Code: {params.code}</div>;
}

