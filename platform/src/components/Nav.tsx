"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Home" },
  { href: "/browse", label: "Browse Recipes" },
  { href: "/admin", label: "Admin" },
];

export default function Nav() {
  const path = usePathname();
  return (
    <header className="bg-green-800 text-white shadow-lg sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 flex items-center justify-between h-16">
        <Link href="/" className="flex items-center gap-2 font-bold text-xl tracking-tight">
          <span className="text-2xl">🍚</span>
          <span>SarapSulit</span>
        </Link>
        <nav className="flex gap-1">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                path === l.href
                  ? "bg-green-600 text-white"
                  : "text-green-100 hover:bg-green-700"
              }`}
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
