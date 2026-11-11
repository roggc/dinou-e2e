import { Link } from "dinou";
import { ALLOWED_UNDERSCORE_FILE_VALUE } from "./_allowed-file-helper";

export default function EscapedProbePage() {
  // Compile-time dead-link verification (never rendered at runtime):
  if (false as boolean) {
    return (
      <div>
        {/* @ts-expect-error Escaped route `/t-escaped` must NOT exist in DinouRouteMap */}
        <Link href="/t-escaped">Dead Link Unprefixed</Link>
        {/* @ts-expect-error Escaped route `/_t-escaped` must NOT exist in DinouRouteMap */}
        <Link href="/_t-escaped">Dead Link Prefixed</Link>
      </div>
    );
  }

  return (
    <main>
      <h1 data-testid="probe-heading">Escaped Probe Active</h1>
      <p data-testid="probe-underscore-file">{ALLOWED_UNDERSCORE_FILE_VALUE}</p>
    </main>
  );
}

