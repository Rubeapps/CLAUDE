"use client";

import { CandlestickChart, LayoutDashboard, LogOut, Megaphone, Menu, Radar, ShoppingCart, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", label: "Visão geral", icon: LayoutDashboard },
  { href: "/dropship", label: "Dropshipping P&L", icon: ShoppingCart },
  { href: "/spy", label: "Spy Engine", icon: Radar },
  { href: "/spy/ads", label: "Anúncios Meta", icon: Megaphone },
  { href: "/trading", label: "Trading", icon: CandlestickChart },
] as const;

export function Sidebar({ email }: { email: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // Destaca só o item mais específico (ex.: /spy/ads não acende também /spy).
  const activeHref = NAV.map((n) => n.href)
    .filter((href) => pathname === href || pathname.startsWith(`${href}/`))
    .sort((a, b) => b.length - a.length)[0];

  const nav = (
    <nav className="flex flex-1 flex-col gap-1">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = href === activeHref;
        return (
          <Link
            key={href}
            href={href}
            onClick={() => setOpen(false)}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
              active ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        );
      })}
    </nav>
  );

  const footer = (
    <div className="space-y-2 border-t pt-4">
      <p className="truncate px-3 text-xs text-muted-foreground" title={email}>
        {email}
      </p>
      <form action="/auth/signout" method="post">
        <button type="submit" className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground">
          <LogOut className="h-4 w-4" /> Sair
        </button>
      </form>
    </div>
  );

  const brand = (
    <Link href="/dashboard" className="flex items-center gap-2 px-3">
      <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary font-mono text-xs font-bold text-primary-foreground">A</span>
      <span className="text-sm font-semibold tracking-tight">Apex OS</span>
    </Link>
  );

  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/90 px-4 backdrop-blur lg:hidden">
        {brand}
        <button type="button" aria-label={open ? "Fechar menu" : "Abrir menu"} onClick={() => setOpen(!open)} className="rounded-md p-2 hover:bg-accent">
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </header>
      {open ? (
        <div className="fixed inset-0 top-14 z-20 flex flex-col gap-4 bg-background p-4 lg:hidden">
          {nav}
          {footer}
        </div>
      ) : null}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col gap-6 border-r bg-card/40 p-4 lg:flex">
        {brand}
        {nav}
        {footer}
      </aside>
    </>
  );
}
