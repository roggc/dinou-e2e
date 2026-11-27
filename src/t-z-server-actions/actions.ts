"use server";

import crypto from "node:crypto";
import { getContext } from "dinou";

type Z3E2eStore = {
  progressiveItems: string[];
  boundItems: string[];
};

function getStore(): Z3E2eStore {
  const g = globalThis as any;
  if (!g.__Z3_E2E_STORE__) {
    g.__Z3_E2E_STORE__ = {
      progressiveItems: [],
      boundItems: [],
    };
  }
  return g.__Z3_E2E_STORE__;
}

export async function resetZ3E2eState() {
  const store = getStore();
  store.progressiveItems = [];
  store.boundItems = [];
  return { ok: true };
}

export async function submitProgressiveForm(formData: FormData) {
  const ctx = getContext();
  const keys = Array.from(formData.keys());
  const leaked = keys.filter(
    (k) => k.startsWith("$ACTION_") || k.startsWith("__dinou_")
  );
  const title = String(formData.get("title") || "").trim();
  const goDone = String(formData.get("goDone") || "") === "1";

  const store = getStore();
  store.progressiveItems.push(`${title}|leaked=${leaked.length}`);
  if (store.progressiveItems.length > 50) {
    store.progressiveItems = store.progressiveItems.slice(-50);
  }

  ctx.res.cookie("z3_browser_prog", title, { path: "/" });
  if (goDone) {
    ctx.res.redirect("/t-z-server-actions/done");
  }
  return { ok: true, title };
}

export async function boundProgressiveAction(prefix: string, formData: FormData) {
  const label = String(formData.get("label") || "").trim();
  const store = getStore();
  store.boundItems.push(`${prefix}:${label}`);
  if (store.boundItems.length > 50) {
    store.boundItems = store.boundItems.slice(-50);
  }
  return { ok: true };
}

export async function optimisticAddTodo(
  prevState: { todos: string[]; error: string | null },
  formData: FormData
) {
  const title = String(formData.get("todo") || "").trim();
  const shouldFail = String(formData.get("shouldFail") || "") === "1";

  // Deterministic delay so Playwright can observe useFormStatus().pending === true
  // and the optimistic item before the server settles.
  await new Promise((r) => setTimeout(r, 260));

  if (shouldFail || !title) {
    return {
      todos: prevState.todos,
      error: `Rejected:${title || "empty"}`,
    };
  }

  return {
    todos: [...prevState.todos, `confirmed:${title}`],
    error: null,
  };
}

export async function echoRichTypes(payload: any) {
  const checks = {
    isDate: payload.date instanceof Date,
    dateIso: payload.date instanceof Date ? payload.date.toISOString() : null,
    isMap: payload.map instanceof Map,
    mapSize: payload.map instanceof Map ? payload.map.size : -1,
    mapBigVal:
      payload.map instanceof Map ? payload.map.get(9007199254740995n) : null,
    isSet: payload.set instanceof Set,
    setHasAlpha: payload.set instanceof Set ? payload.set.has("alpha") : false,
    setHasDate:
      payload.set instanceof Set
        ? Array.from(payload.set).some(
            (v) => v instanceof Date && v.getUTCFullYear() === 2030
          )
        : false,
    isBigInt: typeof payload.big === "bigint",
    bigStr: typeof payload.big === "bigint" ? payload.big.toString() : null,
    isUint8: payload.bytes instanceof Uint8Array,
    bytesHex:
      payload.bytes instanceof Uint8Array
        ? Buffer.from(payload.bytes).toString("hex")
        : null,
    hasUndefKey: Object.prototype.hasOwnProperty.call(payload, "undef"),
    undefIsUndefined: payload.undef === undefined,
    isNegZero: Object.is(payload.negZero, -0),
    isNaNVal: Number.isNaN(payload.nanVal),
    isPosInf: payload.posInf === Infinity,
    isNegInf: payload.negInf === -Infinity,
    isRegExp: payload.regex instanceof RegExp,
    regexStr: payload.regex instanceof RegExp ? payload.regex.toString() : null,
    isURL: payload.url instanceof URL,
    urlHref: payload.url instanceof URL ? payload.url.href : null,
    escapedLiteralOk:
      Boolean(payload.escapedUserObj) &&
      payload.escapedUserObj.$dinou_sf === "not-a-tag" &&
      payload.escapedUserObj.raw === 123,
  };

  return {
    checks,
    echo: {
      date: payload.date,
      map: payload.map,
      set: payload.set,
      big: payload.big,
      bytes: payload.bytes,
      undef: undefined,
    },
  };
}

export async function uploadBinaryWithMeta(prevState: any, formData: FormData) {
  const keys = Array.from(formData.keys());
  const leakedInternalKeys = keys.filter(
    (k) => k.startsWith("__dinou_") || k.startsWith("$ACTION_")
  );

  const fileA = formData.get("fileA") as File | null;
  const fileB = formData.get("fileB") as File | null;
  const note = String(formData.get("note") || "");

  const bufA = fileA ? Buffer.from(await fileA.arrayBuffer()) : Buffer.alloc(0);
  const bufB = fileB ? Buffer.from(await fileB.arrayBuffer()) : Buffer.alloc(0);

  return {
    leakedInternalKeys,
    note,
    fileAName: fileA ? fileA.name : null,
    fileALength: bufA.length,
    fileASha256: crypto.createHash("sha256").update(bufA).digest("hex"),
    fileBName: fileB ? fileB.name : null,
    fileBLength: bufB.length,
    fileBSha256: crypto.createHash("sha256").update(bufB).digest("hex"),
    prevStateChecks: {
      isDate: prevState?.updatedAt instanceof Date,
      dateIso:
        prevState?.updatedAt instanceof Date
          ? prevState.updatedAt.toISOString()
          : null,
      isSet: prevState?.tags instanceof Set,
      tagsList: prevState?.tags instanceof Set ? Array.from(prevState.tags) : [],
      isBigInt: typeof prevState?.seq === "bigint",
      seqStr: typeof prevState?.seq === "bigint" ? prevState.seq.toString() : null,
    },
  };
}

export async function seedInitialCookieB() {
  const ctx = getContext();
  ctx.res.cookie("z3_c_b", "initial_b", { path: "/" });
  ctx.res.clearCookie("z3_c_a");
  ctx.res.clearCookie("z3_c_c");
  return { seeded: true };
}

export async function concurrentCookieActionA() {
  const ctx = getContext();
  await new Promise((r) => setTimeout(r, 80));
  ctx.res.cookie("z3_c_a", "alpha_val", { path: "/" });
  return { who: "A" };
}

export async function concurrentCookieActionB() {
  const ctx = getContext();
  await new Promise((r) => setTimeout(r, 15));
  ctx.res.clearCookie("z3_c_b");
  ctx.res.cookie("z3_c_c", "gamma_val", { path: "/" });
  return { who: "B" };
}
