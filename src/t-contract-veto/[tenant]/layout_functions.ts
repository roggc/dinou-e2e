const TENANT_MAP_KEY = Symbol.for("dinou.e2e.contract.tenant.map");
const LOG_MAP_KEY = Symbol.for("dinou.e2e.contract.validation.log.map");

const ALLOWED_TENANTS = new Set([
  "acme",
  "acme-chromium",
  "acme-firefox",
  "acme-webkit",
]);

export const getStaticPaths = [
  { tenant: "acme" },
  { tenant: "acme-chromium" },
  { tenant: "acme-firefox" },
  { tenant: "acme-webkit" },
];
export const allowISG = false;

export function validateParams(params: { tenant: string }) {
  const logMap = ((globalThis as any)[LOG_MAP_KEY] =
    (globalThis as any)[LOG_MAP_KEY] || {});
  const list = (logMap[params.tenant] = logMap[params.tenant] || []);
  list.push(`layout:${params.tenant}`);

  const tenantMap = (globalThis as any)[TENANT_MAP_KEY];
  if (tenantMap && tenantMap[params.tenant] === false) {
    return false;
  }
  if (
    params.tenant === "acme" &&
    (globalThis as any).__E2E_CONTRACT_TENANT_ACTIVE__ === false
  ) {
    return false;
  }
  return ALLOWED_TENANTS.has(params.tenant);
}
