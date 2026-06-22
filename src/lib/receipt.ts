import type { Business, Note } from "./storage";
import { calcNoteTotals, calcLineSubtotal, PAYMENT_LABELS } from "./storage";
import { formatIDR, formatDateTime } from "./format";

export function buildReceiptText(note: Note, business: Business): string {
  const lines: string[] = [];
  if (business.name) lines.push(`*${business.name}*`);
  if (business.address) lines.push(business.address);
  if (business.phone) lines.push(`Telp: ${business.phone}`);
  lines.push("--------------------------------");
  lines.push(`No  : ${note.number}`);
  lines.push(`Tgl : ${formatDateTime(note.date)}`);
  if (note.customerName) lines.push(`Utk : ${note.customerName}`);
  lines.push("--------------------------------");
  const totals = calcNoteTotals(note);
  for (const it of note.items) {
    lines.push(it.name);
    const left = `  ${it.qty} x ${formatIDR(it.price)}`;
    const right = formatIDR(calcLineSubtotal(it));
    lines.push(padBetween(left, right, 32));
  }
  lines.push("--------------------------------");
  lines.push(padBetween("Subtotal", formatIDR(totals.subtotal), 32));
  if (totals.noteDiscount > 0) {
    lines.push(padBetween("Diskon", "- " + formatIDR(totals.noteDiscount), 32));
  }
  if (totals.taxRate > 0) {
    lines.push(padBetween(`Pajak (${totals.taxRate}%)`, formatIDR(totals.taxAmount), 32));
  }
  if (totals.shipping > 0) {
    lines.push(padBetween("Ongkir", formatIDR(totals.shipping), 32));
  }
  lines.push(padBetween("*TOTAL*", `*${formatIDR(totals.total)}*`, 32));
  lines.push("--------------------------------");
  lines.push(padBetween("Bayar", PAYMENT_LABELS[note.paymentMethod], 32));
  if (note.paymentMethod === "tunai" && note.cashReceived > 0) {
    lines.push(padBetween("Tunai", formatIDR(note.cashReceived), 32));
    lines.push(padBetween("Kembali", formatIDR(Math.max(0, note.cashReceived - totals.total)), 32));
  }
  if (note.status === "belum") {
    lines.push("");
    lines.push(`⚠️ *BELUM LUNAS*${note.dueDate ? ` — jatuh tempo ${formatDateTime(note.dueDate + "T00:00:00").split(" · ")[0]}` : ""}`);
  }
  if (business.bankName && note.paymentMethod !== "qris") {
    lines.push("", "🏦 *Transfer ke:*", `${business.bankName} ${business.bankAccount}`, `a/n ${business.bankHolder}`);
  }
  lines.push("--------------------------------");
  if (note.note) lines.push(`Catatan: ${note.note}`);
  if (business.receiptFooter) lines.push(business.receiptFooter);
  return lines.join("\n");
}

function padBetween(left: string, right: string, width: number): string {
  const space = Math.max(1, width - left.length - right.length);
  return left + " ".repeat(space) + right;
}

export async function renderReceiptPNG(node: HTMLElement): Promise<string> {
  const { toPng } = await import("html-to-image");
  return await toPng(node, { pixelRatio: 2, cacheBust: true, backgroundColor: "#ffffff" });
}

// Cetak struk thermal: buka window baru dengan @page size sesuai lebar kertas, lalu print().
export function printThermal(node: HTMLElement, paperWidth: "58mm" | "80mm"): boolean {
  if (typeof window === "undefined") return false;
  const mm = paperWidth === "58mm" ? 58 : 80;
  const w = window.open("", "_blank", "width=380,height=600");
  if (!w) return false;
  w.document.write(
    `<!DOCTYPE html><html><head><title>Struk</title>` +
      `<style>@page{size:${mm}mm auto;margin:0}body{margin:0;padding:0;background:#fff}` +
      `@media print{body{margin:0;padding:0}}</style></head>` +
      `<body>${node.innerHTML}</body></html>`,
  );
  w.document.close();
  w.onload = () => {
    w.focus();
    w.print();
    setTimeout(() => w.close(), 800);
  };
  return true;
}

// Render struk thermal sebagai PNG data-URL (untuk simpan/bagikan).
export async function renderThermalPNG(node: HTMLElement): Promise<string> {
  const { toPng } = await import("html-to-image");
  return await toPng(node, { pixelRatio: 3, cacheBust: true, backgroundColor: "#ffffff" });
}

export function waLink(phone: string | undefined, text: string): string {
  const digits = (phone || "").replace(/[^\d]/g, "");
  const normalized = digits.startsWith("0") ? "62" + digits.slice(1) : digits;
  const base = normalized ? `https://wa.me/${normalized}` : "https://wa.me/";
  return `${base}?text=${encodeURIComponent(text)}`;
}

export async function downloadDataUrl(dataUrl: string, filename: string) {
  if (typeof document === "undefined") return;
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export async function sharePNG(dataUrl: string, filename: string, text?: string): Promise<boolean> {
  if (typeof navigator === "undefined") return false;
  try {
    const blob = await (await fetch(dataUrl)).blob();
    const file = new File([blob], filename, { type: "image/png" });
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    if (nav.canShare && nav.canShare({ files: [file] })) {
      await navigator.share({ files: [file], text });
      return true;
    }
  } catch {
    /* fallthrough */
  }
  await downloadDataUrl(dataUrl, filename);
  return false;
}
