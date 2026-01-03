"use client";
import { useRouter } from "dinou";
import { useState } from "react";

export default function ClientView({ serverId }: { serverId: string }) {
  const router = useRouter();
  const [text, setText] = useState(""); // Estado local del cliente

  return (
    <div style={{ border: "2px solid blue", padding: "20px" }}>
      <h2>Client Side Zone</h2>

      {/* 1. Datos del servidor que deben cambiar al refrescar */}
      <p>
        Server ID:{" "}
        <strong id="server-id" suppressHydrationWarning={true}>
          {serverId}
        </strong>
      </p>

      {/* 2. Estado del cliente que NO debe perderse al refrescar */}
      <input
        id="client-input"
        type="text"
        placeholder="Type here..."
        value={text}
        onChange={(e) => setText(e.target.value)}
        style={{ display: "block", marginBottom: "10px" }}
      />

      <button id="btn-refresh" onClick={() => router.refresh()}>
        🔄 Soft Refresh
      </button>
    </div>
  );
}
