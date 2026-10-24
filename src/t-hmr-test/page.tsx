import HmrCounter from "./counter";

export default function HmrTestPage() {
  return (
    <div style={{ padding: "20px", fontFamily: "sans-serif" }}>
      <h1 id="hmr-server-title">Initial Server Title</h1>
      <p id="hmr-docs-text">
        Documentation test snippet: In Dinou, you can declare &quot;use server&quot; at the top of a file.
      </p>
      <HmrCounter />
    </div>
  );
}
