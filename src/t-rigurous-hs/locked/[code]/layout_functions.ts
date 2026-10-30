export function getStaticPaths() {
  return ["alpha"];
}

export function allowISG() {
  return false;
}

export async function getProps(params: { code?: string }) {
  return {
    lockedLabel: `Locked Shell: ${params.code}`,
  };
}

