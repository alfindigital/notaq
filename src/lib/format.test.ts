import { describe, it, expect } from "vitest";
import { formatIDR, parseIDRInput, formatIDRInput } from "./format";

describe("formatIDR", () => {
  it("memformat ribuan dengan pemisah id-ID", () => {
    expect(formatIDR(1000)).toBe("Rp1.000");
    expect(formatIDR(25000)).toBe("Rp25.000");
    expect(formatIDR(1234567)).toBe("Rp1.234.567");
  });
  it("menangani nol dan negatif", () => {
    expect(formatIDR(0)).toBe("Rp0");
    expect(formatIDR(-500)).toBe("Rp-500");
  });
  it("membulatkan & aman terhadap nilai non-finite", () => {
    expect(formatIDR(1000.4)).toBe("Rp1.000");
    expect(formatIDR(NaN)).toBe("Rp0");
  });
});

describe("parseIDRInput", () => {
  it("mengambil digit dari berbagai format ketikan", () => {
    expect(parseIDRInput("Rp 25.000")).toBe(25000);
    expect(parseIDRInput("25,000")).toBe(25000);
    expect(parseIDRInput("25000")).toBe(25000);
  });
  it("mengembalikan 0 untuk input kosong/non-digit", () => {
    expect(parseIDRInput("")).toBe(0);
    expect(parseIDRInput("abc")).toBe(0);
  });
});

describe("formatIDRInput", () => {
  it("memformat untuk field input (tanpa Rp), kosong saat 0", () => {
    expect(formatIDRInput(25000)).toBe("25.000");
    expect(formatIDRInput(0)).toBe("");
  });
  it("roundtrip dengan parseIDRInput", () => {
    expect(parseIDRInput(formatIDRInput(150000))).toBe(150000);
  });
});
