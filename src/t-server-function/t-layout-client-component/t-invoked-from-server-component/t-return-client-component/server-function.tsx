"use server";

import Component from "./component";
import { getHeader } from "./get-header";

export async function serverFunction() {
  const header = getHeader();
  await new Promise((resolve) => setTimeout(resolve, 2000));
  return <Component header={header} />;
}
