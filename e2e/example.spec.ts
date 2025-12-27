import { test, expect } from "@playwright/test";
// Detectamos si estamos en un entorno de "start" (Producción)
const isProd = process.env.TEST_CMD?.includes("start") || false;

async function SSRStreamingFlow(
  page: any,
  response: any = null,
  invokedFromServerComponent = false
) {
  if (isProd) {
    // 🟢 EN PROD (SSG): Esperamos el resultado final INMEDIATAMENTE
    // No debe haber loading, debe poner "bye!" directo.
    await expect(page.getByText("bye!")).toBeVisible();
    await expect(page.getByText("Helper accessed User-Agent:")).toBeVisible();
    await expect(page.getByText("loading...")).not.toBeVisible();
    await expect(page.getByText("hello!")).toBeVisible();

    // 2. Verificaciones de Infraestructura (Cookies & Headers)
    const cookies = await page.context().cookies();
    const myCookie = cookies.find((c: any) => c.name === "theme");

    if (!invokedFromServerComponent) {
      // CASO A: Client Component (SSG + Fetch Cliente)
      // ------------------------------------------------
      // Aunque el HTML es estático, el cliente hizo un fetch a la API.
      // Eza API sí es dinámica y SÍ devuelve headers/cookies.

      // Cookie: Debe existir
      expect(myCookie?.value).toBe("dark");

      // Header: NO estará en la navegación principal (index.html),
      // pero SÍ estaría en la petición de red del fetch (difícil de testear aquí sin interceptar).
      // Así que asumimos que en navigation response NO está.
      if (response) {
        const headers = await response.allHeaders();
        expect(headers["x-custom-dinou"]).toBeUndefined();
      }
    } else {
      // CASO B: Server Component (SSG Puro)
      // ------------------------------------------------
      // Todo ocurrió en el build. El usuario recibe un HTML plano.

      expect(myCookie?.value).toBe("dark");

      // Header: NO debe existir
      if (response) {
        const headers = await response.allHeaders();
        expect(headers["x-custom-dinou"]).toBeUndefined();
      }
    }
  } else {
    // 2. VERIFICACIÓN INICIAL (Inmediata)
    // El texto estático "hello!" debe estar ahí desde el HTML inicial (SSR).
    await expect(page.getByText("hello!")).toBeVisible();

    // El fallback del Suspense debe estar visible inmediatamente.
    await expect(page.getByText("loading...")).toBeVisible();

    // Aseguramos que "bye!" AÚN NO está visible (está "en el servidor" esperando el timeout).
    await expect(page.getByText("bye!")).not.toBeVisible();

    // 3. LA ESPERA AUTOMÁTICA (Transición)
    // Playwright esperará automáticamente a que aparezca "bye!".
    // Como tu server function tarda 1s y el timeout por defecto es 5s, esto pasará sin problemas.
    // Esto verifica que el Stream llegó y React hidrató el componente devuelto.
    await expect(page.getByText("bye!")).toBeVisible({ timeout: 10000 });
    // El helper debe haber podido leer el User-Agent o una Cookie
    // y la server function lo devuelve al cliente.
    await expect(page.getByText("Helper accessed User-Agent:")).toBeVisible();

    // 4. ESTADO FINAL
    // Una vez llega el componente, el "loading..." debe desaparecer.
    await expect(page.getByText("loading...")).not.toBeVisible();

    // "hello!" debe seguir ahí (no se borró la página, fue un update parcial).
    await expect(page.getByText("hello!")).toBeVisible();

    // Verificar Header
    if (response && invokedFromServerComponent) {
      const headers = await response.allHeaders();
      expect(headers["x-custom-dinou"]).toBe("v4-rocks");
    }

    // Verificar Cookie en el navegador
    const cookies = await page.context().cookies();
    const myCookie = cookies.find((c: any) => c.name === "theme");
    expect(myCookie?.value).toBe("dark");
  }
}

async function SSRStreamingFlowProd(
  page: any,
  response: any = null,
  invokedFromServerComponent = false
) {
  // 🛑 MAGIA DE PLAYWRIGHT:
  // Si NO estamos en producción, saltamos este test.
  // En el reporte saldrá como "Skipped" en lugar de "Passed".
  test.skip(
    !isProd,
    "Testing dynamic opt-out only makes sense in Production builds"
  );
  // 2. VERIFICACIÓN INICIAL (Inmediata)
  // El texto estático "hello!" debe estar ahí desde el HTML inicial (SSR).
  await expect(page.getByText("hello!")).toBeVisible();

  // El fallback del Suspense debe estar visible inmediatamente.
  await expect(page.getByText("loading...")).toBeVisible();

  // Aseguramos que "bye!" AÚN NO está visible (está "en el servidor" esperando el timeout).
  await expect(page.getByText("bye!")).not.toBeVisible();

  // 3. LA ESPERA AUTOMÁTICA (Transición)
  // Playwright esperará automáticamente a que aparezca "bye!".
  // Como tu server function tarda 1s y el timeout por defecto es 5s, esto pasará sin problemas.
  // Esto verifica que el Stream llegó y React hidrató el componente devuelto.
  await expect(page.getByText("bye!")).toBeVisible({ timeout: 10000 });
  await expect(page.getByText("Helper accessed User-Agent:")).toBeVisible();

  // 4. ESTADO FINAL
  // Una vez llega el componente, el "loading..." debe desaparecer.
  await expect(page.getByText("loading...")).not.toBeVisible();

  // "hello!" debe seguir ahí (no se borró la página, fue un update parcial).
  await expect(page.getByText("hello!")).toBeVisible();

  if (response && invokedFromServerComponent) {
    const headers = await response.allHeaders();
    expect(headers["x-custom-dinou"]).toBe("v4-rocks");
  }

  // Verificar Cookie en el navegador
  const cookies = await page.context().cookies();
  const myCookie = cookies.find((c: any) => c.name === "theme");
  expect(myCookie?.value).toBe("dark");
}

async function conncurrencyFlow(
  browser: any,
  url: string,
  invokedFromServer = false
) {
  test.skip(
    isProd && invokedFromServer,
    "SSG builds do not support dynamic content when invoked from Server Components"
  );
  // 1. Crear dos contextos (simula dos usuarios en dos PCs distintos)
  const userA = await browser.newContext();
  const userB = await browser.newContext();

  // 2. Setear cookies distintas para identificarlos
  await userA.addCookies([
    { name: "user", value: "ALICE", domain: "localhost", path: "/" },
  ]);
  await userB.addCookies([
    { name: "user", value: "BOB", domain: "localhost", path: "/" },
  ]);

  const pageA = await userA.newPage();
  const pageB = await userB.newPage();

  pageA.on("console", (msg: any) => {
    if (msg.type() === "error") console.log(`[Browser Error]: ${msg.text()}`);
  });
  pageB.on("console", (msg: any) => {
    if (msg.type() === "error") console.log(`[Browser Error]: ${msg.text()}`);
  });

  // 3. Lanzar las peticiones SIMULTÁNEAMENTE (Promise.all)
  // La server function debe leer la cookie y devolver: "Hello [Name]"
  // Añadimos un delay artificial en el servidor para forzar solapamiento.
  await Promise.all([
    pageA.goto(url, { waitUntil: "commit" }),
    pageB.goto(url, { waitUntil: "commit" }),
  ]);

  // 4. Verificar que no se cruzaron los cables
  // await expect(pageA.getByText("Hello ALICE")).toBeVisible();
  await expect(
    pageA.getByText("Hello ALICE", { exact: true }).locator("visible=true")
  ).toBeVisible();
  await expect(pageA.getByText("Hello BOB")).not.toBeVisible(); // 🛑 Si esto falla, tienes un leak grave

  // await expect(pageB.getByText("Hello BOB")).toBeVisible();
  await expect(
    pageB.getByText("Hello BOB", { exact: true }).locator("visible=true")
  ).toBeVisible();
  await expect(pageB.getByText("Hello ALICE")).not.toBeVisible();

  await userA.close();
  await userB.close();
}

async function conncurrencyFlowProdDynamic(browser: any, url: string) {
  test.skip(
    !isProd,
    "Testing dynamic opt-out only makes sense in Production builds"
  );
  // 1. Crear dos contextos (simula dos usuarios en dos PCs distintos)
  const userA = await browser.newContext();
  const userB = await browser.newContext();

  // 2. Setear cookies distintas para identificarlos
  await userA.addCookies([
    { name: "user", value: "ALICE", domain: "localhost", path: "/" },
  ]);
  await userB.addCookies([
    { name: "user", value: "BOB", domain: "localhost", path: "/" },
  ]);

  const pageA = await userA.newPage();
  const pageB = await userB.newPage();

  pageA.on("console", (msg: any) => {
    if (msg.type() === "error") console.log(`[Browser Error]: ${msg.text()}`);
  });
  pageB.on("console", (msg: any) => {
    if (msg.type() === "error") console.log(`[Browser Error]: ${msg.text()}`);
  });

  // 3. Lanzar las peticiones SIMULTÁNEAMENTE (Promise.all)
  // La server function debe leer la cookie y devolver: "Hello [Name]"
  // Añadimos un delay artificial en el servidor para forzar solapamiento.
  await Promise.all([
    pageA.goto(url, { waitUntil: "commit" }),
    pageB.goto(url, { waitUntil: "commit" }),
  ]);

  // 4. Verificar que no se cruzaron los cables
  // await expect(pageA.getByText("Hello ALICE")).toBeVisible();
  await expect(
    pageA.getByText("Hello ALICE", { exact: true }).locator("visible=true")
  ).toBeVisible();
  await expect(pageA.getByText("Hello BOB")).not.toBeVisible(); // 🛑 Si esto falla, tienes un leak grave

  // await expect(pageB.getByText("Hello BOB")).toBeVisible();
  await expect(
    pageB.getByText("Hello BOB", { exact: true }).locator("visible=true")
  ).toBeVisible();
  await expect(pageB.getByText("Hello ALICE")).not.toBeVisible();

  await userA.close();
  await userB.close();
}

async function redirectFlow(page: any, toServerComponent = false) {
  if (!isProd) {
    await expect(
      page.getByText("This page will be redirected!Redirecting...")
    ).toBeVisible();
  }
  if (toServerComponent) {
    // Playwright debe haber sido redirigido automáticamente a /docs
    await expect(page).toHaveURL("/docs", { timeout: 10000 });
    await expect(
      page.getByText("This page will be redirected!")
    ).not.toBeVisible();
    await expect(page.getByText("This is docs page")).toBeVisible();
  } else {
    // Playwright debe haber sido redirigido automáticamente a /
    await expect(page).toHaveURL("/", { timeout: 10000 });
    await expect(
      page.getByText("This page will be redirected!")
    ).not.toBeVisible();
    await expect(page.getByText("hello!")).toBeVisible();
  }
}

test.describe("Dinou Core: Suspense & Server Functions", () => {
  test("layout client component - Invoked From Client Component-Flujo completo: SSR -> Loading -> Streaming -> Client Component", async ({
    page,
  }) => {
    page.on("console", (msg) => {
      if (msg.type() === "error") console.log(`[Browser Error]: ${msg.text()}`);
    });
    // 1. Navegar a la página (asumiendo que este componente está en la home '/')
    // Si está en otra ruta, cambia '/' por '/tu-ruta'
    const response = await page.goto(
      "/t-server-function/t-layout-client-component/t-invoked-from-client-component/t-return-client-component",
      { waitUntil: "commit" }
    );

    await SSRStreamingFlow(page, response);
  });
  test("concurrency test - layout client component - Invoked From Client Component-Flujo completo: SSR -> Loading -> Streaming -> Client Component", async ({
    browser,
  }) => {
    await conncurrencyFlow(
      browser,
      "/t-server-function/t-layout-client-component/t-invoked-from-client-component/t-return-client-component"
    );
  });
  test("layout client component - Invoked From Client Component-Flujo completo: SSR -> Loading -> Streaming -> Server Component", async ({
    page,
  }) => {
    page.on("console", (msg) => {
      if (msg.type() === "error") console.log(`[Browser Error]: ${msg.text()}`);
    });
    // 1. Navegar a la página (asumiendo que este componente está en la home '/')
    // Si está en otra ruta, cambia '/' por '/tu-ruta'
    const response = await page.goto(
      "/t-server-function/t-layout-client-component/t-invoked-from-client-component/t-return-server-component",
      { waitUntil: "commit" }
    );

    await SSRStreamingFlow(page, response);
  });
  test("concurrency test - layout client component - Invoked From Client Component-Flujo completo: SSR -> Loading -> Streaming -> Server Component", async ({
    browser,
  }) => {
    await conncurrencyFlow(
      browser,
      "/t-server-function/t-layout-client-component/t-invoked-from-client-component/t-return-server-component"
    );
  });
  test("layout client component - Invoked From Server Component-Flujo completo: SSR -> Loading -> Streaming -> Client Component", async ({
    page,
  }) => {
    page.on("console", (msg) => {
      if (msg.type() === "error") console.log(`[Browser Error]: ${msg.text()}`);
    });
    // 1. Navegar a la página (asumiendo que este componente está en la home '/')
    // Si está en otra ruta, cambia '/' por '/tu-ruta'
    const response = await page.goto(
      "/t-server-function/t-layout-client-component/t-invoked-from-server-component/t-return-client-component",
      { waitUntil: "commit" }
    );

    await SSRStreamingFlow(page, response, true);
  });
  test("concurrency test - layout client component - Invoked From Server Component-Flujo completo: SSR -> Loading -> Streaming -> Client Component", async ({
    browser,
  }) => {
    await conncurrencyFlow(
      browser,
      "/t-server-function/t-layout-client-component/t-invoked-from-server-component/t-return-client-component",
      true
    );
  });
  test("layout client component - Invoked From Server Component-Flujo completo: SSR -> Loading -> Streaming -> Server Component", async ({
    page,
  }) => {
    page.on("console", (msg) => {
      if (msg.type() === "error") console.log(`[Browser Error]: ${msg.text()}`);
    });
    // 1. Navegar a la página (asumiendo que este componente está en la home '/')
    // Si está en otra ruta, cambia '/' por '/tu-ruta'
    const response = await page.goto(
      "/t-server-function/t-layout-client-component/t-invoked-from-server-component/t-return-server-component",
      { waitUntil: "commit" }
    );

    await SSRStreamingFlow(page, response, true);
  });
  test("concurrency test - layout client component - Invoked From Server Component-Flujo completo: SSR -> Loading -> Streaming -> Server Component", async ({
    browser,
  }) => {
    await conncurrencyFlow(
      browser,
      "/t-server-function/t-layout-client-component/t-invoked-from-server-component/t-return-server-component",
      true
    );
  });
  test("layout server component - Invoked From Client Component-Flujo completo: SSR -> Loading -> Streaming -> Client Component", async ({
    page,
  }) => {
    page.on("console", (msg) => {
      if (msg.type() === "error") console.log(`[Browser Error]: ${msg.text()}`);
    });
    // 1. Navegar a la página (asumiendo que este componente está en la home '/')
    // Si está en otra ruta, cambia '/' por '/tu-ruta'
    const response = await page.goto(
      "/t-server-function/t-layout-server-component/t-invoked-from-client-component/t-return-client-component",
      { waitUntil: "commit" }
    );

    await SSRStreamingFlow(page, response);
  });
  test("concurrency test - layout server component - Invoked From Client Component-Flujo completo: SSR -> Loading -> Streaming -> Client Component", async ({
    browser,
  }) => {
    await conncurrencyFlow(
      browser,
      "/t-server-function/t-layout-server-component/t-invoked-from-client-component/t-return-client-component"
    );
  });
  test("layout server component - Invoked From Client Component-Flujo completo: SSR -> Loading -> Streaming -> Server Component", async ({
    page,
  }) => {
    page.on("console", (msg) => {
      if (msg.type() === "error") console.log(`[Browser Error]: ${msg.text()}`);
    });
    // 1. Navegar a la página (asumiendo que este componente está en la home '/')
    // Si está en otra ruta, cambia '/' por '/tu-ruta'
    const response = await page.goto(
      "/t-server-function/t-layout-server-component/t-invoked-from-client-component/t-return-server-component",
      { waitUntil: "commit" }
    );

    await SSRStreamingFlow(page, response);
  });
  test("concurrency test - layout server component - Invoked From Client Component-Flujo completo: SSR -> Loading -> Streaming -> Server Component", async ({
    browser,
  }) => {
    await conncurrencyFlow(
      browser,
      "/t-server-function/t-layout-server-component/t-invoked-from-client-component/t-return-server-component"
    );
  });
  test("layout server component - Invoked From Server Component-Flujo completo: SSR -> Loading -> Streaming -> Client Component", async ({
    page,
  }) => {
    page.on("console", (msg) => {
      if (msg.type() === "error") console.log(`[Browser Error]: ${msg.text()}`);
    });
    // 1. Navegar a la página (asumiendo que este componente está en la home '/')
    // Si está en otra ruta, cambia '/' por '/tu-ruta'
    const response = await page.goto(
      "/t-server-function/t-layout-server-component/t-invoked-from-server-component/t-return-client-component",
      { waitUntil: "commit" }
    );

    await SSRStreamingFlow(page, response, true);
  });
  test("concurrency test - layout server component - Invoked From Server Component-Flujo completo: SSR -> Loading -> Streaming -> Client Component", async ({
    browser,
  }) => {
    await conncurrencyFlow(
      browser,
      "/t-server-function/t-layout-server-component/t-invoked-from-server-component/t-return-client-component",
      true
    );
  });
  test("layout server component - Invoked From Server Component-Flujo completo: SSR -> Loading -> Streaming -> Server Component", async ({
    page,
  }) => {
    page.on("console", (msg) => {
      if (msg.type() === "error") console.log(`[Browser Error]: ${msg.text()}`);
    });
    // 1. Navegar a la página (asumiendo que este componente está en la home '/')
    // Si está en otra ruta, cambia '/' por '/tu-ruta'
    const response = await page.goto(
      "/t-server-function/t-layout-server-component/t-invoked-from-server-component/t-return-server-component",
      { waitUntil: "commit" }
    );

    await SSRStreamingFlow(page, response, true);
  });
  test("concurrency test - layout server component - Invoked From Server Component-Flujo completo: SSR -> Loading -> Streaming -> Server Component", async ({
    browser,
  }) => {
    await conncurrencyFlow(
      browser,
      "/t-server-function/t-layout-server-component/t-invoked-from-server-component/t-return-server-component",
      true
    );
  });
  test("prod-dynamic -> layout client component - Invoked From Client Component-Flujo completo: SSR -> Loading -> Streaming -> Client Component", async ({
    page,
  }) => {
    page.on("console", (msg) => {
      if (msg.type() === "error") console.log(`[Browser Error]: ${msg.text()}`);
    });
    // 1. Navegar a la página (asumiendo que este componente está en la home '/')
    // Si está en otra ruta, cambia '/' por '/tu-ruta'
    const response = await page.goto(
      "/t-server-function/t-layout-client-component/t-invoked-from-client-component/t-return-client-component?opt-out=1",
      { waitUntil: "commit" }
    );

    await SSRStreamingFlowProd(page, response);
  });
  test("prod-dynamic -> concurrency test - layout client component - Invoked From Client Component-Flujo completo: SSR -> Loading -> Streaming -> Client Component", async ({
    browser,
  }) => {
    await conncurrencyFlowProdDynamic(
      browser,
      "/t-server-function/t-layout-client-component/t-invoked-from-client-component/t-return-client-component?opt-out=1"
    );
  });
  test("prod-dynamic ->layout client component - Invoked From Client Component-Flujo completo: SSR -> Loading -> Streaming -> Server Component", async ({
    page,
  }) => {
    page.on("console", (msg) => {
      if (msg.type() === "error") console.log(`[Browser Error]: ${msg.text()}`);
    });
    // 1. Navegar a la página (asumiendo que este componente está en la home '/')
    // Si está en otra ruta, cambia '/' por '/tu-ruta'
    const response = await page.goto(
      "/t-server-function/t-layout-client-component/t-invoked-from-client-component/t-return-server-component?opt-out=1",
      { waitUntil: "commit" }
    );

    await SSRStreamingFlowProd(page, response);
  });
  test("prod-dynamic -> concurrency test - layout client component - Invoked From Client Component-Flujo completo: SSR -> Loading -> Streaming -> Server Component", async ({
    browser,
  }) => {
    await conncurrencyFlowProdDynamic(
      browser,
      "/t-server-function/t-layout-client-component/t-invoked-from-client-component/t-return-server-component?opt-out=1"
    );
  });
  test("prod-dynamic ->layout client component - Invoked From Server Component-Flujo completo: SSR -> Loading -> Streaming -> Client Component", async ({
    page,
  }) => {
    page.on("console", (msg) => {
      if (msg.type() === "error") console.log(`[Browser Error]: ${msg.text()}`);
    });
    // 1. Navegar a la página (asumiendo que este componente está en la home '/')
    // Si está en otra ruta, cambia '/' por '/tu-ruta'
    const response = await page.goto(
      "/t-server-function/t-layout-client-component/t-invoked-from-server-component/t-return-client-component?opt-out=1",
      { waitUntil: "commit" }
    );

    await SSRStreamingFlowProd(page, response, true);
  });
  test("prod-dynamic -> concurrency test - layout client component - Invoked From Server Component-Flujo completo: SSR -> Loading -> Streaming -> Client Component", async ({
    browser,
  }) => {
    await conncurrencyFlowProdDynamic(
      browser,
      "/t-server-function/t-layout-client-component/t-invoked-from-server-component/t-return-client-component?opt-out=1"
    );
  });
  test("prod-dynamic ->layout client component - Invoked From Server Component-Flujo completo: SSR -> Loading -> Streaming -> Server Component", async ({
    page,
  }) => {
    page.on("console", (msg) => {
      if (msg.type() === "error") console.log(`[Browser Error]: ${msg.text()}`);
    });
    // 1. Navegar a la página (asumiendo que este componente está en la home '/')
    // Si está en otra ruta, cambia '/' por '/tu-ruta'
    const response = await page.goto(
      "/t-server-function/t-layout-client-component/t-invoked-from-server-component/t-return-server-component?opt-out=1",
      { waitUntil: "commit" }
    );

    await SSRStreamingFlowProd(page, response, true);
  });
  test("prod-dynamic -> concurrency test - layout client component - Invoked From Server Component-Flujo completo: SSR -> Loading -> Streaming -> Server Component", async ({
    browser,
  }) => {
    await conncurrencyFlowProdDynamic(
      browser,
      "/t-server-function/t-layout-client-component/t-invoked-from-server-component/t-return-server-component?opt-out=1"
    );
  });
  test("prod-dynamic ->layout server component - Invoked From Client Component-Flujo completo: SSR -> Loading -> Streaming -> Client Component", async ({
    page,
  }) => {
    page.on("console", (msg) => {
      if (msg.type() === "error") console.log(`[Browser Error]: ${msg.text()}`);
    });
    // 1. Navegar a la página (asumiendo que este componente está en la home '/')
    // Si está en otra ruta, cambia '/' por '/tu-ruta'
    const response = await page.goto(
      "/t-server-function/t-layout-server-component/t-invoked-from-client-component/t-return-client-component?opt-out=1",
      { waitUntil: "commit" }
    );

    await SSRStreamingFlowProd(page, response);
  });
  test("prod-dynamic -> concurrency test - layout server component - Invoked From Client Component-Flujo completo: SSR -> Loading -> Streaming -> Client Component", async ({
    browser,
  }) => {
    await conncurrencyFlowProdDynamic(
      browser,
      "/t-server-function/t-layout-server-component/t-invoked-from-client-component/t-return-client-component?opt-out=1"
    );
  });
  test("prod-dynamic ->layout server component - Invoked From Client Component-Flujo completo: SSR -> Loading -> Streaming -> Server Component", async ({
    page,
  }) => {
    page.on("console", (msg) => {
      if (msg.type() === "error") console.log(`[Browser Error]: ${msg.text()}`);
    });
    // 1. Navegar a la página (asumiendo que este componente está en la home '/')
    // Si está en otra ruta, cambia '/' por '/tu-ruta'
    const response = await page.goto(
      "/t-server-function/t-layout-server-component/t-invoked-from-client-component/t-return-server-component?opt-out=1",
      { waitUntil: "commit" }
    );

    await SSRStreamingFlowProd(page, response);
  });
  test("prod-dynamic -> concurrency test - layout server component - Invoked From Client Component-Flujo completo: SSR -> Loading -> Streaming -> Server Component", async ({
    browser,
  }) => {
    await conncurrencyFlowProdDynamic(
      browser,
      "/t-server-function/t-layout-server-component/t-invoked-from-client-component/t-return-server-component?opt-out=1"
    );
  });
  test("prod-dynamic ->layout server component - Invoked From Server Component-Flujo completo: SSR -> Loading -> Streaming -> Client Component", async ({
    page,
  }) => {
    page.on("console", (msg) => {
      if (msg.type() === "error") console.log(`[Browser Error]: ${msg.text()}`);
    });
    // 1. Navegar a la página (asumiendo que este componente está en la home '/')
    // Si está en otra ruta, cambia '/' por '/tu-ruta'
    const response = await page.goto(
      "/t-server-function/t-layout-server-component/t-invoked-from-server-component/t-return-client-component?opt-out=1",
      { waitUntil: "commit" }
    );

    await SSRStreamingFlowProd(page, response, true);
  });
  test("prod-dynamic -> concurrency test - layout server component - Invoked From Server Component-Flujo completo: SSR -> Loading -> Streaming -> Client Component", async ({
    browser,
  }) => {
    await conncurrencyFlowProdDynamic(
      browser,
      "/t-server-function/t-layout-server-component/t-invoked-from-server-component/t-return-client-component?opt-out=1"
    );
  });
  test("prod-dynamic ->layout server component - Invoked From Server Component-Flujo completo: SSR -> Loading -> Streaming -> Server Component", async ({
    page,
  }) => {
    page.on("console", (msg) => {
      if (msg.type() === "error") console.log(`[Browser Error]: ${msg.text()}`);
    });
    // 1. Navegar a la página (asumiendo que este componente está en la home '/')
    // Si está en otra ruta, cambia '/' por '/tu-ruta'
    const response = await page.goto(
      "/t-server-function/t-layout-server-component/t-invoked-from-server-component/t-return-server-component?opt-out=1",
      { waitUntil: "commit" }
    );

    await SSRStreamingFlowProd(page, response, true);
  });
  test("prod-dynamic -> concurrency test - layout server component - Invoked From Server Component-Flujo completo: SSR -> Loading -> Streaming -> Server Component", async ({
    browser,
  }) => {
    await conncurrencyFlowProdDynamic(
      browser,
      "/t-server-function/t-layout-server-component/t-invoked-from-server-component/t-return-server-component?opt-out=1"
    );
  });
  test("redirect works - layout client component - invoked from client component - redirect to client component", async ({
    page,
  }) => {
    page.on("console", (msg) => {
      if (msg.type() === "error") console.log(`[Browser Error]: ${msg.text()}`);
    });
    // Vamos a una página protegida sin cookies
    await page.goto(
      "/t-server-function/t-layout-client-component/t-invoked-from-client-component/t-redirect-to-client-component",
      { waitUntil: "commit" }
    );
    await redirectFlow(page, false);
  });
  test("redirect works - layout client component - invoked from client component - redirect to server component", async ({
    page,
  }) => {
    page.on("console", (msg) => {
      if (msg.type() === "error") console.log(`[Browser Error]: ${msg.text()}`);
    });
    // Vamos a una página protegida sin cookies
    await page.goto(
      "/t-server-function/t-layout-client-component/t-invoked-from-client-component/t-redirect-to-server-component",
      { waitUntil: "commit" }
    );
    await redirectFlow(page, true);
  });
  test("redirect works - layout client component - invoked from server component - redirect to client component", async ({
    page,
  }) => {
    page.on("console", (msg) => {
      if (msg.type() === "error") console.log(`[Browser Error]: ${msg.text()}`);
    });
    // Vamos a una página protegida sin cookies
    await page.goto(
      "/t-server-function/t-layout-client-component/t-invoked-from-server-component/t-redirect-to-client-component",
      { waitUntil: "commit" }
    );
    await redirectFlow(page, false);
  });
  test("redirect works - layout client component - invoked from server component - redirect to server component", async ({
    page,
  }) => {
    page.on("console", (msg) => {
      if (msg.type() === "error") console.log(`[Browser Error]: ${msg.text()}`);
    });
    // Vamos a una página protegida sin cookies
    await page.goto(
      "/t-server-function/t-layout-client-component/t-invoked-from-server-component/t-redirect-to-server-component",
      { waitUntil: "commit" }
    );
    await redirectFlow(page, true);
  });
  test("redirect works - layout server component - invoked from client component - redirect to client component", async ({
    page,
  }) => {
    page.on("console", (msg) => {
      if (msg.type() === "error") console.log(`[Browser Error]: ${msg.text()}`);
    });
    // Vamos a una página protegida sin cookies
    await page.goto(
      "/t-server-function/t-layout-server-component/t-invoked-from-client-component/t-redirect-to-client-component",
      { waitUntil: "commit" }
    );
    await redirectFlow(page, false);
  });
  test("redirect works - layout server component - invoked from client component - redirect to server component", async ({
    page,
  }) => {
    page.on("console", (msg) => {
      if (msg.type() === "error") console.log(`[Browser Error]: ${msg.text()}`);
    });
    // Vamos a una página protegida sin cookies
    await page.goto(
      "/t-server-function/t-layout-server-component/t-invoked-from-client-component/t-redirect-to-server-component",
      { waitUntil: "commit" }
    );
    await redirectFlow(page, true);
  });
  test("redirect works - layout server component - invoked from server component - redirect to client component", async ({
    page,
  }) => {
    page.on("console", (msg) => {
      if (msg.type() === "error") console.log(`[Browser Error]: ${msg.text()}`);
    });
    // Vamos a una página protegida sin cookies
    await page.goto(
      "/t-server-function/t-layout-server-component/t-invoked-from-server-component/t-redirect-to-client-component",
      { waitUntil: "commit" }
    );
    await redirectFlow(page, false);
  });
  test("redirect works - layout server component - invoked from server component - redirect to server component", async ({
    page,
  }) => {
    page.on("console", (msg) => {
      if (msg.type() === "error") console.log(`[Browser Error]: ${msg.text()}`);
    });
    // Vamos a una página protegida sin cookies
    await page.goto(
      "/t-server-function/t-layout-server-component/t-invoked-from-server-component/t-redirect-to-server-component",
      { waitUntil: "commit" }
    );
    await redirectFlow(page, true);
  });
});

test.describe("Dinou Core: ISR", () => {
  test("ISR - Time based revalidation", async ({ page }) => {
    if (!isProd) test.skip(); // ISR solo tiene sentido en build/prod
    await page.waitForTimeout(4000);
    await page.goto("/t-isr/t-layout-client-component/t-client-component");
    await page.waitForTimeout(1000);
    await page.reload();
    const initialTime = await page.getByTestId("timestamp").innerText();

    // Esperar menos del tiempo de revalidación
    await page.waitForTimeout(1000);
    await page.reload();
    const secondTime = await page.getByTestId("timestamp").innerText();
    expect(secondTime).toBe(initialTime); // Debe ser caché

    // Esperar más del tiempo de revalidación
    await page.waitForTimeout(4000);
    await page.reload(); // Esto dispara la regeneración (usuario ve stale)
    const thirdTime = await page.getByTestId("timestamp").innerText();
    expect(thirdTime).toBe(initialTime); // Debe ser caché
    await page.waitForTimeout(1000);
    await page.reload(); // Ahora ve el fresco
    const finalTime = await page.getByTestId("timestamp").innerText();
    expect(finalTime).not.toBe(initialTime);
  });
});
