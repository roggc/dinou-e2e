"use client";

import { ROUTE, type ErrorProps } from "./dinou";

export default function ContextualSidebarError({ error, params }: ErrorProps) {
  return (
    <div role="alert" data-testid="ctx-sidebar-error" data-error-route={ROUTE}>
      <span data-testid="ctx-sidebar-error-slug">{params.slug}</span>
      <span data-testid="ctx-sidebar-error-msg">{error.message}</span>
    </div>
  );
}

