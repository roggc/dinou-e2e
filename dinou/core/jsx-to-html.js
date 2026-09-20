// dinou/core/jsx-to-html.js
// Lightweight server-side JSX-to-HTML serializer for Edge/Worker environments.

const SELF_CLOSING_TAGS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "param", "source", "track", "wbr",
]);

function escapeHtml(str) {
  if (typeof str !== "string") str = String(str);
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(str) {
  if (typeof str !== "string") str = String(str);
  return str
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function styleObjectToString(style) {
  if (typeof style === "string") return style;
  if (!style || typeof style !== "object") return "";
  return Object.entries(style)
    .map(([k, v]) => {
      const prop = k.replace(/([A-Z])/g, "-$1").toLowerCase();
      return `${prop}:${v}`;
    })
    .join(";");
}

/**
 * Serializes a React JSX element tree into an HTML string.
 * Works seamlessly in Edge/Workers without requiring Node child_process.
 * 
 * @param {*} node React Element or primitive or Promise
 * @returns {Promise<string>} HTML string
 */
async function renderJsxToHtml(node) {
  if (node == null || typeof node === "boolean") {
    return "";
  }

  // If node is a Promise (e.g. from async component or server function)
  if (typeof node === "object" && typeof node.then === "function") {
    try {
      const resolved = await node;
      return await renderJsxToHtml(resolved);
    } catch (e) {
      return "";
    }
  }

  if (typeof node === "string" || typeof node === "number") {
    return escapeHtml(node);
  }

  if (Array.isArray(node)) {
    const renderedItems = await Promise.all(node.map((child) => renderJsxToHtml(child)));
    return renderedItems.join("");
  }

  if (typeof node === "object" && node !== null) {
    // React Fragment
    if (node.type === Symbol.for("react.fragment")) {
      return await renderJsxToHtml(node.props?.children);
    }

    // Suspense
    if (
      node.type === Symbol.for("react.suspense") ||
      node.type === "Suspense"
    ) {
      try {
        let child = node.props?.children;
        if (child && typeof child.then === "function") {
          child = await child;
        }
        return await renderJsxToHtml(child);
      } catch (e) {
        return await renderJsxToHtml(node.props?.fallback);
      }
    }

    // HTML Elements (string type)
    if (typeof node.type === "string") {
      const tag = node.type;
      const { children, ...props } = node.props || {};

      let attrs = "";
      for (const [key, val] of Object.entries(props)) {
        if (val == null || typeof val === "function" || key === "children") {
          continue;
        }

        if (key === "className") {
          attrs += ` class="${escapeAttr(val)}"`;
        } else if (key === "style") {
          const styleStr = styleObjectToString(val);
          if (styleStr) attrs += ` style="${escapeAttr(styleStr)}"`;
        } else if (key === "dangerouslySetInnerHTML" && val && val.__html) {
          // dangerouslySetInnerHTML
          return `<${tag}${attrs}>${val.__html}</${tag}>`;
        } else if (typeof val === "boolean") {
          if (val) attrs += ` ${key}`;
        } else {
          attrs += ` ${key}="${escapeAttr(val)}"`;
        }
      }

      if (SELF_CLOSING_TAGS.has(tag)) {
        return `<${tag}${attrs}/>`;
      }

      const inner = await renderJsxToHtml(children);
      return `<${tag}${attrs}>${inner}</${tag}>`;
    }

    // Check if node is a Client Component Reference with an SSR implementation
    let clientRefId = "";
    try {
      if (node.type) {
        if (typeof node.type.$$id === "string") {
          clientRefId = node.type.$$id;
        } else if (typeof node.type.name === "string") {
          clientRefId = node.type.name;
        }
      }
    } catch (e) {
      clientRefId = "";
    }

    if (
      clientRefId &&
      typeof globalThis !== "undefined" &&
      globalThis.__DINOU_CLIENT_SSR__
    ) {
      const ssrMap = globalThis.__DINOU_CLIENT_SSR__;
      let ssrFn = ssrMap[clientRefId];
      if (!ssrFn) {
        const altId = clientRefId.replace(/\\/g, "/");
        ssrFn = ssrMap[altId];
        if (!ssrFn) {
          const driveSwapped = altId.replace(/file:\/\/\/([a-zA-Z]):/, (m, d) =>
            'file:///' + (d === d.toLowerCase() ? d.toUpperCase() : d.toLowerCase()) + ':'
          );
          ssrFn = ssrMap[driveSwapped];
        }
      }

      if (typeof ssrFn === "function") {
        try {
          let rendered = ssrFn(node.props || {});
          if (rendered && typeof rendered.then === "function") {
            rendered = await rendered;
          }
          if (rendered != null) {
            return await renderJsxToHtml(rendered);
          }
        } catch (e) {
          console.warn(`[Edge ISG SSR] Component failed in ${clientRefId}:`, e);
          // Fall back to children if SSR function throws
        }
      }
    }

    // Callable function component (e.g. Server Component or normal function)
    if (typeof node.type === "function") {
      try {
        let rendered = node.type(node.props || {});
        if (rendered && typeof rendered.then === "function") {
          rendered = await rendered;
        }
        if (rendered != null) {
          return await renderJsxToHtml(rendered);
        }
      } catch (e) {
        // Fall back to children
      }
    }

    // Functional / Client Component references: render their children
    if (node.props && "children" in node.props) {
      let children = node.props.children;
      if (children && typeof children.then === "function") {
        children = await children;
      }
      return await renderJsxToHtml(children);
    }
  }

  return "";
}

module.exports = {
  renderJsxToHtml,
};
