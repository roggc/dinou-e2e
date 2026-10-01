import {
  NamedClientCard,
  NamedClientBadge,
  MultiplierCounter,
} from "./components/named-client";

export default function Page() {
  return (
    <div>
      <h2 id="named-exports-title">Named Exports Test Page</h2>
      <NamedClientCard title="RSC Named Export Success" />
      <NamedClientBadge text="Verified Client Component" />
      <MultiplierCounter initial={2} />
      <p>
        <a id="link-to-subpage" href="/t-named-exports/sub">
          Go to Subpage
        </a>
      </p>
    </div>
  );
}
