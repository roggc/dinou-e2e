"use server";

import Component from "./component";
import { getHeader } from "./get-header";

export async function serverFunction() {
  const header = getHeader();
  await new Promise((resolve) => setTimeout(resolve, 2000));
  console.log("header from server function:", header);
  return <Component header={header} />;
}
