import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, useCallback, memo, lazy, Suspense } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus, Trash2, X, Check, ArrowLeft,
  ChevronDown, Calendar, BookmarkPlus, Tag, StickyNote,
} from "lucide-react";
import { toast } from "sonner";

import {
  db, calcNoteTotals, deriveCustomers, deriveTags,
  generateNoteNumber, uid,
  PAYMENT_METHODS, PAYMENT_LABELS,
  type Note, type NoteItem, type Preset, type PaymentMethod,
} from "@/lib/storage";
import { formatIDR, formatIDRInput, parseIDRInput, toDateInput } from "@/lib/format";
import { tapHaptic } from "@/lib/haptic";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
const CalendarPicker = lazy(() => import("@/components/ui/calendar").then((m) => ({ default: m.Calendar })));
import { cn } from "@/lib/utils";
import { SITE_URL } from "@/lib/site";

type SearchParams = { edit?: string; from?: string };

export const Route = createFileRoute("/buat")({
  validateSearch: (s: Record<string, unknown>): SearchParams => ({
    edit: typeof s.edit === "string" ? s.edit : undefined,
    from: typeof s.from === "string" ? s.from : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Bikin Nota Online Gratis — Cetak & Kirim WA · Notaku" },
      { name: "description", content: "Buat nota & invoice online dalam hitungan detik. Tambah item, diskon, lalu kirim struk langsung ke pelanggan via WhatsApp. Gratis, tanpa registrasi." },
      { property: "og:title", content: "Bikin Nota Online Gratis — Cetak & Kirim WA · Notaku" },
      { property: "og:description", content: "Buat nota & invoice online dalam hitungan detik. Tambah item, diskon, kirim struk langsung ke pelanggan via WhatsApp. Gratis, tanpa registrasi." },
      { property: "og:url", content: `${SITE_URL}/buat` },
      { property: "og:image", content: `${SITE_URL}/og-image.jpg` },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { name: "twitter:image", content: `${SITE_URL}/og-image.jpg` },
    ],
    links: [{ rel: "canonical", href: `${SITE_URL}/buat` }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Beranda", item: `${SITE_URL}/` },
            { "@type": "ListItem", position: 2, name: "Buat Nota", item: `${SITE_URL}/buat` },
          ],
        }),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "HowTo",
          name: "Cara bikin nota online dan kirim ke WhatsApp",
          inLanguage: "id-ID",
          step: [
            { "@type": "HowToStep", position: 1, name: "Isi nama & kontak pelanggan", text: "Masukkan nama dan nomor HP pelanggan (opsional)." },
            { "@type": "HowToStep", position: 2, name: "Tambah item belanja", text: "Tambah item beserta jumlah dan harga. Bisa dari preset agar lebih cepat." },
            { "@type": "HowToStep", position: 3, name: "Set diskon & catatan", text: "Beri diskon jika perlu, lalu tulis catatan tambahan." },
            { "@type": "HowToStep", position: 4, name: "Cetak atau kirim via WhatsApp", text: "Simpan nota lalu bagikan ke pelanggan via WhatsApp sebagai teks atau gambar." },
          ],
        }),
      },
    ],
  }),
  component: BuatPage,
});


const DRAFT_KEY = "notaku:buat-draft:v2";

type Draft = {
  date: string;
  customerName: string;
  customerPhone: string;
  items: NoteItem[];
  discount: number;
  paymentMethod: PaymentMethod;
  cashReceived: number;
  tags: string[];
  noteText: string;
  updatedAt: number;
};

function emptyItem(): NoteItem { return { name: "", qty: 1, price: 0, cost: 0 }; }

function loadDraft(): Draft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as Draft;
    if (!d || !Array.isArray(d.items)) return null;
    return d;
  } catch { return null; }
}
function isDraftEmpty(d: Pick<Draft, "customerName" | "customerPhone" | "items" | "discount" | "tags" | "noteText">) {
  const hasItem = d.items.some((it) => it.name.trim() || it.price > 0);
  return !d.customerName.trim() && !d.customerPhone.trim() && !d.noteText.trim() && !hasItem && d.discount === 0 && d.tags.length === 0;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <h2 className="t-eyebrow px-1">{children}</h2>;
}

function DateChip({ date, onChange }: { date: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const d = new Date(date + "T00:00:00");
  const text = d.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="tap inline-flex items-center gap-1.5 rounded-full bg-card border border-border px-3 py-1.5 text-[12px] text-foreground shadow-soft hover:bg-accent">
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

function BuatPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const editingId = search.edit;
  const fromId = search.from;
  const { data: business } = useQuery({ queryKey: ["business"], queryFn: () => db.getBusiness() });
  const { data: presets = [] } = useQuery({ queryKey: ["presets"], queryFn: () => db.getPresets() });
  const { data: notes = [] } = useQuery({ queryKey: ["notes"], queryFn: () => db.getNotes() });

  const initial = typeof window !== "undefined" && !editingId && !fromId ? loadDraft() : null;
  const [date, setDate] = useState<string>(() => initial?.date ?? toDateInput(new Date().toISOString()));
  const [customerName, setCustomerName] = useState(initial?.customerName ?? "");
  const [customerPhone, setCustomerPhone] = useState(initial?.customerPhone ?? "");
  const [items, setItems] = useState<NoteItem[]>(initial?.items?.length ? initial.items : [emptyItem()]);
  const [discount, setDiscount] = useState<number>(initial?.discount ?? 0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(initial?.paymentMethod ?? "tunai");
  const [cashReceived, setCashReceived] = useState<number>(initial?.cashReceived ?? 0);
  const [tags, setTags] = useState<string[]>(initial?.tags ?? []);
  const [noteText, setNoteText] = useState(initial?.noteText ?? "");
  const hadInitialDraft = useRef(!!initial && !isDraftEmpty({ customerName: initial.customerName, customerPhone: initial.customerPhone, items: initial.items, discount: initial.discount, tags: initial.tags ?? [], noteText: initial.noteText }));
  const [editingNumber, setEditingNumber] = useState<string | null>(null);
  const loadedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const key = editingId ? `e:${editingId}` : fromId ? `f:${fromId}` : null;
    if (!key || loadedKeyRef.current === key || !notes.length) return;
    const src = notes.find((n) => n.id === (editingId || fromId));
    if (!src) return;
    loadedKeyRef.current = key;
    if (editingId) {
      setDate(toDateInput(src.date)); setEditingNumber(src.number);
    } else {
      setDate(toDateInput(new Date().toISOString())); setEditingNumber(null);
      toast.success(`Disalin dari ${src.number}`);
    }
    setCustomerName(src.customerName); setCustomerPhone(src.customerPhone);
    setItems(src.items.map((it) => ({ ...it })));
    setDiscount(src.discount);
    setPaymentMethod(src.paymentMethod);
    setCashReceived(src.cashReceived);
    setTags([...src.tags]);
    setNoteText(src.note);
  }, [editingId, fromId, notes]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (editingId || fromId) return;
    const draft = { date, customerName, customerPhone, items, discount, paymentMethod, cashReceived, tags, noteText };
    const t = setTimeout(() => {
      try {
        if (isDraftEmpty(draft)) localStorage.removeItem(DRAFT_KEY);
        else localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...draft, updatedAt: Date.now() }));
      } catch {
        // Storage penuh atau Safari private mode: lewati simpan draf diam-diam.
      }
    }, 400);
    return () => clearTimeout(t);
  }, [date, customerName, customerPhone, items, discount, paymentMethod, cashReceived, tags, noteText, editingId, fromId]);

  useEffect(() => {
    if (hadInitialDraft.current) { toast.success("Draf dipulihkan"); hadInitialDraft.current = false; }
  }, []);

  const customers = useMemo(() => deriveCustomers(notes), [notes]);
  const allTags = useMemo(() => deriveTags(notes), [notes]);

  function matchCustomer(q: string, c: { name: string; phone?: string }) {
    const s = q.trim().toLowerCase(); if (!s) return false;
    if (c.name.toLowerCase().includes(s)) return true;
    const digits = s.replace(/\D/g, "");
    if (digits && c.phone && c.phone.replace(/\D/g, "").includes(digits)) return true;
    return false;
  }
  const nameSuggestions = useMemo(() => (customerName.trim() ? customers.filter((c) => matchCustomer(customerName, c)).slice(0, 5) : []), [customers, customerName]);
  const phoneSuggestions = useMemo(() => (customerPhone.trim() ? customers.filter((c) => matchCustomer(customerPhone, c)).slice(0, 5) : []), [customers, customerPhone]);
  const recentCustomers = useMemo(() => [...customers].sort((a, b) => (a.lastDate < b.lastDate ? 1 : -1)).slice(0, 4), [customers]);

  const totals = useMemo(() => calcNoteTotals({ items, discount }), [items, discount]);

  function updateItem(i: number, patch: Partial<NoteItem>) {
    setItems((arr) => arr.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }
  function removeItem(i: number) { setItems((arr) => (arr.length === 1 ? arr : arr.filter((_, idx) => idx !== i))); }
  function addRow() { setItems((a) => [...a, emptyItem()]); }
  function addPreset(p: Preset) {
    setItems((a) => {
      const empty = a.findIndex((it) => !it.name && !it.price);
      const row: NoteItem = { name: p.name, qty: 1, price: p.price, cost: p.cost };
      if (empty >= 0) return a.map((it, i) => (i === empty ? row : it));
      return [...a, row];
    });
  }

  const savePresetMutation = useMutation({
    mutationFn: async (it: NoteItem) => {
      const cur = await db.getPresets();
      const exists = cur.some((p) => p.name.trim().toLowerCase() === it.name.trim().toLowerCase() && p.price === it.price);
      if (exists) return { skipped: true as const, name: it.name };
      await db.setPresets([...cur, { id: uid(), name: it.name.trim(), price: it.price, cost: it.cost || 0, unit: "" }]);
      return { skipped: false as const, name: it.name };
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["presets"] });
      tapHaptic(15);
      if (r.skipped) toast.info(`"${r.name}" sudah ada di preset`);
      else toast.success(`"${r.name}" disimpan ke preset`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveMutation = useMutation({
    mutationFn: async (): Promise<Note> => {
      const cleaned = items.map((it) => ({ ...it, name: it.name.trim() })).filter((it) => it.name);
      if (!cleaned.length) throw new Error("Tambahkan minimal 1 item dengan nama.");
      const now = new Date().toISOString();
      if (editingId) {
        const existing = notes.find((n) => n.id === editingId);
        if (!existing) throw new Error("Nota tidak ditemukan.");
        const updated: Note = {
          ...existing,
          customerName: customerName.trim(),
          customerPhone: customerPhone.trim(),
          items: cleaned,
          discount,
          paymentMethod,
          cashReceived: paymentMethod === "tunai" ? cashReceived : 0,
          tags,
          note: noteText.trim(),
          date: new Date(date + "T" + new Date(existing.date).toISOString().slice(11, 19)).toISOString(),
          updatedAt: now,
        };
        await db.setNotes(notes.map((n) => (n.id === editingId ? updated : n)));
        return updated;
      }
      const seq = (await db.getSeq()) + 1;
      const number = generateNoteNumber(business?.prefix || "NT", seq, new Date(date));
      const note: Note = {
        id: uid(), number,
        date: new Date(date + "T" + new Date().toISOString().slice(11, 19)).toISOString(),
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        items: cleaned, discount,
        paymentMethod,
        cashReceived: paymentMethod === "tunai" ? cashReceived : 0,
        tags, note: noteText.trim(),
        createdAt: now, updatedAt: now,
      };
      await db.setSeq(seq);
      await db.setNotes([note, ...notes]);
      if (customerPhone.trim() && business) await db.setBusiness({ ...business, lastWaNumber: customerPhone.trim() });
      return note;
    },
    onSuccess: (note) => {
      qc.invalidateQueries({ queryKey: ["notes"] });
      if (typeof window !== "undefined") { try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ } }
      tapHaptic(20);
      if (editingId) { toast.success("Perubahan disimpan"); navigate({ to: "/riwayat/$noteId", params: { noteId: note.id } }); }
      else { toast.success("Nota tersimpan"); navigate({ to: "/" }); }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <h1 className="sr-only">Bikin Nota Online & Cetak Struk Gratis</h1>
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <Link to="/" className="tap inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground rounded-full px-1 py-1">
          <ArrowLeft className="h-4 w-4" /> {editingId ? "Batal" : "Beranda"}
        </Link>
        <DateChip date={date} onChange={setDate} />
      </div>

      {editingId && editingNumber && (
        <div className="t-caption px-1">Mengedit {editingNumber}</div>
      )}

      {/* Customer */}
      <section className="space-y-1.5">
        <SectionLabel>Pelanggan</SectionLabel>
        {!editingId && recentCustomers.length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1">
            {recentCustomers.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => { setCustomerName(c.name); setCustomerPhone(c.phone); tapHaptic(); }}
                className="tap shrink-0 rounded-full bg-card border border-border px-3 py-1 text-xs shadow-soft hover:bg-accent"
              >
                {c.name}
              </button>
            ))}
          </div>
        )}
        <div className="rounded-2xl bg-card border border-border shadow-soft overflow-hidden flex divide-x divide-border">
          <div className="flex-1 min-w-0">
            <CustomerSuggestInput placeholder="Nama" value={customerName} onChange={setCustomerName} suggestions={nameSuggestions} onPick={(c) => { setCustomerName(c.name); setCustomerPhone(c.phone || ""); }} maxLength={60} />
          </div>
          <div className="w-[140px] shrink-0">
            <CustomerSuggestInput placeholder="No. WA" value={customerPhone} onChange={(v) => setCustomerPhone(v.replace(/[^\d+]/g, ""))} suggestions={phoneSuggestions} onPick={(c) => { setCustomerName(c.name); setCustomerPhone(c.phone || ""); }} maxLength={20} inputMode="tel" />
          </div>
        </div>
      </section>

      {/* Items */}
      <section className="space-y-1.5">
        <div className="flex items-center justify-between px-1">
          <SectionLabel>Item</SectionLabel>
          {(() => {
            const savable = items.filter((it) => it.name.trim() && it.price > 0 && !presets.some((p) => p.name.trim().toLowerCase() === it.name.trim().toLowerCase() && p.price === it.price));
            if (savable.length === 0) return null;
            return (
              <Popover>
                <PopoverTrigger asChild>
                  <button className="tap inline-flex items-center gap-1 rounded-full bg-card border border-border px-2.5 py-1 text-[11px] font-medium text-foreground shadow-soft hover:bg-accent">
                    <BookmarkPlus className="h-3 w-3" /> Simpan preset <ChevronDown className="h-3 w-3 text-muted-foreground" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-72 p-1.5" align="end">
                  <div className="max-h-80 overflow-auto space-y-0.5">
                    <div className="px-2 pt-1 pb-1 t-eyebrow">Simpan ke preset</div>
                    {savable.map((it, idx) => (
                      <button key={`${it.name}-${idx}`} onClick={() => savePresetMutation.mutate(it)} className="tap w-full text-left px-2 py-2 text-sm rounded-lg hover:bg-accent flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5 min-w-0">
                          <BookmarkPlus className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="truncate">{it.name}</span>
                        </span>
                        <span className="text-muted-foreground shrink-0">{formatIDR(it.price)}</span>
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            );
          })()}
        </div>

        {presets.length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1 pb-0.5">
            {presets.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => { tapHaptic(); addPreset(p); }}
                className="tap shrink-0 inline-flex items-center gap-1.5 rounded-full bg-card border border-border px-3 py-1.5 text-xs shadow-soft hover:bg-accent active:scale-95"
              >
                <Plus className="h-3 w-3 text-muted-foreground" />
                <span className="font-medium truncate max-w-[120px]">{p.name}</span>
                <span className="text-muted-foreground tabular-nums">{formatIDR(p.price)}</span>
              </button>
            ))}
          </div>
        )}

        <div className="space-y-2">
          {items.map((it, i) => (
            <ItemRow
              key={i}
              item={it}
              presets={presets}
              onChange={(p) => updateItem(i, p)}
              onRemove={items.length > 1 ? () => removeItem(i) : undefined}
            />
          ))}
        </div>
      </section>


      {/* Inline chips: Tambah item, Diskon, Tag, Catatan */}
      <ExtrasRow
        onAddItem={addRow}
        discount={discount}
        setDiscount={setDiscount}
        tags={tags}
        setTags={setTags}
        tagSuggestions={allTags.map((t) => t.tag)}
        noteText={noteText}
        setNoteText={setNoteText}
      />


      {/* Summary */}
      <div className="rounded-2xl bg-card border border-border shadow-soft p-3 space-y-1.5 text-sm">
        <Row label="Subtotal" value={formatIDR(totals.subtotal)} muted />
        {discount > 0 && <Row label="Diskon" value={"− " + formatIDR(discount)} muted />}
        
        <div className="h-px bg-border my-1" />
        <div className="flex items-end justify-between">
          <span className="text-muted-foreground">Total</span>
          <span className="font-display font-semibold text-2xl tracking-tight tabular-nums">{formatIDR(totals.total)}</span>
        </div>
      </div>

      {/* Pembayaran */}
      <PaymentSection
        total={totals.total}
        paymentMethod={paymentMethod}
        setPaymentMethod={setPaymentMethod}
        cashReceived={cashReceived}
        setCashReceived={setCashReceived}
      />

      <Button size="lg" className="tap w-full h-12 rounded-full shadow-pop text-[15px] font-semibold" disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
        <Check className="h-4 w-4" />
        {editingId ? "Simpan perubahan" : "Simpan"}
      </Button>

    </div>
  );
}

function Row({ label, value, muted }: { label: React.ReactNode; value: React.ReactNode; muted?: boolean }) {
  return <div className={cn("flex justify-between", muted && "text-muted-foreground")}><span>{label}</span><span className="tabular-nums">{value}</span></div>;
}

function cashSuggestions(total: number): number[] {
  if (total <= 0) return [];
  const steps = [5000, 10000, 20000, 50000, 100000];
  const set = new Set<number>();
  for (const s of steps) {
    const up = Math.ceil(total / s) * s;
    if (up > total) set.add(up);
  }
  return [...set].sort((a, b) => a - b).slice(0, 3);
}

function PaymentSection({
  total, paymentMethod, setPaymentMethod, cashReceived, setCashReceived,
}: {
  total: number;
  paymentMethod: PaymentMethod;
  setPaymentMethod: (m: PaymentMethod) => void;
  cashReceived: number;
  setCashReceived: (n: number) => void;
}) {
  const isTunai = paymentMethod === "tunai";
  const kembalian = cashReceived - total;
  const suggestions = useMemo(() => cashSuggestions(total), [total]);
  return (
    <section className="space-y-2">
      <SectionLabel>Pembayaran</SectionLabel>
      <div className="flex gap-1.5">
        {PAYMENT_METHODS.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => { tapHaptic(); setPaymentMethod(m); }}
            className={cn(
              "tap flex-1 rounded-full px-3 py-2 text-xs font-medium border",
              paymentMethod === m
                ? "bg-primary text-primary-foreground border-primary shadow-soft"
                : "bg-card text-muted-foreground border-border hover:text-foreground",
            )}
          >
            {PAYMENT_LABELS[m]}
          </button>
        ))}
      </div>

      {isTunai && (
        <div className="rounded-2xl bg-card border border-border shadow-soft p-3 space-y-2.5">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground shrink-0">Uang diterima</span>
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">Rp</span>
              <input
                aria-label="Uang tunai diterima"
                inputMode="decimal" enterKeyHint="done" placeholder="0"
                value={formatIDRInput(cashReceived)}
                onChange={(e) => setCashReceived(parseIDRInput(e.target.value))}
                onFocus={(e) => e.target.select()}
                className="w-full h-11 pl-8 pr-2 bg-surface rounded-full text-right text-sm focus:outline-none focus:ring-2 focus:ring-ring/30"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => { tapHaptic(); setCashReceived(total); }}
              className="tap rounded-full bg-surface border border-border px-3 py-1 text-[11px] text-muted-foreground hover:text-foreground"
            >
              Uang pas
            </button>
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => { tapHaptic(); setCashReceived(s); }}
                className="tap rounded-full bg-surface border border-border px-3 py-1 text-[11px] text-muted-foreground hover:text-foreground tabular-nums"
              >
                {formatIDRInput(s)}
              </button>
            ))}
            {cashReceived > 0 && (
              <button
                type="button"
                onClick={() => { tapHaptic(); setCashReceived(0); }}
                className="tap rounded-full px-3 py-1 text-[11px] text-muted-foreground hover:text-destructive"
              >
                Hapus
              </button>
            )}
          </div>

          {cashReceived > 0 && (
            kembalian >= 0 ? (
              <div className="flex items-center justify-between text-sm pt-0.5">
                <span className="text-muted-foreground">Kembalian</span>
                <span className="font-display font-semibold text-lg tracking-tight tabular-nums">{formatIDR(kembalian)}</span>
              </div>
            ) : (
              <div className="flex items-center justify-between text-sm pt-0.5 text-destructive">
                <span>Kurang</span>
                <span className="font-medium tabular-nums">{formatIDR(-kembalian)}</span>
              </div>
            )
          )}
        </div>
      )}
    </section>
  );
}

type ItemRowProps = { item: NoteItem; presets?: Preset[]; onChange: (p: Partial<NoteItem>) => void; onRemove?: () => void };
const ItemRow = memo(({ item, presets = [], onChange, onRemove }: ItemRowProps) => {
  const [showCost] = useState(item.cost > 0);
  const [focused, setFocused] = useState(false);
  const sugs = useMemo(() => {
    const q = item.name.trim().toLowerCase();
    if (!q) return [];
    return presets.filter((p) => p.name.toLowerCase().includes(q) && p.name.toLowerCase() !== q).slice(0, 5);
  }, [item.name, presets]);
  const showSugs = focused && sugs.length > 0;
  return (
    <div className="group relative rounded-2xl bg-card border border-border shadow-soft p-3 pr-12 space-y-2">
      <div className="relative">
        <input
          aria-label="Nama item"
          placeholder="Nama item" value={item.name}
          onChange={(e) => onChange({ name: e.target.value })}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 120)}
          maxLength={60} enterKeyHint="next"
          className="w-full h-11 px-3 bg-surface rounded-full text-[15px] font-medium placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-ring/30"
        />
        {showSugs && (
          <div className="absolute z-20 left-1 right-1 mt-1 rounded-xl border border-border bg-popover shadow-pop overflow-hidden">
            {sugs.map((p) => (
              <button
                key={p.id} type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { tapHaptic(); onChange({ name: p.name, price: p.price, cost: p.cost || 0 }); setFocused(false); }}
                className="tap w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-center justify-between gap-2"
              >
                <span className="truncate font-medium">{p.name}</span>
                <span className="text-muted-foreground text-xs tabular-nums shrink-0">{formatIDR(p.price)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 text-sm">
        <div className="inline-flex items-center rounded-full bg-surface">
          <button type="button" onClick={() => { tapHaptic(); onChange({ qty: Math.max(1, item.qty - 1) }); }} className="tap w-9 h-11 grid place-items-center text-muted-foreground text-lg active:scale-95 select-none" aria-label="Kurangi">−</button>
          <input
            aria-label="Jumlah item"
            inputMode="decimal" enterKeyHint="next" value={item.qty}
            onChange={(e) => { const v = parseFloat(e.target.value.replace(",", ".")); onChange({ qty: Number.isFinite(v) && v > 0 ? Math.min(99999, v) : 1 }); }}
            onFocus={(e) => e.target.select()}
            className="w-8 text-center bg-transparent focus:outline-none font-medium tabular-nums text-base"
          />
          <button type="button" onClick={() => { tapHaptic(); onChange({ qty: Math.min(99999, item.qty + 1) }); }} className="tap w-9 h-11 grid place-items-center text-muted-foreground text-lg active:scale-95 select-none" aria-label="Tambah">+</button>
        </div>
        <span className="text-muted-foreground">×</span>
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">Rp</span>
          <input
            aria-label="Harga satuan"
            inputMode="decimal" enterKeyHint="next" placeholder="0"
            value={formatIDRInput(item.price)} onChange={(e) => onChange({ price: parseIDRInput(e.target.value) })}
            onFocus={(e) => e.target.select()}
            className="w-full h-11 pl-8 pr-2 bg-surface rounded-full text-right text-sm focus:outline-none"
          />
        </div>
      </div>
      {showCost && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground shrink-0 pl-1">Modal</span>
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-[10px]">Rp</span>
            <input
              aria-label="Harga modal per item"
              inputMode="decimal" placeholder="0"
              value={formatIDRInput(item.cost)} onChange={(e) => onChange({ cost: parseIDRInput(e.target.value) })}
              onFocus={(e) => e.target.select()}
              className="w-full h-9 pl-7 pr-2 bg-surface rounded-full text-right focus:outline-none"
            />
          </div>
        </div>
      )}
      <div className="absolute top-1 right-1 flex items-center">
        {onRemove && (
          <button type="button" onClick={() => { tapHaptic(); onRemove(); }} className="tap inline-flex items-center justify-center w-9 h-9 text-muted-foreground hover:text-destructive rounded-full" aria-label="Hapus baris">
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
});

function ExtrasRow({
  onAddItem, discount, setDiscount, tags, setTags, tagSuggestions, noteText, setNoteText,
}: {
  onAddItem?: () => void;
  discount: number; setDiscount: (n: number) => void;
  tags: string[]; setTags: (v: string[]) => void; tagSuggestions: string[];
  noteText: string; setNoteText: (v: string) => void;
}) {
  const [tagText, setTagText] = useState("");
  function addTag(t: string) {
    const k = t.trim(); if (!k) return;
    if (tags.includes(k)) return;
    setTags([...tags, k.slice(0, 20)]); setTagText("");
  }
  const sugs = tagSuggestions.filter((s) => !tags.includes(s) && (!tagText || s.toLowerCase().includes(tagText.toLowerCase()))).slice(0, 8);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {/* Tambah item */}
      {onAddItem && (
        <button type="button" onClick={onAddItem} className="tap inline-flex items-center gap-1.5 rounded-full bg-primary text-primary-foreground px-4 py-1.5 text-xs font-medium shadow-pop hover:opacity-90">
          <Plus className="h-3.5 w-3.5" /> Item
        </button>
      )}
      {/* Diskon */}
      <DiscountChip discount={discount} setDiscount={setDiscount} />


      {/* Tags */}
      {tags.map((t) => (
        <span key={t} className="inline-flex items-center gap-1 rounded-full bg-accent/60 px-2.5 py-1 text-xs">
          <Tag className="h-3 w-3" /> {t}
          <button type="button" onClick={() => setTags(tags.filter((x) => x !== t))} aria-label={`Hapus tag ${t}`} className="ml-0.5 hover:text-destructive"><X className="h-3 w-3" /></button>
        </span>
      ))}
      <Popover>
        <PopoverTrigger asChild>
          <button type="button" className="tap inline-flex items-center gap-1 rounded-full bg-card border border-border border-dashed px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground shadow-soft">
            <Plus className="h-3 w-3" /> Tag
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-2 space-y-2" align="start">
          <Input
            aria-label="Tambah tag baru"
            value={tagText}
            onChange={(e) => setTagText(e.target.value.slice(0, 20))}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag(tagText); } }}
            placeholder="Tambah tag…"
            className="h-9 rounded-xl border-border bg-card"
            autoFocus
            maxLength={20}
          />
          {sugs.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {sugs.map((s) => (
                <button key={s} type="button" onClick={() => addTag(s)} className="tap rounded-full bg-surface px-2.5 py-1 text-[11px] text-muted-foreground hover:text-foreground">+ {s}</button>
              ))}
            </div>
          )}
        </PopoverContent>
      </Popover>

      {/* Catatan */}
      <NoteChip noteText={noteText} setNoteText={setNoteText} />

    </div>
  );
}

function DiscountChip({ discount, setDiscount }: { discount: number; setDiscount: (n: number) => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string>(discount ? formatIDRInput(discount) : "");
  useEffect(() => { if (!open) setDraft(discount ? formatIDRInput(discount) : ""); }, [discount, open]);
  function commit() { setDiscount(parseIDRInput(draft)); }
  const hasDiscount = discount > 0;
  return (
    <span className="inline-flex items-center">
      <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) commit(); }}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              "tap inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs shadow-soft",
              hasDiscount
                ? "bg-accent/60 text-foreground"
                : "bg-card border border-border border-dashed text-muted-foreground hover:text-foreground"
            )}
          >
            {hasDiscount ? <>Diskon {formatIDR(discount)}</> : <><Plus className="h-3 w-3" /> Diskon</>}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-60 p-2" align="start">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">Rp</span>
            <Input
              aria-label="Nominal diskon"
              inputMode="decimal" enterKeyHint="done" placeholder="0"
              value={draft}
              onChange={(e) => setDraft(formatIDRInput(parseIDRInput(e.target.value)))}
              onFocus={(e) => e.target.select()}
              onKeyDown={(e) => { if (e.key === "Enter") { commit(); setOpen(false); } }}
              className="h-10 rounded-xl border-border bg-card pl-8"
              autoFocus
            />
          </div>
          {hasDiscount && (
            <button type="button" onClick={() => { setDraft(""); setDiscount(0); setOpen(false); }} className="mt-2 w-full text-left text-[11px] text-muted-foreground hover:text-destructive px-1">Hapus diskon</button>
          )}
        </PopoverContent>
      </Popover>
    </span>
  );
}

function NoteChip({ noteText, setNoteText }: { noteText: string; setNoteText: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(noteText);
  useEffect(() => { if (!open) setDraft(noteText); }, [noteText, open]);
  function commit() { setNoteText(draft.slice(0, 200)); }
  const has = noteText.trim().length > 0;
  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) commit(); }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "tap inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs shadow-soft max-w-[60%]",
            has
              ? "bg-accent/60 text-foreground"
              : "bg-card border border-border border-dashed text-muted-foreground hover:text-foreground"
          )}
        >
          {has ? (
            <>
              <StickyNote className="h-3 w-3 shrink-0" />
              <span className="truncate">{noteText}</span>
            </>
          ) : (
            <><Plus className="h-3 w-3" /> Catatan</>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2 space-y-2" align="start">
        <Textarea
          rows={3}
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, 200))}
          maxLength={200}
          placeholder="Catatan…"
          className="rounded-xl border-border bg-card"
          autoFocus
        />
        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          <button type="button" onClick={() => { setDraft(""); setNoteText(""); setOpen(false); }} className="hover:text-destructive">Hapus</button>
          <span className="tabular-nums">{draft.length}/200</span>
        </div>
      </PopoverContent>
    </Popover>
  );
}






type CustomerLite = { name: string; phone?: string; count?: number };
function CustomerSuggestInput({ placeholder, value, onChange, suggestions, onPick, maxLength, inputMode }: { placeholder: string; value: string; onChange: (v: string) => void; suggestions: CustomerLite[]; onPick: (c: CustomerLite) => void; maxLength?: number; inputMode?: "tel" | "text" | "numeric"; }) {
  const [focused, setFocused] = useState(false);
  const [open, setOpen] = useState(true);
  const show = focused && open && suggestions.length > 0;
  return (
    <div className="relative">
      <input
        aria-label={placeholder}
        placeholder={placeholder} value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => { setFocused(true); setOpen(true); }}
        onBlur={() => setTimeout(() => setFocused(false), 120)}
        onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}
        maxLength={maxLength} inputMode={inputMode} enterKeyHint="next"
        className="w-full bg-transparent px-4 h-11 text-[15px] placeholder:text-muted-foreground/70 focus:outline-none"
      />
      {show && (
        <div className="absolute z-20 mt-1 left-2 right-2 rounded-xl border border-border bg-popover shadow-pop overflow-hidden">
          {suggestions.map((s, i) => (
            <button key={i} type="button" className="tap w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-center justify-between gap-2"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onPick(s); setOpen(false); }}>
              <span className="truncate">
                <span className="font-medium">{s.name}</span>
                {s.phone && <span className="text-muted-foreground ml-2">{s.phone}</span>}
              </span>
              {typeof s.count === "number" && <span className="text-[10px] text-muted-foreground shrink-0">{s.count}× nota</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
