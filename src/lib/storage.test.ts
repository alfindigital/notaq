import { describe, it, expect } from "vitest";
import {
  calcLineSubtotal,
  calcNoteTotals,
  sumOutstanding,
  isOverdue,
  type Note,
  type NoteItem,
} from "./storage";

function mkItem(p: Partial<NoteItem> = {}): NoteItem {
  return {
    name: "Item",
    qty: 1,
    price: 1000,
    cost: 0,
    discountType: "amount",
    discountValue: 0,
    ...p,
  };
}
function mkNote(p: Partial<Note> = {}): Note {
  return {
    id: "n1",
    number: "001",
    date: "2026-06-01T08:00:00.000Z",
    customerName: "",
    customerPhone: "",
    items: [mkItem()],
    discount: 0,
    taxType: "none",
    customTaxRate: 0,
    shippingCost: 0,
    paymentMethod: "tunai",
    cashReceived: 0,
    status: "lunas",
    dueDate: "",
    paidDate: "",
    tags: [],
    note: "",
    createdAt: "2026-06-01T08:00:00.000Z",
    updatedAt: "2026-06-01T08:00:00.000Z",
    ...p,
  };
}

describe("calcLineSubtotal", () => {
  it("tanpa diskon = qty × price", () => {
    expect(calcLineSubtotal(mkItem({ qty: 2, price: 5000 }))).toBe(10000);
  });
  it("diskon nominal dikurangi langsung", () => {
    expect(
      calcLineSubtotal(
        mkItem({ qty: 1, price: 10000, discountType: "amount", discountValue: 2000 }),
      ),
    ).toBe(8000);
  });
  it("diskon persen dihitung dari gross & dibatasi 100%", () => {
    expect(
      calcLineSubtotal(
        mkItem({ qty: 1, price: 10000, discountType: "percent", discountValue: 10 }),
      ),
    ).toBe(9000);
    expect(
      calcLineSubtotal(
        mkItem({ qty: 1, price: 10000, discountType: "percent", discountValue: 150 }),
      ),
    ).toBe(0);
  });
  it("tidak pernah negatif", () => {
    expect(
      calcLineSubtotal(
        mkItem({ qty: 1, price: 5000, discountType: "amount", discountValue: 99999 }),
      ),
    ).toBe(0);
  });
});

describe("calcNoteTotals", () => {
  it("nota sederhana: subtotal/total/modal/laba", () => {
    const t = calcNoteTotals(mkNote({ items: [mkItem({ qty: 2, price: 5000, cost: 3000 })] }));
    expect(t.subtotal).toBe(10000);
    expect(t.total).toBe(10000);
    expect(t.modal).toBe(6000);
    expect(t.laba).toBe(4000);
    expect(t.taxAmount).toBe(0);
    expect(t.shipping).toBe(0);
  });

  it("diskon level-nota mengurangi total tapi dibatasi subtotal", () => {
    const t = calcNoteTotals(mkNote({ items: [mkItem({ qty: 1, price: 10000 })], discount: 3000 }));
    expect(t.noteDiscount).toBe(3000);
    expect(t.afterDiscount).toBe(7000);
    expect(t.total).toBe(7000);

    const over = calcNoteTotals(
      mkNote({ items: [mkItem({ qty: 1, price: 10000 })], discount: 99999 }),
    );
    expect(over.noteDiscount).toBe(10000);
    expect(over.total).toBe(0);
  });

  it("PPN 11% ditambahkan ke total, bukan ke laba", () => {
    const t = calcNoteTotals(
      mkNote({ items: [mkItem({ qty: 1, price: 10000, cost: 4000 })], taxType: "ppn11" }),
    );
    expect(t.taxRate).toBe(11);
    expect(t.taxAmount).toBe(1100);
    expect(t.total).toBe(11100);
    expect(t.laba).toBe(6000); // afterDiscount(10000) − modal(4000), pajak tak masuk
  });

  it("pajak custom memakai customTaxRate", () => {
    const t = calcNoteTotals(
      mkNote({ items: [mkItem({ qty: 1, price: 20000 })], taxType: "custom", customTaxRate: 5 }),
    );
    expect(t.taxAmount).toBe(1000);
    expect(t.total).toBe(21000);
  });

  it("ongkir masuk total (pass-through) tapi tidak masuk laba", () => {
    const t = calcNoteTotals(
      mkNote({ items: [mkItem({ qty: 1, price: 10000, cost: 4000 })], shippingCost: 5000 }),
    );
    expect(t.shipping).toBe(5000);
    expect(t.total).toBe(15000);
    expect(t.laba).toBe(6000);
  });

  it("gabungan diskon-item + diskon-nota + pajak + ongkir", () => {
    const t = calcNoteTotals(
      mkNote({
        items: [
          mkItem({ qty: 1, price: 10000, cost: 4000, discountType: "percent", discountValue: 10 }),
        ], // line 9000
        discount: 1000, // afterDiscount 8000
        taxType: "ppn11", // +880
        shippingCost: 2000,
      }),
    );
    expect(t.subtotal).toBe(9000);
    expect(t.itemDiscount).toBe(1000);
    expect(t.afterDiscount).toBe(8000);
    expect(t.taxAmount).toBe(880);
    expect(t.total).toBe(8000 + 880 + 2000);
    expect(t.laba).toBe(8000 - 4000);
  });

  it("kompatibel mundur: nota tanpa field pajak/ongkir/diskon-item identik dengan hitung lama", () => {
    const legacy = {
      items: [{ name: "X", qty: 3, price: 2000, cost: 1000 }],
      discount: 1000,
    } as unknown as Note;
    const t = calcNoteTotals(legacy);
    expect(t.subtotal).toBe(6000);
    expect(t.total).toBe(5000);
    expect(t.modal).toBe(3000);
    expect(t.laba).toBe(2000);
  });
});

describe("sumOutstanding", () => {
  it("menjumlahkan total hanya nota berstatus 'belum'", () => {
    const notes = [
      mkNote({ id: "a", status: "belum", items: [mkItem({ qty: 1, price: 10000 })] }),
      mkNote({ id: "b", status: "lunas", items: [mkItem({ qty: 1, price: 50000 })] }),
      mkNote({
        id: "c",
        status: "belum",
        items: [mkItem({ qty: 2, price: 2500 })],
        shippingCost: 1000,
      }),
      mkNote({ id: "d", status: "batal", items: [mkItem({ qty: 1, price: 99999 })] }),
    ];
    expect(sumOutstanding(notes)).toBe(10000 + (5000 + 1000));
  });
  it("nol bila tak ada piutang", () => {
    expect(sumOutstanding([mkNote({ status: "lunas" })])).toBe(0);
  });
});

describe("isOverdue", () => {
  it("true hanya bila belum bayar & jatuh tempo sudah lewat", () => {
    expect(isOverdue({ status: "belum", dueDate: "2000-01-01" })).toBe(true);
    expect(isOverdue({ status: "belum", dueDate: "2999-12-31" })).toBe(false);
    expect(isOverdue({ status: "lunas", dueDate: "2000-01-01" })).toBe(false);
    expect(isOverdue({ status: "belum", dueDate: "" })).toBe(false);
  });
});
