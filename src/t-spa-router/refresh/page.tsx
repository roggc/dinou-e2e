import ClientView from "./client-view";

export default async function RefreshPage() {
  // Generamos un ID único en cada renderizado del servidor
  const randomId = Math.random().toString(36).substring(7);

  return (
    <div>
      <h1>Refresh Test Page</h1>
      <p>This page generates a new ID on every server render.</p>
      <ClientView serverId={randomId} />
    </div>
  );
}
