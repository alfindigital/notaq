import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Trash2, MessageCircle, Image as ImageIcon, Copy, Pencil, CopyPlus, Printer, Download, BadgeCheck } from "lucide-react";
import { toast } from "sonner";


import { db, calcNoteTotals, calcLineSubtotal, PAYMENT_LABELS, STATUS_LABELS, statusTone, type Note } from "@/lib/storage";
import { formatIDR, formatDateTime } from "@/lib/format";
import { buildReceiptText, renderReceiptPNG, sharePNG, waLink, printThermal, renderThermalPNG, downloadDataUrl } from "@/lib/receipt";
import { tapHaptic } from "@/lib/haptic";
import { Receipt as ReceiptCard } from "@/components/Receipt";
import { ThermalReceipt, type PaperWidth } from "@/components/ThermalReceipt";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { RollingIDR } from "@/components/RollingIDR";

// Lebar kertas thermal terakhir dipilih (diingat antar nota).
const PAPER_WIDTH_KEY = "notaku:thermalPaperWidth";

export const Route = createFileRoute("/riwayat/$noteId")({
  head: () => ({
    meta: [
      { title: "Detail nota — Notaku" },
      { name: "description", content: "Lihat detail nota tersimpan: item, total, catatan, dan kirim ulang struk ke pelanggan via WhatsApp." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Detail nota — Notaku" },
      { property: "og:description", content: "Detail nota UMKM dengan opsi cetak struk, salin teks, dan kirim WhatsApp." },
    ],
  }),
  component: NoteDetail,
});

function NoteDetail() {
  const { noteId } = Route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: notes = [] } = useQuery({ queryKey: ["notes"], queryFn: () => db.getNotes() });
  const { data: business } = useQuery({ queryKey: ["business"], queryFn: () => db.getBusiness() });
  const note = notes.find((n) => n.id === noteId);

  const ref = useRef<HTMLDivElement>(null);
  const thermalRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [paperWidth, setPaperWidth] = useState<PaperWidth>(() =>
    typeof window !== "undefined" && localStorage.getItem(PAPER_WIDTH_KEY) === "80mm" ? "80mm" : "58mm",
  );
  function changePaper(w: PaperWidth) {
    setPaperWidth(w);
    try { localStorage.setItem(PAPER_WIDTH_KEY, w); } catch { /* ignore */ }
  }
  const text = useMemo(() => (note && business ? buildReceiptText(note, business) : ""), [note, business]);

  const del = useMutation({
    mutationFn: async () => { await db.setNotes(notes.filter((n) => n.id !== noteId)); },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notes"] });
      navigate({ to: "/riwayat" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const markPaid = useMutation({
    mutationFn: async () => {
      const now = new Date().toISOString();
      const next = notes.map((n): Note => (n.id === noteId ? { ...n, status: "lunas", dueDate: "", paidDate: now, updatedAt: now } : n));
      await db.setNotes(next);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["notes"] }); tapHaptic(20); toast.success("Ditandai lunas"); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!note || !business) {
    return (
      <div className="space-y-4">
        <BackLink />
        <p className="text-muted-foreground">Nota tidak ditemukan.</p>
      </div>
    );
  }

  async function shareImage() {
    if (!ref.current) return;
    setBusy(true);
    try {
      const url = await renderReceiptPNG(ref.current);
      await sharePNG(url, `${note!.number}.png`, text);
    } catch (e) { toast.error("Gagal membuat gambar."); if (import.meta.env.DEV) console.error(e); }
    finally { setBusy(false); }
  }
  async function copyText() {
    await navigator.clipboard.writeText(text);
    toast.success("Teks disalin");
  }
  function sendWA() {
    window.open(waLink(note!.customerPhone, text), "_blank", "noopener");
  }
  function doPrintThermal() {
    if (!thermalRef.current) return;
    if (!printThermal(thermalRef.current, paperWidth)) toast.error("Popup diblokir. Izinkan popup untuk mencetak.");
  }
  async function saveThermalPDF() {
    if (!thermalRef.current) return;
    setBusy(true);
    try {
      const [{ default: jsPDF }, dataUrl] = await Promise.all([import("jspdf"), renderThermalPNG(thermalRef.current)]);
      const img = new Image();
      img.src = dataUrl;
      await new Promise((res) => { img.onload = res; });
      const mm = paperWidth === "58mm" ? 58 : 80;
      const h = (img.height * mm) / img.width;
      const pdf = new jsPDF({ orientation: "p", unit: "mm", format: [mm, h] });
      pdf.addImage(dataUrl, "PNG", 0, 0, mm, h);
      pdf.save(`struk-${note!.number}.pdf`);
    } catch (e) {
      // Fallback: unduh PNG kalau jsPDF gagal.
      try { await downloadDataUrl(await renderThermalPNG(thermalRef.current!), `struk-${note!.number}.png`); }
      catch { toast.error("Gagal membuat file."); }
      if (import.meta.env.DEV) console.error(e);
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-5 pb-4">
      <div className="flex items-center justify-between">
        <BackLink />
        <div className="flex items-center gap-1">
          <Link
            to="/buat"
            search={{ from: note.id }}
            className="tap text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm rounded-full px-3 py-1.5"
          >
            <CopyPlus className="h-4 w-4" /> Buat ulang
          </Link>
          <Link
            to="/buat"
            search={{ edit: note.id }}
            className="tap text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm rounded-full px-3 py-1.5"
          >
            <Pencil className="h-4 w-4" /> Edit
          </Link>
          <button
            onClick={() => {
              toast("Hapus nota ini?", {
                action: { label: "Hapus", onClick: () => del.mutate() },
                cancel: { label: "Batal", onClick: () => undefined },
                duration: 8000,
              });
            }}
            className="tap text-muted-foreground hover:text-destructive inline-flex items-center gap-1 text-sm rounded-full px-3 py-1.5"
          >
            <Trash2 className="h-4 w-4" /> Hapus
          </button>
        </div>
      </div>

      <div>
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-2xl font-display font-semibold tracking-tight">{note.number}</h1>
          <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium", statusTone(note))}>
            {STATUS_LABELS[note.status]}
          </span>
        </div>
        <p className="text-xs text-muted-foreground mt-1">{formatDateTime(note.date)}</p>
        {note.status === "belum" && (
          <div className="mt-2 flex items-center gap-3 flex-wrap">
            <button
              onClick={() => markPaid.mutate()}
              disabled={markPaid.isPending}
              className="tap inline-flex items-center gap-1.5 rounded-full bg-primary text-primary-foreground px-3.5 py-1.5 text-sm font-medium shadow-pop disabled:opacity-60"
            >
              <BadgeCheck className="h-4 w-4" /> Tandai Lunas
            </button>
            {note.dueDate && (
              <span className="text-xs text-muted-foreground">
                Jatuh tempo {new Date(note.dueDate + "T00:00:00").toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
              </span>
            )}
          </div>
        )}
      </div>

      {note.customerName && (
        <section className="rounded-2xl bg-card border border-border shadow-soft p-4">
          <h2 className="t-eyebrow">Pelanggan</h2>
          <div className="font-medium mt-1">{note.customerName}</div>
          {note.customerPhone && <div className="text-sm text-muted-foreground">{note.customerPhone}</div>}
        </section>
      )}

      {note.note && (
        <section className="rounded-2xl bg-card border border-border shadow-soft p-4">
          <h2 className="t-eyebrow">Catatan</h2>
          <div className="text-sm mt-1 whitespace-pre-wrap">{note.note}</div>
        </section>
      )}



      <section aria-labelledby="nota-items">
        <h2 id="nota-items" className="sr-only">Item</h2>
        <ul className="rounded-2xl bg-card border border-border shadow-soft overflow-hidden divide-y divide-border">
          {note.items.map((it, i) => (
            <li key={i} className="px-4 py-3 flex justify-between text-sm">
              <div className="min-w-0">
                <div className="font-medium truncate">{it.name}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {it.qty} × {formatIDR(it.price)}
                  {it.discountValue > 0 ? ` · diskon ${it.discountType === "percent" ? `${it.discountValue}%` : formatIDR(it.discountValue)}` : ""}
                </div>
              </div>
              <div className="font-medium">{formatIDR(calcLineSubtotal(it))}</div>
            </li>
          ))}
        </ul>
      </section>

      {(() => {
        const totals = calcNoteTotals(note);
        return (
          <section aria-labelledby="nota-ringkasan" className="rounded-2xl bg-card border border-border shadow-soft p-4 space-y-2 text-sm">
            <h2 id="nota-ringkasan" className="sr-only">Ringkasan</h2>
            <Row label="Subtotal" value={<RollingIDR value={totals.subtotal} />} muted />
            {totals.noteDiscount > 0 && (
              <Row label="Diskon" value={"− " + formatIDR(totals.noteDiscount)} muted />
            )}
            {totals.taxRate > 0 && (
              <Row label={`Pajak (${totals.taxRate}%)`} value={"+ " + formatIDR(totals.taxAmount)} muted />
            )}
            {totals.shipping > 0 && (
              <Row label="Ongkir" value={"+ " + formatIDR(totals.shipping)} muted />
            )}
            <div className="h-px bg-border my-1" />
            <div className="flex items-end justify-between">
              <span className="text-muted-foreground">Total</span>
              <RollingIDR value={totals.total} className="font-display font-semibold text-2xl tracking-tight" />
            </div>
            <div className="h-px bg-border my-1" />
            <Row label="Metode" value={PAYMENT_LABELS[note.paymentMethod]} muted />
            {note.paymentMethod === "tunai" && note.cashReceived > 0 && (
              <>
                <Row label="Tunai" value={formatIDR(note.cashReceived)} muted />
                <Row label="Kembali" value={formatIDR(Math.max(0, note.cashReceived - totals.total))} muted />
              </>
            )}
          </section>
        );
      })()}

      <div className="grid grid-cols-4 gap-2 pt-2">
        <ActionTile icon={<ImageIcon className="h-5 w-5" />} label="PNG" onClick={shareImage} loading={busy} />
        <ActionTile icon={<Copy className="h-5 w-5" />} label="Salin" onClick={copyText} />
        <ActionTile icon={<MessageCircle className="h-5 w-5" />} label="WA" onClick={sendWA} />
        <Popover>
          <PopoverTrigger asChild>
            <button
              onClick={() => tapHaptic()}
              disabled={busy}
              aria-label="Cetak struk thermal"
              className="tap flex flex-col items-center justify-center gap-1.5 rounded-2xl bg-card border border-border shadow-soft py-4 text-sm disabled:opacity-60"
            >
              <Printer className="h-5 w-5" />
              <span>Cetak</span>
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-60 p-3 space-y-3" align="end">
            <div>
              <div className="t-eyebrow mb-1.5">Lebar kertas</div>
              <div className="flex w-full rounded-full bg-surface p-0.5">
                {(["58mm", "80mm"] as PaperWidth[]).map((w) => (
                  <button
                    key={w}
                    type="button"
                    onClick={() => changePaper(w)}
                    className={cn(
                      "flex-1 h-9 rounded-full text-sm font-medium transition-colors",
                      paperWidth === w ? "bg-primary text-primary-foreground shadow-soft" : "text-muted-foreground",
                    )}
                  >
                    {w}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => { tapHaptic(); doPrintThermal(); }}
                className="tap inline-flex items-center justify-center gap-1.5 rounded-full bg-primary text-primary-foreground h-10 text-sm font-medium"
              >
                <Printer className="h-4 w-4" /> Cetak
              </button>
              <button
                type="button"
                onClick={() => { tapHaptic(); saveThermalPDF(); }}
                disabled={busy}
                className="tap inline-flex items-center justify-center gap-1.5 rounded-full bg-card border border-border h-10 text-sm font-medium disabled:opacity-60"
              >
                <Download className="h-4 w-4" /> PDF
              </button>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <div style={{ position: "fixed", left: -10000, top: 0 }}>
        <ReceiptCard ref={ref} note={note} business={business} />
        <ThermalReceipt ref={thermalRef} note={note} business={business} paperWidth={paperWidth} />
      </div>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      to="/riwayat"
      className="tap tap-target inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground rounded-full px-3"
    >
      <ArrowLeft className="h-4 w-4" /> Riwayat
    </Link>
  );
}
function Row({ label, value, muted }: { label: React.ReactNode; value: React.ReactNode; muted?: boolean }) {
  return (
    <div className={`flex justify-between ${muted ? "text-muted-foreground" : ""}`}>
      <span>{label}</span><span>{value}</span>
    </div>
  );
}
function ActionTile({
  icon, label, onClick, loading,
}: { icon: React.ReactNode; label: string; onClick: () => void; loading?: boolean }) {
  return (
    <button
      onClick={() => { tapHaptic(); onClick(); }}
      disabled={loading}
      className="tap flex flex-col items-center justify-center gap-1.5 rounded-2xl bg-card border border-border shadow-soft py-4 text-sm disabled:opacity-60"
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
