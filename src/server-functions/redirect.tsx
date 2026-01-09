"use server";

import { getContext } from "dinou";
import { ClientRedirect } from "@/components/client-redirect";

export async function redirect() {
  const ctx = getContext();
  // if (!ctx) return;

  await new Promise((resolve) => setTimeout(resolve, 2000));

  // ctx.res.clearCookie("dinou-test-cookie");
  // ctx.res.redirect("/docs");
  // return <ClientRedirect to="/docs" />;
  return {
    date: new Date(),
    map: new Map([["a", 1]]),
    set: new Set([1, 2, 3]),
    bigint: 1234567890n,
    foo: "bar",
    num1: 42,
    num2: 3.14,
    boolval: true,
  };
}
