"use server";

const TENANT_MAP_KEY = Symbol.for("dinou.e2e.contract.tenant.map");
const ITEM_MAP_KEY = Symbol.for("dinou.e2e.contract.item.map");
const LOG_MAP_KEY = Symbol.for("dinou.e2e.contract.validation.log.map");

function getMap<T>(sym: symbol): Record<string, T> {
  if (!(globalThis as any)[sym]) {
    (globalThis as any)[sym] = {};
  }
  return (globalThis as any)[sym];
}

export async function setContractVetoState(state: {
  tenant?: string;
  tenantActive?: boolean;
  itemActive?: boolean;
  resetLog?: boolean;
}) {
  const tenant = state.tenant || "acme";
  const tenantMap = getMap<boolean>(TENANT_MAP_KEY);
  const itemMap = getMap<boolean>(ITEM_MAP_KEY);
  const logMap = getMap<string[]>(LOG_MAP_KEY);

  if (typeof state.tenantActive === "boolean") {
    tenantMap[tenant] = state.tenantActive;
    if (tenant === "acme") {
      (globalThis as any).__E2E_CONTRACT_TENANT_ACTIVE__ = state.tenantActive;
    }
  }
  if (typeof state.itemActive === "boolean") {
    itemMap[tenant] = state.itemActive;
    if (tenant === "acme") {
      (globalThis as any).__E2E_CONTRACT_ITEM_ACTIVE__ = state.itemActive;
    }
  }
  if (state.resetLog) {
    logMap[tenant] = [];
  }
  return { ok: true, tenant };
}

export async function getContractValidationLog(tenant = "acme") {
  const logMap = getMap<string[]>(LOG_MAP_KEY);
  return Array.isArray(logMap[tenant]) ? [...logMap[tenant]] : [];
}
