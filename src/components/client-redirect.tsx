"use client";

import { useEffect } from "react";
// Asumiendo que usas un router estándar, ajusta esto a tu router
// Si no tienes router SPA, usa window.location.href

export function ClientRedirect({ to }: { to: string }) {
  useEffect(() => {
    // Opción A: Navegación dura (recarga página)
    window.location.href = to;

    // Opción B: Si usas un router tipo Next/Wouter:
    // router.push(to);
  }, [to]);

  return null; // No renderiza nada visualmente
}
