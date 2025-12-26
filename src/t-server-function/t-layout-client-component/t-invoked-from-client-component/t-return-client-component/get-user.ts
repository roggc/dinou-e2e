import { getContext } from "dinou";

export function getUser() {
  const ctx = getContext();
  return ctx?.req?.cookies?.["user"];
}
