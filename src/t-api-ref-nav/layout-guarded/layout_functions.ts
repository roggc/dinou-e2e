import type { ReactNode } from "react";
import { getContext, redirect } from "dinou";

export interface TenantLayoutExtraProps {
  tenant: {
    title: string;
  };
}

export const revalidate = 0;

export async function getProps(): Promise<TenantLayoutExtraProps | ReactNode> {
  const { req } = getContext();
  if (req.cookies.api_ref_tenant !== "acme") {
    return redirect("/t-api-ref-nav/login?from=layout");
  }
  return { tenant: { title: "Acme Corp" } };
}
