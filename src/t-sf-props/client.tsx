"use client";

import React, { useState, useActionState } from "react";

interface SfProps {
  onEcho: (msg: string) => Promise<string>;
  onBound: (msg: string) => Promise<string>;
  onInline: (msg: string) => Promise<string>;
  onModuleUnexported: (msg: string) => Promise<string>;
  onFormAction: (prevState: any, formData: FormData) => Promise<any>;
}

export function SfPropsClient({
  onEcho,
  onBound,
  onInline,
  onModuleUnexported,
  onFormAction,
}: SfProps) {
  const [echoResult, setEchoResult] = useState("");
  const [boundResult, setBoundResult] = useState("");
  const [inlineResult, setInlineResult] = useState("");
  const [moduleUnexportedResult, setModuleUnexportedResult] = useState("");
  const [formState, formDispatch] = useActionState(onFormAction, {
    success: false,
    message: "",
  });

  return (
    <div style={{ padding: "20px", fontFamily: "sans-serif" }}>
      <h1 id="sf-heading">Server Functions as Props E2E</h1>

      <div style={{ marginBottom: "15px" }}>
        <button
          id="btn-echo"
          onClick={async () => {
            const res = await onEcho("hola");
            setEchoResult(res);
          }}
        >
          Call Echo
        </button>
        <span id="result-echo">{echoResult}</span>
      </div>

      <div style={{ marginBottom: "15px" }}>
        <button
          id="btn-bound"
          onClick={async () => {
            const res = await onBound("hola");
            setBoundResult(res);
          }}
        >
          Call Bound
        </button>
        <span id="result-bound">{boundResult}</span>
      </div>

      <div style={{ marginBottom: "15px" }}>
        <button
          id="btn-inline"
          onClick={async () => {
            const res = await onInline("hola");
            setInlineResult(res);
          }}
        >
          Call Inline
        </button>
        <span id="result-inline">{inlineResult}</span>
      </div>

      <div style={{ marginBottom: "15px" }}>
        <button
          id="btn-module-unexported"
          onClick={async () => {
            const res = await onModuleUnexported("hola");
            setModuleUnexportedResult(res);
          }}
        >
          Call Module Unexported
        </button>
        <span id="result-module-unexported">{moduleUnexportedResult}</span>
      </div>

      <form action={formDispatch}>
        <input id="input-name" name="name" defaultValue="dinou" />
        <button id="btn-submit" type="submit">
          Submit Form
        </button>
        <span id="result-form">{formState.message}</span>
      </form>
    </div>
  );
}
