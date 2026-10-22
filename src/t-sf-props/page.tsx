import React from "react";
import { echoAction, boundAction, formAction } from "./actions";
import { SfPropsClient } from "./client";

// Server function at module level with "use server" in body (unexported)
async function unexportedModuleAction(msg: string) {
  "use server";
  return `module-unexported:${msg}`;
}

export default function SfPropsPage() {
  const secret = "captured";

  // Inline server function inside component capturing closure variable `secret`
  async function inlineAction(msg: string) {
    "use server";
    return `inline:${msg}:${secret}`;
  }

  return (
    <SfPropsClient
      onEcho={echoAction}
      onBound={boundAction.bind(null, "bound")}
      onInline={inlineAction}
      onModuleUnexported={unexportedModuleAction}
      onFormAction={formAction}
    />
  );
}
