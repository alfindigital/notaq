import { forwardRef } from "react";
import type { Business, Note } from "@/lib/storage";
import { calcNoteTotals, calcLineSubtotal, PAYMENT_LABELS } from "@/lib/storage";
import { formatIDR, formatDateTime } from "@/lib/format";

export type PaperWidth = "58mm" | "80mm";

interface Props {
  note: Note;
  business: Business;
  paperWidth: PaperWidth;
}

// Struk thermal monokrom untuk printer 58mm / 80mm (mono, hitam-putih).
export const ThermalReceipt = forwardRef<HTMLDivElement, Props>(function ThermalReceipt(
  { note, business, paperWidth },
  ref,
) {
  const totals = calcNoteTotals(note);
  const is58 = paperWidth === "58mm";
  const width = is58 ? "48mm" : "72mm";
  const fontSize = is58 ? 9 : 11;
  const sep = (is58 ? "-" : "=").repeat(is58 ? 32 : 42);

  return (
    <div
      ref={ref}
      style={{
        width,
        fontFamily: "'Courier New', Consolas, monospace",
        fontSize,
        lineHeight: 1.4,
        color: "#000",
        background: "#fff",
        padding: is58 ? "2mm" : "3mm",
        boxSizing: "border-box",
      }}
    >
      <div style={{ textAlign: "center", marginBottom: "2mm" }}>
        <div style={{ fontSize: is58 ? 11 : 13, fontWeight: 700 }}>{business.name || "NAMA USAHA"}</div>
        {business.address ? <div style={{ fontSize: fontSize - 1 }}>{business.address}</div> : null}
        {business.phone ? <div style={{ fontSize: fontSize - 1 }}>{business.phone}</div> : null}
      </div>

      <Sep sep={sep} />
      <div>No : {note.number}</div>
      <div>Tgl: {formatDateTime(note.date)}</div>
      {note.customerName ? <div>Plg: {note.customerName}</div> : null}
      <Sep sep={sep} />

      {note.items.map((it, i) => (
        <div key={i} style={{ marginBottom: "1mm" }}>
          <div style={{ fontWeight: 700 }}>{it.name}</div>
          <TRow left={`${it.qty} x ${formatIDR(it.price)}`} right={formatIDR(calcLineSubtotal(it))} />
          {it.discountValue > 0 ? (
            <div style={{ fontSize: fontSize - 2 }}>
              diskon {it.discountType === "percent" ? `${it.discountValue}%` : formatIDR(it.discountValue)}
            </div>
          ) : null}
        </div>
      ))}

      <Sep sep={sep} />
      <TRow left="Subtotal" right={formatIDR(totals.subtotal)} />
      {totals.noteDiscount > 0 ? <TRow left="Diskon" right={"-" + formatIDR(totals.noteDiscount)} /> : null}
      {totals.taxRate > 0 ? <TRow left={`Pajak ${totals.taxRate}%`} right={formatIDR(totals.taxAmount)} /> : null}
      {totals.shipping > 0 ? <TRow left="Ongkir" right={formatIDR(totals.shipping)} /> : null}
      <div style={{ fontWeight: 700, fontSize: is58 ? 11 : 13, margin: "1mm 0" }}>
        <TRow left="TOTAL" right={formatIDR(totals.total)} bold />
      </div>
      <Sep sep={sep} />

      <TRow left="Bayar" right={PAYMENT_LABELS[note.paymentMethod]} />
      {note.paymentMethod === "tunai" && note.cashReceived > 0 ? (
        <>
          <TRow left="Tunai" right={formatIDR(note.cashReceived)} />
          <TRow left="Kembali" right={formatIDR(Math.max(0, note.cashReceived - totals.total))} />
        </>
      ) : null}

      {note.status === "belum" ? (
        <div style={{ textAlign: "center", fontWeight: 700, margin: "2mm 0" }}>** BELUM LUNAS **</div>
      ) : null}

      {business.bankName && note.paymentMethod !== "qris" ? (
        <div style={{ textAlign: "center", margin: "2mm 0", fontSize: fontSize - 1 }}>
          <div>Transfer ke:</div>
          <div style={{ fontWeight: 700 }}>{business.bankName} {business.bankAccount}</div>
          <div>a/n {business.bankHolder}</div>
        </div>
      ) : null}

      {note.note ? <div style={{ margin: "1mm 0", textAlign: "center" }}>{note.note}</div> : null}
      <div style={{ textAlign: "center", marginTop: "2mm", fontSize: fontSize - 1 }}>
        {business.receiptFooter || "Terima kasih!"}
      </div>
    </div>
  );
});

function Sep({ sep }: { sep: string }) {
  return <div style={{ letterSpacing: 1, whiteSpace: "nowrap", overflow: "hidden" }}>{sep}</div>;
}

function TRow({ left, right, bold }: { left: string; right: string; bold?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 6, fontWeight: bold ? 700 : 400 }}>
      <span>{left}</span>
      <span>{right}</span>
    </div>
  );
}
