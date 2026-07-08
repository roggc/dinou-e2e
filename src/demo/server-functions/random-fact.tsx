"use server";

import RandomFact from "@/demo/components/random-fact";

const facts = [
  "React Server Components stream data as a binary-encoded format called RSC Flight.",
  "Dinou forks a child process for each SSR render to isolate the react-server module graph.",
  "The RSC Flight payload travels via fd4 (file descriptor 4) between the parent and child process.",
  "Server functions in Dinou can return JSX — not just JSON.",
  "Dinou implements ISG: the first visitor gets a dynamic render, everyone after gets static HTML.",
  "The `createBailoutProxy` in Dinou uses JS Proxy to detect dynamic data access at build time.",
  "Dinou's router intercepts all <a> clicks at the document level with a single event listener.",
  "AsyncLocalStorage is stored on globalThis with a Symbol key to survive multiple require() calls.",
  "Node.js ESM requires explicit file extensions — Dinou's loader restores CJS-style resolution.",
  "Dinou supports esbuild, Rollup, and webpack as interchangeable client bundlers.",
];

// Server function → returns a CLIENT component (RandomFact is "use client")
export async function randomFact() {
  await delay(1200);
  const factIndex = new Date().getDate() % facts.length;
  const fact = facts[factIndex];
  return <RandomFact fact={fact} />;
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
