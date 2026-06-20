import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState, lazy, Suspense } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, FilePlus2, Wallet } from "lucide-react";
import { toast } from "sonner";

const OmsetChart = lazy(() => import("@/components/OmsetChart"));

import { db, aggregate, dailyBuckets, calcNoteTotals, hasMissingCost, sumExpenses } from "@/lib/storage";
import { formatIDR, formatDateID } from "@/lib/format";
import { SkelHero, SkelListItem, Skel } from "@/components/Skeleton";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { PullToRefreshIndicator } from "@/components/PullToRefreshIndicator";
import { SITE_URL } from "@/lib/site";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Notaku — Aplikasi Nota & Struk UMKM Gratis Tanpa Login" },
      { name: "description", content: "Aplikasi nota dan struk gratis untuk UMKM Indonesia. Catat omset, cetak struk, kirim ke pelanggan via WhatsApp — tanpa login, data aman di HP." },
      { property: "og:title", content: "Notaku — Aplikasi Nota & Struk UMKM Gratis Tanpa Login" },
      { property: "og:description", content: "Aplikasi nota dan struk gratis untuk UMKM. Catat omset, cetak struk, kirim ke pelanggan via WhatsApp — tanpa login, data aman di HP." },
      { property: "og:url", content: `${SITE_URL}/` },
      { property: "og:image", content: `${SITE_URL}/og-image.jpg` },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { name: "twitter:image", content: `${SITE_URL}/og-image.jpg` },
    ],
    links: [{ rel: "canonical", href: `${SITE_URL}/` }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: [
            {
              "@type": "Question",
              name: "Apakah Notaku gratis?",
              acceptedAnswer: { "@type": "Answer", text: "Ya. Notaku 100% gratis tanpa biaya bulanan, tanpa iklan, dan tanpa login akun." },
            },
            {
              "@type": "Question",
              name: "Apakah data nota saya aman?",
              acceptedAnswer: { "@type": "Answer", text: "Semua data tersimpan lokal di HP kamu (IndexedDB). Notaku tidak mengirim data ke server mana pun." },
            },
            {
              "@type": "Question",
              name: "Bisa kirim nota ke pelanggan lewat WhatsApp?",
              acceptedAnswer: { "@type": "Answer", text: "Bisa. Nota bisa dibagikan sebagai gambar atau teks langsung ke WhatsApp pelanggan dalam sekali tap." },
            },
            {
              "@type": "Question",
              name: "Apakah Notaku bisa dipakai offline?",
              acceptedAnswer: { "@type": "Answer", text: "Bisa. Notaku adalah PWA yang bisa diinstal di HP dan tetap berfungsi tanpa koneksi internet." },
            },
          ],
        }),
      },
    ],
  }),

  component: Beranda,
});

function Beranda() {
  const qc = useQueryClient();
  const notesQ = useQuery({ queryKey: ["notes"], queryFn: () => db.getNotes() });
  const notes = notesQ.data ?? [];
  useQuery({ queryKey: ["business"], queryFn: () => db.getBusiness() });
  const { data: prefs } = useQuery({ queryKey: ["prefs"], queryFn: () => db.getPrefs() });
  const { data: expenses = [] } = useQuery({ queryKey: ["expenses"], queryFn: () => db.getExpenses() });
  const [range, setRange] = useState<"today" | "month">("today");
  const stats = useMemo(() => aggregate(notes, range), [notes, range]);
  const pengeluaran = useMemo(() => sumExpenses(expenses, range), [expenses, range]);
  const labaBersih = stats.laba - pengeluaran;
  const buckets = useMemo(() => dailyBuckets(notes, 7), [notes]);
  const recent = useMemo(() => [...notes].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 5), [notes]);
  const missingCost = useMemo(() => hasMissingCost(notes), [notes]);
  const hide = !!prefs?.hideAmounts;
  const loading = notesQ.isPending;

  const ptr = usePullToRefresh(async () => {
    await qc.invalidateQueries();
    toast.success("Diperbarui", { duration: 1500 });
  });

  return (
    <div className="space-y-5">
      <h1 className="sr-only">Notaku — Dashboard Nota & Rekap Omset UMKM</h1>
      <PullToRefreshIndicator {...ptr} />




      <div className="relative grid grid-cols-2 rounded-full bg-surface p-1 text-sm" role="tablist">
        {(["today", "month"] as const).map((r) => (
          <button
            key={r}
            type="button"
            role="tab"
            aria-selected={range === r}
            onClick={() => setRange(r)}
            className={
              "tap min-h-9 rounded-full font-medium " +
              (range === r ? "bg-card text-foreground shadow-soft" : "text-muted-foreground")
            }
          >
            {r === "today" ? "Hari Ini" : "Bulan Ini"}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {loading ? (
          <>
            <SkelHero />
            <SkelHero />
          </>
        ) : (
          <>
            <HeroCard label="Omset" amount={stats.omset} sub={`${stats.count} nota`} hide={hide} />
            <HeroCard label="Laba Bersih" amount={labaBersih} sub={missingCost ? "Sebagian item belum bermodal" : "Setelah pengeluaran"} hide={hide} tone="accent" />
          </>
        )}
      </div>

      {!loading && (
        <Link
          to="/pengeluaran"
          className="tap flex items-center justify-between gap-2 rounded-2xl bg-card border border-border shadow-soft px-4 py-2.5"
        >
          <div className="flex items-center gap-2 min-w-0">
            <Wallet className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="t-caption truncate">
              Laba kotor {hide ? "•••" : formatIDR(stats.laba)} − Pengeluaran {hide ? "•••" : formatIDR(pengeluaran)}
            </span>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        </Link>
      )}

      {loading ? (
        <section className="rounded-2xl bg-card border border-border shadow-soft p-3 space-y-2">
          <Skel className="h-3 w-20" />
          <Skel className="h-32 w-full" />
        </section>
      ) : notes.length > 0 && (
        <section className="rounded-2xl bg-card border border-border shadow-soft p-3">
          <div className="flex items-center justify-between px-1 pb-2">
            <h2 className="t-eyebrow">Omset 7 hari</h2>
          </div>
          <div className="h-32">
            <Suspense fallback={<div className="h-full w-full rounded-xl bg-muted/40 animate-pulse" />}>
              <OmsetChart buckets={buckets} />
            </Suspense>
          </div>
        </section>
      )}


      <section className="space-y-2">
        <h2 className="t-eyebrow px-1">Transaksi terbaru</h2>
        {loading ? (
          <ul className="rounded-2xl bg-card border border-border shadow-soft overflow-hidden divide-y divide-border">
            {[0,1,2].map((i) => <li key={i}><SkelListItem /></li>)}
          </ul>
        ) : recent.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center">
            <p className="font-medium">Belum ada transaksi</p>
            <p className="t-caption mt-1">Yuk buat nota pertama!</p>
            <Link
              to="/buat"
              className="tap inline-flex items-center gap-1.5 mt-4 rounded-full bg-primary text-primary-foreground px-4 py-2 text-sm font-medium shadow-pop"
            >
              <FilePlus2 className="h-4 w-4" /> Buat nota
            </Link>
          </div>
        ) : (
          <ul className="rounded-2xl bg-card border border-border shadow-soft overflow-hidden divide-y divide-border">
            {recent.map((n) => {
              const t = calcNoteTotals(n);
              return (
                <li key={n.id}>
                  <Link
                    to="/riwayat/$noteId"
                    params={{ noteId: n.id }}
                    className="tap flex items-center justify-between px-4 py-3 hover:bg-accent/60"
                  >
                    <div className="min-w-0">
                      <div className="font-medium truncate text-[15px]">{n.customerName || "Tanpa nama"}</div>
                      <div className="t-caption mt-0.5">{formatDateID(n.date)}</div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="font-display font-semibold tracking-tight tabular-nums">
                        {hide ? "•••" : formatIDR(t.total)}
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function HeroCard({ label, amount, sub, hide, tone }: { label: string; amount: number; sub: string; hide: boolean; tone?: "accent" }) {
  return (
    <div className={"rounded-2xl border border-border shadow-soft p-4 " + (tone === "accent" ? "bg-accent/40" : "bg-card")}>
      <div className="t-eyebrow">{label}</div>
      <div className="t-display mt-1.5 tabular-nums">{hide ? "•••••" : formatIDR(amount)}</div>
      <div className="t-caption mt-0.5">{sub}</div>
    </div>
  );
}
