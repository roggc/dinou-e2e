export const ppr = true;

export async function getProps() {
  return {
    shellBuildId: `syn-shell-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    shellBuildTime: new Date().toISOString(),
  };
}

