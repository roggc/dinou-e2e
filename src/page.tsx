"use client";

import { useEffect, useState } from "react";
import Suspense from "react-enhanced-suspense";
import dinouLogo from "@/assets/dinou.png";
import reactLogo from "@/assets/react-logo.svg";
import { quoteCard } from "@/server-functions/quote-card";

export default function Page() {
  const [count, setCount] = useState(19);
  const [quoteKey, setQuoteKey] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100 text-gray-800 p-6">
      <div className="flex items-center gap-6 mb-8">
        <img
          src={dinouLogo}
          alt="Dinou Logo"
          width={64}
          height={64}
          className="drop-shadow-md"
        />
        <img
          src={reactLogo}
          alt="React Logo"
          width={64}
          height={64}
          className="animate-spin-slow"
        />
      </div>

      <h1 className="text-3xl md:text-5xl font-bold mb-4 text-center">
        Welcome to Dinou
      </h1>
      <p className="text-lg md:text-xl text-gray-600 mb-10 text-center max-w-md">
        Build something amazing with{" "}
        <a
          href="https://dinou.dev"
          target="_blank"
          className="text-blue-600 hover:text-blue-700 underline-offset-4 hover:underline transition-colors"
        >
          Dinou
        </a>{" "}
        +{" "}
        <a
          href="https://react.dev"
          target="_blank"
          className="text-blue-600 hover:text-blue-700 underline-offset-4 hover:underline transition-colors"
        >
          React 19
        </a>
      </p>

      <div className="flex flex-col items-center gap-3 mb-12">
        <span className="text-2xl font-semibold">{count}</span>
        <div className="flex gap-3">
          <button
            onClick={() => setCount((c) => c - 1)}
            className="px-4 py-2 rounded-lg bg-gray-200 hover:bg-gray-300 active:scale-95 transition cursor-pointer"
          >
            –
          </button>
          <button
            onClick={() => setCount((c) => c + 1)}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 active:scale-95 transition cursor-pointer"
          >
            +
          </button>
        </div>
      </div>

      <button
        className="px-4 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 active:scale-95 transition mb-4 cursor-pointer disabled:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-70 disabled:active:scale-100"
        onClick={() => setQuoteKey((k) => k + 1)}
        disabled={isLoading}
      >
        Refresh quote
      </button>

      <Suspense
        fallback={<Fetching setIsLoading={setIsLoading} />}
        resourceId={`quote-card-${quoteKey}`}
      >
        {() => quoteCard()}
      </Suspense>

      <footer className="absolute bottom-6 text-sm text-gray-400">
        <p>
          Get started by editing{" "}
          <code className="bg-gray-100 px-2 py-1 rounded text-gray-600 text-xs">
            src/page.tsx
          </code>
        </p>
      </footer>
    </main>
  );
}

function Fetching({
  setIsLoading,
}: {
  setIsLoading: (value: boolean) => void;
}) {
  useEffect(() => {
    setIsLoading(true);
    return () => {
      setIsLoading(false);
    };
  }, []);

  return <p className="text-gray-400">Fetching…</p>;
}
