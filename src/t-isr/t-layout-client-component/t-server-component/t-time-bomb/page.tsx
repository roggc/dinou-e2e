// src/t-isr-protection/page.tsx (o donde pongas tus rutas)
import * as fs from "fs";
import * as path from "path";

export default async function IsrProtectionPage() {
  const triggerFile = path.resolve(process.cwd(), ".dinou/dist2/trigger-error.txt");

  // // LOG DE DEPURACIÓN EN DISCO (Indestructible)
  // // Esto creará un archivo 'bomb-debug.log' en la raíz de tu proyecto
  // const debugLogPath = path.resolve(process.cwd(), "bomb-debug.log");

  const exists = fs.existsSync(triggerFile);

  // const logMessage = `[${new Date().toISOString()}] Checked: ${triggerFile} | Exists: ${exists}\n`;
  // fs.appendFileSync(debugLogPath, logMessage);

  if (exists) {
    // // También logueamos la explosión
    // fs.appendFileSync(
    //   debugLogPath,
    //   `[${new Date().toISOString()}] 💥 BOOM! Throwing Error...\n`
    // );
    throw new Error("Simulated Critical Error for ISR Testing");
  }

  return (
    <div>
      <h1>Contenido Seguro y Valido</h1>
      <p>Esta versión funciona correctamente.</p>
      <small>{Date.now()}</small>
    </div>
  );
}
