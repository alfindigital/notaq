import { forwardRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import type { Business, Note } from "@/lib/storage";
import { calcNoteTotals, calcLineSubtotal, PAYMENT_LABELS } from "@/lib/storage";
import { formatIDR, formatDateTime } from "@/lib/format";

interface Props { note: Note; business: Business }

export const Receipt = forwardRef<HTMLDivElement, Props>(function Receipt({ note, business }, ref) {
  const totals = calcNoteTotals(note);
  return (
    <div
      ref={ref}
      style={{
        width: 360,
        background: "#fbf6ec",
        color: "#1a2a4a",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        padding: 20,
        fontSize: 12,
        lineHeight: 1.45,
      }}
    >
      <div style={{ textAlign: "center", marginBottom: 10 }}>
        {business.logo ? (
          <img src={business.logo} alt="" role="presentation" style={{ height: 40, margin: "0 auto 6px", display: "block" }} />
        ) : null}
        {business.name ? (
          <div style={{ fontWeight: 700, fontSize: 14, letterSpacing: "-0.01em" }}>{business.name}</div>
        ) : null}
        {business.address ? <div style={{ fontSize: 11 }}>{business.address}</div> : null}
        {business.phone ? <div style={{ fontSize: 11 }}>Telp {business.phone}</div> : null}
      </div>
      <Divider />
      <Row left="No" right={note.number} />
      <Row left="Tgl" right={formatDateTime(note.date)} />
      {note.customerName ? <Row left="Untuk" right={note.customerName} /> : null}
      <Divider />
      {note.items.map((it, i) => (
        <div key={i} style={{ marginBottom: 4 }}>
          <div>{it.name}</div>
          <Row left={`  ${it.qty} × ${formatIDR(it.price)}`} right={formatIDR(calcLineSubtotal(it))} />
          {it.discountValue > 0 ? (
            <div style={{ fontSize: 10, color: "#6b7280" }}>
              {`  diskon ${it.discountType === "percent" ? it.discountValue + "%" : formatIDR(it.discountValue)}`}
            </div>
          ) : null}
        </div>
      ))}
      <Divider />
      <Row left="Subtotal" right={formatIDR(totals.subtotal)} />
      {totals.noteDiscount > 0 ? <Row left="Diskon" right={"- " + formatIDR(totals.noteDiscount)} /> : null}
      {totals.taxRate > 0 ? <Row left={`Pajak (${totals.taxRate}%)`} right={formatIDR(totals.taxAmount)} /> : null}
      {totals.shipping > 0 ? <Row left="Ongkir" right={formatIDR(totals.shipping)} /> : null}
      <Row left={<strong>TOTAL</strong>} right={<strong>{formatIDR(totals.total)}</strong>} bold />
      <Divider />
      <Row left="Bayar" right={PAYMENT_LABELS[note.paymentMethod]} />
      {note.paymentMethod === "tunai" && note.cashReceived > 0 ? (
        <>
          <Row left="Tunai" right={formatIDR(note.cashReceived)} />
          <Row left="Kembali" right={formatIDR(Math.max(0, note.cashReceived - totals.total))} />
        </>
      ) : null}
      {note.status === "belum" ? (
        <div style={{ textAlign: "center", marginTop: 6, fontWeight: 700, color: "#b45309", border: "1px solid #b45309", borderRadius: 6, padding: "2px 0" }}>
          BELUM LUNAS{note.dueDate ? ` · jatuh tempo ${formatDateTime(note.dueDate + "T00:00:00").split(" · ")[0]}` : ""}
        </div>
      ) : null}
      {/* Rekening transfer / QRIS */}
      {note.paymentMethod === "qris" && business.qrisImage ? (
        <>
          <Divider />
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 11, marginBottom: 4 }}>Scan QRIS</div>
            <img src={business.qrisImage} alt="QRIS" style={{ height: 120, margin: "0 auto", display: "block" }} />
          </div>
        </>
      ) : business.bankName ? (
        <>
          <Divider />
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
            <div style={{ fontSize: 11 }}>
              <div style={{ fontWeight: 700 }}>Transfer ke:</div>
              <div>{business.bankName} {business.bankAccount}</div>
              <div>a/n {business.bankHolder}</div>
            </div>
            <QRCodeSVG value={`Transfer ${business.bankName} ${business.bankAccount} a/n ${business.bankHolder} | ${formatIDR(totals.total)}`} size={56} />
          </div>
        </>
      ) : null}
      <Divider />
      {note.note ? (
        <div style={{ marginTop: 4, fontStyle: "italic" }}>Catatan: {note.note}</div>
      ) : null}
      {business.receiptFooter ? (
        <div style={{ textAlign: "center", marginTop: 6 }}>{business.receiptFooter}</div>
      ) : null}
    </div>
  );
});

function Divider() {
  return <div style={{ borderTop: "1px dashed #999", margin: "6px 0" }} />;
}

function Row({ left, right, bold }: { left: React.ReactNode; right: React.ReactNode; bold?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontWeight: bold ? 700 : 400 }}>
      <span>{left}</span>
      <span>{right}</span>
    </div>
  );
}
