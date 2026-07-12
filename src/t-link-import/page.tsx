import { Link, ClientRedirect, getContext } from "dinou";
import ClientComponent from "./ClientComponent";

export default function Page() {
  const ctx = getContext();
  const shouldRedirect = ctx?.req?.query?.redirect === "true";

  if (shouldRedirect) {
    return <ClientRedirect to="/revalidate" />;
  }

  return (
    <div style={{ padding: "20px" }}>
      <h1>Server Component importing Link</h1>
      <Link href="/revalidate" data-testid="server-link">
        Link from Server Component
      </Link>
      <hr />
      <ClientComponent />
    </div>
  );
}
