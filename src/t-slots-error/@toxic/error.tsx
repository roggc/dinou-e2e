"use client";

export default function Page({ error }: any) {
  return (
    <div id="slot-error-message" style={{ color: "red" }}>
      <h3>Ha ocurrido un error parcial</h3>
      <p>{error.message}</p>
    </div>
  );
}
