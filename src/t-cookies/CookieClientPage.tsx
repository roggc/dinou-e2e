"use client";

import { useState, useEffect } from "react";
import { setCookieAction, clearCookieAction } from "./actions";

export default function CookieClientPage() {
  const [cookieString, setCookieString] = useState("");
  const [status, setStatus] = useState("");

  const updateCookies = () => {
    if (typeof window !== "undefined") {
      setCookieString(document.cookie);
    }
  };

  useEffect(() => {
    updateCookies();
  }, []);

  const handleAction = async (fn: () => Promise<any>, actionName: string) => {
    setStatus(`Running ${actionName}...`);
    try {
      await fn();
      setStatus(`Success: ${actionName}`);
      updateCookies();
    } catch (err: any) {
      setStatus(`Error: ${err.message}`);
    }
  };

  return (
    <div>
      <div id="action-status" style={{ fontWeight: "bold", margin: "10px 0" }}>
        {status}
      </div>

      <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
        <button
          id="btn-set-std"
          onClick={() =>
            handleAction(
              () => setCookieAction("cookie_std", "val_std", { path: "/" }),
              "set standard"
            )
          }
        >
          Set Cookie (Std)
        </button>

        <button
          id="btn-clear-std"
          onClick={() =>
            handleAction(
              () => clearCookieAction("cookie_std", { path: "/" }),
              "clear standard"
            )
          }
        >
          Clear Cookie (Std)
        </button>
      </div>

      <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
        <button
          id="btn-set-opts"
          onClick={() =>
            handleAction(
              () =>
                setCookieAction("cookie_opts", "val_opts", {
                  path: "/t-cookies",
                  sameSite: "lax",
                }),
              "set options"
            )
          }
        >
          Set Cookie (Opts)
        </button>

        <button
          id="btn-clear-opts"
          onClick={() =>
            handleAction(
              () =>
                clearCookieAction("cookie_opts", {
                  path: "/t-cookies",
                  sameSite: "lax",
                }),
              "clear options"
            )
          }
        >
          Clear Cookie (Opts)
        </button>
      </div>

      <div>
        <h3>Current document.cookie:</h3>
        <pre id="cookie-display">{cookieString || "(none)"}</pre>
      </div>
    </div>
  );
}
