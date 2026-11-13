"use server";

import { getContext } from "dinou/server";
import {
  StreamedLevel2Button,
  StreamedNestedRunner,
} from "./StreamedNestedRunner";

export async function nestedConfirmAction(itemId: string, tag: string) {
  return `NestedConfirmed:${itemId}:${tag}`;
}

export async function nestedStatefulFormAction(
  itemId: string,
  _prevState: string,
  formData: FormData
) {
  const note = String(formData.get("note") || "");
  return `StreamForm:${itemId}:${note}`;
}

export async function pureDomFormAction(
  itemId: string,
  formData: FormData
): Promise<void> {
  const badge = String(formData.get("badge") || "none");
  const ctx = getContext();
  ctx?.res?.cookie(`sf_stream_${itemId}`, `dom-${badge}`, { path: "/" });
}

export async function level2ConfirmAction(itemId: string) {
  return `Level2Confirmed:${itemId}`;
}

export async function streamLevel2Card(itemId: string) {
  return (
    <StreamedLevel2Button
      onRunLevel2={level2ConfirmAction.bind(null, itemId)}
    />
  );
}

async function AsyncStreamBanner({ itemId }: { itemId: string }) {
  await Promise.resolve();
  return <p data-testid="async-stream-banner">{`StreamedBanner:${itemId}`}</p>;
}

export async function streamCard(itemId: string) {
  return (
    <div data-testid="streamed-card">
      <AsyncStreamBanner itemId={itemId} />
      <form action={pureDomFormAction.bind(null, itemId)}>
        <input name="badge" defaultValue="verified" type="hidden" />
        <button type="submit" data-testid="btn-pure-dom-form">
          Run Pure DOM Streamed Form
        </button>
      </form>
      <StreamedNestedRunner
        onConfirm={nestedConfirmAction.bind(null, itemId)}
        statefulAction={nestedStatefulFormAction.bind(null, itemId)}
        onStreamLevel2={streamLevel2Card.bind(null, itemId)}
      />
    </div>
  );
}

