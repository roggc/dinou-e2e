"use server";

import Component from "./component";

export async function serverFunction() {
  await new Promise((resolve) => setTimeout(resolve, 2000));
  return <Component />;
}
