import { get, set, createStore } from "idb-keyval";
import { z } from "zod";

let store: ReturnType<typeof createStore> | undefined;

function getStore() {
  if (typeof window === "undefined" || typeof indexedDB === "undefined") {
    return undefined;
  }

  if (!store) {
    store = createStore("notaku-db", "kv");
  }

  return store;
}

export const SCHEMA_VERSION = 4;

const KEYS = {
  business: "business",
  presets: "presets",
  notes: "notes",
  expenses: "expenses",
  seq: "seq",
  prefs: "prefs",
  schemaVersion: "schemaVersion",
} as const;

// ===== Multi-tab sync =====
const CHANNEL_NAME = "notaku-db";
let channel: BroadcastChannel | undefined;
function getChannel(): BroadcastChannel | undefined {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") return undefined;
  if (!channel) {
    try { channel = new BroadcastChannel(CHANNEL_NAME); } catch { return undefined; }
  }
  return channel;
}
function broadcastChange(key: string) {
  try { getChannel()?.postMessage({ type: "kv", key, ts: Date.now() }); } catch { /* ignore */ }
}
export function subscribeDbChanges(handler: (key: string) => void): () => void {
  const ch = getChannel();
  if (!ch) return () => {};
  const listener = (e: MessageEvent) => {
    if (e?.data?.type === "kv" && typeof e.data.key === "string") handler(e.data.key);
  };
  ch.addEventListener("message", listener);
  return () => ch.removeEventListener("message", listener);
}

// ===== Schemas =====
export const BusinessSchema = z.object({
  name: z.string().trim().max(80).default(""),
  phone: z.string().trim().max(20).default(""),
  address: z.string().trim().max(200).default(""),
  prefix: z.string().trim().min(1).max(10).default("NT"),
  logo: z.string().max(500_000).default(""),
  receiptFooter: z.string().trim().max(120).default("Terima kasih sudah belanja"),
  lastWaNumber: z.string().trim().max(20).default(""),
  // Rekening untuk pembayaran transfer (ditampilkan di struk & WA).
  bankName: z.string().trim().max(40).default(""),
  bankAccount: z.string().trim().max(40).default(""),
  bankHolder: z.string().trim().max(60).default(""),
  // Gambar QRIS statis (base64) — ditampilkan di struk saat metode QRIS.
  qrisImage: z.string().max(500_000).default(""),
});
export type Business = z.infer<typeof BusinessSchema>;

export const PresetSchema = z.object({
  id: z.string(),
  name: z.string().trim().min(1).max(60),
  price: z.number().int().min(0).max(1_000_000_000),
  cost: z.number().int().min(0).max(1_000_000_000).default(0),
  unit: z.string().trim().max(12).default(""),
});
export type Preset = z.infer<typeof PresetSchema>;

export const DISCOUNT_TYPES = ["amount", "percent"] as const;
export type DiscountType = (typeof DISCOUNT_TYPES)[number];

export const NoteItemSchema = z.object({
  name: z.string().trim().min(1).max(60),
  qty: z.number().min(0.001).max(99_999),
  price: z.number().int().min(0).max(1_000_000_000),
  cost: z.number().int().min(0).max(1_000_000_000).default(0),
  // Diskon per item (opsional). amount = Rp, percent = % dari (qty*price).
  discountType: z.enum(DISCOUNT_TYPES).default("amount"),
  discountValue: z.number().min(0).max(1_000_000_000).default(0),
});
export type NoteItem = z.infer<typeof NoteItemSchema>;

// Payment methods (fixed for v1).
export const PAYMENT_METHODS = ["tunai", "transfer", "qris"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  tunai: "Tunai",
  transfer: "Transfer",
  qris: "QRIS",
};

// Status pembayaran nota.
export const NOTE_STATUSES = ["lunas", "belum", "batal"] as const;
export type NoteStatus = (typeof NOTE_STATUSES)[number];
export const STATUS_LABELS: Record<NoteStatus, string> = {
  lunas: "Lunas",
  belum: "Belum bayar",
  batal: "Batal",
};

// Jenis pajak. ppn11 = PPN 11%, custom = tarif manual, none = tanpa pajak.
export const TAX_TYPES = ["none", "ppn11", "custom"] as const;
export type TaxType = (typeof TAX_TYPES)[number];

export const NoteSchema = z.object({
  id: z.string(),
  number: z.string(),
  date: z.string(),
  customerName: z.string().trim().max(60).default(""),
  customerPhone: z.string().trim().max(20).default(""),
  items: z.array(NoteItemSchema).min(1).max(100),
  discount: z.number().int().min(0).max(1_000_000_000).default(0), // diskon tambahan level-nota (Rp)
  // Pajak & biaya (opsional).
  taxType: z.enum(TAX_TYPES).default("none"),
  customTaxRate: z.number().min(0).max(100).default(0),
  shippingCost: z.number().int().min(0).max(1_000_000_000).default(0),
  paymentMethod: z.enum(PAYMENT_METHODS).default("tunai"),
  cashReceived: z.number().int().min(0).max(1_000_000_000).default(0), // uang tunai diterima; 0 = tak dicatat
  // Status pembayaran & piutang.
  status: z.enum(NOTE_STATUSES).default("lunas"),
  dueDate: z.string().default(""), // YYYY-MM-DD; jatuh tempo piutang
  paidDate: z.string().default(""), // ISO; saat ditandai lunas
  tags: z.array(z.string().trim().min(1).max(20)).default([]),
  note: z.string().trim().max(200).default(""),
  createdAt: z.string().default(() => new Date().toISOString()),
  updatedAt: z.string().default(() => new Date().toISOString()),
});
export type Note = z.infer<typeof NoteSchema>;

// Default expense categories (fixed for v1; not user-editable yet).
export const EXPENSE_CATEGORIES = [
  "Stok/Bahan", "Sewa", "Listrik & Air", "Gaji", "Transport", "Operasional", "Lainnya",
] as const;

export const ExpenseSchema = z.object({
  id: z.string(),
  date: z.string(),
  // Kept as a free string (not enum) so future user-editable categories / cloud
  // migration don't break on unknown values.
  category: z.string().trim().min(1).max(40).default("Lainnya"),
  amount: z.number().int().min(0).max(1_000_000_000),
  note: z.string().trim().max(200).default(""),
  createdAt: z.string().default(() => new Date().toISOString()),
  updatedAt: z.string().default(() => new Date().toISOString()),
});
export type Expense = z.infer<typeof ExpenseSchema>;

export const PrefsSchema = z.object({
  hideAmounts: z.boolean().default(false),
});
export type Prefs = z.infer<typeof PrefsSchema>;

export const BackupSchema = z.object({
  app: z.literal("notaku"),
  version: z.number(),
  exportedAt: z.string(),
  data: z.object({
    business: BusinessSchema,
    presets: z.array(PresetSchema),
    notes: z.array(NoteSchema),
    expenses: z.array(ExpenseSchema),
    seq: z.number(),
    prefs: PrefsSchema,
  }),
});
export type Backup = z.infer<typeof BackupSchema>;

// ===== Defaults =====
export const defaultBusiness: Business = BusinessSchema.parse({});
export const defaultPrefs: Prefs = PrefsSchema.parse({});

// ===== Migration helpers =====
// Old shape had: business.footer, note.discountType/discountValue, note.notes,
// no cost/tags/unit. Map to new shape on load.
type Loose = Record<string, unknown>;

function migrateBusiness(raw: unknown): Business {
  if (!raw || typeof raw !== "object") return defaultBusiness;
  const r = raw as Loose;
  const receiptFooter = (r.receiptFooter as string | undefined) ?? (r.footer as string | undefined) ?? "Terima kasih sudah belanja";
  return BusinessSchema.parse({ ...defaultBusiness, ...r, receiptFooter });
}

function migrateNote(raw: unknown): Note | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Loose;
  // discount: legacy discountType+discountValue → integer
  let discount = 0;
  if (typeof r.discount === "number") {
    discount = Math.max(0, Math.round(r.discount));
  } else if (r.discountType && typeof r.discountValue === "number") {
    const dt = String(r.discountType);
    const dv = r.discountValue;
    const subtotal = Array.isArray(r.items)
      ? (r.items as Loose[]).reduce((s, it) => s + Number(it.qty || 0) * Number(it.price || 0), 0)
      : 0;
    if (dt === "amount") discount = Math.min(dv, subtotal);
    else if (dt === "percent") discount = Math.round((subtotal * Math.min(dv, 100)) / 100);
  }
  const items = Array.isArray(r.items)
    ? (r.items as Loose[]).map((it) => ({
        name: String(it.name ?? "").trim(),
        qty: Number(it.qty ?? 1),
        price: Math.round(Number(it.price ?? 0)),
        cost: Math.round(Number(it.cost ?? 0)),
        discountType: (DISCOUNT_TYPES as readonly string[]).includes(String(it.discountType)) ? (it.discountType as DiscountType) : "amount",
        discountValue: Math.max(0, Number(it.discountValue ?? 0)) || 0,
      })).filter((it) => it.name && it.qty > 0)
    : [];
  if (!items.length) return null;
  const now = new Date().toISOString();
  const paymentMethod = (PAYMENT_METHODS as readonly string[]).includes(String(r.paymentMethod))
    ? (r.paymentMethod as PaymentMethod)
    : "tunai";
  const note = {
    id: String(r.id ?? uid()),
    number: String(r.number ?? ""),
    date: String(r.date ?? now),
    customerName: String(r.customerName ?? "").trim(),
    customerPhone: String(r.customerPhone ?? "").trim(),
    items,
    discount,
    taxType: (TAX_TYPES as readonly string[]).includes(String(r.taxType)) ? (r.taxType as TaxType) : "none",
    customTaxRate: Math.max(0, Math.min(100, Number(r.customTaxRate ?? 0))) || 0,
    shippingCost: Math.max(0, Math.round(Number(r.shippingCost ?? 0))) || 0,
    paymentMethod,
    cashReceived: Math.max(0, Math.round(Number(r.cashReceived ?? 0))) || 0,
    status: (NOTE_STATUSES as readonly string[]).includes(String(r.status)) ? (r.status as NoteStatus) : "lunas",
    dueDate: String(r.dueDate ?? ""),
    paidDate: String(r.paidDate ?? ""),
    tags: Array.isArray(r.tags) ? (r.tags as unknown[]).map(String).map((s) => s.trim()).filter(Boolean) : [],
    note: String(r.note ?? r.notes ?? "").trim(),
    createdAt: String(r.createdAt ?? r.date ?? now),
    updatedAt: String(r.updatedAt ?? r.date ?? now),
  };
  try {
    return NoteSchema.parse(note);
  } catch {
    return null;
  }
}

function migratePreset(raw: unknown): Preset | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Loose;
  try {
    return PresetSchema.parse({
      id: String(r.id ?? uid()),
      name: String(r.name ?? "").trim(),
      price: Math.round(Number(r.price ?? 0)),
      cost: Math.round(Number(r.cost ?? 0)),
      unit: String(r.unit ?? "").trim(),
    });
  } catch {
    return null;
  }
}

function migrateExpense(raw: unknown): Expense | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Loose;
  try {
    const now = new Date().toISOString();
    return ExpenseSchema.parse({
      id: String(r.id ?? uid()),
      date: String(r.date ?? now),
      category: String(r.category ?? "Lainnya").trim() || "Lainnya",
      amount: Math.round(Number(r.amount ?? 0)),
      // accept legacy `description` as an alias for `note`
      note: String(r.note ?? r.description ?? "").trim(),
      createdAt: String(r.createdAt ?? r.date ?? now),
      updatedAt: String(r.updatedAt ?? r.date ?? now),
    });
  } catch {
    return null;
  }
}

// ===== Generic kv =====
async function kvGet<T>(k: string, fallback: T): Promise<T> {
  const store = getStore();
  if (!store) return fallback;
  try {
    const v = await get<T>(k, store);
    return v ?? fallback;
  } catch {
    return fallback;
  }
}
export class StorageWriteError extends Error {
  readonly quota: boolean;
  constructor(message: string, options: { quota: boolean; cause?: unknown }) {
    super(message);
    this.name = "StorageWriteError";
    this.quota = options.quota;
    if (options.cause !== undefined) (this as { cause?: unknown }).cause = options.cause;
  }
}

function isQuotaError(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const err = e as { name?: string; code?: number; message?: string };
  if (err.name === "QuotaExceededError" || err.name === "NS_ERROR_DOM_QUOTA_REACHED") return true;
  if (err.code === 22 || err.code === 1014) return true;
  return typeof err.message === "string" && /quota/i.test(err.message);
}

async function kvSet<T>(k: string, v: T): Promise<void> {
  const store = getStore();
  if (!store) {
    throw new StorageWriteError("Penyimpanan tidak tersedia di peramban ini.", { quota: false });
  }
  try {
    await set(k, v, store);
    broadcastChange(k);
  } catch (e) {
    const quota = isQuotaError(e);
    throw new StorageWriteError(
      quota ? "Penyimpanan penuh. Hapus data lama atau export dulu." : "Gagal menyimpan ke penyimpanan lokal.",
      { quota, cause: e },
    );
  }
}

// Schema-version gate. Detect data written by a newer build than this one.
export type SchemaCheck = { ok: true } | { ok: false; reason: "newer"; stored: number };
export async function checkSchemaVersion(): Promise<SchemaCheck> {
  const stored = await kvGet<number>(KEYS.schemaVersion, 0);
  if (stored > SCHEMA_VERSION) return { ok: false, reason: "newer", stored };
  if (stored !== SCHEMA_VERSION) {
    try { await kvSet(KEYS.schemaVersion, SCHEMA_VERSION); } catch { /* ignore */ }
  }
  return { ok: true };
}

// ===== API =====
export const db = {
  async getBusiness(): Promise<Business> {
    return migrateBusiness(await kvGet<unknown>(KEYS.business, defaultBusiness));
  },
  async setBusiness(b: Business) {
    await kvSet(KEYS.business, BusinessSchema.parse(b));
  },
  async getPresets(): Promise<Preset[]> {
    const raw = await kvGet<unknown[]>(KEYS.presets, []);
    return (raw ?? []).map(migratePreset).filter((x): x is Preset => !!x);
  },
  async setPresets(p: Preset[]) {
    await kvSet(KEYS.presets, z.array(PresetSchema).parse(p));
  },
  async getNotes(): Promise<Note[]> {
    const raw = await kvGet<unknown[]>(KEYS.notes, []);
    return (raw ?? []).map(migrateNote).filter((x): x is Note => !!x);
  },
  async setNotes(notes: Note[]) {
    await kvSet(KEYS.notes, z.array(NoteSchema).parse(notes));
  },
  async getExpenses(): Promise<Expense[]> {
    const raw = await kvGet<unknown[]>(KEYS.expenses, []);
    return (raw ?? []).map(migrateExpense).filter((x): x is Expense => !!x);
  },
  async setExpenses(expenses: Expense[]) {
    await kvSet(KEYS.expenses, z.array(ExpenseSchema).parse(expenses));
  },
  async getSeq(): Promise<number> {
    return await kvGet<number>(KEYS.seq, 0);
  },
  async setSeq(n: number) {
    await kvSet(KEYS.seq, n);
  },
  async getPrefs(): Promise<Prefs> {
    const raw = await kvGet<unknown>(KEYS.prefs, defaultPrefs);
    try { return PrefsSchema.parse(raw); } catch { return defaultPrefs; }
  },
  async setPrefs(p: Prefs) {
    await kvSet(KEYS.prefs, PrefsSchema.parse(p));
  },
  async exportAll(): Promise<Backup> {
    const [business, presets, notes, expenses, seq, prefs] = await Promise.all([
      this.getBusiness(),
      this.getPresets(),
      this.getNotes(),
      this.getExpenses(),
      this.getSeq(),
      this.getPrefs(),
    ]);
    return {
      app: "notaku",
      version: SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      data: { business, presets, notes, expenses, seq, prefs },
    };
  },
  async importAll(data: unknown, mode: "merge" | "replace" = "replace") {
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw new Error("Format tidak valid.");
    }
    // Be lenient: also accept legacy flat exports.
    let parsed: Backup["data"];
    if ((data as Loose).app === "notaku" && (data as Loose).data) {
      parsed = BackupSchema.parse(data).data;
    } else {
      const r = data as Loose;
      const hasAnyKey = ["business", "presets", "notes", "seq", "prefs"].some((k) => k in r);
      if (!hasAnyKey) throw new Error("Format tidak valid.");
      parsed = {
        business: migrateBusiness(r.business),
        presets: Array.isArray(r.presets) ? (r.presets as unknown[]).map(migratePreset).filter((x): x is Preset => !!x) : [],
        notes: Array.isArray(r.notes) ? (r.notes as unknown[]).map(migrateNote).filter((x): x is Note => !!x) : [],
        expenses: Array.isArray(r.expenses) ? (r.expenses as unknown[]).map(migrateExpense).filter((x): x is Expense => !!x) : [],
        seq: typeof r.seq === "number" ? r.seq : 0,
        prefs: (() => { try { return PrefsSchema.parse(r.prefs); } catch { return defaultPrefs; } })(),
      };
    }
    if (mode === "replace") {
      await this.setBusiness(parsed.business);
      await this.setPresets(parsed.presets);
      await this.setNotes(parsed.notes);
      await this.setExpenses(parsed.expenses);
      await this.setSeq(parsed.seq);
      await this.setPrefs(parsed.prefs);
    } else {
      await this.setBusiness(parsed.business);
      await this.setPrefs(parsed.prefs);
      const curP = await this.getPresets();
      const pIds = new Set(curP.map((x) => x.id));
      await this.setPresets([...curP, ...parsed.presets.filter((p) => !pIds.has(p.id))]);
      const curN = await this.getNotes();
      const nIds = new Set(curN.map((x) => x.id));
      await this.setNotes([...curN, ...parsed.notes.filter((n) => !nIds.has(n.id))]);
      const curE = await this.getExpenses();
      const eIds = new Set(curE.map((x) => x.id));
      await this.setExpenses([...curE, ...parsed.expenses.filter((e) => !eIds.has(e.id))]);
      const curS = await this.getSeq();
      await this.setSeq(Math.max(curS, parsed.seq));
    }
  },
  async wipe() {
    await Promise.all([
      kvSet(KEYS.business, defaultBusiness),
      kvSet(KEYS.presets, []),
      kvSet(KEYS.notes, []),
      kvSet(KEYS.expenses, []),
      kvSet(KEYS.seq, 0),
      kvSet(KEYS.prefs, defaultPrefs),
    ]);
  },
};

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function generateNoteNumber(prefix: string, seq: number, date = new Date()): string {
  const year = date.getFullYear();
  return `${prefix || "NT"}-${year}-${String(seq).padStart(4, "0")}`;
}

// ===== Derived =====
// Subtotal satu baris item setelah diskon per-item.
export function calcLineSubtotal(item: Pick<NoteItem, "qty" | "price" | "discountType" | "discountValue">): number {
  const gross = item.qty * item.price;
  const dv = item.discountValue || 0;
  if (dv <= 0) return gross;
  if (item.discountType === "percent") return Math.max(0, Math.round(gross * (1 - Math.min(dv, 100) / 100)));
  return Math.max(0, gross - dv);
}

export type NoteTotals = {
  subtotal: number; total: number; modal: number; laba: number;
  // Rincian lanjutan (0 untuk nota sederhana).
  itemDiscount: number; noteDiscount: number; afterDiscount: number;
  taxRate: number; taxAmount: number; shipping: number;
};
export function calcNoteTotals(
  note: Pick<Note, "items" | "discount"> & Partial<Pick<Note, "taxType" | "customTaxRate" | "shippingCost">>,
): NoteTotals {
  const gross = note.items.reduce((s, it) => s + it.qty * it.price, 0);
  const subtotal = note.items.reduce((s, it) => s + calcLineSubtotal(it), 0);
  const itemDiscount = gross - subtotal;
  const modal = note.items.reduce((s, it) => s + it.qty * (it.cost || 0), 0);
  const noteDiscount = Math.min(note.discount || 0, subtotal);
  const afterDiscount = Math.max(0, subtotal - noteDiscount);
  const taxRate = note.taxType === "ppn11" ? 11 : note.taxType === "custom" ? (note.customTaxRate || 0) : 0;
  const taxAmount = Math.round(afterDiscount * (taxRate / 100));
  const shipping = note.shippingCost || 0;
  const total = afterDiscount + taxAmount + shipping;
  // Pajak = titipan negara, ongkir = pass-through → keduanya tidak dihitung sebagai laba.
  const laba = afterDiscount - modal;
  return { subtotal, total, modal, laba, itemDiscount, noteDiscount, afterDiscount, taxRate, taxAmount, shipping };
}

export function hasMissingCost(notes: Note[]): boolean {
  return notes.some((n) => n.items.some((it) => !it.cost));
}

// ===== Status / piutang =====
function todayYMD(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function isOverdue(note: Pick<Note, "status" | "dueDate">): boolean {
  return note.status === "belum" && !!note.dueDate && note.dueDate < todayYMD();
}
// Token warna untuk badge status (kelas Tailwind).
export function statusTone(note: Pick<Note, "status" | "dueDate">): string {
  if (note.status === "lunas") return "bg-accent text-accent-foreground";
  if (note.status === "batal") return "bg-muted text-muted-foreground line-through";
  return isOverdue(note)
    ? "bg-destructive/15 text-destructive"
    : "bg-amber-500/15 text-amber-700 dark:text-amber-400";
}
// Total piutang berjalan (nota belum dibayar).
export function sumOutstanding(notes: Note[]): number {
  let total = 0;
  for (const n of notes) if (n.status === "belum") total += calcNoteTotals(n).total;
  return total;
}

export function deriveCustomers(notes: Note[]): { name: string; phone: string; key: string; totalBelanja: number; count: number; lastDate: string }[] {
  const map = new Map<string, { name: string; phone: string; key: string; totalBelanja: number; count: number; lastDate: string }>();
  for (const n of notes) {
    const name = n.customerName?.trim();
    const phone = n.customerPhone?.trim();
    if (!name && !phone) continue;
    const key = (phone || name || "").toLowerCase();
    const cur = map.get(key);
    const total = calcNoteTotals(n).total;
    if (!cur) map.set(key, { name: name || "Tanpa nama", phone: phone || "", key, totalBelanja: total, count: 1, lastDate: n.date });
    else {
      cur.count += 1;
      cur.totalBelanja += total;
      if (n.date > cur.lastDate) {
        cur.lastDate = n.date;
        cur.name = name || cur.name;
        cur.phone = phone || cur.phone;
      }
    }
  }
  return [...map.values()];
}

export function deriveTags(notes: Note[]): { tag: string; count: number }[] {
  const map = new Map<string, number>();
  for (const n of notes) for (const t of n.tags) {
    const k = t.trim(); if (!k) continue;
    map.set(k, (map.get(k) || 0) + 1);
  }
  return [...map.entries()].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count);
}

export type PeriodRange = "today" | "month" | "week" | "all";
export function periodStart(range: PeriodRange, ref = new Date()): number {
  const d = new Date(ref);
  if (range === "today") return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  if (range === "week") {
    const s = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    return s - ((d.getDay() + 6) % 7) * 86_400_000;
  }
  if (range === "month") return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  return 0;
}

export function aggregate(notes: Note[], range: PeriodRange): { omset: number; laba: number; count: number } {
  const start = periodStart(range);
  let omset = 0, laba = 0, count = 0;
  for (const n of notes) {
    if (new Date(n.date).getTime() < start) continue;
    const t = calcNoteTotals(n);
    omset += t.total; laba += t.laba; count += 1;
  }
  return { omset, laba, count };
}

export function sumExpenses(expenses: Expense[], range: PeriodRange): number {
  const start = periodStart(range);
  let total = 0;
  for (const e of expenses) {
    if (new Date(e.date).getTime() < start) continue;
    total += e.amount;
  }
  return total;
}

export function dailyBuckets(notes: Note[], days: number): { date: string; omset: number }[] {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const buckets: { date: string; omset: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(start);
    d.setDate(d.getDate() - i);
    buckets.push({ date: d.toISOString().slice(0, 10), omset: 0 });
  }
  const idx = new Map(buckets.map((b, i) => [b.date, i]));
  for (const n of notes) {
    const k = n.date.slice(0, 10);
    const i = idx.get(k);
    if (i == null) continue;
    buckets[i].omset += calcNoteTotals(n).total;
  }
  return buckets;
}

// ===== Monthly reporting (Laporan) =====
// month is 0-based (0 = Januari), matching Date.getMonth().
export function inCalendarMonth(iso: string, year: number, month: number): boolean {
  const d = new Date(iso);
  return d.getFullYear() === year && d.getMonth() === month;
}

export type MonthlyRecap = {
  omset: number;
  modal: number;
  labaKotor: number;
  pengeluaran: number;
  labaBersih: number;
  count: number;
  avgPerNota: number;
  byMethod: Record<PaymentMethod, { count: number; omset: number }>;
  topItems: { name: string; qty: number; omset: number }[];
  topCustomers: { name: string; total: number; count: number }[];
};

export function monthlyRecap(notes: Note[], expenses: Expense[], year: number, month: number): MonthlyRecap {
  const monthNotes = notes.filter((n) => inCalendarMonth(n.date, year, month));
  const byMethod: Record<PaymentMethod, { count: number; omset: number }> = {
    tunai: { count: 0, omset: 0 },
    transfer: { count: 0, omset: 0 },
    qris: { count: 0, omset: 0 },
  };
  const itemMap = new Map<string, { name: string; qty: number; omset: number }>();
  let omset = 0, modal = 0;
  for (const n of monthNotes) {
    const t = calcNoteTotals(n);
    omset += t.total;
    modal += t.modal;
    const m = byMethod[n.paymentMethod] ?? byMethod.tunai;
    m.count += 1;
    m.omset += t.total;
    for (const it of n.items) {
      const key = it.name.trim().toLowerCase();
      if (!key) continue;
      const cur = itemMap.get(key);
      const lineOmset = it.qty * it.price;
      if (!cur) itemMap.set(key, { name: it.name.trim(), qty: it.qty, omset: lineOmset });
      else { cur.qty += it.qty; cur.omset += lineOmset; }
    }
  }
  const pengeluaran = expenses
    .filter((e) => inCalendarMonth(e.date, year, month))
    .reduce((s, e) => s + e.amount, 0);
  const labaKotor = omset - modal;
  const count = monthNotes.length;
  const topItems = [...itemMap.values()].sort((a, b) => b.omset - a.omset).slice(0, 5);
  const topCustomers = deriveCustomers(monthNotes)
    .map((c) => ({ name: c.name, total: c.totalBelanja, count: c.count }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 3);
  return {
    omset,
    modal,
    labaKotor,
    pengeluaran,
    labaBersih: labaKotor - pengeluaran,
    count,
    avgPerNota: count ? Math.round(omset / count) : 0,
    byMethod,
    topItems,
    topCustomers,
  };
}

// Omset per bulan untuk N bulan terakhir (termasuk bulan ini).
// date dipakai sebagai kunci/label: "YYYY-MM-01".
export function monthlyBuckets(notes: Note[], months: number): { date: string; omset: number }[] {
  const today = new Date();
  const buckets: { date: string; omset: number }[] = [];
  const idx = new Map<string, number>();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    idx.set(key, buckets.length);
    buckets.push({ date: `${key}-01`, omset: 0 });
  }
  for (const n of notes) {
    const d = new Date(n.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const i = idx.get(key);
    if (i == null) continue;
    buckets[i].omset += calcNoteTotals(n).total;
  }
  return buckets;
}
