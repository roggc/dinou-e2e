export default async function Page() {
  // Simulamos un crash durante el renderizado
  throw new Error("💥 EXPLOSIÓN EN EL SLOT 💥");
  return <div>Nunca llegarás aquí</div>;
}
