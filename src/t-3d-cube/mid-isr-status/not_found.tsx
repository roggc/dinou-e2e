import { Link } from "dinou";

export default function MidIsrStatusNotFound() {
  return (
    <div id="mis-not-found-boundary" data-not-found="true">
      <h2>Mid-ISR Custom 404 Not Found</h2>
      <Link
        id="link-mis-nf-recover"
        href="/t-3d-cube/mid-isr-status/target"
        prefetch={false}
        fresh
      >
        Back to Target
      </Link>
    </div>
  );
}
