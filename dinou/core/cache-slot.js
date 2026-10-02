// dinou/core/cache-slot.js
// Primitive for Vertical Segmentation (Micro-ISR) in React Server Components.
// Caches and invalidates component sub-trees inside pages using revalidate & revalidateTag.

const React = require("react");
const { getStorageAdapter } = require("./storage-adapter.js");
const { asyncRenderJSXToClientJSX } = require("./render-jsx-to-client-jsx.js");

const inflightSlotRenders = new Map();

/**
 * Serializes a resolved JSX element tree into a JSON-safe string,
 * preserving symbols, React 19 transitional elements, and client component references.
 */
function serializeJSX(jsx) {
  return JSON.stringify(jsx, (key, value) => {
    if (typeof value === "symbol") {
      return { __dinou_symbol__: Symbol.keyFor(value) || value.description };
    }
    if (
      (typeof value === "function" || typeof value === "object") &&
      value !== null &&
      value.$$typeof === Symbol.for("react.client.reference")
    ) {
      return {
        __dinou_client_ref__: true,
        id: value.$$id || value.name,
        name: value.name,
        async: value.$$async,
      };
    }
    if (
      value &&
      typeof value === "object" &&
      value.$$typeof === Symbol.for("react.transitional.element")
    ) {
      return {
        __dinou_element__: true,
        type: value.type,
        props: value.props,
        key: value.key,
      };
    }
    return value;
  });
}

/**
 * Deserializes a JSON string back into a genuine React 19 element tree.
 */
function deserializeJSX(json) {
  const parsed = JSON.parse(json, (key, value) => {
    if (value && typeof value === "object") {
      if (value.__dinou_symbol__) {
        return Symbol.for(value.__dinou_symbol__);
      }
      if (value.__dinou_client_ref__) {
        const fakeRef = function () {};
        Object.defineProperties(fakeRef, {
          $$typeof: { value: Symbol.for("react.client.reference") },
          $$id: { value: value.id },
          name: { value: value.name },
          $$async: { value: value.async },
        });
        return fakeRef;
      }
    }
    return value;
  });

  function toReactElement(node) {
    if (node == null || typeof node !== "object") return node;
    if (Array.isArray(node)) return node.map(toReactElement);

    if (node.__dinou_element__) {
      const type = node.type;
      const props = {};
      if (node.props) {
        for (const [k, v] of Object.entries(node.props)) {
          if (k === "key") continue;
          props[k] = toReactElement(v);
        }
      }
      if (node.key != null) {
        props.key = node.key;
      }
      return React.createElement(type, props);
    }
    return node;
  }

  return toReactElement(parsed);
}

/**
 * DinouCacheSlot component.
 *
 * @param {object} props
 * @param {string} [props.id] Unique slot identifier
 * @param {string} [props.tag] Cache tag for granular revalidateTag invalidation
 * @param {string[]} [props.tags] Array of cache tags
 * @param {number} [props.revalidate] Revalidation TTL in seconds (0 = no-cache, >0 = ISR)
 * @param {React.ReactNode | Function} props.children Child component(s)
 */
async function DinouCacheSlot(props) {
  const { id, tag, tags, revalidate, children } = props || {};

  const slotId = id || tag || (Array.isArray(tags) ? tags[0] : null);
  if (!slotId) {
    // If no slot identifier, render directly without caching
    return typeof children === "function" ? await children() : children;
  }

  const allTags = Array.isArray(tags)
    ? [...tags]
    : tag
    ? [tag]
    : [];

  const storageKey = `slots/${slotId}/slot.json`;
  const storage = getStorageAdapter();

  if (!storage) {
    return typeof children === "function" ? await children() : children;
  }

  // 1. Check if cached in storage
  let cached = null;
  try {
    cached = await storage.get(storageKey);
  } catch (err) {
    // Storage read error; proceed to fresh render
  }

  const now = Date.now();
  if (cached && cached.content) {
    const meta = cached.metadata || {};
    const generatedAt = meta.generatedAt || 0;
    const revalidateSeconds =
      typeof revalidate === "number"
        ? revalidate
        : typeof meta.revalidate === "number"
        ? meta.revalidate
        : undefined;

    const isExpired =
      typeof revalidateSeconds === "number" &&
      revalidateSeconds > 0 &&
      now > generatedAt + revalidateSeconds * 1000;

    if (!isExpired) {
      try {
        return deserializeJSX(cached.content);
      } catch (err) {
        // Deserialization error; fallback to re-rendering
      }
    } else {
      // Stale-While-Revalidate: Return stale content immediately,
      // and trigger background regeneration
      try {
        const staleJSX = deserializeJSX(cached.content);

        // Deduplicate in-flight background render
        if (!inflightSlotRenders.has(storageKey)) {
          const bgPromise = (async () => {
            try {
              const childElement = typeof children === "function" ? await children() : children;
              const resolved = await asyncRenderJSXToClientJSX(childElement);
              const serialized = serializeJSX(resolved);
              await storage.set(storageKey, serialized, {
                tags: allTags,
                revalidate: revalidateSeconds,
                generatedAt: Date.now(),
                slotId,
              });
            } catch (e) {
              console.error(`[DinouCacheSlot] Background revalidation failed for slot "${slotId}":`, e);
            } finally {
              inflightSlotRenders.delete(storageKey);
            }
          })();
          inflightSlotRenders.set(storageKey, bgPromise);
        }

        return staleJSX;
      } catch (err) {}
    }
  }

  // 2. Cache MISS or expired without usable stale content: Deduplicate synchronous render
  if (inflightSlotRenders.has(storageKey)) {
    try {
      return await inflightSlotRenders.get(storageKey);
    } catch (e) {}
  }

  const renderPromise = (async () => {
    const childElement = typeof children === "function" ? await children() : children;
    const resolved = await asyncRenderJSXToClientJSX(childElement);
    const serialized = serializeJSX(resolved);

    try {
      await storage.set(storageKey, serialized, {
        tags: allTags,
        revalidate: typeof revalidate === "number" ? revalidate : undefined,
        generatedAt: Date.now(),
        slotId,
      });
    } catch (err) {
      console.error(`[DinouCacheSlot] Failed to write cache for slot "${slotId}":`, err);
    }

    return resolved;
  })();

  inflightSlotRenders.set(storageKey, renderPromise);
  try {
    return await renderPromise;
  } finally {
    inflightSlotRenders.delete(storageKey);
  }
}

module.exports = {
  DinouCacheSlot,
  serializeJSX,
  deserializeJSX,
};
