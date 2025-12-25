import { getContext } from "dinou";

export function getHeader() {
  const ctx = getContext();
  return ctx?.req?.headers?.["user-agent"];
}
