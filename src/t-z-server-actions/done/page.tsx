import { getContext } from "dinou";

export default function Z3DonePage() {
  const ctx = getContext();
  return (
    <main data-testid="z3-done-page">
      <h1 data-testid="z3-done-cookie">
        {`Done:${ctx.req.cookies?.z3_browser_prog || "none"}`}
      </h1>
    </main>
  );
}
