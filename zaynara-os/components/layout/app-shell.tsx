"use client";

import { LogOut, Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { NAV_ITEMS } from "@/components/layout/nav-items";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function AppShell({ email, children }: { email: string; children: React.ReactNode }) {
  const pathname = usePathname();
  // Guarda a página onde o menu móvel foi aberto: ao navegar, fecha sozinho.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const setOpen = (value: boolean) => setOpenOn(value ? pathname : null);

  const nav = (
    <nav className="flex flex-1 flex-col gap-1 p-3" aria-label="Navegação principal">
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground",
              active && "bg-sidebar-accent text-foreground",
            )}
          >
            <Icon className="size-4" />
            {label}
          </Link>
        );
      })}
    </nav>
  );

  const footer = (
    <div className="flex items-center justify-between gap-2 border-t border-sidebar-border p-3">
      <span className="truncate text-xs text-muted-foreground" title={email}>
        {email}
      </span>
      <div className="flex items-center">
        <ThemeToggle />
        <form action="/auth/signout" method="post">
          <Button variant="ghost" size="icon" type="submit" aria-label="Terminar sessão">
            <LogOut />
          </Button>
        </form>
      </div>
    </div>
  );

  const brand = (
    <div className="flex h-14 items-center gap-2 border-b border-sidebar-border px-5">
      <span className="flex size-7 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
        Z
      </span>
      <span className="font-semibold tracking-tight">Zaynara OS</span>
    </div>
  );

  return (
    <div className="flex min-h-screen">
      {/* Desktop */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex">
        {brand}
        {nav}
        {footer}
      </aside>

      {/* Móvel */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur md:hidden">
          <Button variant="ghost" size="icon" aria-label="Abrir menu" onClick={() => setOpen(true)}>
            <Menu />
          </Button>
          <span className="font-semibold">Zaynara OS</span>
        </header>

        {open && (
          <div className="fixed inset-0 z-40 md:hidden">
            <button
              type="button"
              aria-label="Fechar menu"
              className="absolute inset-0 bg-black/50"
              onClick={() => setOpen(false)}
            />
            <aside className="relative flex h-full w-64 flex-col bg-sidebar text-sidebar-foreground shadow-xl">
              <div className="flex items-center justify-between pr-2">
                {brand}
                <Button variant="ghost" size="icon" aria-label="Fechar menu" onClick={() => setOpen(false)}>
                  <X />
                </Button>
              </div>
              {nav}
              {footer}
            </aside>
          </div>
        )}

        <main className="min-w-0 flex-1 p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
