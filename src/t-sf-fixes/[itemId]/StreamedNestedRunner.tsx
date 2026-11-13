"use client";

import { useActionState, useState, type ReactNode } from "react";

export function StreamedLevel2Button({
  onRunLevel2,
}: {
  onRunLevel2: () => Promise<string>;
}) {
  const [res, setRes] = useState("");
  return (
    <div data-testid="streamed-level2-card">
      <button
        type="button"
        data-testid="btn-level2-confirm"
        onClick={async () => {
          const out = await onRunLevel2();
          setRes(out);
        }}
      >
        Run Level-2 Action
      </button>
      <span data-testid="level2-confirm-result">{res}</span>
    </div>
  );
}

export function StreamedNestedRunner({
  onConfirm,
  statefulAction,
  onStreamLevel2,
}: {
  onConfirm: (tag: string) => Promise<string>;
  statefulAction: (prevState: string, formData: FormData) => Promise<string>;
  onStreamLevel2: () => Promise<ReactNode>;
}) {
  const [confirmResult, setConfirmResult] = useState("");
  const [level2Node, setLevel2Node] = useState<ReactNode>(null);
  const [formState, formAction] = useActionState(statefulAction, "idle");

  return (
    <div data-testid="streamed-nested-runner">
      <button
        type="button"
        data-testid="btn-nested-confirm"
        onClick={async () => {
          const out = await onConfirm("confirmed");
          setConfirmResult(out);
        }}
      >
        Run Nested Action
      </button>
      <span data-testid="nested-confirm-result">{confirmResult}</span>

      <form action={formAction}>
        <input
          data-testid="input-nested-note"
          name="note"
          defaultValue="stream-ok"
        />
        <button type="submit" data-testid="btn-nested-form">
          Submit Streamed Form
        </button>
      </form>
      <span data-testid="nested-form-result">{formState}</span>

      <button
        type="button"
        data-testid="btn-load-level2"
        onClick={async () => {
          const nextUi = await onStreamLevel2();
          setLevel2Node(nextUi);
        }}
      >
        Load Level-2 Streamed UI
      </button>
      <div data-testid="level2-container">{level2Node}</div>
    </div>
  );
}

