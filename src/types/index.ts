export type OrderStatus = "ongoing" | "completed";

export interface Order {
  id: string;
  orderNo: string;
  shopName: string;
  customerName: string;
  orderDate: string;
  amount: number;
  depositAmount: number;
  receivableAmount: number;
  status: OrderStatus;
  photoPath: string;
  photoUrl: string;
  spreadsheetPath: string;
  spreadsheetUrl: string;
  note: string;
  createdAt: string;
}

export interface Receipt {
  id: string;
  orderId: string;
  receivedAt: string;
  amount: number;
  method: "微信" | "支付宝" | "银行卡" | "现金" | "其他";
  note: string;
  createdAt: string;
}

export interface Payment {
  id: string;
  shopName: string;
  paidAt: string;
  amount: number;
  category: "采购付款" | "物流付款" | "退款" | "人工费用" | "其他支出";
  payee: string;
  note: string;
  createdAt: string;
}

export interface AppData {
  orders: Order[];
  receipts: Receipt[];
  payments: Payment[];
}

export type OrderInput = Omit<Order, "id" | "createdAt" | "photoUrl" | "spreadsheetUrl"> & {
  photoFile?: File | null;
  spreadsheetFile?: File | null;
};
export type ReceiptInput = Omit<Receipt, "id" | "createdAt">;
export type PaymentInput = Omit<Payment, "id" | "createdAt">;
