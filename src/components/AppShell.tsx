import { Link, Outlet, useLocation } from "@tanstack/react-router";
import { Home, History, Plus, Receipt, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
const tabs = [
  { to: "/", label: "Beranda", icon: Home, exact: true },
  { to: "/buat", label: "Buat", icon: Plus },
  { to: "/riwayat", label: "Riwayat", icon: History },
  { to: "/pengaturan", label: "Pengaturan", icon: Settings },
] as const;

export function AppShell() {
  const { pathname } = useLocation();

  return (
    <div className="min-h-dvh flex flex-col bg-background text-foreground">
      <header className="sticky top-0 z-30 backdrop-blur-md bg-background/80 border-b border-border/60">
        <div className="mx-auto max-w-md sm:max-w-2xl px-4 sm:px-6 h-14 flex items-center gap-2">
          <Link to="/" className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-xl bg-primary text-primary-foreground grid place-items-center shadow-soft">
              <Receipt className="h-4 w-4" />
            </div>
            <span className="font-display font-semibold tracking-tight text-[15px]">Notaku</span>
            <span className="ml-1.5 inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary tracking-tight">
              v1 · 19 Jun
            </span>
          </Link>
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-md sm:max-w-2xl px-4 sm:px-6 pt-3 pb-24">
        <Outlet />
      </main>

      <nav
        className="fixed bottom-0 inset-x-0 z-40 pointer-events-none"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 8px)" }}
      >
        <div className="mx-auto w-full max-w-md px-3 pointer-events-auto">
          <div className="grid grid-cols-4 gap-1 rounded-full bg-primary text-primary-foreground backdrop-blur-md border border-primary/40 shadow-nav p-2">
            {tabs.map((tab) => (
              <TabButton key={tab.to} tab={tab} pathname={pathname} />
            ))}
          </div>
        </div>
      </nav>
    </div>
  );
}

function TabButton({ tab, pathname }: { tab: typeof tabs[number]; pathname: string }) {
  const active = "exact" in tab && tab.exact
    ? pathname === tab.to
    : pathname === tab.to || pathname.startsWith(tab.to + "/");
  const Icon = tab.icon;
  return (
    <Link
      to={tab.to}
      preload="render"
      aria-label={tab.label}
      className={cn(
        "tap relative grid place-items-center py-2 rounded-full transition-colors",
        active
          ? "bg-background text-primary shadow-soft"
          : "text-primary-foreground/70 hover:text-primary-foreground",
      )}
    >
      <Icon className="h-5 w-5" strokeWidth={active ? 2.4 : 2} />
    </Link>
  );
}
