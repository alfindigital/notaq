import { createFileRoute, Link, Outlet, useMatchRoute } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, FileText, ChevronRight, Plus, Tag, Calendar, X, ArrowUpDown, Trash2, Check } from "lucide-react";
import { toast } from "sonner";

import { db, calcNoteTotals, deriveTags, STATUS_LABELS, statusTone, type Note, type NoteStatus } from "@/lib/storage";
import { formatIDR, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SkelListItem } from "@/components/Skeleton";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { PullToRefreshIndicator } from "@/components/PullToRefreshIndicator";
import { SITE_URL } from "@/lib/site";

const CalendarPicker = lazy(() => import("@/components/ui/calendar").then((m) => ({ default: m.Calendar })));

type Period = "all" | "day" | "month" | "custom";
type SortKey = "newest" | "oldest" | "amount";
type StatusFilter = NoteStatus | "all";
const PERIODS: { id: Exclude<Period, "custom">; label: string }[] = [
  { id: "all", label: "Semua" }, { id: "day", label: "Hari ini" }, { id: "month", label: "Bulan" },
];
const SORTS: { id: SortKey; label: string }[] = [
  { id: "newest", label: "Terbaru" }, { id: "oldest", label: "Terlama" }, { id: "amount", label: "Nominal" },
];

export const Route = createFileRoute("/riwayat")({
  // Mendukung deep-link dari dashboard, mis. /riwayat?status=belum
  validateSearch: (search: Record<string, unknown>): { status?: StatusFilter } => {
    const s = search.status;
    return s === "belum" || s === "lunas" || s === "batal" ? { status: s } : {};
  },
  head: () => ({
    meta: [
      { title: "Riwayat Nota & Rekap Omset Harian UMKM · Notaku" },
      { name: "description", content: "Lihat semua nota tersimpan, rekap omset harian dan bulanan, plus laba kotor usaha kamu. Filter cepat per tanggal dan tag — semua di HP." },
      { property: "og:title", content: "Riwayat Nota & Rekap Omset Harian UMKM · Notaku" },
      { property: "og:description", content: "Lihat semua nota tersimpan, rekap omset harian dan bulanan, plus laba kotor usaha kamu. Filter cepat per tanggal dan tag." },
      { property: "og:url", content: `${SITE_URL}/riwayat` },
      { property: "og:image", content: `${SITE_URL}/og-image.jpg` },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { name: "twitter:image", content: `${SITE_URL}/og-image.jpg` },
    ],
    links: [{ rel: "canonical", href: `${SITE_URL}/riwayat` }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Beranda", item: `${SITE_URL}/` },
            { "@type": "ListItem", position: 2, name: "Riwayat", item: `${SITE_URL}/riwayat` },
          ],
        }),
      },
    ],
  }),

  component: RiwayatPage,
});

function RiwayatPage() {
  const matchRoute = useMatchRoute();
  if (matchRoute({ to: "/riwayat/$noteId" })) return <Outlet />;
  return <RiwayatList />;
}

function fmtYMD(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Parse "> 50k", "< 100rb", ">=200000" → returns {op, value, rest}
function parseAmountQuery(q: string): { op: ">" | "<" | ">=" | "<="; value: number; rest: string } | null {
  const m = q.match(/(>=|<=|>|<)\s*(?:rp\s*)?([\d.,]+)\s*(k|rb|ribu|jt|juta|m|mio)?/i);
  if (!m) return null;
  const op = m[1] as ">" | "<" | ">=" | "<=";
  const numRaw = m[2].replace(/[.,]/g, "");
  let value = parseInt(numRaw, 10);
  if (!Number.isFinite(value)) return null;
  const suf = (m[3] || "").toLowerCase();
  if (suf === "k" || suf === "rb" || suf === "ribu") value *= 1000;
  else if (suf === "jt" || suf === "juta" || suf === "m" || suf === "mio") value *= 1_000_000;
  const rest = (q.slice(0, m.index) + q.slice((m.index || 0) + m[0].length)).trim();
  return { op, value, rest };
}

function highlight(text: string, q: string): React.ReactNode {
  if (!q) return text;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return text;
  return (
    <>
      {text.slice(0, i)}
      <mark className="bg-primary/20 text-foreground rounded px-0.5">{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}

function RiwayatList() {
  const qc = useQueryClient();
  const notesQ = useQuery({ queryKey: ["notes"], queryFn: () => db.getNotes() });
  const notes = notesQ.data ?? [];
  const loading = notesQ.isPending;

  const initialStatus = Route.useSearch({ select: (s) => s.status });
  const [q, setQ] = useState("");
  const [period, setPeriod] = useState<Period>("all");
  const [status, setStatus] = useState<StatusFilter>(initialStatus ?? "all");
  const [range, setRange] = useState<{ from?: Date; to?: Date } | undefined>();
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [tag, setTag] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>("newest");
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [tagSheetOpen, setTagSheetOpen] = useState(false);
  const [newTagText, setNewTagText] = useState("");

  const allTags = useMemo(() => deriveTags(notes), [notes]);

  const ptr = usePullToRefresh(async () => {
    await qc.invalidateQueries();
    toast.success("Diperbarui", { duration: 1500 });
  });

  // Parse smart query (amount op)
  const parsedAmount = useMemo(() => parseAmountQuery(q), [q]);
  const textQ = (parsedAmount ? parsedAmount.rest : q).trim();

  const filtered = useMemo(() => {
    const ql = textQ.toLowerCase();
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const fromYMD = range?.from ? fmtYMD(range.from) : null;
    const toYMD = range?.to ? fmtYMD(range.to) : fromYMD;
    return notes.filter((n) => {
      if (ql) {
        const inItems = n.items.some((it) => it.name.toLowerCase().includes(ql));
        const hit = n.number.toLowerCase().includes(ql)
          || n.customerName.toLowerCase().includes(ql)
          || n.customerPhone.includes(ql)
          || inItems;
        if (!hit) return false;
      }
      if (parsedAmount) {
        const t = calcNoteTotals(n).total;
        const { op, value } = parsedAmount;
        if (op === ">" && !(t > value)) return false;
        if (op === "<" && !(t < value)) return false;
        if (op === ">=" && !(t >= value)) return false;
        if (op === "<=" && !(t <= value)) return false;
      }
      if (tag && !n.tags.includes(tag)) return false;
      if (status !== "all" && n.status !== status) return false;
      if (period === "custom" && fromYMD && toYMD) {
        const ymd = n.date.slice(0, 10);
        if (ymd < fromYMD || ymd > toYMD) return false;
      } else if (period !== "all") {
        const t = new Date(n.date).getTime();
        if (period === "day" && t < startOfDay) return false;
        if (period === "month" && t < startOfMonth) return false;
      }
      return true;
    });
  }, [notes, textQ, parsedAmount, period, range, tag, status]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    if (sort === "newest") arr.sort((a, b) => (a.date < b.date ? 1 : -1));
    else if (sort === "oldest") arr.sort((a, b) => (a.date < b.date ? -1 : 1));
    else arr.sort((a, b) => calcNoteTotals(b).total - calcNoteTotals(a).total);
    return arr;
  }, [filtered, sort]);

  const summary = useMemo(() => {
    let om = 0, lb = 0;
    for (const n of filtered) { const t = calcNoteTotals(n); om += t.total; lb += t.laba; }
    return { omset: om, laba: lb, count: filtered.length };
  }, [filtered]);

  const groups = useMemo(() => {
    if (sort === "amount") return [["__amount__", sorted] as [string, Note[]]];
    const map = new Map<string, Note[]>();
    for (const n of sorted) {
      const key = n.date.slice(0, 10);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(n);
    }
    return [...map.entries()];
  }, [sorted, sort]);

  const rangeLabel = (() => {
    if (period !== "custom" || !range?.from) return "Tanggal";
    const f = range.from.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
    if (!range.to || fmtYMD(range.to) === fmtYMD(range.from)) return f;
    const t = range.to.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
    return `${f} – ${t}`;
  })();

  const hasActiveFilter = !!q || period !== "all" || !!tag || status !== "all";
  const showStatusFilter = status !== "all" || notes.some((n) => n.status !== "lunas");

  function resetFilters() {
    setQ(""); setPeriod("all"); setRange(undefined); setTag(null); setStatus("all");
  }

  function toggleSel(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function exitSelect() { setSelectMode(false); setSelected(new Set()); }
  function selectAllVisible() { setSelected(new Set(sorted.map((n) => n.id))); }

  async function bulkDelete() {
    const ids = selected;
    const next = notes.filter((n) => !ids.has(n.id));
    await db.setNotes(next);
    qc.invalidateQueries({ queryKey: ["notes"] });
    toast.success(`${ids.size} nota dihapus`);
    exitSelect();
    setConfirmDeleteOpen(false);
  }
  async function bulkAddTag(t: string) {
    const tagN = t.trim().slice(0, 20);
    if (!tagN) return;
    const next = notes.map((n) => selected.has(n.id) && !n.tags.includes(tagN) ? { ...n, tags: [...n.tags, tagN], updatedAt: new Date().toISOString() } : n);
    await db.setNotes(next);
    qc.invalidateQueries({ queryKey: ["notes"] });
    toast.success(`Tag "${tagN}" ditambahkan ke ${selected.size} nota`);
    setNewTagText("");
    setTagSheetOpen(false);
    exitSelect();
  }

  const periodLabel = period === "all" ? "Semua" : period === "day" ? "Hari ini" : period === "month" ? "Bulan ini" : rangeLabel;

  return (
    <div className="space-y-4">
      <PullToRefreshIndicator {...ptr} />
      <h1 className="sr-only">Riwayat Nota & Rekap Omset Harian</h1>

      <div className="rounded-2xl bg-card border border-border shadow-soft p-4 space-y-2">
        <div className="text-[11px] text-muted-foreground uppercase tracking-wider">{periodLabel}{status !== "all" ? ` · ${STATUS_LABELS[status]}` : ""}{tag ? ` · #${tag}` : ""}</div>
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Nota" value={String(summary.count)} />
          <Stat label="Omset" value={formatIDR(summary.omset)} />
          <Stat label="Laba" value={formatIDR(summary.laba)} />
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          aria-label="Cari nota"
          placeholder="Cari nama, item, atau >50k…" value={q} onChange={(e) => setQ(e.target.value)}
          className="w-full h-11 pl-11 pr-10 rounded-full bg-card border border-border shadow-soft text-[15px] placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-ring/20"
        />
        {q && (
          <button onClick={() => setQ("")} aria-label="Hapus pencarian" className="tap absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1">
        {PERIODS.map((p) => (
          <button key={p.id} type="button" onClick={() => { setPeriod(p.id); setRange(undefined); }}
            className={"tap shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium border " + (period === p.id ? "bg-primary text-primary-foreground border-primary shadow-soft" : "bg-card text-muted-foreground border-border")}>
            {p.label}
          </button>
        ))}
        <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
          <PopoverTrigger asChild>
            <button type="button"
              className={"tap shrink-0 inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium border " + (period === "custom" ? "bg-primary text-primary-foreground border-primary shadow-soft" : "bg-card text-muted-foreground border-border")}>
              <Calendar className="h-3.5 w-3.5" />
              <span>{rangeLabel}</span>
              {period === "custom" && (
                <X className="h-3 w-3" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setPeriod("all"); setRange(undefined); }} />
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0 pointer-events-auto z-50" align="start">
            <Suspense fallback={<div className="p-6 text-xs text-muted-foreground">Memuat…</div>}>
              <CalendarPicker
                mode="range"
                selected={range as any}
                defaultMonth={range?.from ?? new Date()}
                onSelect={(picked: any) => {
                  setRange(picked);
                  setPeriod("custom");
                  if (picked?.from && picked?.to) setDatePickerOpen(false);
                }}
                numberOfMonths={1}
                className="p-3 pointer-events-auto"
              />
            </Suspense>
          </PopoverContent>
        </Popover>

        <Popover>
          <PopoverTrigger asChild>
            <button type="button" className="tap shrink-0 ml-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium border bg-card text-muted-foreground border-border">
              <ArrowUpDown className="h-3.5 w-3.5" />
              <span>{SORTS.find((s) => s.id === sort)?.label}</span>
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-40 p-1" align="end">
            {SORTS.map((s) => (
              <button key={s.id} onClick={() => setSort(s.id)} className={"tap w-full text-left px-2.5 py-2 text-sm rounded-md hover:bg-accent flex items-center justify-between " + (sort === s.id ? "text-foreground font-medium" : "text-muted-foreground")}>
                {s.label}
                {sort === s.id && <Check className="h-3.5 w-3.5" />}
              </button>
            ))}
          </PopoverContent>
        </Popover>
      </div>


      {showStatusFilter && (
        <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1">
          {(["all", "belum", "lunas", "batal"] as StatusFilter[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className={"tap shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium border " + (status === s ? "bg-primary text-primary-foreground border-primary shadow-soft" : "bg-card text-muted-foreground border-border")}
            >
              {s === "all" ? "Semua status" : STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      )}

      {allTags.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1">
          {tag && (
            <button onClick={() => setTag(null)} className="tap shrink-0 rounded-full bg-card border border-border px-2.5 py-1 text-[11px]">× Hapus tag</button>
          )}
          {allTags.map((t) => (
            <button key={t.tag} onClick={() => setTag(tag === t.tag ? null : t.tag)}
              className={"tap shrink-0 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] border " + (tag === t.tag ? "bg-primary text-primary-foreground border-primary" : "bg-card text-muted-foreground border-border")}>
              <Tag className="h-3 w-3" /> {t.tag}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <ul className="rounded-2xl bg-card border border-border shadow-soft overflow-hidden divide-y divide-border">
          {[0,1,2,3].map((i) => <li key={i}><SkelListItem /></li>)}
        </ul>
      ) : sorted.length === 0 ? (
        notes.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-10 text-center">
            <FileText className="h-7 w-7 mx-auto mb-3 text-muted-foreground/60" />
            <p className="font-medium">Belum ada nota</p>
            <p className="t-caption mt-1">Mulai dari nota pertama kamu.</p>
            <Link to="/buat" className="tap inline-flex items-center gap-1.5 mt-4 rounded-full bg-primary text-primary-foreground px-4 py-2 text-sm font-medium shadow-soft">
              <Plus className="h-4 w-4" /> Buat nota
            </Link>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-border p-10 text-center">
            <Search className="h-7 w-7 mx-auto mb-3 text-muted-foreground/60" />
            <p className="font-medium">Tidak ada hasil</p>
            <p className="t-caption mt-1">Coba ubah atau hapus filter.</p>
            {hasActiveFilter && (
              <button onClick={resetFilters} className="tap inline-flex items-center gap-1.5 mt-4 rounded-full bg-card border border-border px-4 py-2 text-sm font-medium shadow-soft hover:bg-accent">
                <X className="h-4 w-4" /> Reset filter
              </button>
            )}
          </div>
        )
      ) : (
        <div className="space-y-4 pb-24">
          {groups.map(([dateKey, items]) => (
            <div key={dateKey} className="space-y-2">
              {sort !== "amount" && (
                <h2 className="t-eyebrow px-1">{formatDate(dateKey + "T00:00:00")}</h2>
              )}
              <ul className="rounded-2xl bg-card border border-border shadow-soft overflow-hidden divide-y divide-border">
                {items.map((n) => (
                  <NoteRow
                    key={n.id}
                    note={n}
                    q={textQ}
                    selectMode={selectMode}
                    checked={selected.has(n.id)}
                    onLongPress={() => { if (!selectMode) { setSelectMode(true); setSelected(new Set([n.id])); } }}
                    onToggle={() => toggleSel(n.id)}
                  />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {/* Multi-select bottom bar */}
      {selectMode && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 backdrop-blur p-3 shadow-pop">
          <div className="mx-auto max-w-[520px] flex items-center gap-2">
            <button onClick={exitSelect} aria-label="Tutup pilih" className="tap p-2 rounded-full hover:bg-accent">
              <X className="h-4 w-4" />
            </button>
            <div className="text-sm font-medium flex-1">{selected.size} dipilih</div>
            <button onClick={selectAllVisible} className="tap text-xs text-muted-foreground hover:text-foreground px-2">Pilih semua</button>
            <Button size="sm" variant="outline" disabled={selected.size === 0} onClick={() => setTagSheetOpen(true)} className="rounded-full">
              <Tag className="h-3.5 w-3.5" /> Tag
            </Button>
            <Button size="sm" variant="destructive" disabled={selected.size === 0} onClick={() => setConfirmDeleteOpen(true)} className="rounded-full">
              <Trash2 className="h-3.5 w-3.5" /> Hapus
            </Button>
          </div>
        </div>
      )}

      {confirmDeleteOpen && (
        <Modal onClose={() => setConfirmDeleteOpen(false)} title={`Hapus ${selected.size} nota?`}>
          <p className="text-sm text-muted-foreground">Aksi ini tidak bisa dibatalkan.</p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setConfirmDeleteOpen(false)} className="rounded-full">Batal</Button>
            <Button variant="destructive" onClick={bulkDelete} className="rounded-full">Hapus</Button>
          </div>
        </Modal>
      )}

      {tagSheetOpen && (
        <Modal onClose={() => setTagSheetOpen(false)} title={`Tambah tag ke ${selected.size} nota`}>
          <Input
            value={newTagText}
            onChange={(e) => setNewTagText(e.target.value.slice(0, 20))}
            onKeyDown={(e) => { if (e.key === "Enter") bulkAddTag(newTagText); }}
            placeholder="Nama tag…"
            autoFocus
          />
          {allTags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-2">
              {allTags.map((t) => (
                <button key={t.tag} onClick={() => bulkAddTag(t.tag)} className="tap rounded-full bg-surface px-2.5 py-1 text-[11px] text-muted-foreground hover:text-foreground border border-border">
                  + {t.tag}
                </button>
              ))}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-3">
            <Button variant="outline" onClick={() => setTagSheetOpen(false)} className="rounded-full">Batal</Button>
            <Button onClick={() => bulkAddTag(newTagText)} disabled={!newTagText.trim()} className="rounded-full">Tambah</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function NoteRow({ note: n, q, selectMode, checked, onLongPress, onToggle }: {
  note: Note; q: string; selectMode: boolean; checked: boolean;
  onLongPress: () => void; onToggle: () => void;
}) {
  const t = calcNoteTotals(n);
  const timer = useRef<number | null>(null);
  const fired = useRef(false);

  function start() {
    fired.current = false;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { fired.current = true; onLongPress(); }, 550);
  }
  function cancel() {
    if (timer.current) { window.clearTimeout(timer.current); timer.current = null; }
  }

  useEffect(() => () => cancel(), []);

  if (selectMode) {
    return (
      <li>
        <button
          type="button"
          onClick={onToggle}
          className={"tap w-full flex items-center justify-between px-4 py-3 hover:bg-accent/60 text-left " + (checked ? "bg-primary/10" : "")}
        >
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <span className={"h-5 w-5 shrink-0 rounded-md border grid place-items-center " + (checked ? "bg-primary border-primary text-primary-foreground" : "border-border bg-card")}>
              {checked && <Check className="h-3.5 w-3.5" />}
            </span>
            <div className="min-w-0">
              <div className="font-medium truncate text-[15px]">{n.customerName || "Tanpa nama"}</div>
              <div className="text-xs text-muted-foreground mt-0.5 truncate">{n.number} · {n.items.length} item</div>
            </div>
          </div>
          <div className="font-display font-semibold tracking-tight tabular-nums">{formatIDR(t.total)}</div>
        </button>
      </li>
    );
  }

  return (
    <li>
      <Link
        to="/riwayat/$noteId" params={{ noteId: n.id }}
        onTouchStart={start} onTouchEnd={cancel} onTouchMove={cancel} onTouchCancel={cancel}
        onMouseDown={start} onMouseUp={cancel} onMouseLeave={cancel}
        onClick={(e) => { if (fired.current) { e.preventDefault(); fired.current = false; } }}
        onContextMenu={(e) => { e.preventDefault(); onLongPress(); }}
        className="tap flex items-center justify-between px-4 py-3 hover:bg-accent/60 select-none"
      >
        <div className="min-w-0">
          <div className="font-medium truncate text-[15px]">{highlight(n.customerName || "Tanpa nama", q)}</div>
          <div className="text-xs text-muted-foreground mt-0.5 truncate flex items-center gap-1 flex-wrap">
            <span>{highlight(n.number, q)} · {n.items.length} item</span>
            {n.status !== "lunas" && (
              <span className={cn("inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium", statusTone(n))}>
                {STATUS_LABELS[n.status]}
              </span>
            )}
            {n.tags.map((tg) => (
              <span key={tg} className="inline-flex items-center gap-0.5 rounded-full bg-accent text-foreground/70 px-1.5 py-0.5 text-[10px]">
                <Tag className="h-2.5 w-2.5" />{tg}
              </span>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="font-display font-semibold tracking-tight tabular-nums">{formatIDR(t.total)}</div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </div>
      </Link>
    </li>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="t-eyebrow">{label}</div>
      <div className="font-display font-semibold text-base tracking-tight mt-1 tabular-nums">{value}</div>
    </div>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-card border border-border shadow-pop p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-base">{title}</h3>
          <button onClick={onClose} aria-label="Tutup" className="tap p-1 rounded-full hover:bg-accent"><X className="h-4 w-4" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
