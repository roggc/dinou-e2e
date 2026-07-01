"use server";

import { getContext } from "dinou";
import { ClientRedirect } from "@/components/client-redirect";

export async function redirectSF() {
  const ctx = getContext();
  if (!ctx?.res) return;
  await new Promise((resolve) => setTimeout(resolve, 6000));
  ctx.res.redirect("/docs");
  return <ClientRedirect to="/docs" />;
}
