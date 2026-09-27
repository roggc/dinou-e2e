import { getContext } from "dinou";
import ClientTester from "./client-tester";

export default async function Page() {
  const ctx = getContext();
  const user = (ctx as any)?.user;

  return (
    <main id="plugin-test-page" style={{ padding: "2rem", fontFamily: "sans-serif" }}>
      <h1>Plugin Context Test</h1>
      <div id="ssr-user-container">
        <p>Name: <span id="ssr-user-name">{user?.name || "No User"}</span></p>
        <p>Role: <span id="ssr-user-role">{user?.role || "No Role"}</span></p>
        <p>Auth: <span id="ssr-user-authenticated">{String(Boolean(user?.authenticated))}</span></p>
      </div>
      <ClientTester />
    </main>
  );
}
