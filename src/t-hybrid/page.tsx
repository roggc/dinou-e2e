import { getContext } from "dinou";
import * as fs from "fs";
import * as path from "path";

export default async function Page() {
  const ctx = getContext();
  let mode = "STATIC";
  let secretData = "";

  // 1. Leemos el "Interruptor Externo"
  // Esto NO activa el proxy porque es fs, no context.
  const triggerFile = path.resolve(process.cwd(), "dist2", "hybrid.mode");

  try {
    if (fs.existsSync(triggerFile)) {
      mode = fs.readFileSync(triggerFile, "utf-8").trim();
    }
  } catch (e) {
    // Ignorar error de lectura
  }

  // 2. Decisión basada en el archivo
  if (mode === "DYNAMIC") {
    // 🚨 ZONA PELIGROSA 🚨
    // Al entrar aquí, tocamos el contexto.
    // Tu Proxy detectará esto y marcará la página como DINÁMICA en el Map.

    // Leemos una cookie cualquiera para disparar el proxy
    const session = ctx?.req.cookies?.session_id || "no-session";
    secretData = `[DYNAMIC MODE ACTIVATED] - Session: ${session}`;
  } else {
    // ✅ ZONA SEGURA ✅
    // Aquí NO tocamos ctx.req.cookies ni headers.
    // El sistema pensará que somos estáticos.
    secretData = "[STATIC MODE] - Safe";
  }

  return (
    <div>
      <h1>Mode: {mode}</h1>
      <p>{secretData}</p>
      {/* <small>Timestamp: {Date.now()}</small> */}
    </div>
  );
}
