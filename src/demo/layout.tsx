"use client";

import { useRouter, usePathname } from "dinou";
import type { ReactNode } from "react";

const navLinks = [
  { href: "/demo", label: "Home" },
  { href: "/demo/server-components", label: "Server Components" },
  { href: "/demo/client-components", label: "Client Components" },
  { href: "/demo/server-functions", label: "Server Functions" },
  { href: "/demo/mixed", label: "Mixed Patterns" },
  { href: "/demo/dynamic/react", label: "Dynamic Route" },
  { href: "/demo/form", label: "Form Actions" },
  { href: "/demo/isr", label: "ISR Cache" },
  { href: "/demo/cookies", label: "Cookies & Spies" },
  { href: "/demo/error-trigger", label: "Error Boundaries" },
  { href: "/demo/redirects", label: "Redirects" },
  { href: "/demo/uploads", label: "File Uploads" },
];

export default function DemoLayout({ children, error_trigger }: { children: ReactNode, error_trigger: ReactNode }) {
  const { push } = useRouter();
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Top nav */}
      <nav className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-2 flex-wrap">
          <span className="font-bold text-indigo-400 mr-4 text-sm tracking-widest uppercase">
            Dinou Demo
          </span>
          {navLinks.map((link) => {
            const isActive = pathname === link.href;
            return (
              <button
                key={link.href}
                onClick={() => push(link.href)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all cursor-pointer ${isActive
                    ? "bg-indigo-600 text-white"
                    : "text-slate-400 hover:text-slate-100 hover:bg-slate-800"
                  }`}
              >
                {link.label}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Content */}
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-10">
        {error_trigger}
        {children}
      </main>

      <footer className="border-t border-slate-800 text-center py-4 text-slate-600 text-xs">
        Dinou Framework — RSC Demo App
      </footer>
    </div>
  );
}
