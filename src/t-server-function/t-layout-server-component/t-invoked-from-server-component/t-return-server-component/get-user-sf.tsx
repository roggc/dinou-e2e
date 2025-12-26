"use server";

import GetUserComp from "./get-user-comp";
import { getUser } from "./get-user";

export async function getUserSF() {
  const user = getUser();
  return <GetUserComp user={user} />;
}
