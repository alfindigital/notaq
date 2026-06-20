import { useSyncExternalStore } from "react";

const THEME_KEY = "notaku-theme";
export type Theme = "light" | "dark";

// Shared, app-wide theme store so every useTheme() consumer stays in sync
// (previously each hook held independent state and could drift apart).
let current: Theme | null = null;
const listeners = new Set<() => void>();

function read(): Theme {
  if (current) return current;
  if (typeof window === "undefined") return "light";
  try {
    const stored = window.localStorage.getItem(THEME_KEY) as Theme | null;
    if (stored === "light" || stored === "dark") return (current = stored);
  } catch { /* localStorage unavailable (Safari private, disabled cookies) */ }
  try {
    current = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch { current = "light"; }
  return current;
}

function apply(theme: Theme) {
  if (typeof document !== "undefined") {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }
  try { window.localStorage.setItem(THEME_KEY, theme); } catch { /* ignore quota/private-mode */ }
}

export function setTheme(theme: Theme) {
  if (theme === current) return;
  current = theme;
  apply(theme);
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

// SSR snapshot is always "light" — the inline script in __root.tsx applies the
// real theme class before hydration, so the initial paint is already correct.
export function useTheme() {
  const theme = useSyncExternalStore(subscribe, read, () => "light" as Theme);
  return {
    theme,
    setTheme,
    toggle: () => setTheme(theme === "dark" ? "light" : "dark"),
  };
}
