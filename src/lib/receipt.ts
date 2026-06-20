import type { Business, Note } from "./storage";
import { calcNoteTotals, PAYMENT_LABELS } from "./storage";
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
    const right = formatIDR(it.qty * it.price);
    lines.push(padBetween(left, right, 32));
  }
  lines.push("--------------------------------");
  lines.push(padBetween("Subtotal", formatIDR(totals.subtotal), 32));
  if (note.discount > 0) {
    lines.push(padBetween("Diskon", "- " + formatIDR(note.discount), 32));
  }
  lines.push(padBetween("*TOTAL*", `*${formatIDR(totals.total)}*`, 32));
  lines.push("--------------------------------");
  lines.push(padBetween("Bayar", PAYMENT_LABELS[note.paymentMethod], 32));
  if (note.paymentMethod === "tunai" && note.cashReceived > 0) {
    lines.push(padBetween("Tunai", formatIDR(note.cashReceived), 32));
    lines.push(padBetween("Kembali", formatIDR(Math.max(0, note.cashReceived - totals.total)), 32));
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
