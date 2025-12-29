"use client";

import { useRouter } from "dinou";

export default function TestButton() {
  const router = useRouter();

  return (
    <div style={{ padding: "20px", border: "1px solid #ccc" }}>
      <p>Testing useRouter Hook</p>

      {/* Botón para Push (Navegación normal) */}
      <button
        data-testid="btn-push"
        onClick={() =>
          router.push(
            "/t-spa-use-router/t-layout-client-component/t-client-component/target"
          )
        }
        style={{ marginRight: "10px" }}
      >
        Go to Target (Push)
      </button>

      {/* Botón para Replace (No deja historial) */}
      <button
        data-testid="btn-replace"
        onClick={() =>
          router.replace(
            "/t-spa-use-router/t-layout-client-component/t-client-component/target"
          )
        }
      >
        Go to Target (Replace)
      </button>
    </div>
  );
}
