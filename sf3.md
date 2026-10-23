# Deep-Dive: Server Functions Manifest Mechanics & Inclusion Rules in Dinou

This document provides an in-depth, definitive technical reference on how **Dinou** constructs its `server-functions-manifest.json`, how reachability affects inclusion, and how the placement of the `"use server"` directive determines exactly which functions are exposed as remote RPC endpoints.

---

## 1. Architectural Foundations: The Role of Reachability

The security and size of Dinou's Server Functions Manifest rely on a foundational principle: **Module Reachability**.

```
[page.tsx / layout.tsx / "use client" components]
                       │
             (recursive import tree)
                       ▼
            [Reachable Modules] ───► Evaluated by Compiler
                       │
            [Unreachable (Orphan) Modules] ───► Completely Omitted
```

During build or dev compilation, Dinou’s entry crawlers (in `esbuild`, `rollup`, and `webpack`) traverse the dependency graph starting from:
1. All route entries (`src/**/page.{jsx,tsx,js,ts}` and `src/**/layout.{jsx,tsx,js,ts}`).
2. All Client Components (`"use client"`).

### Rule 0: The Orphan Module Pruning Rule
> **If a file is never imported (directly or transitively) by any reachable page, layout, or client component, it is an Orphan Module.**

For an orphan module, **nothing is ever added to the manifest**:
- It does not matter if the file has `"use server"` at the top.
- It does not matter if functions inside have `"use server"` in their bodies.
- The crawler never encounters the file, it is never added to `serverFiles`, and it is completely absent from `server-functions-manifest.json`.

Once a file is **reachable** (imported at least once), its internal contents are evaluated according to the two modalities below.

---

## 2. Modality 1: Module-Level `"use server"` (Top of File)

When `"use server"` is declared as the first statement of a file:

```typescript
// src/actions/auth.ts
"use server";

import { db } from "@/server/db";

// Exported -> In Manifest
export async function login(username: string, pass: string) {
  return await db.verify(username, pass);
}

// Exported (even if never used elsewhere!) -> In Manifest
export async function resetPassword(email: string) {
  return await db.sendReset(email);
}

// NOT exported -> NEVER in Manifest (strictly private)
function internalHash(str: string) {
  return crypto.createHash("sha256").update(str).digest("hex");
}
```

### Manifest Inclusion Rules for Module-Level Directives:

1. **All EXPORTED functions go to the manifest:**
   - Every function with `export` (`export async function`, `export const ...`, `export default`) is registered in `server-functions-manifest.json`.
   - **Crucial Nuance:** Even if `resetPassword` is never imported or called by any component in the entire project, **it will still be registered in the manifest** simply because the enclosing module was imported. The module-level directive marks the entire module boundary as a public action surface.
2. **Non-exported functions are NEVER in the manifest:**
   - Functions like `internalHash` that do not have `export` are **never auto-exported** and **never added to the manifest**.
   - Dinou respects their private scope. They remain pure server helpers used internally by other functions in the same file.
3. **HTTP Dispatcher Enforcement:**
   - If an attacker sends `POST /____server_function____` with `{ id: "src/actions/auth.ts#internalHash" }`, Dinou checks the manifest, sees that `internalHash` is not an authorized export, and immediately rejects the request with `400 Bad Request: Invalid export name`.

#### Resulting Manifest (`server-functions-manifest.json`):
```json
{
  "src/actions/auth.ts": [
    "login",
    "resetPassword"
  ]
}
```
*(Notice: `internalHash` is absent).*

---

## 3. Modality 2: Function-Level `"use server"` (Inside Function Bodies)

When a file does **not** have `"use server"` at the top, it is treated as a mixed/standard file. The directive is placed exclusively inside specific function bodies:

```typescript
// src/utils/billing.ts (Notice: NO "use server" at top of file)

import { db } from "@/server/db";

// 1. Exported with "use server" in body -> In Manifest
export async function processCharge(cartId: string) {
  "use server";
  return await db.charge(cartId);
}

// 2. Exported with "use server" in body, but UNUSED across the app -> STILL In Manifest
export async function generateUnusedInvoice(invoiceId: string) {
  "use server";
  return await db.createInvoice(invoiceId);
}

// 3. Top-level with "use server" but NO 'export' -> Auto-Exported & In Manifest
async function unexportedAdminTask() {
  "use server";
  return await db.cleanup();
}

// 4. Exported utility WITHOUT "use server" -> NEVER in Manifest
export function calculateTax(subtotal: number) {
  return subtotal * 0.21;
}

// 5. Private helper WITHOUT "use server" -> NEVER in Manifest
function internalFormat(num: number) {
  return `$${num.toFixed(2)}`;
}
```

### Manifest Inclusion Rules for Function-Level Directives:

1. **Only functions containing `"use server"` go to the manifest:**
   - The compiler's AST parser (`extractServerFunctions`) inspects every function block.
   - Any function that explicitly declares `"use server"` inside its body is registered as an RPC action.
2. **Inclusion applies even if the function is never imported elsewhere:**
   - If `src/utils/billing.ts` is imported anywhere in your project (for example, a component does `import { calculateTax } from "@/utils/billing"`):
   - **`processCharge` and `generateUnusedInvoice` WILL BOTH be added to the manifest**, even if `generateUnusedInvoice` is never imported or called by any other file!
   - **Why?** Writing `"use server"` inside a function is an explicit developer declaration: *"Expose this function as a Server Action"*. Once the module is part of the application, the compiler honors that directive for every function that contains it.
3. **Transparent Auto-Exporting of Unexported Actions:**
   - Notice `unexportedAdminTask`: it has `"use server"` in its body, but no `export` keyword.
   - Dinou's compiler AST engine automatically transforms it to an exported function:
     ```diff
     - async function unexportedAdminTask() {
     + export async function unexportedAdminTask() {
     ```
   - It is added to the manifest so that if it is passed through props (`<Client action={unexportedAdminTask} />`), the RPC dispatcher can dynamically load it via standard ESM `await import()` and execute `mod["unexportedAdminTask"]`.
4. **Functions WITHOUT `"use server"` are completely shielded:**
   - `calculateTax` (exported) and `internalFormat` (unexported) do **not** have `"use server"`.
   - They are **NEVER** added to the manifest.
   - If an external HTTP request attempts to call `calculateTax` via `/____server_function____`, it is blocked with `400 Bad Request`.

#### Resulting Manifest (`server-functions-manifest.json`):
```json
{
  "src/utils/billing.ts": [
    "processCharge",
    "generateUnusedInvoice",
    "unexportedAdminTask"
  ]
}
```
*(Notice: `calculateTax` and `internalFormat` are completely excluded).*

---

## 4. Comprehensive Comparison Matrix

| Scenario / Code Pattern | Enclosing Module Reachable? | Directive Location | Exported in Source Code? | Auto-Exported by Dinou? | Included in `server-functions-manifest.json`? | Callable via `POST /____server_function____`? |
| :--- | :---: | :--- | :---: | :---: | :---: | :---: |
| **Orphan File** | ❌ No | Anywhere | Yes or No | ❌ No | ❌ **No** (0% inclusion) | ❌ No (400 Bad Request) |
| **Module-Level Directive** | ✅ Yes | Line 1 of file | ✅ Yes | N/A (Already exported) | ✅ **Yes** (All exports included) | ✅ Yes |
| **Module-Level Directive** | ✅ Yes | Line 1 of file | ❌ No | ❌ No (Preserved private) | ❌ **No** | ❌ No (400 Bad Request) |
| **Function-Level Directive** | ✅ Yes | Inside function body | ✅ Yes | N/A (Already exported) | ✅ **Yes** | ✅ Yes |
| **Function-Level Directive** | ✅ Yes | Inside function body | ❌ No | ✅ **Yes** (Auto-exported) | ✅ **Yes** | ✅ Yes |
| **Normal Function (Mixed File)**| ✅ Yes | None | ✅ Yes | N/A | ❌ **No** | ❌ No (400 Bad Request) |
| **Private Helper (Mixed File)** | ✅ Yes | None | ❌ No | ❌ No | ❌ **No** | ❌ No (400 Bad Request) |

---

## 5. Security & Best-Practice Takeaways for Developers

1. **Module-level `"use server"` is for dedicated API files:**
   Use `"use server"` at the top of files that contain **only** public Server Actions (e.g. `src/actions/*.ts`). Remember that any `export` in that file becomes a publicly invokable RPC endpoint.
2. **Function-level `"use server"` is for selective exposure:**
   When you have a shared file or Server Component that mixes database queries, helper algorithms, and actions, **never** put `"use server"` at the top. Put `"use server"` strictly inside the functions you want to expose. Everything else will be completely shielded from the manifest.
3. **Do not mark dead actions with `"use server"`:**
   If you have a function with `"use server"` in its body that you no longer need, remove the directive or delete the function. Simply not importing it in other files is not enough to keep it out of the manifest if the parent module itself is imported.
