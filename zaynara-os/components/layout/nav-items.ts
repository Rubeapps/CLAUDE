import { Brain, KanbanSquare, LayoutDashboard, Receipt, Settings, type LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/brain", label: "O Cérebro", icon: Brain },
  { href: "/expenses", label: "Despesas", icon: Receipt },
  { href: "/operations", label: "Operações", icon: KanbanSquare },
  { href: "/settings", label: "Definições", icon: Settings },
];
