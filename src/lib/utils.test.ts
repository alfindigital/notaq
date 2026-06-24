import { describe, it, expect } from "vitest";
import { isTabActive } from "./utils";

describe("isTabActive", () => {
  it("tab exact cocok hanya pada path persis", () => {
    expect(isTabActive("/", "/", true)).toBe(true);
    expect(isTabActive("/riwayat", "/", true)).toBe(false);
  });
  it("tab non-exact aktif untuk path turunannya", () => {
    expect(isTabActive("/riwayat", "/riwayat")).toBe(true);
    expect(isTabActive("/riwayat/abc123", "/riwayat")).toBe(true);
  });
  it("tidak aktif untuk awalan string yang bukan segmen path", () => {
    expect(isTabActive("/riwayatx", "/riwayat")).toBe(false);
    expect(isTabActive("/laporan", "/riwayat")).toBe(false);
  });
  it("hanya satu tab aktif untuk satu pathname", () => {
    const tabs = ["/", "/riwayat", "/laporan", "/pengaturan"];
    const activeCount = tabs.filter((t) => isTabActive("/riwayat/123", t, t === "/")).length;
    expect(activeCount).toBe(1);
  });
});
