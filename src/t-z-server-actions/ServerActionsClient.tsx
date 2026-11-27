"use client";

import { useActionState, useOptimistic, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter, refreshSlot } from "dinou";
import {
  optimisticAddTodo,
  echoRichTypes,
  uploadBinaryWithMeta,
  seedInitialCookieB,
  concurrentCookieActionA,
  concurrentCookieActionB,
  resetZ3E2eState,
} from "./actions";

function SubmitTodoButton() {
  const { pending } = useFormStatus();
  return (
    <>
      <button type="submit" data-testid="z3-opt-submit" disabled={pending}>
        {pending ? "Saving..." : "Add Todo"}
      </button>
      <span data-testid="z3-form-pending">{pending ? "pending" : "idle"}</span>
    </>
  );
}

export default function ServerActionsClient() {
  const router = useRouter();
  const [todoState, todoDispatch] = useActionState(optimisticAddTodo, {
    todos: ["seed-1"],
    error: null as string | null,
  });
  const [optimisticTodos, addOptimisticTodo] = useOptimistic(
    todoState.todos,
    (currentTodos: string[], nextTodo: string) => [...currentTodos, nextTodo]
  );
  const [shouldFail, setShouldFail] = useState(false);
  const [todoInput, setTodoInput] = useState("buy-milk");

  const [richStatus, setRichStatus] = useState("idle");
  const [binaryStatus, setBinaryStatus] = useState("idle");
  const [cookieStatus, setCookieStatus] = useState("idle");

  async function handleOptimisticAction(formData: FormData) {
    const title = String(formData.get("todo") || "").trim();
    addOptimisticTodo(`optimistic:${title}`);
    await todoDispatch(formData);
  }

  async function runRichTypesCheck() {
    setRichStatus("running");
    try {
      const rawBytes = new Uint8Array([
        0x00, 0x01, 0x0a, 0x44, 0x3a, 0x7b, 0x7f, 0x80, 0xfe, 0xff,
      ]);
      const expectedHex = Array.from(rawBytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      const res = await echoRichTypes({
        date: new Date("2026-06-15T12:34:56.789Z"),
        map: new Map<any, any>([
          ["k1", "v1"],
          [9007199254740995n, "big-key-hit"],
        ]),
        set: new Set<any>(["alpha", new Date("2030-01-01T00:00:00.000Z")]),
        big: 9007199254740999n,
        bytes: rawBytes,
        undef: undefined,
        negZero: -0,
        nanVal: Number.NaN,
        posInf: Number.POSITIVE_INFINITY,
        negInf: Number.NEGATIVE_INFINITY,
        regex: /dinou-[0-9]+/gi,
        url: new URL("https://dinou.dev/docs?a=1#top"),
        escapedUserObj: { $dinou_sf: "not-a-tag", raw: 123 },
      });

      const returnedHex =
        res.echo.bytes instanceof Uint8Array
          ? Array.from(res.echo.bytes)
              .map((b) => b.toString(16).padStart(2, "0"))
              .join("")
          : "not-uint8";

      const allOk =
        res.checks.isDate === true &&
        res.checks.dateIso === "2026-06-15T12:34:56.789Z" &&
        res.checks.isMap === true &&
        res.checks.mapBigVal === "big-key-hit" &&
        res.checks.isSet === true &&
        res.checks.setHasAlpha === true &&
        res.checks.setHasDate === true &&
        res.checks.isBigInt === true &&
        res.checks.bigStr === "9007199254740999" &&
        res.checks.isUint8 === true &&
        res.checks.bytesHex === expectedHex &&
        res.checks.hasUndefKey === true &&
        res.checks.undefIsUndefined === true &&
        res.checks.isNegZero === true &&
        res.checks.isNaNVal === true &&
        res.checks.isPosInf === true &&
        res.checks.isNegInf === true &&
        res.checks.isRegExp === true &&
        res.checks.regexStr === "/dinou-[0-9]+/gi" &&
        res.checks.isURL === true &&
        res.checks.urlHref === "https://dinou.dev/docs?a=1#top" &&
        res.checks.escapedLiteralOk === true &&
        res.echo.date instanceof Date &&
        res.echo.date.toISOString() === "2026-06-15T12:34:56.789Z" &&
        res.echo.map instanceof Map &&
        res.echo.map.get(9007199254740995n) === "big-key-hit" &&
        res.echo.set instanceof Set &&
        res.echo.set.has("alpha") &&
        res.echo.big === 9007199254740999n &&
        res.echo.bytes instanceof Uint8Array &&
        returnedHex === expectedHex &&
        res.echo.undef === undefined;

      setRichStatus(
        allOk ? "rich-ok" : `rich-fail:${JSON.stringify({ checks: res.checks, returnedHex })}`
      );
    } catch (e: any) {
      setRichStatus(`rich-err:${e?.message || String(e)}`);
    }
  }

  async function runBinaryUploadCheck() {
    setBinaryStatus("running");
    try {
      const all256 = new Uint8Array(256);
      for (let i = 0; i < 256; i++) all256[i] = i;
      const secondBytes = new Uint8Array([0xde, 0xad, 0xbe, 0xef, 0x00, 0x0a, 0xff]);

      const fd = new FormData();
      fd.append(
        "fileA",
        new File([all256], "café-🚀.bin", { type: "application/octet-stream" })
      );
      fd.append(
        "fileB",
        new File([secondBytes], "second.bin", { type: "application/octet-stream" })
      );
      fd.append("note", "browser-binary");

      const prevState = {
        updatedAt: new Date("2026-07-01T00:00:00.000Z"),
        tags: new Set(["t1", "t2"]),
        seq: 42n,
      };

      const res1 = await uploadBinaryWithMeta(prevState, fd);
      const callerUntouched1 =
        !fd.has("__dinou_func_id") &&
        !fd.has("__dinou_formData_index") &&
        !fd.has("__dinou_args") &&
        !fd.has("__dinou_args_codec");

      // Re-submit same FormData instance a second time!
      const res2 = await uploadBinaryWithMeta({ ...prevState, seq: 43n }, fd);
      const callerUntouched2 = !fd.has("__dinou_func_id");

      // Known SHA-256 of bytes 0x00..0xFF:
      const expectedSha256All256 =
        "40aff2e9d2d8922e47afd4648e6967497158785fbd1da870e7110266bf944880";

      const allOk =
        callerUntouched1 &&
        callerUntouched2 &&
        res1.leakedInternalKeys.length === 0 &&
        res2.leakedInternalKeys.length === 0 &&
        res1.fileAName === "café-🚀.bin" &&
        res1.fileALength === 256 &&
        res1.fileASha256 === expectedSha256All256 &&
        res2.fileASha256 === expectedSha256All256 &&
        res1.fileBName === "second.bin" &&
        res1.fileBLength === 7 &&
        res1.prevStateChecks.isDate === true &&
        res1.prevStateChecks.isSet === true &&
        res1.prevStateChecks.isBigInt === true &&
        res1.prevStateChecks.seqStr === "42" &&
        res2.prevStateChecks.seqStr === "43";

      setBinaryStatus(
        allOk
          ? "binary-ok"
          : `binary-fail:${JSON.stringify({ callerUntouched1, res1, res2 })}`
      );
    } catch (e: any) {
      setBinaryStatus(`binary-err:${e?.message || String(e)}`);
    }
  }

  async function runSeedCookieB() {
    await seedInitialCookieB();
    router.refresh();
    await refreshSlot("z3-cookie-slot", { fresh: true });
    setCookieStatus("seeded");
  }

  async function runConcurrentCookies() {
    setCookieStatus("running");
    await Promise.all([concurrentCookieActionA(), concurrentCookieActionB()]);
    router.refresh();
    await refreshSlot("z3-cookie-slot", { fresh: true });
    setCookieStatus("concurrent-done");
  }

  return (
    <div data-testid="z3-client-root">
      <section data-testid="z3-optimistic-section">
        <form action={handleOptimisticAction}>
          <input
            name="todo"
            data-testid="z3-opt-input"
            value={todoInput}
            onChange={(e) => setTodoInput(e.target.value)}
          />
          <input
            type="hidden"
            name="shouldFail"
            value={shouldFail ? "1" : "0"}
          />
          <label>
            <input
              type="checkbox"
              data-testid="z3-opt-fail-toggle"
              checked={shouldFail}
              onChange={(e) => setShouldFail(e.target.checked)}
            />
            Simulate Server Error
          </label>
          <SubmitTodoButton />
        </form>
        <ul data-testid="z3-opt-list">
          {optimisticTodos.map((item, idx) => (
            <li key={`${idx}-${item}`} data-testid="z3-opt-item">
              {item}
            </li>
          ))}
        </ul>
        <div data-testid="z3-opt-error">{todoState.error || "none"}</div>
      </section>

      <section data-testid="z3-rich-section">
        <button
          type="button"
          data-testid="z3-btn-rich-types"
          onClick={runRichTypesCheck}
        >
          Run Rich Types Round-Trip
        </button>
        <span data-testid="z3-rich-status">{richStatus}</span>
      </section>

      <section data-testid="z3-binary-section">
        <button
          type="button"
          data-testid="z3-btn-binary-upload"
          onClick={runBinaryUploadCheck}
        >
          Run Binary FormData Check
        </button>
        <span data-testid="z3-binary-status">{binaryStatus}</span>
      </section>

      <section data-testid="z3-cookie-section">
        <button
          type="button"
          data-testid="z3-btn-seed-cookie-b"
          onClick={runSeedCookieB}
        >
          Seed Cookie B
        </button>
        <button
          type="button"
          data-testid="z3-btn-concurrent-cookies"
          onClick={runConcurrentCookies}
        >
          Run Concurrent Cookies
        </button>
        <button
          type="button"
          data-testid="z3-btn-reset-state"
          onClick={async () => {
            await resetZ3E2eState();
          }}
        >
          Reset E2E State
        </button>
        <span data-testid="z3-cookie-status">{cookieStatus}</span>
      </section>
    </div>
  );
}
