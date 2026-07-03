import ClientButton from "./client-button";

export default async function Page({ initialMessage }: { initialMessage: string }) {
  return (
    <div style={{ padding: "40px", fontFamily: "sans-serif", background: "#111", color: "#fff", minHeight: "100vh" }}>
      <h1 style={{ color: "#a855f7" }}>Prueba de HMR en Caliente (Dinou v5)</h1>
      
      <div style={{ margin: "20px 0", padding: "20px", border: "1px solid #333", borderRadius: "8px", background: "#1e1e1e" }}>
        <h3>1. getProps en page_functions.ts</h3>
        <p style={{ color: "#10b981", fontSize: "1.1rem" }}>{initialMessage}</p>
      </div>

      <div style={{ margin: "20px 0", padding: "20px", border: "1px solid #333", borderRadius: "8px", background: "#1e1e1e" }}>
        <h3>2. Server Function en actions.ts</h3>
        <ClientButton />
      </div>
    </div>
  );
}
