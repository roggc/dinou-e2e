import { getContext } from "dinou";

// ⚠️ NOTE: This file intentionally does NOT have "use server" at the top of the module.
// It mixes private helpers and normal exported helpers with functions that declare
// "use server" inside their function body.

export interface OrderCalculationResult {
  baseAmount: number;
  discountApplied: number;
  taxAmount: number;
  finalTotal: number;
  couponUsed: string;
  executedOnServer: boolean;
}

// Private helper function (MUST NOT appear in server-functions-manifest.json)
function computeInternalDiscount(amount: number, coupon: string): number {
  const normalized = coupon.trim().toUpperCase();
  if (normalized === "DINOU9") return Math.round(amount * 0.2 * 100) / 100;
  if (normalized === "REACT19") return Math.round(amount * 0.15 * 100) / 100;
  return 0;
}

// Normal exported helper without "use server" (MUST NOT appear in server-functions-manifest.json)
export function nonServerHelperFormat(label: string): string {
  return `[Helper Local] ${label}`;
}

/**
 * 1. Exported function declaration with "use server" in body
 */
export async function calculateOrderOnServer(
  baseAmount: number,
  couponCode: string
): Promise<OrderCalculationResult> {
  "use server";

  const discountApplied = computeInternalDiscount(baseAmount, couponCode);
  const taxable = Math.max(0, baseAmount - discountApplied);
  const taxAmount = Math.round(taxable * 0.21 * 100) / 100;
  const finalTotal = Math.round((taxable + taxAmount) * 100) / 100;

  return {
    baseAmount,
    discountApplied,
    taxAmount,
    finalTotal,
    couponUsed: couponCode.trim().toUpperCase() || "NONE",
    executedOnServer: typeof window === "undefined",
  };
}

/**
 * 2. Exported arrow function with "use server" in body + getContext()
 */
export const verifyContextAndSign = async (
  payload: string,
  customTag: string
) => {
  "use server";

  const ctx = getContext();
  const userAgent = ctx?.req?.headers?.["user-agent"] || "Unknown UA";
  const prevCookie = ctx?.req?.cookies?.["sf_test_tag"] || "ninguna";

  if (ctx?.res && customTag) {
    ctx.res.cookie("sf_test_tag", customTag, {
      path: "/",
      maxAge: 3600,
    });
  }

  return {
    payload,
    customTag,
    previousCookie: prevCookie,
    newCookieSet: customTag,
    hasUserAgent: userAgent.length > 0,
    executedOnServer: typeof window === "undefined",
  };
};

/**
 * 3. Server Function with "use server" in body to inspect the runtime manifest
 *    and verify Granular Manifest Tree-Shaking.
 */
export async function inspectSfManifest() {
  "use server";

  const rawManifest =
    (globalThis as Record<string, any>).__DINOU_SERVER_FUNCTIONS_MANIFEST__ ||
    (globalThis as Record<string, any>).__DINOU_RAW_SERVER_FUNCTIONS_MANIFEST__ ||
    {};

  const sfBodyEntries: Record<string, string[]> = {};
  for (const [fileKey, exportsList] of Object.entries(rawManifest)) {
    const normKey = fileKey.replace(/\\/g, "/");
    if (normKey.includes("t-sf-body")) {
      sfBodyEntries[normKey] = Array.isArray(exportsList)
        ? exportsList
        : Array.from(exportsList as Iterable<string>);
    }
  }

  const mixedFileKey = Object.keys(sfBodyEntries).find((k) =>
    k.includes("mixed-server-utils")
  );
  const mixedExports = mixedFileKey ? sfBodyEntries[mixedFileKey] : [];

  const treeShakingVerified =
    mixedExports.includes("calculateOrderOnServer") &&
    mixedExports.includes("verifyContextAndSign") &&
    mixedExports.includes("directClientImportedServerFn") &&
    mixedExports.includes("directClientArrowServerFn") &&
    mixedExports.includes("inspectSfManifest") &&
    !mixedExports.includes("nonServerHelperFormat") &&
    !mixedExports.includes("computeInternalDiscount");

  return {
    sfBodyEntries,
    mixedExports,
    treeShakingVerified,
  };
}

/**
 * 4. Function declaration with "use server" in body imported DIRECTLY from a Client Component ("use client")
 *    without passing as a prop from a Server Component.
 *    Verifies that the client bundler (esbuild, rollup, webpack) generates an RPC proxy.
 */
export async function directClientImportedServerFn(probeLabel: string) {
  "use server";

  const executedOnServer = typeof window === "undefined";
  const ctx = getContext();
  const hasServerContext = Boolean(ctx?.req);
  const internalDiscount = computeInternalDiscount(100, "DINOU9");

  return {
    probeLabel,
    executedOnServer,
    hasServerContext,
    internalDiscount,
    environment: executedOnServer ? "server-rpc" : "browser-direct-bug",
  };
}

/**
 * 5. Arrow function with "use server" in body imported DIRECTLY from a Client Component ("use client").
 */
export const directClientArrowServerFn = async (inputNumber: number) => {
  "use server";

  const executedOnServer = typeof window === "undefined";
  const bonus = computeInternalDiscount(inputNumber, "DINOU9");

  return {
    inputNumber,
    bonus,
    totalWithBonus: inputNumber + bonus,
    executedOnServer,
  };
};

