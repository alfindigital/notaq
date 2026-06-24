import { createFileRoute, Link } from "@tanstack/react-router";
import { lazy, Suspense, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ChevronLeft, ChevronRight, Package, Users, Wallet, FileSpreadsheet, FileText } from "lucide-react";
import { toast } from "sonner";

const OmsetChart = lazy(() => import("@/components/OmsetChart"));

import { db, monthlyRecap, monthlyBuckets, inCalendarMonth, PAYMENT_METHODS, PAYMENT_LABELS, type Note } from "@/lib/storage";
import { exportNotesCSV, exportNotesPDF } from "@/lib/exportReport";
import { formatIDR } from "@/lib/format";
import { cn } from "@/lib/utils";
import { SkelHero } from "@/components/Skeleton";
import { SITE_URL } from "@/lib/site";

export const Route = createFileRoute("/laporan")({
  head: () => ({
    meta: [
      { title: "Laporan Bulanan & Rekap Omset UMKM · Notaku" },
      { name: "description", content: "Lihat rekap bulanan usaha: omset, laba bersih, metode pembayaran, item terlaris, dan tren 6 bulan. Gratis, tanpa login, data aman di HP." },
      { property: "og:title", content: "Laporan Bulanan & Rekap Omset UMKM · Notaku" },
      { property: "og:description", content: "Rekap bulanan omset, laba bersih, dan tren penjualan UMKM. Gratis, tanpa login." },
      { property: "og:url", content: `${SITE_URL}/laporan` },
      { property: "og:image", content: `${SITE_URL}/og-image.jpg` },
    ],
    links: [{ rel: "canonical", href: `${SITE_URL}/laporan` }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Beranda", item: `${SITE_URL}/` },
            { "@type": "ListItem", position: 2, name: "Laporan", item: `${SITE_URL}/laporan` },
          ],
        }),
      },
    ],
  }),
  component: LaporanPage,
});

function LaporanPage() {
  const notesQ = useQuery({ queryKey: ["notes"], queryFn: () => db.getNotes() });
  const notes = notesQ.data ?? [];
  const { data: expenses = [] } = useQuery({ queryKey: ["expenses"], queryFn: () => db.getExpenses() });
  const { data: business } = useQuery({ queryKey: ["business"], queryFn: () => db.getBusiness() });
  const { data: prefs } = useQuery({ queryKey: ["prefs"], queryFn: () => db.getPrefs() });
  const hide = !!prefs?.hideAmounts;
  const loading = notesQ.isPending;

  const now = new Date();
  const [cursor, setCursor] = useState({ year: now.getFullYear(), month: now.getMonth() });

  const recap = useMemo(() => monthlyRecap(notes, expenses, cursor.year, cursor.month), [notes, expenses, cursor]);
  const buckets = useMemo(() => monthlyBuckets(notes, 6), [notes]);

  const isCurrentMonth = cursor.year === now.getFullYear() && cursor.month === now.getMonth();
  const monthLabel = new Date(cursor.year, cursor.month, 1).toLocaleDateString("id-ID", { month: "long", year: "numeric" });
  const empty = recap.count === 0 && recap.pengeluaran === 0;

  function shiftMonth(delta: number) {
    setCursor((c) => {
      const d = new Date(c.year, c.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }

  const fmt = (n: number) => (hide ? "•••" : formatIDR(n));

  return (
    <div className="space-y-5">
      <h1 className="sr-only">Laporan Bulanan & Rekap Omset UMKM</h1>

      {/* Top bar */}
      <div className="flex items-center justify-between">
        <Link to="/" className="tap inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground rounded-full px-1 py-1">
          <ArrowLeft className="h-4 w-4" /> Beranda
        </Link>
      </div>

      {/* Month switcher */}
      <div className="flex items-center justify-between rounded-full bg-surface p-1">
        <button
          type="button"
          onClick={() => shiftMonth(-1)}
          aria-label="Bulan sebelumnya"
          className="tap grid place-items-center h-9 w-9 rounded-full text-muted-foreground hover:text-foreground hover:bg-card"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <span className="font-display font-semibold tracking-tight text-[15px] capitalize">{monthLabel}</span>
        <button
          type="button"
          onClick={() => shiftMonth(1)}
          disabled={isCurrentMonth}
          aria-label="Bulan berikutnya"
          className="tap grid place-items-center h-9 w-9 rounded-full text-muted-foreground hover:text-foreground hover:bg-card disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-3">
          <SkelHero />
          <SkelHero />
        </div>
      ) : (
        <>
          {/* Hero stats */}
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Omset" value={fmt(recap.omset)} sub={`${recap.count} nota`} />
            <StatCard label="Laba Bersih" value={fmt(recap.labaBersih)} sub="Setelah pengeluaran" tone="accent" />
          </div>

          {empty ? (
            <div className="rounded-2xl border border-dashed border-border p-10 text-center">
              <p className="font-medium">Belum ada data bulan ini</p>
              <p className="t-caption mt-1">Catat nota atau pengeluaran untuk melihat rekap.</p>
            </div>
          ) : (
            <>
              {/* Detail */}
              <section className="rounded-2xl bg-card border border-border shadow-soft p-4 space-y-2 text-sm">
                <Row label="Laba kotor" value={fmt(recap.labaKotor)} muted />
                <Row label="Pengeluaran" value={hide ? "•••" : "− " + formatIDR(recap.pengeluaran)} muted />
                <Row label="Rata-rata / nota" value={fmt(recap.avgPerNota)} muted />
              </section>

              {/* Metode pembayaran */}
              <section className="space-y-2">
                <h2 className="t-eyebrow px-1 inline-flex items-center gap-1.5"><Wallet className="h-3.5 w-3.5" /> Metode bayar</h2>
                <ul className="rounded-2xl bg-card border border-border shadow-soft overflow-hidden divide-y divide-border">
                  {PAYMENT_METHODS.map((m) => {
                    const row = recap.byMethod[m];
                    return (
                      <li key={m} className="flex items-center justify-between px-4 py-3 text-sm">
                        <div className="min-w-0">
                          <div className="font-medium">{PAYMENT_LABELS[m]}</div>
                          <div className="t-caption mt-0.5">{row.count} nota</div>
                        </div>
                        <div className="font-medium tabular-nums">{fmt(row.omset)}</div>
                      </li>
                    );
                  })}
                </ul>
              </section>

              {/* Item terlaris */}
              {recap.topItems.length > 0 && (
                <section className="space-y-2">
                  <h2 className="t-eyebrow px-1 inline-flex items-center gap-1.5"><Package className="h-3.5 w-3.5" /> Item terlaris</h2>
                  <ul className="rounded-2xl bg-card border border-border shadow-soft overflow-hidden divide-y divide-border">
                    {recap.topItems.map((it) => (
                      <li key={it.name} className="flex items-center justify-between px-4 py-3 text-sm gap-2">
                        <div className="min-w-0">
                          <div className="font-medium truncate">{it.name}</div>
                          <div className="t-caption mt-0.5 tabular-nums">{it.qty}× terjual</div>
                        </div>
                        <div className="font-medium tabular-nums shrink-0">{fmt(it.omset)}</div>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* Pelanggan teratas */}
              {recap.topCustomers.length > 0 && (
                <section className="space-y-2">
                  <h2 className="t-eyebrow px-1 inline-flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> Pelanggan teratas</h2>
                  <ul className="rounded-2xl bg-card border border-border shadow-soft overflow-hidden divide-y divide-border">
                    {recap.topCustomers.map((c) => (
                      <li key={c.name} className="flex items-center justify-between px-4 py-3 text-sm gap-2">
                        <div className="min-w-0">
                          <div className="font-medium truncate">{c.name}</div>
                          <div className="t-caption mt-0.5">{c.count}× nota</div>
                        </div>
                        <div className="font-medium tabular-nums shrink-0">{fmt(c.total)}</div>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}

          {/* Tren 6 bulan */}
          {notes.length > 0 && (
            <section className="rounded-2xl bg-card border border-border shadow-soft p-3">
              <div className="flex items-center justify-between px-1 pb-2">
                <h2 className="t-eyebrow">Tren omset 6 bulan</h2>
              </div>
              <div className="h-32">
                <Suspense fallback={<div className="h-full w-full rounded-xl bg-muted/40 animate-pulse" />}>
                  <OmsetChart
                    buckets={buckets}
                    labelFor={(b) => new Date(b.date).toLocaleDateString("id-ID", { month: "long", year: "numeric" })}
                  />
                </Suspense>
              </div>
            </section>
          )}

          {/* Ekspor */}
          {notes.length > 0 && (
            <ExportCard notes={notes} cursor={cursor} businessName={business?.name} />
          )}
        </>
      )}
    </div>
  );
}

type Scope = "month" | "year" | "all";
function ExportCard({ notes, cursor, businessName }: { notes: Note[]; cursor: { year: number; month: number }; businessName?: string }) {
  const [scope, setScope] = useState<Scope>("month");
  const [busy, setBusy] = useState(false);

  const scoped = useMemo(() => {
    if (scope === "all") return notes;
    if (scope === "year") return notes.filter((n) => new Date(n.date).getFullYear() === cursor.year);
    return notes.filter((n) => inCalendarMonth(n.date, cursor.year, cursor.month));
  }, [notes, scope, cursor]);

  const monthLabel = new Date(cursor.year, cursor.month, 1).toLocaleDateString("id-ID", { month: "long", year: "numeric" });
  const scopeLabel: Record<Scope, string> = { month: monthLabel, year: `Tahun ${cursor.year}`, all: "Semua data" };
  const slug = scope === "month" ? `${cursor.year}-${String(cursor.month + 1).padStart(2, "0")}` : scope === "year" ? String(cursor.year) : "semua";

  function doCSV() {
    if (!scoped.length) return;
    try { exportNotesCSV(scoped, `laporan-${slug}.csv`); }
    catch (e) { toast.error("Gagal membuat CSV."); if (import.meta.env.DEV) console.error(e); }
  }
  async function doPDF() {
    if (!scoped.length) return;
    setBusy(true);
    try { await exportNotesPDF(scoped, businessName, `laporan-${slug}.pdf`); }
    catch (e) { toast.error("Gagal membuat PDF."); if (import.meta.env.DEV) console.error(e); }
    finally { setBusy(false); }
  }

  return (
    <section className="rounded-2xl bg-card border border-border shadow-soft p-4 space-y-3">
      <div>
        <h2 className="t-eyebrow">Ekspor laporan</h2>
        <p className="t-caption mt-0.5">Unduh data nota untuk pembukuan atau arsip.</p>
      </div>
      <div className="flex rounded-full bg-surface p-0.5 text-sm">
        {(["month", "year", "all"] as Scope[]).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setScope(s)}
            className={cn(
              "flex-1 h-9 rounded-full font-medium capitalize transition-colors",
              scope === s ? "bg-primary text-primary-foreground shadow-soft" : "text-muted-foreground",
            )}
          >
            {s === "month" ? "Bulan ini" : s === "year" ? "Tahun ini" : "Semua"}
          </button>
        ))}
      </div>
      <p className="t-caption">{scopeLabel[scope]} · {scoped.length} nota</p>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={doCSV}
          disabled={!scoped.length}
          className="tap inline-flex items-center justify-center gap-1.5 rounded-full bg-card border border-border h-11 text-sm font-medium disabled:opacity-50"
        >
          <FileSpreadsheet className="h-4 w-4" /> CSV
        </button>
        <button
          type="button"
          onClick={doPDF}
          disabled={!scoped.length || busy}
          className="tap inline-flex items-center justify-center gap-1.5 rounded-full bg-primary text-primary-foreground h-11 text-sm font-medium disabled:opacity-50"
        >
          <FileText className="h-4 w-4" /> {busy ? "Membuat…" : "PDF"}
        </button>
      </div>
    </section>
  );
}

function StatCard({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: "accent" }) {
  return (
    <div className={"rounded-2xl border border-border shadow-soft p-4 " + (tone === "accent" ? "bg-accent/40" : "bg-card")}>
      <div className="t-eyebrow">{label}</div>
      <div className="t-display mt-1.5 tabular-nums">{value}</div>
      <div className="t-caption mt-0.5">{sub}</div>
    </div>
  );
}

function Row({ label, value, muted }: { label: React.ReactNode; value: React.ReactNode; muted?: boolean }) {
  return (
    <div className={`flex justify-between ${muted ? "text-muted-foreground" : ""}`}>
      <span>{label}</span><span className="tabular-nums">{value}</span>
    </div>
  );
}
