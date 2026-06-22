import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Upload, Save, Plus, Trash2, Download, RotateCcw, Sun, Moon, Eye, EyeOff, Pencil } from "lucide-react";
import { toast } from "sonner";

import { db, defaultBusiness, uid, type Business, type Preset } from "@/lib/storage";
import { useTheme } from "@/lib/theme";
import { formatIDR, formatIDRInput, parseIDRInput } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { SITE_URL } from "@/lib/site";
import { ConfirmModal, TypedConfirmModal, ChoiceModal } from "@/components/Modal";

export const Route = createFileRoute("/pengaturan")({
  head: () => ({
    meta: [
      { title: "Pengaturan Bisnis & Backup Data Nota · Notaku" },
      { name: "description", content: "Atur identitas usaha, logo, preset item, dan pelanggan. Backup & restore data nota Notaku — semua tersimpan lokal di perangkat kamu." },
      { property: "og:title", content: "Pengaturan Bisnis & Backup Data Nota · Notaku" },
      { property: "og:description", content: "Kelola profil bisnis, preset item, pelanggan, dan backup data lokal Notaku." },
      { property: "og:url", content: `${SITE_URL}/pengaturan` },
      { property: "og:image", content: `${SITE_URL}/og-image.jpg` },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { name: "twitter:image", content: `${SITE_URL}/og-image.jpg` },
    ],
    links: [{ rel: "canonical", href: `${SITE_URL}/pengaturan` }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Beranda", item: `${SITE_URL}/` },
            { "@type": "ListItem", position: 2, name: "Pengaturan", item: `${SITE_URL}/pengaturan` },
          ],
        }),
      },
    ],
  }),

  component: PengaturanPage,
});

function PengaturanPage() {
  return (
    <div className="space-y-8">
      <h1 className="sr-only">Pengaturan Bisnis & Backup Data Nota</h1>
      <BusinessSection />
      <DisplaySection />
      <PresetSection />
      
      <BackupSection />
    </div>
  );
}

function DisplaySection() {
  const qc = useQueryClient();
  const { data: prefs } = useQuery({ queryKey: ["prefs"], queryFn: () => db.getPrefs() });
  const hide = !!prefs?.hideAmounts;
  const { theme, setTheme } = useTheme();

  const toggleHide = useMutation({
    mutationFn: async () => { await db.setPrefs({ hideAmounts: !hide }); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["prefs"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Section title="Tampilan">
      <Card className="p-3 space-y-3">
        <div className="relative grid grid-cols-2 rounded-full bg-surface p-1 text-sm">
          {(["light", "dark"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTheme(t)}
              className={
                "tap flex items-center justify-center gap-1.5 min-h-9 rounded-full font-medium " +
                (theme === t ? "bg-card text-foreground shadow-soft" : "text-muted-foreground")
              }
            >
              {t === "light" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              {t === "light" ? "Terang" : "Gelap"}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => toggleHide.mutate()}
          className="tap flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-muted transition-colors"
        >
          {hide ? <EyeOff className="h-5 w-5 text-muted-foreground" /> : <Eye className="h-5 w-5 text-muted-foreground" />}
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">{hide ? "Nominal disembunyikan" : "Nominal ditampilkan"}</div>
            <div className="text-xs text-muted-foreground">{hide ? "Ketuk untuk menampilkan." : "Ketuk untuk menyembunyikan."}</div>
          </div>
        </button>
      </Card>
    </Section>
  );
}

function Section({ title, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="px-1">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl bg-card border border-border shadow-soft ${className}`}>
      {children}
    </div>
  );
}

function BusinessSection() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["business"], queryFn: () => db.getBusiness() });
  const [form, setForm] = useState<Business>(defaultBusiness);
  useEffect(() => { if (data) setForm(data); }, [data]);

  const save = useMutation({
    mutationFn: async (b: Business) => { await db.setBusiness(b); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["business"] }); toast.success("Tersimpan"); },
    onError: (e: Error) => toast.error(e.message),
  });

  async function onLogo(file: File) {
    if (file.size > 300_000) { toast.error("Logo maksimum 300KB"); return; }
    const reader = new FileReader();
    reader.onload = () => setForm((f) => ({ ...f, logo: String(reader.result) }));
    reader.readAsDataURL(file);
  }

  async function onQris(file: File) {
    if (file.size > 300_000) { toast.error("Gambar QRIS maksimum 300KB"); return; }
    const reader = new FileReader();
    reader.onload = () => setForm((f) => ({ ...f, qrisImage: String(reader.result) }));
    reader.readAsDataURL(file);
  }

  return (
    <Section title="Bisnis">
      <Card className="p-4 space-y-4">
        <div className="flex gap-3 items-center">
          <label className="w-16 h-16 shrink-0 rounded-2xl border border-dashed border-border flex items-center justify-center overflow-hidden cursor-pointer bg-surface tap" aria-label="Unggah logo bisnis">
            {form.logo ? (
              <img src={form.logo} alt={form.name ? `Logo ${form.name}` : "Logo bisnis"} className="w-full h-full object-contain" />
            ) : (
              <Upload className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
            )}
            <input
              type="file" accept="image/*" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onLogo(f); }}
            />
          </label>
          <div className="flex-1 min-w-0">
            <Label className="text-xs text-muted-foreground">Nama bisnis</Label>
            <Input value={form.name} maxLength={80} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Warung Sate Pak Ali" className="h-10 rounded-xl mt-1" />
          </div>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Telepon</Label>
          <Input value={form.phone} maxLength={20} inputMode="tel" enterKeyHint="done" onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="08xx" className="h-10 rounded-xl mt-1" />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Alamat</Label>
          <Textarea rows={2} value={form.address} maxLength={200} onChange={(e) => setForm({ ...form, address: e.target.value.replace(/\n{2,}/g, "\n") })} placeholder="Alamat singkat" className="rounded-xl mt-1" />
        </div>
        <div className="space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground">Kode awal nota</Label>
            <Input value={form.prefix} maxLength={10} onChange={(e) => setForm({ ...form, prefix: e.target.value })} className="h-10 rounded-xl mt-1" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Pesan bawah struk</Label>
            <Input value={form.receiptFooter} maxLength={120} onChange={(e) => setForm({ ...form, receiptFooter: e.target.value })} placeholder="Terima kasih" className="h-10 rounded-xl mt-1" />
          </div>
        </div>

        {/* Rekening transfer & QRIS — tampil di struk untuk pembayaran non-tunai */}
        <div className="pt-1 border-t border-border/60 space-y-3">
          <p className="t-eyebrow">Rekening & QRIS <span className="font-normal text-muted-foreground normal-case">(opsional)</span></p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">Nama bank</Label>
              <Input value={form.bankName} maxLength={40} onChange={(e) => setForm({ ...form, bankName: e.target.value })} placeholder="BCA" className="h-10 rounded-xl mt-1" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">No. rekening</Label>
              <Input value={form.bankAccount} maxLength={40} inputMode="numeric" onChange={(e) => setForm({ ...form, bankAccount: e.target.value })} placeholder="1234567890" className="h-10 rounded-xl mt-1" />
            </div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Atas nama</Label>
            <Input value={form.bankHolder} maxLength={60} onChange={(e) => setForm({ ...form, bankHolder: e.target.value })} placeholder="Nama pemilik rekening" className="h-10 rounded-xl mt-1" />
          </div>
          <div className="flex gap-3 items-center">
            <label className="w-16 h-16 shrink-0 rounded-2xl border border-dashed border-border flex items-center justify-center overflow-hidden cursor-pointer bg-surface tap" aria-label="Unggah gambar QRIS">
              {form.qrisImage ? (
                <img src={form.qrisImage} alt="QRIS" className="w-full h-full object-contain" />
              ) : (
                <Upload className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
              )}
              <input
                type="file" accept="image/*" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) onQris(f); }}
              />
            </label>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">Gambar QRIS statis</p>
              <p className="t-caption mt-0.5">Muncul di struk saat metode QRIS. Maks 300KB.</p>
              {form.qrisImage && (
                <button className="mt-1 text-xs text-muted-foreground hover:text-destructive" onClick={() => setForm({ ...form, qrisImage: "" })}>
                  Hapus QRIS
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between pt-1">
          {form.logo ? (
            <button className="text-xs text-muted-foreground hover:text-destructive" onClick={() => setForm({ ...form, logo: "" })}>
              Hapus logo
            </button>
          ) : <span />}
          <Button onClick={() => save.mutate(form)} disabled={save.isPending} className="tap rounded-full">
            <Save className="h-4 w-4" /> Simpan
          </Button>
        </div>
      </Card>
    </Section>
  );
}

function PresetSection() {
  const qc = useQueryClient();
  const { data: presets = [] } = useQuery({ queryKey: ["presets"], queryFn: () => db.getPresets() });
  const [name, setName] = useState("");
  const [price, setPrice] = useState(0);
  const [cost, setCost] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: async (items: Preset[]) => { await db.setPresets(items); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["presets"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  function add() {
    const nm = name.trim();
    if (!nm) return;
    save.mutate([...presets, { id: uid(), name: nm, price, cost, unit: "" }]);
    setName(""); setPrice(0); setCost(0);
  }
  function remove(id: string) { save.mutate(presets.filter((p) => p.id !== id)); }
  function updatePreset(id: string, updates: Partial<Omit<Preset, "id">>) {
    save.mutate(presets.map((p) => (p.id === id ? { ...p, ...updates } : p)));
  }

  return (
    <Section title="Preset">
      <Card className="p-3 space-y-3">
        <div className="space-y-2">
          <Input aria-label="Nama preset" placeholder="Nama item" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} enterKeyHint="next" className="h-11 rounded-xl" />
          <div className="flex gap-2 items-end">
            <div className="flex-1 space-y-1">
              <Label className="text-[10px] text-muted-foreground">Harga</Label>
              <Input
                aria-label="Harga jual preset"
                inputMode="decimal" enterKeyHint="next" placeholder="0"
                value={formatIDRInput(price)}
                onChange={(e) => setPrice(parseIDRInput(e.target.value))}
                onFocus={(e) => e.target.select()}
                className="h-11 rounded-xl text-right"
              />
            </div>
            <div className="flex-1 space-y-1">
              <Label className="text-[10px] text-muted-foreground">Modal</Label>
              <Input
                aria-label="Modal preset"
                inputMode="decimal" enterKeyHint="done" placeholder="0"
                value={formatIDRInput(cost)}
                onChange={(e) => setCost(parseIDRInput(e.target.value))}
                onFocus={(e) => e.target.select()}
                className="h-11 rounded-xl text-right"
              />
            </div>
            <Button variant="outline" onClick={add} aria-label="Tambah preset item" className="tap rounded-xl h-11 w-11 p-0 shrink-0">
              <Plus className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
        {presets.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-3">Belum ada preset.</p>
        ) : (
          <ul className="divide-y divide-border">
            {presets.map((p) => (
              <li key={p.id} className="py-2.5">
                {editingId === p.id ? (
                  <div className="space-y-2">
                    <Input
                      value={p.name}
                      onChange={(e) => updatePreset(p.id, { name: e.target.value })}
                      className="h-9 rounded-lg text-sm"
                    />
                    <div className="flex gap-2">
                      <Input
                        inputMode="decimal"
                        value={formatIDRInput(p.price)}
                        onChange={(e) => updatePreset(p.id, { price: parseIDRInput(e.target.value) })}
                        onFocus={(e) => e.target.select()}
                        className="h-9 rounded-lg text-right text-xs"
                      />
                      <Input
                        inputMode="decimal"
                        value={formatIDRInput(p.cost || 0)}
                        onChange={(e) => updatePreset(p.id, { cost: parseIDRInput(e.target.value) })}
                        onFocus={(e) => e.target.select()}
                        className="h-9 rounded-lg text-right text-xs"
                      />
                    </div>
                    <div className="flex justify-end">
                      <button
                        onClick={() => setEditingId(null)}
                        className="text-xs text-muted-foreground hover:text-foreground"
                      >
                        Selesai
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="text-sm font-medium truncate">{p.name}</div>
                      <div className="flex gap-3 text-xs text-muted-foreground">
                        <span>Harga {formatIDR(p.price)}</span>
                        <span>Modal {formatIDR(p.cost || 0)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => setEditingId(p.id)} aria-label={`Edit preset ${p.name}`} className="tap tap-target inline-flex items-center justify-center text-muted-foreground hover:text-foreground rounded-full">
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                      </button>
                      <button onClick={() => remove(p.id)} aria-label={`Hapus preset ${p.name}`} className="tap tap-target inline-flex items-center justify-center text-muted-foreground hover:text-destructive rounded-full">
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </Section>
  );
}


function BackupSection() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [importChoiceOpen, setImportChoiceOpen] = useState(false);
  const [replaceConfirmOpen, setReplaceConfirmOpen] = useState(false);
  const [wipeConfirmOpen, setWipeConfirmOpen] = useState(false);

  async function doExport() {
    try {
      const data = await db.exportAll();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `notaku-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Defer revoke so Safari/iOS finishes the download.
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal export.");
    }
  }
  async function doImport(file: File, mode: "merge" | "replace") {
    try {
      const text = await file.text();
      await db.importAll(JSON.parse(text), mode);
      qc.invalidateQueries();
      toast.success("Berhasil import.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal import: format tidak valid.");
      if (import.meta.env.DEV) console.error(e);
    }
  }

  function triggerFilePicker(mode: "merge" | "replace") {
    if (!fileRef.current) return;
    fileRef.current.setAttribute("data-mode", mode);
    fileRef.current.click();
  }

  async function doWipe() {
    try {
      await db.wipe();
      qc.invalidateQueries();
      toast.success("Data direset.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal reset.");
    }
  }

  return (
    <Section title="Cadangan">
      <Card className="p-3 space-y-2">
        <div className="grid grid-cols-3 gap-2">
          <Button variant="outline" onClick={doExport} className="tap rounded-xl"><Download className="h-4 w-4" /> Export</Button>
          <Button
            variant="outline"
            className="tap rounded-xl"
            onClick={() => setImportChoiceOpen(true)}
          >
            <Upload className="h-4 w-4" /> Import
          </Button>
          <Button
            variant="outline"
            className="tap rounded-xl text-destructive hover:text-destructive"
            onClick={() => setWipeConfirmOpen(true)}
          >
            <RotateCcw className="h-4 w-4" /> Reset
          </Button>
        </div>
        <input
          ref={fileRef} type="file" accept="application/json" className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            const mode = (fileRef.current?.getAttribute("data-mode") as "merge" | "replace") || "replace";
            if (f) doImport(f, mode);
            e.target.value = "";
          }}
        />
      </Card>

      <ChoiceModal
        open={importChoiceOpen}
        onClose={() => setImportChoiceOpen(false)}
        title="Mode import"
        description="Pilih cara menggabungkan data dari file."
        options={[
          {
            label: "Merge",
            description: "Tambah data baru, tidak menimpa yang ada.",
            onSelect: () => triggerFilePicker("merge"),
          },
          {
            label: "Replace",
            description: "Timpa SEMUA data dengan isi file.",
            variant: "destructive",
            onSelect: () => setReplaceConfirmOpen(true),
          },
        ]}
      />

      <TypedConfirmModal
        open={replaceConfirmOpen}
        onClose={() => setReplaceConfirmOpen(false)}
        title="Konfirmasi Replace"
        description="Mode REPLACE akan MENIMPA semua data Notaku dengan isi file."
        keyword="REPLACE"
        confirmLabel="Pilih file"
        onConfirm={() => triggerFilePicker("replace")}
      />

      <TypedConfirmModal
        open={wipeConfirmOpen}
        onClose={() => setWipeConfirmOpen(false)}
        title="Hapus semua data?"
        description="Tindakan ini menghapus seluruh data Notaku di perangkat ini dan tidak bisa dibatalkan."
        keyword="HAPUS"
        confirmLabel="Hapus semua"
        onConfirm={doWipe}
      />
    </Section>
  );
}

