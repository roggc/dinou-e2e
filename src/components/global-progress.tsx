// src/components/global-progress.jsx
"use client";
import { useNavigationLoading } from "dinou"; // o dinou/navigation

export default function GlobalProgress() {
  const isLoading = useNavigationLoading();

  if (!isLoading) return null;

  return (
    <div
      data-testid="global-loader"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100%",
        height: "4px",
        background: "linear-gradient(90deg, red, orange)",
        zIndex: 9999,
        animation: "loading-animation 1s infinite",
      }}
    />
  );
}
