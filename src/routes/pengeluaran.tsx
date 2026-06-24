import { createFileRoute, Link } from "@tanstack/react-router";
import { lazy, Suspense, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Calendar, Check, Trash2, Wallet } from "lucide-react";
import { toast } from "sonner";

import {
  db, sumExpenses, periodStart, uid, EXPENSE_CATEGORIES,
  type Expense, type PeriodRange,
} from "@/lib/storage";
import { formatIDR, formatIDRInput, parseIDRInput, toDateInput, formatDate } from "@/lib/format";
import { tapHaptic } from "@/lib/haptic";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { SITE_URL } from "@/lib/site";

const CalendarPicker = lazy(() => import("@/components/ui/calendar").then((m) => ({ default: m.Calendar })));

export const Route = createFileRoute("/pengeluaran")({
  head: () => ({
    meta: [
      { title: "Catat Pengeluaran & Laba Bersih UMKM · Notaku" },
      { name: "description", content: "Catat pengeluaran usaha — sewa, listrik, gaji, belanja stok — dan lihat laba bersih otomatis. Gratis, tanpa login, data aman di HP." },
      { property: "og:title", content: "Catat Pengeluaran & Laba Bersih UMKM · Notaku" },
      { property: "og:description", content: "Catat pengeluaran usaha dan hitung laba bersih otomatis. Gratis, tanpa login." },
      { property: "og:url", content: `${SITE_URL}/pengeluaran` },
      { property: "og:image", content: `${SITE_URL}/og-image.jpg` },
    ],
    links: [{ rel: "canonical", href: `${SITE_URL}/pengeluaran` }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Beranda", item: `${SITE_URL}/` },
            { "@type": "ListItem", position: 2, name: "Pengeluaran", item: `${SITE_URL}/pengeluaran` },
          ],
        }),
      },
    ],
  }),
  component: PengeluaranPage,
});

const PERIODS: { id: PeriodRange; label: string }[] = [
  { id: "today", label: "Hari ini" },
  { id: "month", label: "Bulan ini" },
  { id: "all", label: "Semua" },
];

// Combine a YYYY-MM-DD date with a time-of-day (keep original time on edit).
function dateToISO(ymd: string, keepTimeFrom?: string): string {
  const time = new Date(keepTimeFrom ?? new Date().toISOString()).toISOString().slice(11, 19);
  return new Date(`${ymd}T${time}`).toISOString();
}

function DateChip({ date, onChange }: { date: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const d = new Date(date + "T00:00:00");
  const text = d.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="tap inline-flex items-center gap-1.5 rounded-full bg-surface border border-border px-3 py-1.5 text-[12px] text-foreground hover:bg-accent">
          <Calendar className="h-3.5 w-3.5" /><span>{text}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 pointer-events-auto z-50" align="end">
        <Suspense fallback={<div className="p-6 text-xs text-muted-foreground">Memuat…</div>}>
          <CalendarPicker
            mode="single"
            selected={d}
            defaultMonth={d}
            onSelect={(picked) => {
              if (!picked) return;
              const y = picked.getFullYear();
              const m = String(picked.getMonth() + 1).padStart(2, "0");
              const day = String(picked.getDate()).padStart(2, "0");
              onChange(`${y}-${m}-${day}`);
              setOpen(false);
            }}
            className="p-3 pointer-events-auto"
          />
        </Suspense>
      </PopoverContent>
    </Popover>
  );
}

function PengeluaranPage() {
  const qc = useQueryClient();
  const { data: expenses = [] } = useQuery({ queryKey: ["expenses"], queryFn: () => db.getExpenses() });

  const [period, setPeriod] = useState<PeriodRange>("month");

  // Form state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [date, setDate] = useState<string>(() => toDateInput(new Date().toISOString()));
  const [category, setCategory] = useState<string>("");
  const [amount, setAmount] = useState<number>(0);
  const [note, setNote] = useState<string>("");

  function resetForm() {
    setEditingId(null);
    setDate(toDateInput(new Date().toISOString()));
    setCategory("");
    setAmount(0);
    setNote("");
  }

  function loadForEdit(e: Expense) {
    setEditingId(e.id);
    setDate(toDateInput(e.date));
    setCategory(e.category);
    setAmount(e.amount);
    setNote(e.note);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const filtered = useMemo(() => {
    const start = periodStart(period);
    return expenses.filter((e) => new Date(e.date).getTime() >= start);
  }, [expenses, period]);

  const total = useMemo(() => sumExpenses(expenses, period), [expenses, period]);

  const groups = useMemo(() => {
    const sorted = [...filtered].sort((a, b) => (a.date < b.date ? 1 : -1));
    const map = new Map<string, Expense[]>();
    for (const e of sorted) {
      const k = e.date.slice(0, 10);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(e);
    }
    return [...map.entries()];
  }, [filtered]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (amount <= 0) throw new Error("Isi nominal pengeluaran dulu.");
      const cat = category || "Lainnya";
      const now = new Date().toISOString();
      const cur = await db.getExpenses();
      if (editingId) {
        const ex = cur.find((e) => e.id === editingId);
        if (!ex) throw new Error("Pengeluaran tidak ditemukan.");
        const updated: Expense = { ...ex, date: dateToISO(date, ex.date), category: cat, amount, note: note.trim(), updatedAt: now };
        await db.setExpenses(cur.map((e) => (e.id === editingId ? updated : e)));
      } else {
        const expense: Expense = { id: uid(), date: dateToISO(date), category: cat, amount, note: note.trim(), createdAt: now, updatedAt: now };
        await db.setExpenses([expense, ...cur]);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expenses"] });
      tapHaptic(20);
      toast.success(editingId ? "Perubahan disimpan" : "Pengeluaran tersimpan");
      resetForm();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function doRemove(id: string) {
    try {
      const cur = await db.getExpenses();
      await db.setExpenses(cur.filter((e) => e.id !== id));
      qc.invalidateQueries({ queryKey: ["expenses"] });
      toast.success("Pengeluaran dihapus");
      if (editingId === id) resetForm();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal menghapus.");
    }
  }

  function confirmRemove(id: string) {
    toast("Hapus pengeluaran ini?", {
      action: { label: "Hapus", onClick: () => doRemove(id) },
      cancel: { label: "Batal", onClick: () => undefined },
      duration: 6000,
    });
  }

  const periodLabel = period === "today" ? "Hari ini" : period === "month" ? "Bulan ini" : "Semua";

  return (
    <div className="space-y-4">
      <h1 className="sr-only">Catat Pengeluaran Usaha & Laba Bersih</h1>

      {/* Top bar */}
      <div className="flex items-center justify-between">
        <Link to="/" className="tap inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground rounded-full px-1 py-1">
          <ArrowLeft className="h-4 w-4" /> Beranda
        </Link>
      </div>

      {/* Summary */}
      <div className="rounded-2xl bg-card border border-border shadow-soft p-4">
        <div className="t-eyebrow inline-flex items-center gap-1.5"><Wallet className="h-3.5 w-3.5" /> Pengeluaran · {periodLabel}</div>
        <div className="t-display mt-1.5 tabular-nums">{formatIDR(total)}</div>
        <div className="t-caption mt-0.5">{filtered.length} transaksi</div>
      </div>

      {/* Period filter */}
      <div className="flex gap-2">
        {PERIODS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setPeriod(p.id)}
            className={cn(
              "tap rounded-full px-3.5 py-1.5 text-xs font-medium border",
              period === p.id ? "bg-primary text-primary-foreground border-primary shadow-soft" : "bg-card text-muted-foreground border-border",
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Add / edit form */}
      <div className="rounded-2xl bg-card border border-border shadow-soft p-3 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="t-eyebrow">{editingId ? "Edit pengeluaran" : "Tambah pengeluaran"}</h2>
          <DateChip date={date} onChange={setDate} />
        </div>

        <div className="flex flex-wrap gap-1.5">
          {EXPENSE_CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => { tapHaptic(); setCategory(c); }}
              className={cn(
                "tap rounded-full px-3 py-1.5 text-xs border",
                category === c ? "bg-primary text-primary-foreground border-primary shadow-soft" : "bg-surface text-muted-foreground border-border hover:text-foreground",
              )}
            >
              {c}
            </button>
          ))}
        </div>

        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">Rp</span>
          <Input
            aria-label="Nominal pengeluaran"
            inputMode="decimal"
            enterKeyHint="done"
            placeholder="0"
            value={formatIDRInput(amount)}
            onChange={(e) => setAmount(parseIDRInput(e.target.value))}
            onFocus={(e) => e.target.select()}
            className="h-11 rounded-xl pl-8 text-right"
          />
        </div>

        <Input
          aria-label="Catatan pengeluaran"
          value={note}
          onChange={(e) => setNote(e.target.value.slice(0, 200))}
          maxLength={200}
          placeholder="Catatan (opsional)"
          className="h-10 rounded-xl"
        />

        <div className="flex gap-2">
          {editingId && (
            <Button variant="outline" onClick={resetForm} className="tap rounded-full">Batal</Button>
          )}
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || amount <= 0}
            className="tap flex-1 rounded-full"
          >
            <Check className="h-4 w-4" /> {editingId ? "Simpan perubahan" : "Simpan"}
          </Button>
        </div>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center">
          <Wallet className="h-7 w-7 mx-auto mb-3 text-muted-foreground/60" />
          <p className="font-medium">Belum ada pengeluaran</p>
          <p className="t-caption mt-1">Catat pengeluaran pertama di form atas.</p>
        </div>
      ) : (
        <div className="space-y-4 pb-4">
          {groups.map(([dateKey, items]) => (
            <div key={dateKey} className="space-y-2">
              <h2 className="t-eyebrow px-1">{formatDate(dateKey + "T00:00:00")}</h2>
              <ul className="rounded-2xl bg-card border border-border shadow-soft overflow-hidden divide-y divide-border">
                {items.map((e) => (
                  <li key={e.id} className="flex items-center justify-between px-4 py-3 gap-2">
                    <button onClick={() => loadForEdit(e)} className="tap min-w-0 flex-1 text-left">
                      <div className="font-medium truncate text-[15px]">{e.category}</div>
                      {e.note && <div className="t-caption mt-0.5 truncate">{e.note}</div>}
                    </button>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <div className="font-display font-semibold tracking-tight tabular-nums">{formatIDR(e.amount)}</div>
                      <button onClick={() => confirmRemove(e.id)} aria-label={`Hapus pengeluaran ${e.category}`} className="tap p-1 rounded-full text-muted-foreground hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
