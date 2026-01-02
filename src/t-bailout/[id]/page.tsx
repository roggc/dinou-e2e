import { getContext } from "dinou"; // O tu import correcto

export default async function Page() {
  const ctx = getContext();

  // 🔥 EL DETONADOR: Simplemente leer la propiedad debe activar el Proxy
  // No hace falta .get(), con acceder a la propiedad basta.
  const userCookie = ctx?.req?.cookies?.user_session2 || "invitado";

  return (
    <div id="dynamic-content">
      Soy Dinámica porque toqué la cookie: {userCookie}
    </div>
  );
}
