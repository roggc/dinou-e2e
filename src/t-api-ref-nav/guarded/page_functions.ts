import type { ReactNode } from "react";
import { getContext, redirect } from "dinou";

export interface GuardedPageExtraProps {
  profile: {
    name: string;
  };
}

export const revalidate = 0;

export async function getProps(): Promise<GuardedPageExtraProps | ReactNode> {
  const { req } = getContext();
  if (req.cookies.api_ref_auth !== "valid") {
    return redirect("/t-api-ref-nav/login?from=guarded");
  }
  return { profile: { name: "Grace" } };
}
