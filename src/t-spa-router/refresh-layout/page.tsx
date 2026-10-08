import ClientRefreshLayoutView from "./client-view";

export default async function RefreshLayoutPage() {
  const pageRandomId = Math.random().toString(36).substring(7);

  return (
    <div>
      <h1>Refresh Layout Page</h1>
      <ClientRefreshLayoutView serverId={pageRandomId} />
    </div>
  );
}
