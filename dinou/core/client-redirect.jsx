// dinou/core/client-redirect.jsx
"use client";

import { useEffect } from "react";
import { useRouter } from "./navigation.js";

function sanitizeClientRedirectTarget(rawTarget) {
  if (typeof rawTarget !== "string" || rawTarget.length === 0) return "/";
  if (/[\u0000-\u001F\u007F]/.test(rawTarget)) return "/";
  if (rawTarget !== rawTarget.trim()) return "/";
  if (rawTarget.startsWith("/")) {
    if (/^\/[\/\\]/.test(rawTarget)) return "/";
    const pathOnly = rawTarget.split("?")[0].split("#")[0];
    if (pathOnly.includes("\\")) return "/";
    try {
      const parsed = new URL(rawTarget, "http://dinou.invalid");
      return parsed.origin === "http://dinou.invalid" ? rawTarget : "/";
    } catch {
      return "/";
    }
  }
  if (/^https?:\/\//i.test(rawTarget)) {
    try {
      const parsed = new URL(rawTarget);
      if ((parsed.protocol === "http:" || parsed.protocol === "https:") && parsed.hostname) {
        return rawTarget;
      }
    } catch {}
  }
  return "/";
}

export function ClientRedirect({ to }) {
  const router = useRouter();

  useEffect(() => {
    if (typeof window !== "undefined") {
      const safeTo = sanitizeClientRedirectTarget(to);
      document.body.setAttribute("data-hydrated", "true");
      if (window.__DINOU_ROUTER_NAVIGATE__) {
        window.__DINOU_ROUTER_NAVIGATE__(safeTo, { replace: true });
      } else if (router && router.replace) {
        router.replace(safeTo);
      } else {
        window.__DINOU_STATIC_EXPORT_UNLOADING__ = true;
        window.location.href = safeTo;
      }
    }
  }, [to, router]);

  return null;
}

export default ClientRedirect;

