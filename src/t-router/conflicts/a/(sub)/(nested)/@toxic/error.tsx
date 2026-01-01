"use client";
// En frameworks como Next.js, error.tsx debe ser un Client Component ('use client')
// pero en Dinou depende de cómo manejes los errores.
export default function Page({ error }: any) {
  return (
    <div id="slot-error-message" style={{ color: "red" }}>
      <h3 id="slot-error-message-title">Ha ocurrido un error parcial</h3>
      <p>{error.message}</p>
    </div>
  );
}
