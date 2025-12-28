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

      // await expect(async () => {
      //   const cookies = await page.context().cookies();
      //   const myCookie = cookies.find((c: any) => c.name === "theme");
      //   expect(myCookie?.value).toBe("dark");
      // }).toPass({
      //   intervals: [100, 250, 500], // Reintenta cada poco tiempo
      //   timeout: 3000,
      // });
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

async function ISRFlow(page: any) {
  const time1 = await page.getByTestId("timestamp").innerText();

  // 2. Esperar un tiempo prudencial (ej. 5 segundos) para asegurar que el revalidate (3s) expire
  // No hacemos reloads intermedios para no "despertar" al servidor antes de tiempo
  await page.waitForTimeout(5000);

  // 3. Recargar. Esta petición disparará la regeneración (o nos dará el nuevo directamente)
  await page.reload();
  const time2 = await page.getByTestId("timestamp").innerText();

  // 4. Lógica de verificación flexible
  if (time2 !== time1) {
    // Escenario A: El servidor fue rápido y nos dio el nuevo ya. ¡Éxito!
    expect(new Date(time2).getTime()).toBeGreaterThan(
      new Date(time1).getTime()
    );
  } else {
    // Escenario B: Nos dio el Stale (viejo). Esperamos a que la regeneración termine.
    await page.waitForTimeout(2000); // Margen para que buildStaticPage termine
    await page.reload();
    const time3 = await page.getByTestId("timestamp").innerText();
    expect(new Date(time3).getTime()).toBeGreaterThan(
      new Date(time1).getTime()
    );
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
  test("ISR - Time based revalidation - layout client component - server + client component", async ({
    page,
  }) => {
    if (!isProd) test.skip();

    // 1. Entrar y obtener el tiempo de nacimiento de la página
    await page.goto("/t-isr/t-layout-client-component/t-client-component");
    await ISRFlow(page);
  });
  test("ISR - Time based revalidation - layout client component - server component", async ({
    page,
  }) => {
    if (!isProd) test.skip();

    // 1. Entrar y obtener el tiempo de nacimiento de la página
    await page.goto("/t-isr/t-layout-client-component/t-server-component");
    await ISRFlow(page);
  });
  test("ISR - Time based revalidation - layout server component - server + client component", async ({
    page,
  }) => {
    if (!isProd) test.skip();

    // 1. Entrar y obtener el tiempo de nacimiento de la página
    await page.goto("/t-isr/t-layout-server-component/t-client-component");
    await ISRFlow(page);
  });
  test("ISR - Time based revalidation - layout server component - server component", async ({
    page,
  }) => {
    if (!isProd) test.skip();

    // 1. Entrar y obtener el tiempo de nacimiento de la página
    await page.goto("/t-isr/t-layout-server-component/t-server-component");
    await ISRFlow(page);
  });
});
test.describe("Dinou Core: Soft navigation (SPA)", () => {
  test("SPA Navigation preserves Layout State - layout client component - client component", async ({
    page,
  }) => {
    await page.goto("/t-spa/t-layout-client-component/t-client-component"); // Carga inicial (Hard)

    // 🛡️ FIX: Esperar a que React hidrate antes de interactuar
    await page.waitForSelector('body[data-hydrated="true"]');

    // 1. Modificar estado en el layout (asumiendo un botón contador)
    await page.getByText("Increment").click();
    await expect(page.getByTestId("counter")).toHaveText("1");

    // 2. Click en enlace normal <a>
    await page.getByRole("link", { name: "go to sub route" }).click();

    // 3. Verificar URL y contenido nuevo
    await expect(page).toHaveURL(
      /\/t-spa\/t-layout-client-component\/t-client-component\/sub-route-a/
    );
    await expect(
      page.getByText(
        "hello from t-layout-client-component/t-client-component/sub-route-a/page.tsx"
      )
    ).toBeVisible();

    // 4. Verificar que el contador SIGUE en 1 (No se reseteó a 0)
    await expect(page.getByTestId("counter")).toHaveText("1");
  });
  test("SPA Navigation preserves Layout State - layout client component - server component", async ({
    page,
  }) => {
    await page.goto("/t-spa/t-layout-client-component/t-server-component"); // Carga inicial (Hard)

    // 🛡️ FIX: Esperar a que React hidrate antes de interactuar
    await page.waitForSelector('body[data-hydrated="true"]');

    // 1. Modificar estado en el layout (asumiendo un botón contador)
    await page.getByText("Increment").click();
    await expect(page.getByTestId("counter")).toHaveText("1");

    // 2. Click en enlace normal <a>
    await page.getByRole("link", { name: "go to sub route" }).click();

    // 3. Verificar URL y contenido nuevo
    await expect(page).toHaveURL(
      /\/t-spa\/t-layout-client-component\/t-server-component\/sub-route-a/
    );
    await expect(
      page.getByText(
        "hello from t-layout-client-component/t-server-component/sub-route-a/page.tsx"
      )
    ).toBeVisible();

    // 4. Verificar que el contador SIGUE en 1 (No se reseteó a 0)
    await expect(page.getByTestId("counter")).toHaveText("1");
  });
  test("SPA Navigation preserves Layout State - layout server component - client component", async ({
    page,
  }) => {
    await page.goto("/t-spa/t-layout-server-component/t-client-component"); // Carga inicial (Hard)

    // 🛡️ FIX: Esperar a que React hidrate antes de interactuar
    await page.waitForSelector('body[data-hydrated="true"]');

    // 1. Modificar estado en el layout (asumiendo un botón contador)
    await page.getByText("Increment").click();
    await expect(page.getByTestId("counter")).toHaveText("1");

    // 2. Click en enlace normal <a>
    await page.getByRole("link", { name: "go to sub route" }).click();

    // 3. Verificar URL y contenido nuevo
    await expect(page).toHaveURL(
      /\/t-spa\/t-layout-server-component\/t-client-component\/sub-route-a/
    );
    await expect(
      page.getByText(
        "hello from t-layout-server-component/t-client-component/sub-route-a/page.tsx"
      )
    ).toBeVisible();

    // 4. Verificar que el contador SIGUE en 1 (No se reseteó a 0)
    await expect(page.getByTestId("counter")).toHaveText("1");
  });
  test("SPA Navigation preserves Layout State - layout server component - server component", async ({
    page,
  }) => {
    await page.goto("/t-spa/t-layout-server-component/t-server-component"); // Carga inicial (Hard)

    // 🛡️ FIX: Esperar a que React hidrate antes de interactuar
    await page.waitForSelector('body[data-hydrated="true"]');

    // 1. Modificar estado en el layout (asumiendo un botón contador)
    await page.getByText("Increment").click();
    await expect(page.getByTestId("counter")).toHaveText("1");

    // 2. Click en enlace normal <a>
    await page.getByRole("link", { name: "go to sub route" }).click();

    // 3. Verificar URL y contenido nuevo
    await expect(page).toHaveURL(
      /\/t-spa\/t-layout-server-component\/t-server-component\/sub-route-a/
    );
    await expect(
      page.getByText(
        "hello from t-layout-server-component/t-server-component/sub-route-a/page.tsx"
      )
    ).toBeVisible();

    // 4. Verificar que el contador SIGUE en 1 (No se reseteó a 0)
    await expect(page.getByTestId("counter")).toHaveText("1");
  });
});
test.describe("Dinou Core: Scroll Restoration (SPA)", () => {
  test("Restores scroll position on Back navigation & Resets on New navigation", async ({
    page,
  }) => {
    // Activar logs de consola del navegador en la terminal de Node
    page.on("console", (msg) => console.log("PAGE LOG:", msg.text()));
    // 1. Ir a la página A
    await page.goto(
      "/t-spa-scroll-restoration/t-layout-client-component/t-client-component"
    ); // Usa una ruta que tenga un enlace a otra

    // 🛡️ Esperar Hidratación (Tu fix)
    await page.waitForSelector('body[data-hydrated="true"]');

    // 📏 FORZAR ALTURA ROBUSTA (Inline Style)
    await page.evaluate(() => {
      document.body.style.minHeight = "3000px";
    });

    // 3. Hacer Scroll hacia abajo (ej. 500px)
    await page.evaluate(() => window.scrollTo(0, 500));

    // Verificar que estamos abajo
    let scrollY = await page.evaluate(() => window.scrollY);
    expect(scrollY).toBeCloseTo(500, 1); // Margen de error de 1px

    // 4. 🚀 NAVEGACIÓN NUEVA (Click sin mover el scroll)
    // Usamos evaluate para hacer click JS puro, así Playwright NO hace auto-scroll
    // para buscar el elemento si se quedó arriba.
    await page.evaluate(() => {
      const link = document.querySelector('a[href*="sub-route-a"]');
      if (link) link.click();
    });

    // Verificar que cambió la URL
    await expect(page).toHaveURL(
      /\/t-spa-scroll-restoration\/t-layout-client-component\/t-client-component\/sub-route-a/
    );

    // 🛡️ Esperar un tick para asegurar que el useLayoutEffect se ejecutó
    // A veces el navegador es muy rápido reportando la URL
    await page.waitForTimeout(100);

    // 5. ✅ VERIFICACIÓN A: En navegación nueva, el scroll debe volver a ARRIBA (0)
    scrollY = await page.evaluate(() => window.scrollY);
    expect(scrollY).toBe(0);

    // (Opcional) Forzar altura en la página B también si quieres probar scroll ahí
    // await page.addStyleTag({ content: "body { min-height: 3000px; }" });

    // 6. 🔙 NAVEGACIÓN ATRÁS (Simular botón Back del navegador)
    await page.goBack();

    // Verificar que volvimos a la URL A
    await expect(page).toHaveURL(
      /\/t-spa-scroll-restoration\/t-layout-client-component\/t-client-component/
    );

    // 🛑 MOMENTO CRÍTICO: VOLVER A FORZAR LA ALTURA 🛑
    // Al volver atrás, React puede haber repintado el body y borrado el style inline.
    // Lo reaplicamos inmediatamente antes de chequear el scroll.
    await page.evaluate(() => {
      document.body.style.minHeight = "3000px";
      // Debug: Imprimir altura actual para ver si funcionó
      console.log("Body Height after GoBack:", document.body.scrollHeight);
    });

    // 7. VERIFICACIÓN
    await expect
      .poll(async () => {
        // Debug: ver qué está leyendo playwright
        const y = await page.evaluate(() => window.scrollY);
        const h = await page.evaluate(() => document.body.scrollHeight);
        console.log(`Polling check -> ScrollY: ${y}, BodyHeight: ${h}`);
        return y;
      })
      .toBeCloseTo(500, 10);
  });
});
test.describe("Dinou Core: Navigation (SPA)", () => {
  test("usePathname updates correctly on soft navigation - layout client component - client component", async ({
    page,
  }) => {
    await page.goto(
      "/t-spa-navigation/t-layout-client-component/t-client-component"
    ); // Carga inicial (Hard)

    // 🛡️ FIX: Esperar a que React hidrate antes de interactuar
    await page.waitForSelector('body[data-hydrated="true"]');

    // 1. Estado inicial
    await expect(page.getByTestId("link-home")).toHaveCSS("font-weight", "700"); // Bold
    await expect(page.getByTestId("link-about")).toHaveCSS(
      "font-weight",
      "400"
    ); // Normal
    await expect(page.getByTestId("current-path")).toHaveText(
      "/t-spa-navigation/t-layout-client-component/t-client-component"
    );

    // 2. Navegación SPA (Click)
    // Usamos click programático para asegurar que el router lo pilla sin scroll issues
    await page.evaluate(() =>
      document.querySelector('[data-testid="link-about"]')?.click()
    );

    // 3. Verificación
    // Gracias al Contexto, esto se actualiza SOLO cuando la navegación termina
    await expect(page.getByTestId("current-path")).toHaveText(
      "/t-spa-navigation/t-layout-client-component/about"
    );
    await expect(page.getByTestId("link-home")).toHaveCSS("font-weight", "400");
    await expect(page.getByTestId("link-about")).toHaveCSS(
      "font-weight",
      "700"
    );
  });
});
