import { supabase } from "./supabase";
import type { AppData, Order, OrderInput, Payment, PaymentInput, Receipt, ReceiptInput } from "../types";

const STORAGE_KEY = "shop-ledger-data";
const ORDER_PHOTO_BUCKET = "order-photos";

const today = new Date().toISOString().slice(0, 10);

const sampleData: AppData = {
  orders: [
    {
      id: "demo-order-1",
      orderNo: "DD-20260512-001",
      shopName: "示例店铺",
      customerName: "张三",
      orderDate: today,
      amount: 1280,
      depositAmount: 300,
      receivableAmount: 980,
      status: "ongoing",
      photoPath: "",
      photoUrl: "",
      note: "演示订单，可删除",
      createdAt: new Date().toISOString(),
    },
  ],
  receipts: [
    {
      id: "demo-receipt-1",
      orderId: "demo-order-1",
      receivedAt: today,
      amount: 800,
      method: "微信",
      note: "首付款",
      createdAt: new Date().toISOString(),
    },
  ],
  payments: [
    {
      id: "demo-payment-1",
      shopName: "示例店铺",
      paidAt: today,
      amount: 320,
      category: "采购付款",
      payee: "供应商 A",
      note: "演示支出",
      createdAt: new Date().toISOString(),
    },
  ],
};

function newId() {
  return crypto.randomUUID();
}

function cleanOrderInput(input: OrderInput): Omit<OrderInput, "photoFile"> {
  const { photoFile: _photoFile, ...order } = input;
  return order;
}

function normalizeOrderStatus(status: unknown): Order["status"] {
  return status === "paid" || status === "completed" ? "completed" : "ongoing";
}

function readLocal(): AppData {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sampleData));
    return sampleData;
  }

  return JSON.parse(raw) as AppData;
}

function writeLocal(data: AppData) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

async function getCurrentUserId() {
  if (!supabase) return null;

  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return data.user?.id ?? null;
}

async function getSignedPhotoUrl(photoPath: string) {
  if (!supabase || !photoPath) return "";

  const { data, error } = await supabase.storage.from(ORDER_PHOTO_BUCKET).createSignedUrl(photoPath, 60 * 60);
  if (error) return "";
  return data.signedUrl;
}

async function uploadOrderPhoto(file: File | null | undefined, orderId: string, userId: string | null) {
  if (!supabase || !file || !userId) return "";

  const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const photoPath = `${userId}/${orderId}/${Date.now()}.${extension}`;
  const { error } = await supabase.storage.from(ORDER_PHOTO_BUCKET).upload(photoPath, file, {
    cacheControl: "3600",
    upsert: true,
  });
  if (error) throw error;
  return photoPath;
}

const toOrder = (row: Record<string, unknown>, photoUrl = ""): Order => ({
  id: String(row.id),
  orderNo: String(row.order_no),
  shopName: String(row.shop_name),
  customerName: String(row.customer_name),
  orderDate: String(row.order_date),
  amount: Number(row.amount),
  depositAmount: Number(row.deposit_amount ?? 0),
  receivableAmount: Number(row.receivable_amount ?? Math.max(Number(row.amount) - Number(row.deposit_amount ?? 0), 0)),
  status: normalizeOrderStatus(row.status),
  photoPath: String(row.photo_path ?? ""),
  photoUrl,
  note: String(row.note ?? ""),
  createdAt: String(row.created_at),
});

const toReceipt = (row: Record<string, unknown>): Receipt => ({
  id: String(row.id),
  orderId: String(row.order_id),
  receivedAt: String(row.received_at),
  amount: Number(row.amount),
  method: row.method as Receipt["method"],
  note: String(row.note ?? ""),
  createdAt: String(row.created_at),
});

const toPayment = (row: Record<string, unknown>): Payment => ({
  id: String(row.id),
  shopName: String(row.shop_name),
  paidAt: String(row.paid_at),
  amount: Number(row.amount),
  category: row.category as Payment["category"],
  payee: String(row.payee ?? ""),
  note: String(row.note ?? ""),
  createdAt: String(row.created_at),
});

export async function loadData(): Promise<AppData> {
  if (!supabase) {
    return readLocal();
  }

  const [{ data: orders, error: ordersError }, { data: receipts, error: receiptsError }, { data: payments, error: paymentsError }] =
    await Promise.all([
      supabase.from("orders").select("*").order("created_at", { ascending: false }),
      supabase.from("receipts").select("*").order("received_at", { ascending: false }),
      supabase.from("payments").select("*").order("paid_at", { ascending: false }),
    ]);

  const error = ordersError ?? receiptsError ?? paymentsError;
  if (error) throw error;

  const mappedOrders = await Promise.all(
    (orders ?? []).map(async (order) => toOrder(order, await getSignedPhotoUrl(String(order.photo_path ?? "")))),
  );

  return {
    orders: mappedOrders,
    receipts: (receipts ?? []).map(toReceipt),
    payments: (payments ?? []).map(toPayment),
  };
}

export async function saveOrder(input: OrderInput): Promise<Order> {
  if (!supabase) {
    const data = readLocal();
    const order: Order = { ...cleanOrderInput(input), id: newId(), photoUrl: "", createdAt: new Date().toISOString() };
    writeLocal({ ...data, orders: [order, ...data.orders] });
    return order;
  }

  const userId = await getCurrentUserId();
  const orderId = newId();
  const photoPath = await uploadOrderPhoto(input.photoFile, orderId, userId);
  const { data, error } = await supabase
    .from("orders")
    .insert({
      id: orderId,
      user_id: userId,
      order_no: input.orderNo,
      shop_name: input.shopName,
      customer_name: input.customerName,
      order_date: input.orderDate,
      amount: input.amount,
      deposit_amount: input.depositAmount,
      receivable_amount: input.receivableAmount,
      status: input.status,
      photo_path: photoPath || input.photoPath,
      note: input.note,
    })
    .select()
    .single();

  if (error) throw error;
  return toOrder(data, await getSignedPhotoUrl(String(data.photo_path ?? "")));
}

export async function updateOrder(id: string, input: OrderInput): Promise<Order> {
  if (!supabase) {
    const data = readLocal();
    const nextOrder = cleanOrderInput(input);
    writeLocal({
      ...data,
      orders: data.orders.map((order) => (order.id === id ? { ...order, ...nextOrder, photoUrl: "" } : order)),
    });
    return { ...nextOrder, id, photoUrl: "", createdAt: new Date().toISOString() };
  }

  const userId = await getCurrentUserId();
  const uploadedPhotoPath = await uploadOrderPhoto(input.photoFile, id, userId);
  const { data, error } = await supabase
    .from("orders")
    .update({
      order_no: input.orderNo,
      shop_name: input.shopName,
      customer_name: input.customerName,
      order_date: input.orderDate,
      amount: input.amount,
      deposit_amount: input.depositAmount,
      receivable_amount: input.receivableAmount,
      status: input.status,
      photo_path: uploadedPhotoPath || input.photoPath,
      note: input.note,
    })
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return toOrder(data, await getSignedPhotoUrl(String(data.photo_path ?? "")));
}

export async function removeOrder(id: string): Promise<void> {
  if (!supabase) {
    const data = readLocal();
    writeLocal({
      orders: data.orders.filter((order) => order.id !== id),
      receipts: data.receipts.filter((receipt) => receipt.orderId !== id),
      payments: data.payments,
    });
    return;
  }

  const { error } = await supabase.from("orders").delete().eq("id", id);
  if (error) throw error;
}

export async function saveReceipt(input: ReceiptInput): Promise<Receipt> {
  if (!supabase) {
    const data = readLocal();
    const receipt: Receipt = { ...input, id: newId(), createdAt: new Date().toISOString() };
    writeLocal({ ...data, receipts: [receipt, ...data.receipts] });
    return receipt;
  }

  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("receipts")
    .insert({
      user_id: userId,
      order_id: input.orderId,
      received_at: input.receivedAt,
      amount: input.amount,
      method: input.method,
      note: input.note,
    })
    .select()
    .single();

  if (error) throw error;
  return toReceipt(data);
}

export async function removeReceipt(id: string): Promise<void> {
  if (!supabase) {
    const data = readLocal();
    writeLocal({ ...data, receipts: data.receipts.filter((receipt) => receipt.id !== id) });
    return;
  }

  const { error } = await supabase.from("receipts").delete().eq("id", id);
  if (error) throw error;
}

export async function savePayment(input: PaymentInput): Promise<Payment> {
  if (!supabase) {
    const data = readLocal();
    const payment: Payment = { ...input, id: newId(), createdAt: new Date().toISOString() };
    writeLocal({ ...data, payments: [payment, ...data.payments] });
    return payment;
  }

  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("payments")
    .insert({
      user_id: userId,
      shop_name: input.shopName,
      paid_at: input.paidAt,
      amount: input.amount,
      category: input.category,
      payee: input.payee,
      note: input.note,
    })
    .select()
    .single();

  if (error) throw error;
  return toPayment(data);
}

export async function removePayment(id: string): Promise<void> {
  if (!supabase) {
    const data = readLocal();
    writeLocal({ ...data, payments: data.payments.filter((payment) => payment.id !== id) });
    return;
  }

  const { error } = await supabase.from("payments").delete().eq("id", id);
  if (error) throw error;
}
