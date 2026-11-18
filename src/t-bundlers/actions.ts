"use server";

export async function doubleOnServer(value: number) {
  const buildTool = process.env.DINOU_BUILD_TOOL || "unset";
  const unvendorizedEnv =
    typeof process !== "undefined" &&
    Boolean(
      process.env &&
        (process.env.DINOU_UNVENDORIZED === "true" ||
          process.env.DINOU_UNVENDORIZED === "1")
    );
  return {
    next: value * 2,
    buildTool,
    unvendorizedEnv,
  };
}

