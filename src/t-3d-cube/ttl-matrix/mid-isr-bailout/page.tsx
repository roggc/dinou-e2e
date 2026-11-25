import { getContext } from "dinou/server";
import { readCubeState } from "../../shared/cube-state";

export default function TtlMidIsrBailoutPage() {
  const s = readCubeState();
  if (s.ttlTriggerBailout) {
    const ctx = getContext();
    const probeCookie = String(ctx?.req?.cookies?.["ttl_probe"] || "no-cookie");
    return (
      <article id="ttl-bailout-page">
        <span id="ttl-bailout-mode">dynamic</span>
        <span id="ttl-bailout-val">{`${s.ttlBailoutSeq}:${probeCookie}`}</span>
      </article>
    );
  }
  return (
    <article id="ttl-bailout-page">
      <span id="ttl-bailout-mode">static</span>
      <span id="ttl-bailout-val">{`${s.ttlBailoutSeq}:static`}</span>
    </article>
  );
}
