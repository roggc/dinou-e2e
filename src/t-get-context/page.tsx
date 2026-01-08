import { getContext } from "dinou";
import ClientComponent from "./client-component";
export default async function Page() {
  const ctx = getContext();
  return <ClientComponent req={ctx?.req.cookies} />;
}
