import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
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
  // 1. Obtenemos el timestamp inicial
  const time1 = await page.getByTestId("timestamp").innerText();
  const targetUrl = page.url(); // Guardamos la URL limpia

  // 2. Esperamos el tiempo de revalidación (5s)
  await page.waitForTimeout(4000);

  // 3. VERIFICACIÓN CON CONTEXTO LIMPIO (Sonda ISR)
  // En lugar de recargar la misma página, abrimos una ventana de incógnito nueva
  // repetidamente hasta que el servidor nos sirva la versión nueva.
  await expect
    .poll(
      async () => {
        // A. Creamos un contexto nuevo (Sin caché, sin cookies previas)
        // Usamos el browser original para no lanzar una instancia nueva de Firefox (rápido)
        const browser = page.context().browser();
        if (!browser) throw new Error("No browser instance found");

        const tempContext = await browser.newContext();
        const tempPage = await tempContext.newPage();

        // B. Vamos a la URL limpia
        await tempPage.goto(targetUrl);

        // C. Leemos el dato
        const currentTime = await tempPage.getByTestId("timestamp").innerText();

        // D. Cerramos el contexto para limpiar memoria
        await tempContext.close();

        return new Date(currentTime).getTime();
      },
      {
        message: "El ISR no regeneró la página (verificado con New Context)",
        timeout: 15000,
        intervals: [2000], // Intervalos un poco más largos ya que abrimos contextos
      }
    )
    .toBeGreaterThan(new Date(time1).getTime());

  // Opcional: Si quieres que la página original del test también se actualice visualmente
  // para pasos posteriores, ahora sí puedes hacer reload (aunque puede que Firefox siga con su caché)
  // await page.reload();
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
    // 🕵️‍♂️ CHIVATO: Ver logs y errores del navegador en tu terminal
    page.on("console", (msg) =>
      console.log(`[BROWSER CONSOLE]: ${msg.text()}`)
    );
    page.on("pageerror", (err) =>
      console.log(`[BROWSER ERROR]: ${err.message}`)
    );
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

    // 5. ✅ VERIFICACIÓN A: En navegación nueva, el scroll debe volver a ARRIBA (0)
    // Usamos POLL para esperar a que el requestAnimationFrame de React haga efecto
    await expect
      .poll(
        async () => {
          return await page.evaluate(() => window.scrollY);
        },
        {
          // Opcional: timeout específico para esta aserción si quieres
          timeout: 2000,
        }
      )
      .toBe(0);

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
test.describe("Dinou Core: Programmatic Navigation (useRouter)", () => {
  test("router.push navigates correctly without full reload", async ({
    page,
  }) => {
    // 1. Configurar Intercepción de Red (La Magia 🪄)
    // Interceptamos cualquier petición que contenga "____rsc_payload____"
    await page.route(/.*____rsc_payload____.*/, async (route) => {
      // Retrasamos la respuesta 500ms o 1s
      await new Promise((resolve) => setTimeout(resolve, 1000));
      // Dejamos que la petición continúe al servidor real
      await route.continue();
    });
    // 1. Carga inicial
    await page.goto(
      "/t-spa-use-router/t-layout-client-component/t-client-component"
    );

    // 🛡️ IMPORTANTE: Esperar a hidratación (tu fix de seguridad)
    await page.waitForSelector('body[data-hydrated="true"]');
    // Aseguramos que NO se ve al principio
    await expect(page.getByTestId("global-loader")).toBeHidden();

    // 2. Verificar estado inicial
    await expect(page.getByText("Page: Source")).toBeVisible();

    // 3. Ejecutar navegación programática
    await page.getByTestId("btn-push").click();

    // 4. Verificación durante la carga
    // Como hemos "congelado" la red 1 segundo, Playwright tiene tiempo de sobra para verlo
    await expect(page.getByTestId("global-loader")).toBeVisible();

    // 4. Verificaciones
    // A. La URL debe cambiar
    await expect(page).toHaveURL(
      /.*\/t-spa-use-router\/t-layout-client-component\/t-client-component\/target/
    );

    // B. El contenido nuevo debe aparecer (Payload RSC cargado y renderizado)
    await expect(page.getByTestId("target-title")).toHaveText("Page: Target");

    // C. Verificar que NO estamos en la página anterior
    await expect(page.getByText("Page: Source")).toBeHidden();
    // El loader debe haber desaparecido
    await expect(page.getByTestId("global-loader")).toBeHidden();
  });
  test("router.replace navigates correctly", async ({ page }) => {
    // 1. Carga inicial
    await page.goto(
      "/t-spa-use-router/t-layout-client-component/t-client-component"
    );
    await page.waitForSelector('body[data-hydrated="true"]');

    // 2. Ejecutar navegación con replace
    await page.getByTestId("btn-replace").click();

    // 3. Verificar URL y Contenido
    await expect(page).toHaveURL(
      /.*\/t-spa-use-router\/t-layout-client-component\/t-client-component\/target/
    );
    await expect(page.getByTestId("target-title")).toHaveText("Page: Target");
  });
});
test.describe("Dinou Core: Server Component Redirects", () => {
  const BASE_PATH =
    "/t-redirect-from-server-component/to-server-component/t-layout-server-component";
  const SOURCE_URL = `${BASE_PATH}`;
  const TARGET_URL = `${BASE_PATH}/redirect-to`;
  const SOFT_BASE_URL = `${BASE_PATH}/redirect-to/redirect-soft`;
  const SOFT_TARGET_URL = `${BASE_PATH}/redirect-to/redirect-soft/target`;

  // CASO 1: Navegación Directa (SSR / Hard Load)
  // El navegador recibe el 302 del servidor y lo sigue automáticamente.
  test("Hard Navigation: Server redirects immediately on initial load", async ({
    page,
  }) => {
    // 1. Vamos directamente a la URL que provoca el redirect
    await page.goto(SOURCE_URL);

    // 2. Esperamos hidratación
    await page.waitForSelector('body[data-hydrated="true"]');

    // 3. Verificamos que la URL final en el navegador es la de destino
    // Usamos RegExp para evitar problemas con http://localhost...
    await expect(page).toHaveURL(new RegExp(TARGET_URL));

    // 4. Verificamos que se renderizó el contenido correcto
    await expect(page.getByTestId("target-content")).toHaveText(
      "hello from server component B"
    );
  });

  // CASO 2: Navegación SPA (Soft Navigation)
  // El Router hace fetch(), recibe el redirect, y debe actualizar la URL.
  test("Soft Navigation: Router handles redirect from RSC payload", async ({
    page,
  }) => {
    // 1. Empezamos en una página segura (la de destino, por ejemplo, o la home)
    // para cargar React y el Router primero.
    await page.goto(TARGET_URL);
    await page.waitForSelector('body[data-hydrated="true"]');

    // // 2. Inyectamos un enlace temporal en el DOM para simular una navegación SPA
    // // Esto nos ahorra crear una página "Menu" solo para el test.
    // await page.evaluate((url) => {
    //   const a = document.createElement("a");
    //   a.href = url;
    //   a.innerText = "Click to Redirect";
    //   a.setAttribute("data-testid", "link-trigger");
    //   document.body.appendChild(a);
    // }, SOFT_BASE_URL);

    // 3. Hacemos click (Interceptado por tu Router -> fetch)
    await page.getByTestId("link-trigger").click();

    // 4. Verificaciones
    // A. El Router debe haber detectado el cambio y actualizado la URL
    await expect(page).toHaveURL(new RegExp(SOFT_TARGET_URL));

    // B. El contenido debe ser visible
    await expect(page.getByTestId("target-content")).toHaveText(
      "hello from server component X"
    );
  });
});
test.describe("Dinou Core: Metadata Management", () => {
  test("Updates document title and meta tags on Soft Navigation", async ({
    page,
  }) => {
    // 1. Carga Inicial (SSR) - Aquí probablemente ya te funciona si usas getProps
    await page.goto(
      "/t-spa-metadata/t-layout-client-component/t-client-component/t-target-client-component"
    );
    await expect(page).toHaveTitle("Dinou - Home");

    // Verificamos también un meta tag (ej. description)
    const metaDesc = page.locator('meta[name="description"]');
    await expect(metaDesc).toHaveAttribute(
      "content",
      "Welcome to the home page"
    );

    // 2. Navegación SPA (Click)
    await page.getByText("Go to Target").click();

    // 3. Verificación tras Soft Navigation
    await expect(page).toHaveTitle("Dinou - Target Page");

    // Verificamos que la descripción también cambió
    await expect(metaDesc).toHaveAttribute(
      "content",
      "This is the target page"
    );
  });
});
test.describe("Dinou Core: Hash Navigation", () => {
  test("Smoothly scrolls to an element ID without triggering RSC fetch", async ({
    page,
  }) => {
    // 🕵️‍♂️ CHIVATO: Ver logs y errores del navegador en tu terminal
    page.on("console", (msg) =>
      console.log(`[BROWSER CONSOLE]: ${msg.text()}`)
    );
    page.on("pageerror", (err) =>
      console.log(`[BROWSER ERROR]: ${err.message}`)
    );
    await page.goto("/t-spa-hash/t-layout-client-component/t-client-component");
    await page.waitForSelector('body[data-hydrated="true"]');

    // Forzamos altura para que haya scroll real
    await page.evaluate(() => {
      document.body.style.minHeight = "2000px";
      const div = document.createElement("div");
      div.id = "section-target";
      div.style.marginTop = "1500px";
      div.innerText = "Target Section";
      document.body.appendChild(div);
    });

    // 1. Interceptar peticiones de red para asegurar que NO se pide un RSC
    let rscRequestOccurred = false;
    page.on("request", (request) => {
      if (request.url().includes("____rsc_payload")) {
        rscRequestOccurred = true;
      }
    });

    // 2. Click en un enlace de hash
    await page.evaluate(() => {
      const a = document.createElement("a");
      a.href = "#section-target";
      a.innerText = "Jump to Section";
      a.id = "hash-link";
      document.body.appendChild(a);
    });

    await page.click("#hash-link");

    // 3. Verificaciones
    // A. La URL debe terminar en #section-target
    await expect(page).toHaveURL(/#section-target$/);

    // B. El scroll debe haber cambiado (no estar en 0)
    const scrollY = await page.evaluate(() => window.scrollY);
    expect(scrollY).toBeGreaterThan(1000);

    // C. CRÍTICO: No debe haber habido petición RSC
    expect(rscRequestOccurred).toBe(false);
  });
  test("Smoothly scrolls to an element ID without triggering RSC fetch - Link", async ({
    page,
  }) => {
    await page.goto(
      "/t-spa-hash/t-layout-client-component/t-client-component/t-target-client-component/t-link"
    );
    await page.waitForSelector('body[data-hydrated="true"]');

    // B. El scroll debe haber cambiado (no estar en 0)
    let scrollY = await page.evaluate(() => window.scrollY);
    expect(scrollY).not.toBeGreaterThan(100);
    // 1. Interceptar peticiones de red para asegurar que NO se pide un RSC
    let rscRequestOccurred = false;
    page.on("request", (request) => {
      if (request.url().includes("____rsc_payload")) {
        rscRequestOccurred = true;
      }
    });

    await page.getByTestId("hash-link").click();

    // 3. Verificaciones
    // A. La URL debe terminar en #section-target
    await expect(page).toHaveURL(/#pepe-section$/);

    // B. El scroll debe haber cambiado (no estar en 0)
    scrollY = await page.evaluate(() => window.scrollY);
    expect(scrollY).toBeGreaterThan(100);

    // C. CRÍTICO: No debe haber habido petición RSC
    expect(rscRequestOccurred).toBe(false);
  });
  test("Navigating to a different page with a hash jumps to the element", async ({
    page,
  }) => {
    await page.goto(
      "/t-spa-hash/t-layout-client-component/t-client-component/t-target-client-component"
    );
    await page.waitForSelector('body[data-hydrated="true"]');

    // Navegar a otra página con hash
    await page.click(
      'a[href="/t-spa-hash/t-layout-client-component/t-client-component/t-target-client-component/target#pepe-section"]'
    );

    // Verificar URL
    await expect(page).toHaveURL(/target#pepe-section$/);

    // Verificar que el scroll se movió
    await expect
      .poll(async () => {
        return await page.evaluate(() => window.scrollY);
      })
      .toBeGreaterThan(100);
  });
});
test.describe("Dinou Core: Relative Navigation", () => {
  test("Navigates to relative paths correctly", async ({ page }) => {
    // 🕵️‍♂️ CHIVATO: Ver logs y errores del navegador en tu terminal
    page.on("console", (msg) =>
      console.log(`[BROWSER CONSOLE]: ${msg.text()}`)
    );
    page.on("pageerror", (err) =>
      console.log(`[BROWSER ERROR]: ${err.message}`)
    );
    await page.goto(
      "/t-spa-relative/t-layout-client-component/t-client-component/page-a"
    );
    await page.waitForSelector('body[data-hydrated="true"]');
    // Inyectar enlace relativo
    // await page.evaluate(() => {
    //   const a = document.createElement("a");
    //   a.href = "sibling"; // Debería ir a /parent/sibling
    //   a.id = "rel-link";
    //   document.body.appendChild(a);
    // });
    await page.getByTestId("sibling").click();
    await expect(page).toHaveURL(
      /\/t-spa-relative\/t-layout-client-component\/t-client-component\/page-b$/
    );
    await page.goBack();
    await page.getByTestId("nested").click();
    await expect(page).toHaveURL(
      /\/t-spa-relative\/t-layout-client-component\/t-client-component\/page-a\/nested$/
    );
  });
});
test.describe("Dinou Core: Link", () => {
  test("Prefetches RSC payload on hover", async ({ page }) => {
    await page.goto(
      "/t-spa-link/t-layout-client-component/t-client-component/to-client-component"
    );
    await page.waitForSelector('body[data-hydrated="true"]');

    // 1. Preparamos la escucha de la petición
    const rscRequest = page.waitForRequest((req) =>
      req.url().includes("____rsc_payload____")
    );

    // 2. Hacemos HOVER, no click
    await page.hover('a[href="target"]');

    // 3. Verificamos que la petición se disparó
    const request = await rscRequest;
    expect(request.url()).toContain("/target");

    // En este punto, el test confirma que Dinou ya tiene los datos sin haber navegado aún.
  });
});
test.describe("Dinou Core: HTTP Status Codes", () => {
  test("Returns HTTP 404 for non-existent routes (SSR)", async ({ page }) => {
    // 1. Navegación directa (Hard Navigation) a una ruta que no existe
    const response = await page.goto("/esta-ruta-no-existe-12345");

    // Verificamos que hubo respuesta
    expect(response).not.toBeNull();

    // 2. Verificamos el contenido visual (esto dices que YA funciona)
    // Asumo que tu página 404 tiene algún texto identificativo
    await expect(
      page.getByText(/Page not found: no "page" file found for/i)
    ).toBeVisible();

    // 3. LA PRUEBA DE FUEGO: Verificamos el código de estado HTTP
    // Si esto es 200, Google indexará esta página basura.
    // Si es 404, Google sabrá que no existe.
    expect(response?.status()).toBe(404);
  });
  test("Returns HTTP 404 for nested non-existent routes", async ({ page }) => {
    const response = await page.goto("/foo-bla-bla-bla");
    expect(response?.status()).toBe(404);
  });
});
test.describe("Dinou Core: Error pages", () => {
  test("Go to Error page when error", async ({ page }) => {
    // 1. Navegación directa (Hard Navigation) a una ruta que no existe
    await page.goto(
      "/t-error/t-layout-client-component/t-client-component/t-with-error-page"
    );
    await page.waitForSelector('body[data-hydrated="true"]');

    // 2. Verificamos el contenido visual (esto dices que YA funciona)
    // Asumo que tu página 404 tiene algún texto identificativo
    await expect(page.getByText(/ups!/i)).toBeVisible();
  });
});
test.describe("ISR Error Protection Shield", () => {
  const PAGE_URL =
    "/t-isr/t-layout-client-component/t-server-component/t-time-bomb";
  const DIST_DIR = path.resolve("dist2");
  const HTML_PATH = path.join(DIST_DIR, PAGE_URL, "index.html");
  const FLAG_FILE = path.resolve("trigger-error.txt");
  test.beforeEach(() => {
    // Asegurar limpieza antes de empezar
    if (fs.existsSync(FLAG_FILE)) fs.unlinkSync(FLAG_FILE);
    // Opcional: Borrar el HTML generado previamente para empezar de cero
    // if (fs.existsSync(HTML_PATH)) fs.unlinkSync(HTML_PATH);
  });

  test.afterEach(() => {
    // Limpieza al terminar
    if (fs.existsSync(FLAG_FILE)) fs.unlinkSync(FLAG_FILE);
  });

  test("Should KEEP old content if ISR regeneration fails after natural expiration", async ({
    request,
    page,
  }) => {
    if (!isProd) test.skip();
    // -----------------------------------------------------------
    // 3. SABOTAJE
    // -----------------------------------------------------------
    // Ponemos la "bomba" para que la PRÓXIMA regeneración falle
    console.log(`[TEST] Creando bomba en: ${FLAG_FILE}`);
    fs.writeFileSync(FLAG_FILE, "BOOM");
    // -----------------------------------------------------------
    // 1. GENERACIÓN INICIAL (Happy Path)
    // -----------------------------------------------------------
    const res1 = await request.get(PAGE_URL);
    expect(res1.status()).toBe(200);

    const content1 = await res1.text();
    expect(content1).toContain("Contenido Seguro y Valido");

    // Verificamos que se creó el archivo en disco
    expect(fs.existsSync(HTML_PATH)).toBe(true);
    const diskContent1 = fs.readFileSync(HTML_PATH, "utf-8");
    expect(diskContent1).toContain("Contenido Seguro y Valido");

    // -----------------------------------------------------------
    // 2. ESPERA NATURAL (Dejamos que caduque el cache)
    // -----------------------------------------------------------
    // Como revalidate = 1s, esperamos 1.5s para estar seguros
    console.log("⏳ Esperando a que caduque la caché (1.5s)...");
    await page.waitForTimeout(1500);

    // -----------------------------------------------------------
    // 4. DISPARAR ISR
    // -----------------------------------------------------------
    // Hacemos la petición. Como ya pasó el tiempo:
    // a) El servidor devolverá la versión "Stale" (200 OK) INMEDIATAMENTE.
    // b) El servidor lanzará el proceso de regeneración en background.
    console.log("🔄 Disparando ISR...");
    const res2 = await request.get(PAGE_URL);

    // Verificamos "Stale-While-Revalidate": El usuario NO ve el error
    expect(res2.status()).toBe(200);
    expect(await res2.text()).toContain("Contenido Seguro y Valido");

    // -----------------------------------------------------------
    // 5. ESPERAR RESULTADO DEL BACKGROUND
    // -----------------------------------------------------------
    // Damos tiempo a Node.js para que intente regenerar, falle y aborte.
    console.log("⏳ Esperando proceso background (2s)...");
    await page.waitForTimeout(2000);

    // -----------------------------------------------------------
    // 6. VERIFICACIÓN FINAL
    // -----------------------------------------------------------
    // Si la protección funciona, el archivo en disco NO debe haber cambiado.
    const diskContentFinal = fs.readFileSync(HTML_PATH, "utf-8");

    // Debe seguir siendo el contenido válido original
    expect(diskContentFinal).toContain("Contenido Seguro y Valido");

    // No debe ser una página de error de React/Express
    expect(diskContentFinal).not.toContain("Internal Server Error");
    expect(diskContentFinal).not.toContain("Simulated Critical Error");

    // Verificamos que no quedaron temporales basura
    expect(fs.existsSync(HTML_PATH + ".tmp")).toBe(false);
  });
});
// test.describe("ISR Status Updates", () => {
//   const PAGE_URL =
//     "/t-isr/t-layout-client-component/t-server-component/t-redirect";
//   const OUT_DIR = path.resolve("dist2");
//   const MANIFEST_PATH = path.join(OUT_DIR, "status-manifest.json");
//   const FLAG_FILE = path.resolve("exists.flag");
//   // Empezamos limpios
//   test.beforeEach(() => {
//     if (fs.existsSync(FLAG_FILE)) fs.unlinkSync(FLAG_FILE);
//   });
//   test.afterEach(() => {
//     if (fs.existsSync(FLAG_FILE)) fs.unlinkSync(FLAG_FILE);
//   });
//   test("Should update manifest from 404 to 200 and back to 404", async ({
//     request,
//     page,
//   }) => {
//     // --- FASE 1: NO EXISTE (404 Inicial) ---
//     console.log("Phase 1: Expecting 404");
//     const res1 = await request.get(PAGE_URL);
//     expect(res1.status()).toBe(404);

//     // Verificamos Manifiesto
//     const manifest1 = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf-8"));
//     // Nota: Ajusta la ruta del key según cómo la guardes (con o sin slash final)
//     expect(manifest1[PAGE_URL + "/"]?.status).toBe(404);

//     // --- FASE 2: CREACIÓN (404 -> 200) ---
//     console.log("Phase 2: Creating product...");
//     fs.writeFileSync(FLAG_FILE, "exists");

//     // Esperar caducidad
//     await page.waitForTimeout(1500);

//     // Disparar ISR
//     // La primera petición devolverá el 404 cacheado (Stale)
//     await request.get(PAGE_URL);

//     // Esperar regeneración background
//     await page.waitForTimeout(2000);

//     // Segunda petición: Ya debería ser 200
//     const res2 = await request.get(PAGE_URL);
//     expect(res2.status()).toBe(200);
//     expect(await res2.text()).toContain("Producto Disponible");

//     // Verificamos Manifiesto ACTUALIZADO
//     const manifest2 = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf-8"));
//     expect(manifest2[PAGE_URL + "/"]?.status).toBe(200);

//     // --- FASE 3: BORRADO (200 -> 404) ---
//     console.log("Phase 3: Deleting product...");
//     fs.unlinkSync(FLAG_FILE);

//     // Esperar caducidad
//     await page.waitForTimeout(1500);

//     // Disparar ISR (devuelve stale 200)
//     await request.get(PAGE_URL);

//     // Esperar regeneración
//     await page.waitForTimeout(2000);

//     // Segunda petición: Ya debería ser 404 de nuevo
//     const res3 = await request.get(PAGE_URL);
//     expect(res3.status()).toBe(404);

//     // Verificamos Manifiesto ACTUALIZADO
//     const manifest3 = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf-8"));
//     expect(manifest3[PAGE_URL + "/"]?.status).toBe(404);
//   });
// });
test.describe("Routing Precedence", () => {
  test("Static routes should take precedence over dynamic routes", async ({
    page,
  }) => {
    // Asumiendo que tienes:
    // 1. /blog/new (Estática: "Crear Post")
    // 2. /blog/[slug] (Dinámica: "Ver Post: {slug}")

    // Caso A: Ruta Estática
    await page.goto("/blog/new");
    const staticContent = await page.textContent("h1");
    expect(staticContent).toContain("Crear Post");
    // Si falla y dice "Ver Post: new", tu router está mal ordenado.

    // Caso B: Ruta Dinámica
    await page.goto("/blog/hola-mundo");
    const dynamicContent = await page.textContent("h1");
    expect(dynamicContent).toContain("Ver Post: hola-mundo");
  });
});
test.describe("Dinou Router: The Ultimate Challenge", () => {
  // NIVEL 1: Precedencia Mixta (El clásico rompecabezas)
  // Tenemos /a/b (Static), /a/[sub] (Dynamic) y /[...slug] (Catch-all)
  // El router debe elegir siempre el más específico.

  test("Level 1: Specificity Wars (Static > Dynamic > CatchAll)", async ({
    page,
  }) => {
    // 1. Debe ganar la estática exacta
    await page.goto("/t-router/conflicts/a/b");
    await expect(page.locator("#res")).toHaveText("STATIC_AB");

    // 2. Debe ganar la dinámica específica (coincide el 'a', pero 'c' es variable)
    await page.goto("/t-router/conflicts/a/c");
    await expect(page.locator("#res")).toHaveText("DYNAMIC_SUB:c");

    // 3. Debe caer en el Catch-All (porque no empieza por 'a')
    await page.goto("/t-router/conflicts/x/y/z");
    await expect(page.locator("#res")).toHaveText('CATCH_ALL:["x","y","z"]');
  });

  // NIVEL 2: El Catch-All "Goloso"
  // Un catch-all [...slug] debe comerse todo lo que le echen, incluyendo slashes.

  test("Level 2: The Greedy Catch-All", async ({ page }) => {
    const complexPath = "/t-router/conflicts/uno/dos/tres/cuatro";
    await page.goto(complexPath);

    // El router NO debe confundirse por la profundidad
    // Debe devolver un array ordenado
    await expect(page.locator("#res")).toHaveText(
      'CATCH_ALL:["uno","dos","tres","cuatro"]'
    );
  });

  // NIVEL 3: Caracteres Especiales y URL Encoding
  // ¿Qué pasa si el slug tiene espacios, tildes o emojis?
  // Muchos routers fallan al decodificar esto en params.

  test("Level 3: URI Encoding & Special Chars", async ({ page }) => {
    // URL real: /t-router/conflicts/a/café con leche
    const encoded = encodeURI("/t-router/conflicts/a/café con leche");
    await page.goto(encoded);

    // Dinou debe decodificarlo automáticamente en params
    // Si sale "caf%C3%A9...", has fallado.
    await expect(page.locator("#res")).toHaveText("DYNAMIC_SUB:café con leche");
  });

  // NIVEL 4: El Optional Catch-All (El Jefe Final) ☠️
  // [[...opt]] tiene una particularidad: DEBE matchear también la ruta base sin params.
  // Es decir, /t-router/optional debe renderizar el componente, no un 404.

  test("Level 4: The Optional Catch-All Paradox", async ({ page }) => {
    // Caso A: Con parámetros (Fácil)
    await page.goto("/t-router/optional/a/b");
    await expect(page.locator("#res")).toHaveText('OPTIONAL:["a","b"]');

    // Caso B: LA TRAMPA (Sin parámetros)
    // Muchos routers explotan aquí porque buscan params[0] y es undefined
    // o devuelven 404 porque esperan al menos un segmento.
    await page.goto("/t-router/optional");

    // Debe renderizar la página, indicando que no hay params (o array vacío)
    await expect(page.locator("#res")).toHaveText("OPTIONAL:[]");
  });
});
test.describe("Router: Shadowing & Complexity", () => {
  test("Should prioritize deeply nested static route over top-level catch-all", async ({
    page,
  }) => {
    // Escenario: /shadow/[...slug] vs /shadow/deep/very/deep/static
    await page.goto("/t-router/shadow/deep/very/deep/static");

    // Si tu algoritmo de "puntuación" de rutas es correcto, ganará la estática
    await expect(page.locator("#res")).toHaveText("STATIC_DEEP");
  });

  test("Should handle dots in dynamic parameters correctly", async ({
    page,
  }) => {
    // Escenario: /files/[id] -> /files/my.photo.jpg
    await page.goto("/t-router/files/my.photo.jpg");

    await expect(page.locator("#res")).toHaveText("ID:my.photo.jpg");
  });

  // test("Should resolve segments in nested catch-alls", async ({ page }) => {
  //   // Escenario: /nested/[...folder]/[...file] -> /nested/admin/assets/images/logo.png
  //   // Este test es para ver cómo particiona tu recursión los segmentos restantes
  //   await page.goto("/t-router/nested/admin/assets/images/logo.png");

  //   // Esto nos dirá mucho sobre cómo funciona tu index y reqSegments.slice
  //   await expect(page.locator("#res")).toContainText("admin");
  // });
});
test.describe("Dinou SSG (getStaticPaths)", () => {
  const BUILD_DIR = path.resolve(process.cwd(), "dist2");
  test("Should verify SSG for defined paths and fallback for undefined ones", async ({
    page,
  }) => {
    if (!isProd) test.skip();
    // --- PARTE 1: RUTAS PRE-GENERADAS (Alpha) ---
    // Verificamos que 'alpha' fue generada por getStaticPaths
    // Dependiendo de tu estructura, ajusta la ruta del archivo (ej: /alpha/index.html)
    const alphaPath = path.join(BUILD_DIR, "t-ssg", "alpha", "index.html");

    // PRUEBA DE FUEGO: ¿El archivo existe físicamente?
    // Si falla aquí, es que getStaticPaths no se ejecutó al build.
    expect(
      fs.existsSync(alphaPath),
      "Alpha debería estar pre-renderizada en disco"
    ).toBe(true);

    // Navegamos para confirmar que se sirve bien
    const resA = await page.goto("/t-ssg/alpha");
    expect(resA?.status()).toBe(200);
    await expect(page.locator("body")).toContainText("Slug: alpha");

    // --- PARTE 2: RUTAS NO DEFINIDAS (Gamma) ---
    // Gamma NO estaba en getStaticPaths, así que NO debería existir en disco todavía.
    const gammaPath = path.join(BUILD_DIR, "t-ssg", "gamma", "index.html");

    // PRUEBA DE FUEGO: Aseguramos que NO se pre-generó "sin querer"
    expect(
      fs.existsSync(gammaPath),
      "Gamma NO debería existir en disco antes de visitarla"
    ).toBe(false);

    // Ahora la visitamos. Dinou debería generarla AL VUELO (SSR/ISR).
    console.log("Navegando a ruta no estática (Gamma)...");
    const resC = await page.goto("/t-ssg/gamma");

    // AQUÍ ESTÁ EL CAMBIO: Esperamos 200, NO 404
    expect(resC?.status()).toBe(200);
    await expect(page.locator("body")).toContainText("Slug: gamma");
    // OPCIONAL: Si Dinou es ISR, después de visitarla, el archivo AHORA sí debería existir.
    // Si es solo SSR, seguirá sin existir. Depende de tu arquitectura.
    await page.waitForTimeout(2000);
    expect(fs.existsSync(gammaPath)).toBe(true);
  });
});
test.describe("Dinou Data Fetching (getProps)", () => {
  // TEST 2: getProps (Síncrono vs Asíncrono)
  test("Should handle both Sync and Async getProps correctly", async ({
    page,
  }) => {
    // Caso Síncrono
    const resSync = await page.goto("/t-props/sync");
    expect(resSync?.status()).toBe(200);

    // Verificamos que el prop llegó al DOM
    // Si el HTML crudo era "Prop: SYNC_DATA", aquí leerá "Prop: SYNC_DATA"
    await expect(page.locator("body")).toContainText("Prop: SYNC_DATA");

    // Caso Asíncrono (simulando delay)
    const resAsync = await page.goto("/t-props/async");
    expect(resAsync?.status()).toBe(200);

    await expect(page.locator("body")).toContainText("Prop: ASYNC_DATA");
  });
});
test.describe("Dinou not found", () => {
  // TEST 3: Custom 404
  test("Should render Custom 404 page instead of default", async ({ page }) => {
    // Vamos a una ruta que no existe
    let res = await page.goto("/t-not-found/ruta-super-inventada-123");

    // CHECK 1: Status Code (El navegador recibe el header 404)
    expect(res?.status()).toBe(404);

    // CHECK 2: Contenido Visual
    // Verificamos que se renderizó tu componente personalizado
    await expect(page.locator("body")).toContainText("Oops Custom 404");

    res = await page.goto("/t-not-found/nested/ruta-super-inventada-123");

    // CHECK 1: Status Code (El navegador recibe el header 404)
    expect(res?.status()).toBe(404);

    // CHECK 2: Contenido Visual
    // Verificamos que se renderizó tu componente personalizado
    await expect(page.locator("body")).toContainText("Nested 404");
  });
});
