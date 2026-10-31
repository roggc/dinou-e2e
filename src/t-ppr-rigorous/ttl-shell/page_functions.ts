export const ppr = true;
export const revalidate = 1;

export async function getProps() {
  return {
    ttlShellToken: `ttl-shell-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  };
}

