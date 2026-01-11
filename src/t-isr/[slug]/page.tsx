import ClientComponent from "./client-component";

export default async function Page({ timestamp }: { timestamp?: string }) {
  return <ClientComponent timestamp={timestamp ?? new Date().toISOString()} />;
}
