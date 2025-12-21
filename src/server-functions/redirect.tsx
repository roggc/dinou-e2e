"use server";

import { getContext } from "dinou";
import { ClientRedirect } from "@/components/client-redirect";

export async function redirect() {
  const ctx = getContext();
  if (!ctx) return;

  await new Promise((resolve) => setTimeout(resolve, 2000));

  ctx.res.clearCookie("dinou-test-cookie");
  ctx.res.redirect("/docs");
  return <ClientRedirect to="/docs" />;
}
