import React from "react";
import { echoAction, boundAction, formAction } from "./actions";
import { SfPropsClient } from "./client";

export default function SfPropsPage() {
  return (
    <SfPropsClient
      onEcho={echoAction}
      onBound={boundAction.bind(null, "bound")}
      onFormAction={formAction}
    />
  );
}
