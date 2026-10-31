import { getHsPprState } from "../../hsppr-state";

export const ppr = true;

export function getStaticPaths() {
  return ["alpha"];
}

export function allowISG() {
  return false;
}

export function validateParams(params: { team?: string }) {
  return params?.team === "alpha" || params?.team === "beta";
}

export async function getProps(params: { team?: string }) {
  const st = getHsPprState();
  return {
    teamLabel: `Team Shell: ${params?.team}`,
    teamLayoutShellSeq: st.teamLayoutShellSeq,
  };
}

