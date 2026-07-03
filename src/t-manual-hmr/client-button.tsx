"use client";

import { useState } from "react";
import { testAction } from "./actions";

export default function ClientButton() {
  const [response, setResponse] = useState("");
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    try {
      const res = await testAction();
      setResponse(res);
    } catch (e: any) {
      setResponse("Error: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <button 
        onClick={handleClick} 
        style={{ 
          padding: "12px 24px", 
          fontSize: "1rem", 
          background: "#a855f7", 
          color: "white", 
          border: "none", 
          borderRadius: "6px", 
          cursor: "pointer",
          fontWeight: "bold",
          transition: "background 0.2s"
        }}
        onMouseOver={(e) => (e.currentTarget.style.background = "#9333ea")}
        onMouseOut={(e) => (e.currentTarget.style.background = "#a855f7")}
      >
        {loading ? "Ejecutando..." : "Llamar Server Function"}
      </button>
      {response && (
        <p style={{ marginTop: "15px", color: "#38bdf8", fontWeight: "bold" }}>
          Resultado: {response}
        </p>
      )}
    </div>
  );
}
