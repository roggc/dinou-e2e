"use client";

import React from "react";

const createContext = React.createContext;
const useContext = React.useContext;
const use = React.use;
const createElement = React.createElement;
const Component = typeof React.Component === "function" ? React.Component : class {};

export const DinouPageContext =
  typeof globalThis !== "undefined" && globalThis.__DINOU_PAGE_CONTEXT__
    ? globalThis.__DINOU_PAGE_CONTEXT__
    : (typeof createContext === "function"
        ? (typeof globalThis !== "undefined"
            ? (globalThis.__DINOU_PAGE_CONTEXT__ = createContext(null))
            : createContext(null))
        : null);

export function cleanErrorStack(stack) {
  if (!stack || typeof stack !== "string") return "";
  const lines = stack.split("\n");
  const filtered = [];

  for (const line of lines) {
    if (!line.trim().startsWith("at ")) {
      filtered.push(line);
      continue;
    }

    // Filter out client Flight / bundler runtime internals
    if (
      line.includes("resolveErrorDev") ||
      line.includes("resolveErrorModel") ||
      line.includes("processFullStringRow") ||
      line.includes("processFullBinaryRow") ||
      line.includes("processBinaryChunk") ||
      line.includes("buildFakeCallStack") ||
      line.includes("createFakeFunction") ||
      line.includes("initializeFakeTask") ||
      line.includes("getRootTask") ||
      line.includes("progress (http") ||
      line.includes("__hmr_client__") ||
      (line.includes("http://") && line.includes("/chunk-"))
    ) {
      continue;
    }

    // Filter out server engine / Node internals
    if (
      line.includes("node_modules/@roggc/react-server-dom-esm") ||
      line.includes("node_modules/react-dom") ||
      line.includes("node_modules/react/") ||
      line.includes("node:internal") ||
      line.includes("asyncRenderJSXToClientJSX") ||
      line.includes("renderModelDestructive") ||
      line.includes("renderHtmlStream") ||
      line.includes("pipeRSC")
    ) {
      continue;
    }

    filtered.push(line);
  }

  return (filtered.length > 0 ? filtered : lines).join("\n").trim();
}

class SlotErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("[Dinou] Page Error caught in Slot:", error, errorInfo);
  }

  componentDidUpdate(prevProps) {
    if (this.state.hasError && prevProps.pagePromise !== this.props.pagePromise) {
      this.setState({ hasError: false, error: null });
    }
  }

  render() {
    if (this.state.hasError) {
      const isDev = process.env.NODE_ENV !== "production";
      return createElement(
        "div",
        {
          style: {
            fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
            padding: "32px",
            maxWidth: "960px",
            margin: "40px auto",
            backgroundColor: "#fff1f2",
            border: "1px solid #fecdd3",
            borderRadius: "12px",
            color: "#9f1239",
            boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.1)",
          },
        },
        createElement(
          "div",
          { style: { display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" } },
          createElement(
            "span",
            { style: { background: "#e11d48", color: "white", padding: "2px 8px", borderRadius: "9999px", fontSize: "12px", fontWeight: "bold" } },
            isDev ? "Dinou Dev Error" : "Application Error"
          ),
          createElement(
            "h2",
            { style: { margin: 0, fontSize: "1.25rem", fontWeight: 700, color: "#881337" } },
            this.state.error?.message || "Unhandled Application Error"
          )
        ),
        isDev && createElement(
          "p",
          { style: { margin: "0 0 16px 0", fontSize: "0.875rem", color: "#9f1239", lineHeight: 1.5 } },
          "An unhandled error occurred during rendering. You can provide a custom error UI by creating an ",
          createElement("code", { style: { background: "#ffe4e6", padding: "2px 6px", borderRadius: "4px", fontWeight: 600 } }, "error.tsx"),
          " file in your route folder."
        ),
        isDev && this.state.error?.stack && createElement(
          "pre",
          {
            style: {
              background: "#0f172a",
              color: "#f8fafc",
              padding: "16px",
              borderRadius: "8px",
              overflowX: "auto",
              fontSize: "0.8125rem",
              lineHeight: 1.6,
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            },
          },
          this.state.error.stack
        )
      );
    }
    return this.props.children;
  }
}

function PageConsumer({ pagePromise }) {
  if (pagePromise && pagePromise.status === "rejected") {
    throw pagePromise.reason;
  }
  return use ? use(pagePromise) : pagePromise;
}

export function DinouPageSlot() {
  if (typeof useContext !== "function" || !DinouPageContext) {
    return null;
  }
  const pagePromise = useContext(DinouPageContext);
  if (!pagePromise) {
    return null;
  }
  return createElement(
    SlotErrorBoundary,
    { pagePromise },
    createElement(PageConsumer, { pagePromise })
  );
}

export default DinouPageSlot;
