import type { Note } from "./storage";
import { calcNoteTotals, PAYMENT_LABELS, STATUS_LABELS } from "./storage";
import { formatIDR, formatDate } from "./format";

type ReportRow = {
  number: string;
  date: string;
  customer: string;
  method: string;
  status: string;
  subtotal: number;
  discount: number;
  tax: number;
  shipping: number;
  total: number;
  modal: number;
  laba: number;
};

function buildRows(notes: Note[]): ReportRow[] {
  return notes.map((n) => {
    const t = calcNoteTotals(n);
    return {
      number: n.number,
      date: n.date,
      customer: n.customerName || "-",
      method: PAYMENT_LABELS[n.paymentMethod],
      status: STATUS_LABELS[n.status],
      subtotal: t.subtotal,
      discount: t.noteDiscount,
      tax: t.taxAmount,
      shipping: t.shipping,
      total: t.total,
      modal: t.modal,
      laba: t.laba,
    };
  });
}

// Bungkus sel CSV agar koma/kutip/baris baru aman; angka tetap mentah agar Excel bisa dijumlah.
function csvCell(v: string | number): string {
  if (typeof v === "number") return String(v);
  return `"${v.replace(/"/g, '""')}"`;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const HEADERS = [
  "No Nota",
  "Tanggal",
  "Pelanggan",
  "Metode",
  "Status",
  "Subtotal",
  "Diskon",
  "Pajak",
  "Ongkir",
  "Total",
  "Modal",
  "Laba",
];

export function exportNotesCSV(notes: Note[], filename?: string) {
  const rows = buildRows(notes);
  const lines = [
    HEADERS.map(csvCell).join(","),
    ...rows.map((r) =>
      [
        csvCell(r.number),
        csvCell(formatDate(r.date)),
        csvCell(r.customer),
        csvCell(r.method),
        csvCell(r.status),
        r.subtotal,
        r.discount,
        r.tax,
        r.shipping,
        r.total,
        r.modal,
        r.laba,
      ].join(","),
    ),
  ];

  // Baris total agregat.
  const sum = (k: keyof ReportRow) => rows.reduce((s, r) => s + (r[k] as number), 0);
  lines.push("");
  lines.push(
    [
      csvCell("TOTAL"),
      "",
      "",
      "",
      "",
      sum("subtotal"),
      sum("discount"),
      sum("tax"),
      sum("shipping"),
      sum("total"),
      sum("modal"),
      sum("laba"),
    ].join(","),
  );

  // BOM (﻿) agar Excel membaca UTF-8 dengan benar.
  const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  downloadBlob(blob, filename || `laporan-${new Date().toISOString().slice(0, 10)}.csv`);
}

export async function exportNotesPDF(notes: Note[], businessName?: string, filename?: string) {
  const rows = buildRows(notes);
  const { default: jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const marginL = 10;
  const marginR = 10;
  let y = 15;

  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text(businessName || "Laporan Penjualan", marginL, y);
  y += 6;
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(`Dicetak ${formatDate(new Date().toISOString())} · ${rows.length} nota`, marginL, y);
  y += 8;

  const cols = [
    { label: "No Nota", w: 34, key: "number" as const, num: false },
    { label: "Tanggal", w: 24, key: "date" as const, num: false },
    { label: "Pelanggan", w: 38, key: "customer" as const, num: false },
    { label: "Status", w: 20, key: "status" as const, num: false },
    { label: "Subtotal", w: 26, key: "subtotal" as const, num: true },
    { label: "Diskon", w: 22, key: "discount" as const, num: true },
    { label: "Pajak", w: 22, key: "tax" as const, num: true },
    { label: "Ongkir", w: 22, key: "shipping" as const, num: true },
    { label: "Total", w: 28, key: "total" as const, num: true },
    { label: "Laba", w: 26, key: "laba" as const, num: true },
  ];

  const drawHeader = () => {
    doc.setFillColor(34, 139, 110); // hijau Notaku
    doc.rect(marginL, y - 4, pageW - marginL - marginR, 7, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    let x = marginL + 2;
    for (const c of cols) {
      doc.text(c.label, x, y);
      x += c.w;
    }
    doc.setTextColor(0, 0, 0);
    y += 6;
  };

  drawHeader();
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);

  rows.forEach((r, i) => {
    if (y > pageH - 18) {
      doc.addPage();
      y = 15;
      drawHeader();
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
    }
    if (i % 2 === 0) {
      doc.setFillColor(244, 248, 246);
      doc.rect(marginL, y - 3.5, pageW - marginL - marginR, 5.5, "F");
    }
    let x = marginL + 2;
    for (const c of cols) {
      const raw = c.key === "date" ? formatDate(r.date) : r[c.key];
      const text = c.num ? formatIDR(raw as number) : String(raw).slice(0, 24);
      if (c.key === "total") doc.setFont("helvetica", "bold");
      doc.text(text, x, y);
      if (c.key === "total") doc.setFont("helvetica", "normal");
      x += c.w;
    }
    y += 5.5;
  });

  const totalRevenue = rows.reduce((s, r) => s + r.total, 0);
  const totalLaba = rows.reduce((s, r) => s + r.laba, 0);
  y += 4;
  if (y > pageH - 14) {
    doc.addPage();
    y = 15;
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(
    `Total Pendapatan: ${formatIDR(totalRevenue)}   ·   Total Laba: ${formatIDR(totalLaba)}`,
    marginL + 2,
    y,
  );

  doc.save(filename || `laporan-${new Date().toISOString().slice(0, 10)}.pdf`);
}
