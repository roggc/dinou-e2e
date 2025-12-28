import { ClientComponent } from "./client-component";

export default async function Page() {
  return <ClientComponent timestamp={new Date().toISOString()} />;
}
