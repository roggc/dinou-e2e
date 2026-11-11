import { Link, ROUTE, type PageProps } from "./dinou";
import ClientWidget from "./ClientWidget";
import "./parked.css";

export default function ParkedIndexPage({
  tab,
}: PageProps<{ tab?: string }>) {
  // ROUTE is widened to `string` in escaped routes
  const checkWideString: string = ROUTE;
  return (
    <section>
      <h1>Parked Route ({checkWideString})</h1>
      <p>{tab ?? "none"}</p>
      <Link to="./acme/contact">Parked Contact</Link>
      <ClientWidget />
    </section>
  );
}

