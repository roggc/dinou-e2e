import { getContext } from "dinou";
import { DinouCacheSlot } from "dinou/server";
import { submitProgressiveForm, boundProgressiveAction } from "./actions";
import ServerActionsClient from "./ServerActionsClient";

async function CookieSlotView() {
  const ctx = getContext();
  const c = ctx.req.cookies || {};
  return (
    <span data-testid="z3-slot-cookies">
      {`a=${c.z3_c_a || "none"}|b=${c.z3_c_b || "none"}|c=${c.z3_c_c || "none"}`}
    </span>
  );
}

export default function Z3ServerActionsPage() {
  const ctx = getContext();
  const c = ctx.req.cookies || {};
  const store = (globalThis as any).__Z3_E2E_STORE__ || {
    progressiveItems: [],
    boundItems: [],
  };
  const boundAction = boundProgressiveAction.bind(null, "SRV_BOUND");

  return (
    <main data-testid="z3-page">
      <h1>Z3 Advanced Server Functions &amp; Progressive Enhancement</h1>

      <section data-testid="z3-nojs-section">
        <div data-testid="z3-nojs-items">
          {store.progressiveItems.join(",") || "empty"}
        </div>
        <div data-testid="z3-nojs-bound-items">
          {store.boundItems.join(",") || "empty"}
        </div>
        <div data-testid="z3-nojs-cookie">
          {c.z3_browser_prog || "none"}
        </div>

        <form data-testid="z3-nojs-form" action={submitProgressiveForm}>
          <input
            name="title"
            data-testid="z3-nojs-title-input"
            defaultValue="nojs-default"
          />
          <input
            type="checkbox"
            name="goDone"
            value="1"
            data-testid="z3-nojs-godone-checkbox"
          />
          <button type="submit" data-testid="z3-nojs-submit">
            Submit No-JS Form
          </button>
        </form>

        <form data-testid="z3-nojs-bound-form" action={boundAction}>
          <input
            name="label"
            data-testid="z3-nojs-bound-input"
            defaultValue="bound-default"
          />
          <button type="submit" data-testid="z3-nojs-bound-submit">
            Submit No-JS Bound Form
          </button>
        </form>
      </section>

      <section data-testid="z3-server-cookie-section">
        <div data-testid="z3-server-cookies">
          {`a=${c.z3_c_a || "none"}|b=${c.z3_c_b || "none"}|c=${c.z3_c_c || "none"}`}
        </div>
        <DinouCacheSlot id="z3-cookie-slot" revalidate={60}>
          <CookieSlotView />
        </DinouCacheSlot>
      </section>

      <ServerActionsClient />
    </main>
  );
}
