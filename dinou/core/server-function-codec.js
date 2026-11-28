// dinou/core/server-function-codec.js
// Isomorphic, zero-dependency, edge-safe rich argument serializer & binary-safe
// React Flight stream filter for Dinou Server Functions.

const TAG_KEY = "$dinou_sf";

const TYPED_ARRAY_CONSTRUCTORS = {
  Int8Array,
  Uint8Array,
  Uint8ClampedArray,
  Int16Array,
  Uint16Array,
  Int32Array,
  Uint32Array,
  Float32Array,
  Float64Array,
  BigInt64Array: typeof BigInt64Array !== "undefined" ? BigInt64Array : null,
  BigUint64Array: typeof BigUint64Array !== "undefined" ? BigUint64Array : null,
  DataView,
};

function bytesToBase64(bytes) {
  if (typeof btoa === "function") {
    const CHUNK_SIZE = 0x8000;
    let binary = "";
    for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
      const slice = bytes.subarray(i, Math.min(i + CHUNK_SIZE, bytes.length));
      binary += String.fromCharCode.apply(null, slice);
    }
    return btoa(binary);
  }
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("base64");
  }
  throw new Error("[Dinou] Base64 encoding is unavailable in this runtime");
}

function base64ToBytes(b64) {
  if (typeof atob === "function") {
    const binary = atob(b64);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      out[i] = binary.charCodeAt(i);
    }
    return out;
  }
  if (typeof Buffer !== "undefined") {
    const buf = Buffer.from(b64, "base64");
    const out = new Uint8Array(buf.length);
    out.set(buf);
    return out;
  }
  throw new Error("[Dinou] Base64 decoding is unavailable in this runtime");
}

function encodeValueInner(value, stack) {
  if (value === undefined) {
    return { [TAG_KEY]: "u" };
  }
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return value;
  }
  const t = typeof value;
  if (t === "number") {
    if (Number.isNaN(value)) return { [TAG_KEY]: "nan" };
    if (value === Infinity) return { [TAG_KEY]: "inf" };
    if (value === -Infinity) return { [TAG_KEY]: "ninf" };
    if (Object.is(value, -0)) return { [TAG_KEY]: "nz" };
    return value;
  }
  if (t === "bigint") {
    return { [TAG_KEY]: "bi", v: value.toString() };
  }
  if (t !== "object") {
    return value;
  }

  if (value instanceof Date) {
    return {
      [TAG_KEY]: "d",
      v: Number.isNaN(value.getTime()) ? null : value.toISOString(),
    };
  }
  if (value instanceof RegExp) {
    return { [TAG_KEY]: "re", s: value.source, f: value.flags };
  }
  if (typeof URL !== "undefined" && value instanceof URL) {
    return { [TAG_KEY]: "url", v: value.href };
  }
  if (value instanceof ArrayBuffer) {
    return { [TAG_KEY]: "ab", v: bytesToBase64(new Uint8Array(value)) };
  }
  if (ArrayBuffer.isView(value)) {
    const ctorName = value.constructor?.name || "Uint8Array";
    const viewBytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    return { [TAG_KEY]: "ta", c: ctorName, v: bytesToBase64(viewBytes) };
  }

  if (stack.has(value)) {
    throw new TypeError("[Dinou] Circular reference in Server Function arguments");
  }
  stack.add(value);
  try {
    if (value instanceof Map) {
      const entries = [];
      for (const [k, v] of value.entries()) {
        entries.push([encodeValueInner(k, stack), encodeValueInner(v, stack)]);
      }
      return { [TAG_KEY]: "map", v: entries };
    }
    if (value instanceof Set) {
      const items = [];
      for (const item of value.values()) {
        items.push(encodeValueInner(item, stack));
      }
      return { [TAG_KEY]: "set", v: items };
    }
    if (Array.isArray(value)) {
      const out = new Array(value.length);
      for (let i = 0; i < value.length; i++) {
        out[i] = encodeValueInner(value[i], stack);
      }
      return out;
    }

    const encodedObj = {};
    const keys = Object.keys(value);
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      encodedObj[k] = encodeValueInner(value[k], stack);
    }
    if (Object.prototype.hasOwnProperty.call(value, TAG_KEY)) {
      return { [TAG_KEY]: "esc", v: encodedObj };
    }
    return encodedObj;
  } finally {
    stack.delete(value);
  }
}

export function encodeServerFunctionValue(value) {
  return encodeValueInner(value, new Set());
}

export function encodeServerFunctionArgs(args) {
  if (!Array.isArray(args)) return [];
  const stack = new Set();
  return args.map((arg) => encodeValueInner(arg, stack));
}

export function decodeServerFunctionValue(value) {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => decodeServerFunctionValue(item));
  }
  if (Object.prototype.hasOwnProperty.call(value, TAG_KEY)) {
    const tag = value[TAG_KEY];
    switch (tag) {
      case "u":
        return undefined;
      case "nan":
        return Number.NaN;
      case "inf":
        return Number.POSITIVE_INFINITY;
      case "ninf":
        return Number.NEGATIVE_INFINITY;
      case "nz":
        return -0;
      case "bi":
        return BigInt(value.v);
      case "d":
        return value.v === null ? new Date(Number.NaN) : new Date(value.v);
      case "re":
        return new RegExp(String(value.s || ""), String(value.f || ""));
      case "url":
        return new URL(String(value.v || ""));
      case "ab": {
        const bytes = base64ToBytes(String(value.v || ""));
        return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      }
      case "ta": {
        const bytes = base64ToBytes(String(value.v || ""));
        const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
        const Ctor =
          Object.prototype.hasOwnProperty.call(TYPED_ARRAY_CONSTRUCTORS, value.c)
            ? TYPED_ARRAY_CONSTRUCTORS[value.c]
            : null;
        if (!Ctor) return new Uint8Array(ab);
        return new Ctor(ab);
      }
      case "map": {
        const m = new Map();
        if (Array.isArray(value.v)) {
          for (const pair of value.v) {
            if (Array.isArray(pair) && pair.length >= 2) {
              m.set(
                decodeServerFunctionValue(pair[0]),
                decodeServerFunctionValue(pair[1])
              );
            }
          }
        }
        return m;
      }
      case "set": {
        const s = new Set();
        if (Array.isArray(value.v)) {
          for (const item of value.v) {
            s.add(decodeServerFunctionValue(item));
          }
        }
        return s;
      }
      case "esc": {
        const inner = value.v;
        if (!inner || typeof inner !== "object" || Array.isArray(inner)) {
          return inner;
        }
        const out = {};
        for (const k of Object.keys(inner)) {
          if (k === "__proto__" || k === "constructor" || k === "prototype") continue;
          out[k] = decodeServerFunctionValue(inner[k]);
        }
        return out;
      }
      default:
        break;
    }
  }

  const out = {};
  for (const k of Object.keys(value)) {
    if (k === "__proto__" || k === "constructor" || k === "prototype") continue;
    out[k] = decodeServerFunctionValue(value[k]);
  }
  return out;
}

export function decodeServerFunctionArgs(args) {
  if (!Array.isArray(args)) return [];
  return args.map((arg) => decodeServerFunctionValue(arg));
}

// ============================================================================
// Binary-Safe React Flight Stream Filter (strips Dinou `D:{...}\n` control lines
// without ever passing raw binary Flight chunks like `3:o5,<bytes>` through TextDecoder!)
// ============================================================================

// React Flight binary length-prefixed row tags:
//   T (long UTF-8 text), A (ArrayBuffer), O (Int8), o (Uint8), U (Uint8Clamped),
//   S (Int16), s (Uint16), L (Int32), l (Uint32), G (Float32), g (Float64),
//   M (BigInt64), m (BigUint64), V (DataView), b (binary stream chunk)
const FLIGHT_BINARY_TAGS = new Set([
  0x54, // T
  0x41, // A
  0x4f, // O
  0x6f, // o
  0x55, // U
  0x53, // S
  0x73, // s
  0x4c, // L
  0x6c, // l
  0x47, // G
  0x67, // g
  0x4d, // M
  0x6d, // m
  0x56, // V
  0x62, // b
]);

const EMPTY_BYTES = new Uint8Array(0);

function concatUint8(a, b) {
  if (!a || a.length === 0) return b;
  if (!b || b.length === 0) return a;
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

function isHexByte(b) {
  return (
    (b >= 0x30 && b <= 0x39) ||
    (b >= 0x61 && b <= 0x66) ||
    (b >= 0x41 && b <= 0x46)
  );
}

function parseHexAscii(bytes, start, end) {
  if (end <= start) return -1;
  let hex = "";
  for (let i = start; i < end; i++) {
    const b = bytes[i];
    if (!isHexByte(b)) return -1;
    hex += String.fromCharCode(b);
  }
  const n = parseInt(hex, 16);
  return Number.isFinite(n) && n >= 0 ? n : -1;
}

/**
 * Wraps a `text/x-component` ReadableStream, intercepting Dinou `D:{...}\n`
 * control lines at row boundaries while streaming all React Flight rows
 * (including raw binary length-prefixed TypedArray / ArrayBuffer chunks)
 * byte-for-byte untouched.
 */
export function createBinarySafeFlightFilterStream(bodyStream, onCommand) {
  const reader = bodyStream.getReader();
  const cmdDecoder = new TextDecoder("utf-8");

  const STATE_ROW_START = 0;
  const STATE_TEXT_ROW = 1;
  const STATE_BINARY_PAYLOAD = 2;

  return new ReadableStream({
    async start(controller) {
      let state = STATE_ROW_START;
      let remainingBinaryBytes = 0;
      let buf = EMPTY_BYTES;

      const processBuffer = (isEof) => {
        while (buf.length > 0) {
          if (state === STATE_BINARY_PAYLOAD) {
            const take = Math.min(buf.length, remainingBinaryBytes);
            if (take > 0) {
              controller.enqueue(buf.slice(0, take));
              buf = buf.subarray(take);
              remainingBinaryBytes -= take;
            }
            if (remainingBinaryBytes === 0) {
              state = STATE_ROW_START;
            }
            continue;
          }

          if (state === STATE_TEXT_ROW) {
            const nlIdx = buf.indexOf(0x0a);
            if (nlIdx !== -1) {
              controller.enqueue(buf.slice(0, nlIdx + 1));
              buf = buf.subarray(nlIdx + 1);
              state = STATE_ROW_START;
              continue;
            }
            controller.enqueue(buf.slice());
            buf = EMPTY_BYTES;
            return;
          }

          // STATE_ROW_START:
          // Check for Dinou control line `D:{...}\n`
          if (buf[0] === 0x44) {
            if (buf.length === 1) {
              if (!isEof) return;
              controller.enqueue(buf.slice());
              buf = EMPTY_BYTES;
              return;
            }
            if (buf[1] === 0x3a) {
              const nlIdx = buf.indexOf(0x0a, 2);
              if (nlIdx === -1 && !isEof) {
                return;
              }
              const lineEnd = nlIdx !== -1 ? nlIdx : buf.length;
              const cmdBytes = buf.subarray(2, lineEnd);
              buf = nlIdx !== -1 ? buf.subarray(nlIdx + 1) : EMPTY_BYTES;
              try {
                const payload = JSON.parse(cmdDecoder.decode(cmdBytes));
                if (typeof onCommand === "function") {
                  onCommand(payload);
                }
              } catch (e) {
                console.error("[Dinou] Failed to parse stream command line:", e);
              }
              continue;
            }
          }

          // Inspect Flight row header up to `:` (0x3a) or `\n` (0x0a)
          let colonIdx = -1;
          let nlIdx = -1;
          for (let i = 0; i < buf.length; i++) {
            const b = buf[i];
            if (b === 0x0a) {
              nlIdx = i;
              break;
            }
            if (b === 0x3a) {
              colonIdx = i;
              break;
            }
          }

          if (nlIdx !== -1) {
            controller.enqueue(buf.slice(0, nlIdx + 1));
            buf = buf.subarray(nlIdx + 1);
            continue;
          }

          if (colonIdx === -1) {
            // Still reading row ID before `:`
            if (!isEof && buf.length < 32) {
              return;
            }
            controller.enqueue(buf.slice());
            buf = EMPTY_BYTES;
            state = STATE_TEXT_ROW;
            return;
          }

          // Need the tag byte immediately after `:`
          if (colonIdx + 1 >= buf.length) {
            if (!isEof) return;
            controller.enqueue(buf.slice());
            buf = EMPTY_BYTES;
            return;
          }

          const tagByte = buf[colonIdx + 1];
          if (FLIGHT_BINARY_TAGS.has(tagByte)) {
            // Look for `,` (0x2c) terminating `<hexLen>` before any `\n`
            let commaIdx = -1;
            let headerNlIdx = -1;
            for (let i = colonIdx + 2; i < buf.length; i++) {
              const b = buf[i];
              if (b === 0x2c) {
                commaIdx = i;
                break;
              }
              if (b === 0x0a) {
                headerNlIdx = i;
                break;
              }
            }

            if (commaIdx !== -1) {
              const byteLen = parseHexAscii(buf, colonIdx + 2, commaIdx);
              if (byteLen >= 0) {
                controller.enqueue(buf.slice(0, commaIdx + 1));
                buf = buf.subarray(commaIdx + 1);
                remainingBinaryBytes = byteLen;
                state = byteLen > 0 ? STATE_BINARY_PAYLOAD : STATE_ROW_START;
                continue;
              }
            } else if (headerNlIdx === -1 && !isEof && buf.length - colonIdx < 24) {
              // Wait for more header bytes to complete `<tag><hexLen>,`
              return;
            }
          }

          // Standard text Flight row — stream up to `\n`
          const rowNl = buf.indexOf(0x0a, colonIdx + 1);
          if (rowNl !== -1) {
            controller.enqueue(buf.slice(0, rowNl + 1));
            buf = buf.subarray(rowNl + 1);
            continue;
          }
          controller.enqueue(buf.slice());
          buf = EMPTY_BYTES;
          state = STATE_TEXT_ROW;
          return;
        }
      };

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            processBuffer(true);
            break;
          }
          if (value && value.byteLength > 0) {
            const chunk =
              value instanceof Uint8Array
                ? value
                : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
            buf = concatUint8(buf, chunk);
            processBuffer(false);
          }
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });
}

export default {
  encodeServerFunctionValue,
  encodeServerFunctionArgs,
  decodeServerFunctionValue,
  decodeServerFunctionArgs,
  createBinarySafeFlightFilterStream,
};
