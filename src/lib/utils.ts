import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Apakah sebuah tab nav aktif untuk `pathname` saat ini.
 * `exact` → cocok persis (mis. "/"); selain itu cocok bila path sama atau berada di bawahnya
 * (mis. "/riwayat" aktif untuk "/riwayat/123") — bukan cuma awalan string ("/riwayatx" ≠ aktif).
 */
export function isTabActive(pathname: string, to: string, exact = false): boolean {
  if (exact) return pathname === to;
  return pathname === to || pathname.startsWith(to + "/");
}
