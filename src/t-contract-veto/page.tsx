import { Link } from "./dinou";
import { VetoControls } from "./controls";

export default function ContractVetoHome() {
  return (
    <main data-testid="contract-veto-hub">
      <h1>Contract Veto Hub</h1>
      <Link href="/t-contract-veto/acme/items/1" data-testid="go-acme-item">
        Open Acme Item 1
      </Link>
      <VetoControls />
    </main>
  );
}
