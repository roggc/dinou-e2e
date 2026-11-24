"use client";

import { Link } from "dinou";

export default function ErrorCubeBoundary({
  error,
  reset,
}: {
  error?: { message?: string; name?: string };
  reset?: () => void;
}) {
  return (
    <div
      id="cube-err-boundary"
      data-has-reset={typeof reset === "function" ? "true" : "false"}
      style={{ border: "1px solid #dc2626", background: "#fff1f2", padding: 8, margin: "6px 0" }}
    >
      <h3>Error Cube Boundary</h3>
      <p id="cube-err-msg">{error?.message || "Captured Error"}</p>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          id="btn-err-reset"
          type="button"
          onClick={() => {
            if (typeof reset === "function") {
              reset();
            }
          }}
        >
          Reset Boundary
        </button>
        <Link
          id="link-err-recover-healthy"
          href="/t-3d-cube/error-cube/healthy"
          prefetch={false}
        >
          Back To Healthy
        </Link>
      </div>
    </div>
  );
}
