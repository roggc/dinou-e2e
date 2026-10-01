import {
  NamedClientBadge,
  MultiplierCounter,
} from "../components/named-client";

export default function SubPage() {
  return (
    <div>
      <h2 id="named-exports-sub-title">Named Exports Subpage</h2>
      <NamedClientBadge text="Subpage Badge" />
      <MultiplierCounter initial={5} />
      <p>
        <a id="link-back-main" href="/t-named-exports">
          Go Back
        </a>
      </p>
    </div>
  );
}
