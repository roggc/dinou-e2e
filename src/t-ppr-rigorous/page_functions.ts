export const ppr = true;

export async function getProps() {
  return {
    shellBuildTime: new Date().toISOString(),
    shellBuildId: `shell-${Math.random().toString(36).slice(2, 10)}`,
    staticBanner: "Pre-rendered Static Shell (Zero Full-Page Bailout)",
  };
}

