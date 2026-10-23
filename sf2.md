# Server Functions in Dinou: Architecture, Usage & Manifest Mechanics

This document provides a comprehensive, user-facing and architectural guide to **Server Functions** in Dinou. It is intended to serve as the definitive reference for understanding how `"use server"` behaves, how the two declaration modalities work, how the Server Functions Manifest is populated, and best practices for authoring robust full-stack applications.

---

## 1. Overview & Fundamentals

Server Functions (often called *Server Actions* in the React Server Components ecosystem) allow client-side components to seamlessly invoke asynchronous functions that execute exclusively on the server.

In Dinou, Server Functions bridge the gap between Client and Server components without requiring you to manually write boilerplate API routes, serialize JSON payloads, or configure HTTP fetch clients:

- **Server-Only Execution:** The implementation of a server function runs exclusively in the server runtime (Node.js, Cloudflare Workers, Deno, or Bun).
- **Client RPC Stubs:** When imported or passed to a Client Component, Dinou’s bundler plugin (`esbuild`, `rollup`, or `webpack`) replaces the server code with an RPC client reference (`createClientReference`).
- **Unified Protocol:** Dinou handles argument serialization, execution, return value streaming, and reactive cache invalidation automatically.

---

## 2. The Two Modalities of `"use server"`

Dinou supports the two standard modalities defined by React for Server Functions:

1. **Module-Level Directive** (top of file)
2. **Function-Level Directive** (inside the function body)

While both create callable server endpoints, they behave differently regarding **manifest inclusion**, **tree-shaking**, and **closure capturing**.

---

### Modality 1: Module-Level `"use server"`

When placed at the very top of a file (before any imports or code), `"use server"` designates the **entire module** as a dedicated Server Function module.

#### Syntax Example:
```typescript
// src/actions/user-actions.ts
"use server";

import { db } from "@/server/db";

export async function updateUserEmail(userId: string, newEmail: string) {
  // Runs ONLY on the server
  const user = await db.user.update({
    where: { id: userId },
    data: { email: newEmail },
  });
  return { success: true, email: user.email };
}

export async function deleteUserAccount(userId: string) {
  // Also runs ONLY on the server
  await db.user.delete({ where: { id: userId } });
  return { success: true };
}
```

#### Key Characteristics & Behaviors:

1. **All Exports Become Server Functions:**
   Every exported `async` function in this file is automatically treated as an invokable Server Function.
2. **Client Bundle Transformation:**
   When a Client Component imports anything from this file (e.g. `import { updateUserEmail } from "@/actions/user-actions"`), Dinou's bundler replaces the entire module in the browser bundle with lightweight client stubs. None of the database imports, business logic, or server secrets enter the client JavaScript.
3. **Manifest Inclusion Rule (Module Reachability):**
   - If this file is imported by **any** component (Server Component, Client Component, Page, or Layout function) in your application's dependency graph, **ALL exported functions in this file are registered in the Server Manifest**.
   - **Important Consequence:** Even if `deleteUserAccount` is never called or imported by any component, it **will still be included** in the server manifest simply because the enclosing module was imported.
4. **Ideal Use Cases:**
   - Dedicated action files (e.g., `app/actions/auth.ts`, `app/actions/billing.ts`).
   - Grouping related backend operations that can be imported across various client and server components.

---

### Modality 2: Function-Level `"use server"`

Instead of marking an entire file, you can place `"use server"` as the first statement **inside the body of an `async` function**.

This modality allows co-locating server actions inside regular modules or directly inside Server Components.

---

#### Variant A: Exported Functions with Body-Level `"use server"`

You can export functions containing `"use server"` within a file that does **not** have the module-level directive:

```typescript
// src/utils/operations.ts
// Note: NO "use server" at the top of the file!

import { sendEmailAlert } from "@/server/mail";

// Normal helper function (not a server function)
export function formatUsername(name: string) {
  return name.trim().toLowerCase();
}

// Server Function A
export async function sendNotification(userId: string, message: string) {
  "use server";
  await sendEmailAlert(userId, message);
  return { sent: true };
}

// Server Function B (Unused elsewhere in the app)
export async function unusedBackupTask() {
  "use server";
  // Heavy maintenance logic...
  return { ok: true };
}
```

#### Key Characteristics & Behaviors:

1. **Selective Manifest Registration (Dead-Code Elimination):**
   - Unlike module-level `"use server"`, only the specific functions that are **actually imported and referenced** by other components will be registered in the Server Manifest.
   - In the example above, if a component imports `sendNotification`, but **no component ever imports `unusedBackupTask`**, then `unusedBackupTask` **WILL NOT** be added to the server manifest.
2. **Co-existence with Normal Utilities:**
   - Non-server exports (such as `formatUsername`) remain regular utilities.
3. **Ideal Use Cases:**
   - Libraries or shared modules providing optional server tasks alongside normal helper functions.
   - Optimizing manifest size by avoiding registration of unused actions.

---

#### Variant B: Inline Server Functions (Inside Server Components)

You can define Server Functions directly inside a Server Component:

```tsx
// src/app/profile/page.tsx (Server Component)
import { ClientForm } from "@/components/client-form";
import { secretDbService } from "@/server/private-service";

export default async function ProfilePage({ params }: { params: { id: string } }) {
  const currentSecret = await secretDbService.getToken(params.id);

  // Inline Server Function with Lexical Scope Capture
  async function updateProfile(formData: FormData) {
    "use server";
    const name = formData.get("name") as string;
    // Captures `currentSecret` from the outer scope!
    await secretDbService.save(params.id, name, currentSecret);
    return { ok: true };
  }

  return (
    <div>
      <h1>Edit Profile</h1>
      {/* Passing Server Function as a prop to a Client Component */}
      <ClientForm action={updateProfile} />
    </div>
  );
}
```

#### Key Characteristics & Behaviors:

1. **Closure Scope Capture (`bind`):**
   - Inline server functions can access variables from their outer lexical scope (such as `currentSecret` or `params.id`).
   - Dinou and React automatically capture and encrypt/serialize these bound closure arguments so they are available when the client invokes the function.
2. **Passing Directly as Props:**
   - Server Components can pass inline server functions directly to Client Components via props (e.g. `<ClientForm action={updateProfile} />`).
   - React serializes the function into an action reference (`$F...`).
3. **Isolation & Unexported Helpers:**
   - The inline function can call server-only libraries or unexported helper modules. The bundler extracts the function into an internal server endpoint without exposing any internal module structure to the client.
4. **Ideal Use Cases:**
   - Actions tightly bound to the current page, route parameters, or component-specific data.
   - Form submission handlers that require access to server-side variables without re-fetching them.

---

## 3. Comparison Matrix

| Feature / Aspect | Module-Level `"use server"` | Exported Function-Level `"use server"` | Inline Function-Level `"use server"` |
| :--- | :--- | :--- | :--- |
| **Placement** | Top of the file | First statement in function body | First statement in function body |
| **Scope** | All exported `async` functions | Only the specific function | Only the specific function |
| **Manifest Registration** | **Eager (All exports)** if the module is imported | **Selective (Tree-shaked)**: only imported functions | **Automatic**: when passed or referenced in JSX |
| **Closure Support** | ❌ No (module scope only) | ❌ No (module scope only) | ✅ **Yes** (captures outer lexical scope) |
| **Passing as Prop** | ✅ Yes (`<Client action={myAction} />`) | ✅ Yes (`<Client action={myAction} />`) | ✅ Yes (`<Client action={inlineAction} />`) |
| **Client Bundle Impact** | Entire module replaced with client stubs | Only imported functions stubbed; rest stays intact | Serialized as client reference `$F...` prop |
| **Best For** | Reusable API action files | Shared utility files with mixed exports | Page-specific handlers, form submissions |

---

## 4. Consuming Server Functions on the Client

Once declared, a Server Function can be consumed in Client Components in several ways:

### 1. Form Actions (Native & Progressive Enhancement)
```tsx
"use client";

interface Props {
  action: (formData: FormData) => Promise<any>;
}

export function ClientForm({ action }: Props) {
  return (
    <form action={action}>
      <input name="name" type="text" required />
      <button type="submit">Save</button>
    </form>
  );
}
```

### 2. Imperative Calling (`onClick` / Event Handlers)
```tsx
"use client";

import { useState, useTransition } from "react";
import { updateUserEmail } from "@/actions/user-actions";

export function UserSettings({ userId }: { userId: string }) {
  const [email, setEmail] = useState("");
  const [isPending, startTransition] = useTransition();

  const handleUpdate = () => {
    startTransition(async () => {
      const res = await updateUserEmail(userId, email);
      if (res.success) {
        alert("Email updated!");
      }
    });
  };

  return (
    <div>
      <input value={email} onChange={(e) => setEmail(e.target.value)} />
      <button onClick={handleUpdate} disabled={isPending}>
        {isPending ? "Updating..." : "Update Email"}
      </button>
    </div>
  );
}
```

### 3. With React 19 Hooks (`useActionState`)
```tsx
"use client";

import { useActionState } from "react";

interface Props {
  action: (state: any, formData: FormData) => Promise<any>;
}

export function ActionStateDemo({ action }: Props) {
  const [state, formAction, isPending] = useActionState(action, null);

  return (
    <form action={formAction}>
      <input name="email" type="email" />
      <button type="submit" disabled={isPending}>Submit</button>
      {state?.error && <p className="error">{state.error}</p>}
    </form>
  );
}
```

---

## 5. Under the Hood: Dinou Compiler & Bundler Parity

Dinou provides full parity for Server Functions across **`esbuild`**, **`rollup`**, and **`webpack`**:

1. **Manifest File (`react-client-manifest.json`):**
   - The server function manifest maps function IDs (hash + export name) to the server runtime chunk responsible for executing the function.
   - For example:
     ```json
     {
       "src/actions/user-actions.ts#updateUserEmail": {
         "id": "src/actions/user-actions.ts",
         "name": "updateUserEmail",
         "chunks": ["actions-chunk.js"]
       }
     }
     ```
2. **Order of Execution Safeguards:**
   - In Dinou, the build pipeline guarantees that all Server Functions (both module-level and function-level) are extracted, transformed, and indexed **before** the final client and server manifests are emitted.
   - This prevents race conditions where an inline server function or unexported module function could be omitted from the manifest during static pre-rendering (SSG) or AOT compilation.
3. **Runtime Support:**
   - Server Functions are fully supported across all Dinou production runtimes:
     - **Node.js** (Dev mode and Node AOT)
     - **Cloudflare Workers** (`workerd` runtime)
     - **Deno**
     - **Bun** and **Bun Pure**

---

## 6. Security Considerations & Best Practices

1. **Treat Server Functions as Public API Endpoints:**
   - Any client reference exposed to the browser can technically be invoked by a client HTTP request.
   - **Always validate inputs** (using libraries like Zod or ArkType) and **verify authentication/permissions** inside every Server Function.
2. **Avoid Leaking Sensitive Data in Closure Variables:**
   - When using inline server functions, be mindful of what variables are in scope. While Dinou and React handle closure capture securely, avoid closing over large in-memory objects or sensitive secrets unless necessary.
3. **Prefer Module-Level for Public/Shared Actions:**
   - Putting actions in dedicated modules (e.g. `src/actions/*.ts`) provides cleaner architectural boundaries and makes code reuse across components easier.
4. **Prefer Function-Level / Inline for Component-Specific Actions:**
   - Use function-level or inline actions when passing actions directly via props or when the action logic belongs strictly to a specific view.
