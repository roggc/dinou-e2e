"use server";

import { getContext } from "dinou";
import ComplexData from "@/components/complex-data";

export async function complexData() {
  const ctx = getContext();
  // if (!ctx) return;

  await new Promise((resolve) => setTimeout(resolve, 2000));

  // ctx.res.clearCookie("dinou-test-cookie");
  // ctx.res.redirect("/docs");
  // return <ClientRedirect to="/docs" />;
  return (
    <ComplexData
      date={new Date()}
      map={new Map([["a", 1]])}
      set={new Set([1, 2, 3])}
      bigint={1234567890n}
    />
  );
}
