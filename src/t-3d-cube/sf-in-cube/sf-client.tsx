"use client";

import { useState, useActionState } from "react";

export function SfSlotActionsCard({
  id,
  slotSeq,
  importedAction,
  boundAction,
  boundFormAction,
}: {
  id: string;
  slotSeq: number;
  importedAction: (tag: string) => Promise<{ ok: boolean; reply: string }>;
  boundAction: (clientArg: string) => Promise<string>;
  boundFormAction?: (formData: FormData) => Promise<string | void>;
}) {
  const [importedRes, setImportedRes] = useState("idle");
  const [boundRes, setBoundRes] = useState("idle");
  const [boundFormRes, setBoundFormRes] = useState("idle");

  return (
    <div id={`sf-card-${id}`} style={{ border: "1px solid #ccc", padding: 6, margin: 4 }}>
      <span id={`sf-card-seq-${id}`}>{slotSeq}</span>
      <code id={`sf-imported-res-${id}`}>{importedRes}</code>
      <button
        id={`sf-btn-imported-${id}`}
        type="button"
        onClick={async () => {
          const r = await importedAction(`${id}-${slotSeq}`);
          setImportedRes(r.reply);
        }}
      >
        Call Imported SF ({id})
      </button>
      <code id={`sf-bound-res-${id}`}>{boundRes}</code>
      <button
        id={`sf-btn-bound-${id}`}
        type="button"
        onClick={async () => {
          const r = await boundAction(`cli-${id}`);
          setBoundRes(String(r));
        }}
      >
        Call Bound Closure ({id})
      </button>
      {boundFormAction ? (
        <form
          id={`sf-bound-form-${id}`}
          action={async (fd: FormData) => {
            const res = await boundFormAction(fd);
            if (res !== undefined) {
              setBoundFormRes(String(res));
            }
          }}
        >
          <input name="extra" defaultValue={`fd-${id}`} />
          <code id={`sf-bound-form-res-${id}`}>{boundFormRes}</code>
          <button id={`sf-btn-bound-form-${id}`} type="submit">
            Submit Bound Form ({id})
          </button>
        </form>
      ) : null}
    </div>
  );
}

export function SfActionStateForm({
  action,
}: {
  action: (
    prevState: { count: number; lastMsg: string },
    formData: FormData
  ) => Promise<{ count: number; lastMsg: string }>;
}) {
  const [state, formAction, isPending] = useActionState(action, {
    count: 0,
    lastMsg: "none",
  });
  const [msg, setMsg] = useState("updated-via-useActionState");
  const [nextSlotSeq, setNextSlotSeq] = useState("701");

  return (
    <form id="sf-action-state-form" action={formAction} style={{ margin: 6 }}>
      <input
        id="sf-as-msg-input"
        name="msg"
        value={msg}
        onChange={(e) => setMsg(e.target.value)}
      />
      <input
        id="sf-as-next-slot-input"
        name="nextSlotSeq"
        value={nextSlotSeq}
        onChange={(e) => setNextSlotSeq(e.target.value)}
      />
      <button id="sf-btn-submit-action-state" type="submit" disabled={isPending}>
        Submit ActionState
      </button>
      <span id="sf-as-count">{state.count}</span>
      <span id="sf-as-msg">{state.lastMsg}</span>
    </form>
  );
}

export function SfHoleRedirectForm({
  action,
}: {
  action: (formData: FormData) => Promise<any>;
}) {
  const [note, setNote] = useState("hole-redirect-ok");
  const [nextL1SlotSeq, setNextL1SlotSeq] = useState("755");

  return (
    <form id="sf-hole-redirect-form" action={action} style={{ margin: 6 }}>
      <input
        id="sf-hole-note-input"
        name="note"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <input
        id="sf-hole-next-l1-input"
        name="nextL1SlotSeq"
        value={nextL1SlotSeq}
        onChange={(e) => setNextL1SlotSeq(e.target.value)}
      />
      <button id="sf-btn-hole-redirect" type="submit">
        Mutate + Revalidate + Redirect
      </button>
    </form>
  );
}
