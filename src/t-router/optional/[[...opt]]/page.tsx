"use client";

export default function Page({ params }: any) {
  // Si es undefined o vacío, renderiza ROOT
  const val = params.opt ? JSON.stringify(params.opt) : "ROOT";
  return <div id="res">OPTIONAL:{val}</div>;
}
