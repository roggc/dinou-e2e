import { DinouCacheSlot } from "dinou/server";
import { Link, type PageProps } from "./dinou";
import { RevalControls } from "../../../lib/RevalControls";
import { nextRevalStamp } from "../../../lib/revalStore";

export default async function RevalSettingsPage({ params }: PageProps) {
  const ws = params.ws;
  return (
    <main data-testid="settings-page-wrapper">
      <h1 data-testid="settings-page-stamp">
        {nextRevalStamp("SettingsPage", ws)}
      </h1>
      <DinouCacheSlot
        id={`settings-quota-slot-${ws}`}
        tags={[`reval-quota-slot-${ws}`]}
      >
        {async () => (
          <span data-testid="settings-quota-slot-stamp">
            {nextRevalStamp("QuotaSlot", ws)}
          </span>
        )}
      </DinouCacheSlot>
      <RevalControls ws={ws} />
      <Link data-testid="link-to-billing" to="../billing">
        Go to Billing
      </Link>
    </main>
  );
}
