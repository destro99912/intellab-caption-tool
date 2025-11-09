import React from "react";
import Link from "next/link";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh flex flex-col">
      <header className="border-b">
        <div className="mx-auto max-w-7xl px-4 py-3 flex items-center gap-6">
          <Link href="/" className="font-semibold tracking-tight text-xl">
            Intellab
          </Link>

          <nav className="ml-auto flex items-center gap-4">
            <Link href="/hashtag-generator" className="text-sm hover:underline">
              Hashtag Generator
            </Link>
            <Link href="/pricing" className="text-sm hover:underline">
              Pricing
            </Link>
            <Link
              href="/login"
              className="rounded-full bg-black px-4 py-1.5 text-sm text-white"
            >
              Sign Up
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <div className="mx-auto max-w-7xl px-4 py-8">{children}</div>
      </main>

      <footer className="border-t">
        <div className="mx-auto max-w-7xl px-4 py-4 text-xs text-gray-500">
          © {new Date().getFullYear()} Intellab — All rights reserved.
        </div>
      </footer>
    </div>
  );
}
