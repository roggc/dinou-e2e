const ITEM_MAP_KEY = Symbol.for("dinou.e2e.contract.item.map");
const LOG_MAP_KEY = Symbol.for("dinou.e2e.contract.validation.log.map");

export const getStaticPaths = [
  { tenant: "acme", id: 1 },
  { tenant: "acme-chromium", id: 1 },
  { tenant: "acme-firefox", id: 1 },
  { tenant: "acme-webkit", id: 1 },
];
export const allowISG = false;

export function validateParams(params: { tenant: string; id: string }) {
  const logMap = ((globalThis as any)[LOG_MAP_KEY] =
    (globalThis as any)[LOG_MAP_KEY] || {});
  const list = (logMap[params.tenant] = logMap[params.tenant] || []);
  list.push(`page:${params.id}`);

  const itemMap = (globalThis as any)[ITEM_MAP_KEY];
  if (itemMap && itemMap[params.tenant] === false) {
    return false;
  }
  if (
    params.tenant === "acme" &&
    (globalThis as any).__E2E_CONTRACT_ITEM_ACTIVE__ === false
  ) {
    return false;
  }
  return /^[0-9]+$/.test(params.id);
}
