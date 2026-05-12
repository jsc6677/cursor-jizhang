import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { BarChart3, Download, LogOut, Pencil, Plus, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { allowedEmailText, isAllowedEmail } from "./lib/access";
import { isSupabaseConfigured, supabase } from "./lib/supabase";
import { loadData, removeOrder, removePayment, removeReceipt, saveOrder, savePayment, saveReceipt, updateOrder } from "./lib/storage";
import type { AppData, Order, OrderInput, OrderStatus, PaymentInput, ReceiptInput } from "./types";

const emptyData: AppData = { orders: [], receipts: [], payments: [] };

const orderStatusText: Record<OrderStatus, string> = {
  ongoing: "进行中",
  completed: "完成",
};

const today = new Date().toISOString().slice(0, 10);

function currency(value: number) {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    maximumFractionDigits: 2,
  }).format(value);
}

function buildOrderNo() {
  return new Date().toISOString().slice(0, 10).replaceAll("-", "");
}

function getErrorMessage(err: unknown) {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return "操作失败";
}

function getOrderIdFromHash() {
  const match = window.location.hash.match(/^#\/orders\/(.+)$/);
  return match ? decodeURIComponent(match[1]) : null;
}

function getSpreadsheetViewUrl(url: string, path: string) {
  const extension = path.split(".").pop()?.toLowerCase();
  if (extension === "xls" || extension === "xlsx") {
    return `https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(url)}`;
  }
  return url;
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(isSupabaseConfigured);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [activeTab, setActiveTab] = useState<"orders" | "receipts" | "payments" | "reports">("orders");
  const [data, setData] = useState<AppData>(emptyData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(() => getOrderIdFromHash());

  async function refresh() {
    setLoading(true);
    setError("");
    try {
      setData(await loadData());
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!supabase) {
      void refresh();
      return;
    }

    supabase.auth.getSession().then(({ data: authData }) => {
      setSession(authData.session);
      setAuthLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (newSession) void refresh();
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured || session) void refresh();
  }, [session]);

  useEffect(() => {
    const handleHashChange = () => setSelectedOrderId(getOrderIdFromHash());
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  const receiptsByOrder = useMemo(() => {
    return data.receipts.reduce<Record<string, number>>((acc, receipt) => {
      acc[receipt.orderId] = (acc[receipt.orderId] ?? 0) + receipt.amount;
      return acc;
    }, {});
  }, [data.receipts]);

  const stats = useMemo(() => {
    const activeOrders = data.orders;
    const sales = activeOrders.reduce((sum, order) => sum + order.amount, 0);
    const deposits = activeOrders.reduce((sum, order) => sum + order.depositAmount, 0);
    const received = data.receipts.reduce((sum, receipt) => sum + receipt.amount, deposits);
    const paid = data.payments.reduce((sum, payment) => sum + payment.amount, 0);
    return {
      orderCount: activeOrders.length,
      sales,
      received,
      outstanding: Math.max(sales - received, 0),
      paid,
      profit: received - paid,
    };
  }, [data]);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;

    setMessage("");
    setError("");
    const { error: signInError } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.href },
    });
    if (signInError) {
      setError(signInError.message);
      return;
    }
    setMessage("登录链接已发送到邮箱，请打开邮件完成登录。");
  }

  async function mutate(action: () => Promise<unknown>) {
    setError("");
    try {
      await action();
      await refresh();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  function exportCsv() {
    const rows = [
      ["类型", "送货日期", "经办人", "对象", "金额", "已收款", "代收款", "状态/方式", "备注"],
      ...data.orders.map((order) => [
        "订单",
        order.orderDate,
        order.shopName,
        order.customerName,
        String(order.amount),
        String(order.depositAmount),
        String(order.receivableAmount),
        orderStatusText[order.status],
        order.note,
      ]),
      ...data.receipts.map((receipt) => {
        const order = data.orders.find((item) => item.id === receipt.orderId);
        return ["收款", receipt.receivedAt, order?.shopName ?? "", order?.customerName ?? "", String(receipt.amount), "", "", receipt.method, receipt.note];
      }),
      ...data.payments.map((payment) => [
        "付款",
        payment.paidAt,
        payment.shopName,
        payment.payee,
        String(payment.amount),
        "",
        "",
        payment.category,
        payment.note,
      ]),
    ];

    const csv = rows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(",")).join("\n");
    const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `店铺记账-${today}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  if (authLoading) {
    return <div className="center-card">正在检查登录状态...</div>;
  }

  if (isSupabaseConfigured && !session) {
    return (
      <main className="auth-page">
        <section className="auth-card">
          <div className="brand-mark">
            <ShieldCheck size={28} />
          </div>
          <h1>中合订单管理</h1>
          <p>请输入邮箱获取登录链接。登录后即可登记订单、收款和付款。</p>
          <form onSubmit={handleLogin} className="stack">
            <label>
              邮箱
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required />
            </label>
            <button type="submit">发送登录链接</button>
          </form>
          {message && <p className="success">{message}</p>}
          {error && <p className="error">{error}</p>}
        </section>
      </main>
    );
  }

  if (isSupabaseConfigured && session && !isAllowedEmail(session.user.email)) {
    return (
      <main className="auth-page">
        <section className="auth-card">
          <div className="brand-mark">
            <ShieldCheck size={28} />
          </div>
          <h1>无访问权限</h1>
          <p>当前邮箱 {session.user.email} 不在白名单内，不能使用这个订单系统。</p>
          <p>允许登录的邮箱：{allowedEmailText()}</p>
          <button type="button" onClick={() => void supabase?.auth.signOut()}>
            退出登录
          </button>
        </section>
      </main>
    );
  }

  const selectedOrder = selectedOrderId ? data.orders.find((order) => order.id === selectedOrderId) : null;
  if (selectedOrderId) {
    return (
      <main className="app-shell">
        <header className="hero compact-hero">
          <div>
            <p className="eyebrow">订单详情</p>
            <h1>中合订单管理</h1>
            <p>更新后请及时导出！避免丢失数据！</p>
          </div>
          <div className="hero-actions">
            <a className="secondary button-link" href="#">
              返回订单列表
            </a>
            <button className="secondary" onClick={() => void refresh()} disabled={loading}>
              <RefreshCw size={16} />
              刷新
            </button>
          </div>
        </header>
        {error && <div className="notice error">{error}</div>}
        {selectedOrder ? (
          <OrderDetailPage
            order={selectedOrder}
            receivedAmount={receiptsByOrder[selectedOrder.id] ?? 0}
          />
        ) : (
          <section className="card detail-card">
            <h2>没有找到这个订单</h2>
            <p className="muted-text">订单可能已删除，或数据还在加载。可以刷新后再试。</p>
          </section>
        )}
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">{isSupabaseConfigured ? "Supabase 数据库模式" : "本地演示模式"}</p>
          <h1>中合订单管理</h1>
          <p>更新后请及时导出！避免丢失数据！</p>
        </div>
        <div className="hero-actions">
          <button className="secondary" onClick={() => void refresh()} disabled={loading}>
            <RefreshCw size={16} />
            刷新
          </button>
          <button className="secondary" onClick={exportCsv}>
            <Download size={16} />
            导出 CSV
          </button>
          {supabase && (
            <button className="secondary" onClick={() => void supabase?.auth.signOut()}>
              <LogOut size={16} />
              退出
            </button>
          )}
        </div>
      </header>

      {error && <div className="notice error">{error}</div>}

      <section className="stat-grid">
        <StatCard label="订单数" value={`${stats.orderCount} 单`} />
        <StatCard label="订单总额" value={currency(stats.sales)} />
        <StatCard label="已收款" value={currency(stats.received)} />
        <StatCard label="未收款" value={currency(stats.outstanding)} tone="warning" />
        <StatCard label="总支出" value={currency(stats.paid)} />
        <StatCard label="现金利润" value={currency(stats.profit)} tone={stats.profit >= 0 ? "good" : "warning"} />
      </section>

      <nav className="tabs">
        <button className={activeTab === "orders" ? "active" : ""} onClick={() => setActiveTab("orders")}>订单</button>
        <button className={activeTab === "receipts" ? "active" : ""} onClick={() => setActiveTab("receipts")}>收款</button>
        <button className={activeTab === "payments" ? "active" : ""} onClick={() => setActiveTab("payments")}>付款</button>
        <button className={activeTab === "reports" ? "active" : ""} onClick={() => setActiveTab("reports")}>报表</button>
      </nav>

      {activeTab === "orders" && (
        <OrdersPanel
          data={data}
          receiptsByOrder={receiptsByOrder}
          onAdd={(input) => mutate(() => saveOrder(input))}
          onUpdate={(id, input) => mutate(() => updateOrder(id, input))}
          onRemove={(id) => mutate(() => removeOrder(id))}
        />
      )}
      {activeTab === "receipts" && (
        <ReceiptsPanel
          data={data}
          onAdd={(input) => mutate(() => saveReceipt(input))}
          onRemove={(id) => mutate(() => removeReceipt(id))}
        />
      )}
      {activeTab === "payments" && (
        <PaymentsPanel
          data={data}
          onAdd={(input) => mutate(() => savePayment(input))}
          onRemove={(id) => mutate(() => removePayment(id))}
        />
      )}
      {activeTab === "reports" && <ReportsPanel data={data} receiptsByOrder={receiptsByOrder} />}
    </main>
  );
}

function StatCard({ label, value, tone }: { label: string; value: string; tone?: "good" | "warning" }) {
  return (
    <article className={`stat-card ${tone ?? ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function OrderDetailPage({
  order,
  receivedAmount,
}: {
  order: Order;
  receivedAmount: number;
}) {
  const totalReceived = order.depositAmount + receivedAmount;
  const outstanding = Math.max(order.amount - totalReceived, 0);

  return (
    <section className="detail-layout">
      <article className="card detail-card">
        <div className="detail-title">
          <div>
            <p className="eyebrow dark">订单号</p>
            <h2>{order.orderNo}</h2>
          </div>
          <span className={`badge ${order.status}`}>{orderStatusText[order.status]}</span>
        </div>
        <div className="detail-grid">
          <DetailItem label="送货日期" value={order.orderDate} />
          <DetailItem label="经办人" value={order.shopName} />
          <DetailItem label="客户" value={order.customerName} />
          <DetailItem label="订单金额" value={currency(order.amount)} />
          <DetailItem label="已收款" value={currency(order.depositAmount)} />
          <DetailItem label="代收款" value={currency(order.receivableAmount)} />
          <DetailItem label="后续收款" value={currency(receivedAmount)} />
          <DetailItem label="已收合计" value={currency(totalReceived)} />
          <DetailItem label="未收款" value={currency(outstanding)} tone="warning" />
          <DetailItem label="创建时间" value={new Date(order.createdAt).toLocaleString("zh-CN")} />
        </div>
        <div className="detail-note">
          <strong>电子表格</strong>
          <p>{order.spreadsheetUrl ? <a href={order.spreadsheetUrl} target="_blank" rel="noreferrer">查看/下载电子表格</a> : "暂无电子表格"}</p>
        </div>
        <div className="detail-note">
          <strong>备注</strong>
          <p>{order.note || "无"}</p>
        </div>
      </article>

      <article className="card detail-card">
        <h2>订单照片</h2>
        {order.photoUrl ? (
          <a href={order.photoUrl} target="_blank" rel="noreferrer">
            <img className="order-photo" src={order.photoUrl} alt={`订单 ${order.orderNo}`} />
          </a>
        ) : (
          <p className="muted-text">暂无订单照片</p>
        )}
      </article>

    </section>
  );
}

function DetailItem({ label, value, tone }: { label: string; value: string; tone?: "warning" }) {
  return (
    <div className={`detail-item ${tone ?? ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function OrdersPanel({
  data,
  receiptsByOrder,
  onAdd,
  onUpdate,
  onRemove,
}: {
  data: AppData;
  receiptsByOrder: Record<string, number>;
  onAdd: (input: OrderInput) => Promise<unknown>;
  onUpdate: (id: string, input: OrderInput) => Promise<unknown>;
  onRemove: (id: string) => Promise<unknown>;
}) {
  const emptyOrderForm = (): OrderInput => ({
    orderNo: buildOrderNo(),
    shopName: "",
    customerName: "",
    orderDate: today,
    amount: 0,
    depositAmount: 0,
    receivableAmount: 0,
    status: "ongoing",
    photoPath: "",
    spreadsheetPath: "",
    photoFile: null,
    spreadsheetFile: null,
    note: "",
  });
  const [form, setForm] = useState<OrderInput>({
    ...emptyOrderForm(),
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [photoName, setPhotoName] = useState("");
  const [spreadsheetName, setSpreadsheetName] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    const confirmed = window.confirm(editingId ? "确认保存这次订单修改吗？" : "确认保存这个订单吗？");
    if (!confirmed) return;

    if (editingId) {
      await onUpdate(editingId, form);
    } else {
      await onAdd(form);
    }
    setEditingId(null);
    setPhotoName("");
    setSpreadsheetName("");
    setForm(emptyOrderForm());
  }

  function startEdit(orderId: string) {
    const order = data.orders.find((item) => item.id === orderId);
    if (!order) return;

    setEditingId(order.id);
    setPhotoName(order.photoPath ? "已上传订单照片" : "");
    setSpreadsheetName(order.spreadsheetPath ? "已上传电子表格" : "");
    setForm({
      orderNo: order.orderNo,
      shopName: order.shopName,
      customerName: order.customerName,
      orderDate: order.orderDate,
      amount: order.amount,
      depositAmount: order.depositAmount,
      receivableAmount: order.receivableAmount,
      status: order.status,
      photoPath: order.photoPath,
      spreadsheetPath: order.spreadsheetPath,
      photoFile: null,
      spreadsheetFile: null,
      note: order.note,
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setPhotoName("");
    setSpreadsheetName("");
    setForm(emptyOrderForm());
  }

  function confirmRemove(orderId: string) {
    const order = data.orders.find((item) => item.id === orderId);
    const label = order ? `${order.orderNo} / ${order.customerName}` : "这个订单";
    if (window.confirm(`确认删除 ${label} 吗？删除后无法恢复。`)) {
      void onRemove(orderId);
    }
  }

  return (
    <section className="panel-layout orders-layout">
      <form className="card form-card" onSubmit={submit}>
        <h2><Plus size={18} /> {editingId ? "编辑订单" : "新增订单"}</h2>
        <div className="field-grid">
          <TextField label="订单号" value={form.orderNo} onChange={(value) => setForm({ ...form, orderNo: value })} required />
          <TextField label="经办人" value={form.shopName} onChange={(value) => setForm({ ...form, shopName: value })} required />
          <TextField label="客户" value={form.customerName} onChange={(value) => setForm({ ...form, customerName: value })} required />
          <DateField label="送货日期" value={form.orderDate} onChange={(value) => setForm({ ...form, orderDate: value })} />
          <NumberField label="订单金额" value={form.amount} onChange={(value) => setForm({ ...form, amount: value, receivableAmount: Math.max(value - form.depositAmount, 0) })} />
          <NumberField label="已收款" value={form.depositAmount} onChange={(value) => setForm({ ...form, depositAmount: value, receivableAmount: Math.max(form.amount - value, 0) })} />
          <NumberField label="代收款" value={form.receivableAmount} onChange={(value) => setForm({ ...form, receivableAmount: value })} />
          <label>
            订单照片
            <input
              type="file"
              accept="image/*"
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                setPhotoName(file?.name ?? "");
                setForm({ ...form, photoFile: file });
              }}
            />
            {photoName && <span className="field-hint">{photoName}</span>}
          </label>
          <label>
            电子表格
            <input
              type="file"
              accept=".xls,.xlsx,.csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                setSpreadsheetName(file?.name ?? "");
                setForm({ ...form, spreadsheetFile: file });
              }}
            />
            {spreadsheetName && <span className="field-hint">{spreadsheetName}</span>}
          </label>
          <TextField label="备注" value={form.note} onChange={(value) => setForm({ ...form, note: value })} />
        </div>
        <div className="form-actions">
          <button type="submit">{editingId ? "保存修改" : "保存订单"}</button>
          {editingId && <button type="button" className="secondary plain" onClick={cancelEdit}>取消编辑</button>}
        </div>
      </form>

      <div className="card table-card">
        <h2>订单列表</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>订单号</th>
                <th>送货日期</th>
                <th>经办人</th>
                <th>客户</th>
                <th>金额</th>
                <th>已收款</th>
                <th>代收款</th>
                <th>照片</th>
                <th>电子表格</th>
                <th>状态</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.orders.map((order) => (
                <tr key={order.id}>
                  <td><a className="detail-link" href={`#/orders/${encodeURIComponent(order.id)}`}>{order.orderNo}</a></td>
                  <td>{order.orderDate}</td>
                  <td>{order.shopName}</td>
                  <td>{order.customerName}</td>
                  <td>{currency(order.amount)}</td>
                  <td>{currency(order.depositAmount)}</td>
                  <td>{currency(order.receivableAmount)}</td>
                  <td>{order.photoUrl ? <a href={order.photoUrl} target="_blank" rel="noreferrer">查看</a> : "-"}</td>
                  <td>
                    {order.spreadsheetUrl ? (
                      <div className="file-actions">
                        <a href={getSpreadsheetViewUrl(order.spreadsheetUrl, order.spreadsheetPath)} target="_blank" rel="noreferrer">
                          在线查看
                        </a>
                        <a href={order.spreadsheetUrl} target="_blank" rel="noreferrer" download>
                          下载
                        </a>
                      </div>
                    ) : "-"}
                  </td>
                  <td>
                    <select
                      className="status-select"
                      value={order.status}
                      onChange={(event) => {
                        void onUpdate(order.id, {
                          orderNo: order.orderNo,
                          shopName: order.shopName,
                          customerName: order.customerName,
                          orderDate: order.orderDate,
                          amount: order.amount,
                          depositAmount: order.depositAmount,
                          receivableAmount: order.receivableAmount,
                          status: event.target.value as OrderStatus,
                          photoPath: order.photoPath,
                          spreadsheetPath: order.spreadsheetPath,
                          photoFile: null,
                          spreadsheetFile: null,
                          note: order.note,
                        });
                      }}
                    >
                      {Object.entries(orderStatusText).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </td>
                  <td>
                    <div className="row-actions">
                      <IconButton label="编辑订单" variant="edit" onClick={() => startEdit(order.id)} />
                      <IconButton label="删除订单" onClick={() => confirmRemove(order.id)} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function ReceiptsPanel({
  data,
  onAdd,
  onRemove,
}: {
  data: AppData;
  onAdd: (input: ReceiptInput) => Promise<unknown>;
  onRemove: (id: string) => Promise<unknown>;
}) {
  const [form, setForm] = useState<ReceiptInput>({
    orderId: data.orders[0]?.id ?? "",
    receivedAt: today,
    amount: 0,
    method: "微信",
    note: "",
  });

  useEffect(() => {
    if (!form.orderId && data.orders[0]) setForm((current) => ({ ...current, orderId: data.orders[0].id }));
  }, [data.orders, form.orderId]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    await onAdd(form);
    setForm({ ...form, amount: 0, note: "" });
  }

  return (
    <section className="panel-layout">
      <form className="card form-card" onSubmit={submit}>
        <h2><Plus size={18} /> 新增收款</h2>
        <div className="field-grid">
          <label>
            对应订单
            <select value={form.orderId} onChange={(event) => setForm({ ...form, orderId: event.target.value })} required>
              <option value="" disabled>请选择订单</option>
              {data.orders.map((order) => <option key={order.id} value={order.id}>{order.orderNo} - {order.customerName}</option>)}
            </select>
          </label>
          <DateField label="收款日期" value={form.receivedAt} onChange={(value) => setForm({ ...form, receivedAt: value })} />
          <NumberField label="收款金额" value={form.amount} onChange={(value) => setForm({ ...form, amount: value })} />
          <label>
            收款方式
            <select value={form.method} onChange={(event) => setForm({ ...form, method: event.target.value as ReceiptInput["method"] })}>
              {["微信", "支付宝", "银行卡", "现金", "其他"].map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <TextField label="备注" value={form.note} onChange={(value) => setForm({ ...form, note: value })} />
        </div>
        <button type="submit" disabled={!data.orders.length}>保存收款</button>
      </form>
      <SimpleRecordTable title="收款记录" rows={data.receipts.map((receipt) => {
        const order = data.orders.find((item) => item.id === receipt.orderId);
        return {
          id: receipt.id,
          cells: [receipt.receivedAt, order?.orderNo ?? "已删除订单", order?.customerName ?? "-", currency(receipt.amount), receipt.method, receipt.note],
        };
      })} headers={["日期", "订单", "客户", "金额", "方式", "备注"]} onRemove={onRemove} />
    </section>
  );
}

function PaymentsPanel({
  data,
  onAdd,
  onRemove,
}: {
  data: AppData;
  onAdd: (input: PaymentInput) => Promise<unknown>;
  onRemove: (id: string) => Promise<unknown>;
}) {
  const [form, setForm] = useState<PaymentInput>({
    shopName: "",
    paidAt: today,
    amount: 0,
    category: "采购付款",
    payee: "",
    note: "",
  });

  async function submit(event: FormEvent) {
    event.preventDefault();
    await onAdd(form);
    setForm({ ...form, amount: 0, payee: "", note: "" });
  }

  return (
    <section className="panel-layout">
      <form className="card form-card" onSubmit={submit}>
        <h2><Plus size={18} /> 新增付款</h2>
        <div className="field-grid">
          <TextField label="经办人" value={form.shopName} onChange={(value) => setForm({ ...form, shopName: value })} required />
          <DateField label="付款日期" value={form.paidAt} onChange={(value) => setForm({ ...form, paidAt: value })} />
          <NumberField label="付款金额" value={form.amount} onChange={(value) => setForm({ ...form, amount: value })} />
          <label>
            类型
            <select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value as PaymentInput["category"] })}>
              {["采购付款", "物流付款", "退款", "人工费用", "其他支出"].map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <TextField label="收款方" value={form.payee} onChange={(value) => setForm({ ...form, payee: value })} />
          <TextField label="备注" value={form.note} onChange={(value) => setForm({ ...form, note: value })} />
        </div>
        <button type="submit">保存付款</button>
      </form>
      <SimpleRecordTable title="付款记录" rows={data.payments.map((payment) => ({
        id: payment.id,
        cells: [payment.paidAt, payment.shopName, payment.payee, currency(payment.amount), payment.category, payment.note],
      }))} headers={["日期", "经办人", "收款方", "金额", "类型", "备注"]} onRemove={onRemove} />
    </section>
  );
}

function ReportsPanel({ data, receiptsByOrder }: { data: AppData; receiptsByOrder: Record<string, number> }) {
  const shopRows = useMemo(() => {
    const shops = new Map<string, { sales: number; received: number; paid: number }>();
    data.orders.forEach((order) => {
      const row = shops.get(order.shopName) ?? { sales: 0, received: 0, paid: 0 };
      row.sales += order.amount;
      row.received += order.depositAmount + (receiptsByOrder[order.id] ?? 0);
      shops.set(order.shopName, row);
    });
    data.payments.forEach((payment) => {
      const row = shops.get(payment.shopName) ?? { sales: 0, received: 0, paid: 0 };
      row.paid += payment.amount;
      shops.set(payment.shopName, row);
    });
    return Array.from(shops.entries()).map(([shopName, row]) => ({ shopName, ...row, profit: row.received - row.paid }));
  }, [data, receiptsByOrder]);

  return (
    <section className="card table-card">
      <h2><BarChart3 size={18} /> 经办人汇总</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>经办人</th>
              <th>订单总额</th>
              <th>已收款</th>
              <th>总支出</th>
              <th>未收款</th>
              <th>现金利润</th>
            </tr>
          </thead>
          <tbody>
            {shopRows.map((row) => (
              <tr key={row.shopName}>
                <td>{row.shopName}</td>
                <td>{currency(row.sales)}</td>
                <td>{currency(row.received)}</td>
                <td>{currency(row.paid)}</td>
                <td>{currency(Math.max(row.sales - row.received, 0))}</td>
                <td>{currency(row.profit)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SimpleRecordTable({
  title,
  headers,
  rows,
  onRemove,
}: {
  title: string;
  headers: string[];
  rows: Array<{ id: string; cells: string[] }>;
  onRemove: (id: string) => Promise<unknown>;
}) {
  return (
    <div className="card table-card">
      <h2>{title}</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {headers.map((header) => <th key={header}>{header}</th>)}
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                {row.cells.map((cell, index) => <td key={`${row.id}-${index}`}>{cell}</td>)}
                <td><IconButton label="删除记录" onClick={() => void onRemove(row.id)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TextField({ label, value, onChange, required }: { label: string; value: string; onChange: (value: string) => void; required?: boolean }) {
  return (
    <label>
      {label}
      <input value={value} onChange={(event) => onChange(event.target.value)} required={required} />
    </label>
  );
}

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label>
      {label}
      <input type="date" value={value} onChange={(event) => onChange(event.target.value)} required />
    </label>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label>
      {label}
      <input type="number" min="0" step="0.01" value={value} onChange={(event) => onChange(Number(event.target.value))} required />
    </label>
  );
}

function IconButton({ label, onClick, variant = "danger" }: { label: string; onClick: () => void; variant?: "danger" | "edit" }) {
  return (
    <button className={`icon-button ${variant}`} type="button" aria-label={label} onClick={onClick}>
      {variant === "edit" ? <Pencil size={15} /> : <Trash2 size={15} />}
    </button>
  );
}
