import type { PageProps } from "./dinou";
import type { GuardedPageExtraProps } from "./page_functions";

export default function ApiRefNavGuardedPage({
  profile,
}: PageProps<GuardedPageExtraProps>) {
  return (
    <main data-testid="api-nav-guarded-ok">
      Hello {profile.name}
    </main>
  );
}
