"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDocs,
  writeBatch,
  query,
  orderBy,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase"; // adjust path if needed

// ─── Types ────────────────────────────────────────────────────────────────────

interface AdminUser { username: string; password: string; name: string; }

interface Technician { id: string; name: string; phone: string; }

interface Customer {
  id: string;
  name: string;
  address: string;
  phone: string;
  amcMonth: string;
  amcPrice: string;
}

interface Task {
  id: string;
  name: string;
  address: string;
  phone: string;
  type: string;
  techId: string;
  status: StatusKey;
  createdAt: Timestamp | null;
}

type StatusKey = "pending" | "inprogress" | "done";

interface StatusMeta { label: string; bg: string; text: string; }
interface SelectOption { value: string; label: string; }

// ─── Constants ────────────────────────────────────────────────────────────────

const ADMIN_USER: AdminUser = { username: "admin", password: "admin123", name: "Admin" };

const TECHNICIANS: Technician[] = [
  { id: "ravi",   name: "Ravi",   phone: "919203943921" },
  { id: "deepak", name: "Deepak", phone: "919283029302" },
];

const TASK_TYPES: string[] = ["New RO", "Per Visit", "Quotation", "Complaint"];

const STATUS = {
  PENDING:    "pending"    as const,
  INPROGRESS: "inprogress" as const,
  DONE:       "done"       as const,
};

const STATUS_LABEL: Record<StatusKey, StatusMeta> = {
  pending:    { label: "Pending",     bg: "bg-amber-100",   text: "text-amber-700"   },
  inprogress: { label: "In Progress", bg: "bg-blue-100",    text: "text-blue-700"    },
  done:       { label: "Done",        bg: "bg-emerald-100", text: "text-emerald-700" },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeSheetId(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const match = trimmed.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (match?.[1]) return match[1];
  const queryMatch = trimmed.match(/[?&]id=([a-zA-Z0-9-_]+)/);
  if (queryMatch?.[1]) return queryMatch[1];
  return trimmed;
}

function parseSheetValues(values: string[][], sheetId: string): Omit<Customer, "id">[] {
  if (!values || values.length === 0) return [];
  const headers = values[0].map((h) => h.toString().toLowerCase().trim());
  const rows = values.slice(1).filter((row) => row.some((c) => c.toString().trim() !== ""));
  return rows.map((row) => {
    const m: Record<string, string> = {};
    headers.forEach((h, ci) => { m[h] = row[ci]?.toString().trim() ?? ""; });
    return {
      name:     m["name"] || m["customer"] || "",
      address:  m["address"] || "",
      phone:    m["phone"] || m["mobile"] || m["contact"] || "",
      amcMonth: m["month of new amc"] || m["amc month"] || m["amc"] || "",
      amcPrice: m["price"] || m["price of amc"] || m["amc price"] || "",
      _sheetId: sheetId,
    } as Omit<Customer, "id"> & { _sheetId: string };
  });
}

function buildWhatsAppUrl(techPhone: string, task: Task): string {
  const msg = `*New Task Assigned*\nName: ${task.name}\nAddress: ${task.address}\nPhone: ${task.phone}\nType: ${task.type}`;
  return `https://wa.me/${techPhone}?text=${encodeURIComponent(msg)}`;
}

// API key stays in localStorage only — never sent to Firestore
function loadSetting(key: string, fallback: string): string {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}
function saveSetting(key: string, val: string): void {
  try { localStorage.setItem(key, val); } catch {}
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Badge({ status }: { status: StatusKey }) {
  const s = STATUS_LABEL[status] ?? STATUS_LABEL.pending;
  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${s.bg} ${s.text}`}>
      {s.label}
    </span>
  );
}

interface InputProps {
  label: string; value: string;
  onChange: (v: string) => void;
  placeholder?: string; type?: string;
}
function Input({ label, value, onChange, placeholder, type = "text" }: InputProps) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <input
        type={type} value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1.5 w-full rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
      />
    </label>
  );
}

interface SelectProps {
  label: string; value: string;
  onChange: (v: string) => void;
  options: SelectOption[];
}
function Select({ label, value, onChange, options }: SelectProps) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <select
        value={value} onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 w-full rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function Home() {
  // Auth
  const [loggedIn, setLoggedIn]   = useState<boolean>(false);
  const [username, setUsername]   = useState<string>("");
  const [password, setPassword]   = useState<string>("");
  const [authError, setAuthError] = useState<string>("");

  // Sheet settings (localStorage only — contains API key)
  const [sheetId, setSheetId] = useState<string>("");
  const [apiKey, setApiKey]   = useState<string>("");
  const [range, setRange]     = useState<string>("Sheet1!A1:F200");
  const [sheetLoading, setSheetLoading] = useState<boolean>(false);
  const [sheetError, setSheetError]     = useState<string>("");

  // Firestore data
  const [tasks, setTasks]                   = useState<Task[]>([]);
  const [sheetCustomers, setSheetCustomers] = useState<Customer[]>([]);
  const [firestoreLoading, setFirestoreLoading] = useState<boolean>(true);

  // Task form
  const [search, setSearch]           = useState<string>("");
  const [taskName, setTaskName]       = useState<string>("");
  const [taskAddress, setTaskAddress] = useState<string>("");
  const [taskPhone, setTaskPhone]     = useState<string>("");
  const [taskType, setTaskType]       = useState<string>(TASK_TYPES[0]);
  const [taskTech, setTaskTech]       = useState<string>(TECHNICIANS[0].id);
  const [taskError, setTaskError]     = useState<string>("");

  // UI
  const [tab, setTab]                   = useState<string>("tasks");
  const [page, setPage]                 = useState<number>(1);
  const [pageSize, setPageSize]         = useState<number>(10);
  const [filterStatus, setFilterStatus] = useState<string>("all");

  // ── Load localStorage settings ─────────────────────────────────────────────
  useEffect(() => {
    setLoggedIn(loadSetting("wpd-loggedIn", "") === "true");
    setSheetId(loadSetting("wpd-sheetId", ""));
    setApiKey(loadSetting("wpd-apiKey", ""));
    setRange(loadSetting("wpd-range", "Sheet1!A1:F200"));
  }, []);

  useEffect(() => { saveSetting("wpd-loggedIn", String(loggedIn)); }, [loggedIn]);
  useEffect(() => { saveSetting("wpd-sheetId", sheetId); }, [sheetId]);
  useEffect(() => { saveSetting("wpd-apiKey", apiKey); }, [apiKey]);
  useEffect(() => { saveSetting("wpd-range", range); }, [range]);

  // ── Firestore: real-time task listener ────────────────────────────────────
  useEffect(() => {
    const q = query(collection(db, "tasks"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setTasks(
          snap.docs.map((d) => ({
            id:        d.id,
            name:      d.data().name      ?? "",
            address:   d.data().address   ?? "",
            phone:     d.data().phone     ?? "",
            type:      d.data().type      ?? "",
            techId:    d.data().techId    ?? "",
            status:    (d.data().status   ?? STATUS.PENDING) as StatusKey,
            createdAt: d.data().createdAt ?? null,
          })),
        );
        setFirestoreLoading(false);
      },
      () => setFirestoreLoading(false),
    );
    return () => unsub();
  }, []);

  // ── Firestore: load customers once ────────────────────────────────────────
  useEffect(() => {
    getDocs(collection(db, "customers"))
      .then((snap) =>
        setSheetCustomers(
          snap.docs.map((d) => ({
            id:       d.id,
            name:     d.data().name      ?? "",
            address:  d.data().address   ?? "",
            phone:    d.data().phone     ?? "",
            amcMonth: d.data().amcMonth  ?? "",
            amcPrice: d.data().amcPrice  ?? "",
          })),
        ),
      )
      .catch(() => {});
  }, []);

  // ── Derived ────────────────────────────────────────────────────────────────
  const filteredTasks = useMemo(() => {
    if (filterStatus !== "all") return tasks.filter((t) => t.status === filterStatus);
    return tasks;
  }, [tasks, filterStatus]);

  const totalPages = Math.max(1, Math.ceil(filteredTasks.length / pageSize));
  const pageTasks  = useMemo(
    () => filteredTasks.slice((page - 1) * pageSize, page * pageSize),
    [filteredTasks, page, pageSize],
  );

  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);
  useEffect(() => { setPage(1); }, [filterStatus, pageSize]);

  const searchResults = useMemo<Customer[]>(() => {
    const q = search.trim().toLowerCase();
    if (!q || !sheetCustomers.length) return [];
    return sheetCustomers
      .filter((c) => c.name.toLowerCase().includes(q) || c.address.toLowerCase().includes(q))
      .slice(0, 6);
  }, [search, sheetCustomers]);

  const stats = useMemo(() => ({
    total:      tasks.length,
    pending:    tasks.filter((t) => t.status === STATUS.PENDING).length,
    inprogress: tasks.filter((t) => t.status === STATUS.INPROGRESS).length,
    done:       tasks.filter((t) => t.status === STATUS.DONE).length,
  }), [tasks]);

  // ── Auth ───────────────────────────────────────────────────────────────────
  const handleLogin = () => {
    if (username === ADMIN_USER.username && password === ADMIN_USER.password) {
      setLoggedIn(true); setAuthError(""); setUsername(""); setPassword("");
    } else {
      setAuthError("Invalid username or password.");
    }
  };

  // ── Sheet → Firestore ──────────────────────────────────────────────────────
  const fetchSheet = async () => {
    setSheetError(""); setSheetLoading(true);
    try {
      const id = normalizeSheetId(sheetId);
      if (!id)            throw new Error("Enter a valid Sheet ID or URL.");
      if (!apiKey.trim()) throw new Error("Enter your Google API key.");

      const res = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent(range)}?majorDimension=ROWS&key=${apiKey}`,
      );
      const body = await res.json().catch(() => ({})) as {
        values?: string[][];
        error?: { message?: string };
      };
      if (!res.ok) throw new Error(body.error?.message ?? `HTTP ${res.status}`);
      if (!Array.isArray(body.values)) throw new Error("No data returned. Check sheet visibility and range.");

      const parsed = parseSheetValues(body.values, id);

      // Replace all customers in Firestore with new import
      const oldSnap = await getDocs(collection(db, "customers"));
      const batch   = writeBatch(db);
      oldSnap.docs.forEach((d) => batch.delete(d.ref));
      parsed.forEach((c) => batch.set(doc(collection(db, "customers")), c));
      await batch.commit();

      // Refresh local state
      const newSnap = await getDocs(collection(db, "customers"));
      setSheetCustomers(
        newSnap.docs.map((d) => ({
          id:       d.id,
          name:     d.data().name      ?? "",
          address:  d.data().address   ?? "",
          phone:    d.data().phone     ?? "",
          amcMonth: d.data().amcMonth  ?? "",
          amcPrice: d.data().amcPrice  ?? "",
        })),
      );
    } catch (e) {
      setSheetError(e instanceof Error ? e.message : "Unknown error");
    }
    setSheetLoading(false);
  };

  // ── Task CRUD ──────────────────────────────────────────────────────────────
  const fillFromCustomer = (c: Customer) => {
    setTaskName(c.name); setTaskAddress(c.address); setTaskPhone(c.phone); setSearch("");
  };

  const addTask = async () => {
    if (!taskName.trim())    { setTaskError("Customer name is required."); return; }
    if (!taskAddress.trim()) { setTaskError("Address is required."); return; }
    if (!taskPhone.trim())   { setTaskError("Phone is required."); return; }
    try {
      await addDoc(collection(db, "tasks"), {
        name:      taskName.trim(),
        address:   taskAddress.trim(),
        phone:     taskPhone.trim(),
        type:      taskType,
        techId:    taskTech,
        status:    STATUS.PENDING,
        createdAt: serverTimestamp(),
      });
      setTaskName(""); setTaskAddress(""); setTaskPhone("");
      setTaskType(TASK_TYPES[0]); setTaskTech(TECHNICIANS[0].id);
      setTaskError(""); setSearch("");
    } catch {
      setTaskError("Failed to save task. Check your Firestore connection.");
    }
  };

  const changeStatus = async (taskId: string, newStatus: StatusKey) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    if (newStatus === STATUS.INPROGRESS) {
      const tech = TECHNICIANS.find((t) => t.id === task.techId);
      if (tech) window.open(buildWhatsAppUrl(tech.phone, task), "_blank");
    }
    try {
      await updateDoc(doc(db, "tasks", taskId), { status: newStatus });
    } catch {
      alert("Failed to update status.");
    }
  };

  const deleteTask = async (taskId: string) => {
    if (!window.confirm("Delete this task?")) return;
    try {
      await deleteDoc(doc(db, "tasks", taskId));
    } catch {
      alert("Failed to delete task.");
    }
  };

  // ── Login screen ───────────────────────────────────────────────────────────
  if (!loggedIn) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-10 w-10 rounded-2xl bg-blue-600 flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.78 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">AquaServe</h1>
              <p className="text-xs text-slate-500">Water Purifier Service</p>
            </div>
          </div>
          <h2 className="mt-6 text-2xl font-semibold text-slate-900">Admin Sign In</h2>
          <p className="mt-1 text-sm text-slate-500">Enter your credentials to continue.</p>
          <div className="mt-6 space-y-4">
            <Input label="Username" value={username} onChange={setUsername} placeholder="admin" />
            <Input label="Password" value={password} onChange={setPassword} placeholder="••••••••" type="password" />
            {authError && <div className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{authError}</div>}
            <button type="button" onClick={handleLogin}
              className="w-full rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-500">
              Sign in
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Dashboard ──────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-blue-600 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.78 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
              </svg>
            </div>
            <span className="font-bold text-slate-900">AquaServe</span>
          </div>
          <div className="flex items-center gap-3">
            {firestoreLoading && <span className="text-xs text-slate-400 animate-pulse">Syncing…</span>}
            <span className="hidden sm:block rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">Admin</span>
            <button type="button" onClick={() => { setLoggedIn(false); setAuthError(""); }}
              className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600 transition hover:bg-rose-100">
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Total",       value: stats.total,      color: "bg-slate-900 text-white" },
            { label: "Pending",     value: stats.pending,    color: "bg-amber-500 text-white" },
            { label: "In Progress", value: stats.inprogress, color: "bg-blue-600 text-white" },
            { label: "Done",        value: stats.done,       color: "bg-emerald-600 text-white" },
          ].map((s) => (
            <div key={s.label} className={`rounded-3xl p-5 ${s.color}`}>
              <p className="text-3xl font-bold">{s.value}</p>
              <p className="mt-1 text-sm opacity-80">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-2">
          {([ ["tasks","Tasks"], ["import","Sheet Import"] ] as const).map(([key, label]) => (
            <button key={key} type="button" onClick={() => setTab(key)}
              className={`rounded-2xl px-4 py-2 text-sm font-semibold transition ${
                tab === key ? "bg-slate-900 text-white" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}>{label}</button>
          ))}
        </div>

        {/* Sheet Import Tab */}
        {tab === "import" && (
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold">Google Sheets Import</h2>
            <p className="mt-1 text-sm text-slate-500">
              Customers are saved to Firestore and available across all devices. Expected headers: name, address, phone, amc month, price.
            </p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Input label="Sheet ID or URL" value={sheetId} onChange={setSheetId} placeholder="Paste Sheet URL or ID" />
              <Input label="Google API Key (saved locally only)" value={apiKey} onChange={setApiKey} placeholder="Your API key" />
              <div className="sm:col-span-2">
                <Input label="Range" value={range} onChange={setRange} placeholder="Sheet1!A1:F200" />
              </div>
            </div>
            <div className="mt-4 flex items-center gap-4">
              <button type="button" onClick={fetchSheet} disabled={sheetLoading}
                className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-50">
                {sheetLoading ? "Loading…" : "Load Sheet"}
              </button>
              {sheetCustomers.length > 0 && (
                <span className="text-sm text-emerald-600 font-medium">✓ {sheetCustomers.length} customers in Firestore</span>
              )}
            </div>
            {sheetError && <div className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{sheetError}</div>}
          </section>
        )}

        {/* Tasks Tab */}
        {tab === "tasks" && (
          <>
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold">Add New Task</h2>
              <p className="mt-1 text-sm text-slate-500">Search a customer from the sheet, or fill in manually.</p>

              <div className="mt-5 relative">
                <Input label="Search customer (from sheet)" value={search} onChange={setSearch} placeholder="Type name or address…" />
                {searchResults.length > 0 && (
                  <div className="absolute z-20 mt-1 w-full rounded-2xl border border-slate-200 bg-white shadow-lg overflow-hidden">
                    {searchResults.map((c) => (
                      <button key={c.id} type="button" onClick={() => fillFromCustomer(c)}
                        className="flex w-full flex-col gap-0.5 px-4 py-3 text-left text-sm hover:bg-slate-50 border-b border-slate-100 last:border-0">
                        <span className="font-medium text-slate-900">{c.name}</span>
                        <span className="text-slate-500 text-xs">{c.address} · {c.phone}</span>
                      </button>
                    ))}
                  </div>
                )}
                {search.trim() && !searchResults.length && sheetCustomers.length > 0 && (
                  <p className="mt-1 text-xs text-slate-400">No match — fill in manually below.</p>
                )}
                {search.trim() && !sheetCustomers.length && (
                  <p className="mt-1 text-xs text-amber-500">No sheet loaded yet. Go to Sheet Import tab.</p>
                )}
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Input label="Customer Name" value={taskName}    onChange={setTaskName}    placeholder="Full name" />
                <Input label="Phone"         value={taskPhone}   onChange={setTaskPhone}   placeholder="Mobile number" />
                <Input label="Address"       value={taskAddress} onChange={setTaskAddress} placeholder="Full address" />
                <Select label="Type" value={taskType} onChange={setTaskType}
                  options={TASK_TYPES.map((t) => ({ value: t, label: t }))} />
                <Select label="Assign Technician" value={taskTech} onChange={setTaskTech}
                  options={TECHNICIANS.map((t) => ({ value: t.id, label: t.name }))} />
              </div>

              {taskError && <div className="mt-3 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{taskError}</div>}
              <button type="button" onClick={addTask}
                className="mt-5 rounded-2xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-blue-500">
                + Add Task
              </button>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="text-lg font-semibold">All Tasks</h2>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex rounded-2xl border border-slate-200 overflow-hidden text-xs font-semibold">
                    {([ ["all","All"], ["pending","Pending"], ["inprogress","In Progress"], ["done","Done"] ] as const).map(([val, lbl]) => (
                      <button key={val} type="button" onClick={() => setFilterStatus(val)}
                        className={`px-3 py-2 transition ${filterStatus === val ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}>
                        {lbl}
                      </button>
                    ))}
                  </div>
                  <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-2 py-2 text-xs outline-none">
                    {[5,10,20,50].map((s) => <option key={s} value={s}>{s} / page</option>)}
                  </select>
                </div>
              </div>

              {/* Mobile cards */}
              <div className="mt-5 space-y-3 sm:hidden">
                {firestoreLoading ? (
                  <p className="text-sm text-slate-400 py-6 text-center animate-pulse">Loading tasks…</p>
                ) : pageTasks.length === 0 ? (
                  <p className="text-sm text-slate-400 py-6 text-center">No tasks found.</p>
                ) : pageTasks.map((task) => {
                  const tech = TECHNICIANS.find((t) => t.id === task.techId);
                  return (
                    <div key={task.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold text-slate-900">{task.name}</p>
                          <p className="text-xs text-slate-500 mt-0.5">{task.address}</p>
                        </div>
                        <Badge status={task.status} />
                      </div>
                      <div className="flex flex-wrap gap-2 text-xs text-slate-600">
                        <span className="rounded-lg bg-white border border-slate-200 px-2 py-1">{task.phone}</span>
                        <span className="rounded-lg bg-white border border-slate-200 px-2 py-1">{task.type}</span>
                        <span className="rounded-lg bg-white border border-slate-200 px-2 py-1">👷 {tech?.name}</span>
                      </div>
                      <TaskActions task={task} onStatus={changeStatus} onDelete={deleteTask} />
                    </div>
                  );
                })}
              </div>

              {/* Desktop table */}
              <div className="mt-5 hidden sm:block overflow-x-auto">
                <table className="min-w-full text-sm text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
                      {["Name","Address","Phone","Type","Technician","Status","Actions"].map((h) => (
                        <th key={h} className="px-4 py-3 border-b border-slate-200 font-semibold whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {firestoreLoading ? (
                      <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400 animate-pulse">Loading tasks…</td></tr>
                    ) : pageTasks.length === 0 ? (
                      <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400">No tasks found.</td></tr>
                    ) : pageTasks.map((task) => {
                      const tech = TECHNICIANS.find((t) => t.id === task.techId);
                      return (
                        <tr key={task.id} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="px-4 py-3 font-medium text-slate-900 whitespace-nowrap">{task.name}</td>
                          <td className="px-4 py-3 text-slate-600 max-w-xs">{task.address}</td>
                          <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{task.phone}</td>
                          <td className="px-4 py-3">
                            <span className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">{task.type}</span>
                          </td>
                          <td className="px-4 py-3 text-slate-600 whitespace-nowrap">👷 {tech?.name}</td>
                          <td className="px-4 py-3"><Badge status={task.status} /></td>
                          <td className="px-4 py-3"><TaskActions task={task} onStatus={changeStatus} onDelete={deleteTask} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {filteredTasks.length > 0 && (
                <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between text-sm text-slate-500">
                  <span>
                    Showing {Math.min((page-1)*pageSize+1, filteredTasks.length)}–{Math.min(page*pageSize, filteredTasks.length)} of {filteredTasks.length} tasks
                  </span>
                  <div className="flex gap-2">
                    <button type="button" disabled={page===1} onClick={() => setPage((p) => Math.max(1,p-1))}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium disabled:opacity-40">← Prev</button>
                    <span className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs">{page} / {totalPages}</span>
                    <button type="button" disabled={page===totalPages} onClick={() => setPage((p) => Math.min(totalPages,p+1))}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium disabled:opacity-40">Next →</button>
                  </div>
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}

// ─── Task Actions ─────────────────────────────────────────────────────────────

interface TaskActionsProps {
  task: Task;
  onStatus: (taskId: string, newStatus: StatusKey) => void;
  onDelete: (taskId: string) => void;
}

function TaskActions({ task, onStatus, onDelete }: TaskActionsProps) {
  const { status } = task;
  return (
    <div className="flex flex-wrap gap-2">
      {status === STATUS.PENDING && (
        <button type="button" onClick={() => onStatus(task.id, STATUS.INPROGRESS)}
          className="rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 transition"
          title="Send to technician via WhatsApp and mark In Progress">
          📲 Send & Start
        </button>
      )}
      {status === STATUS.INPROGRESS && (
        <button type="button" onClick={() => onStatus(task.id, STATUS.DONE)}
          className="rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 transition">
          ✓ Mark Done
        </button>
      )}
      {status === STATUS.DONE && (
        <span className="rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-400">Completed</span>
      )}
      <button type="button" onClick={() => onDelete(task.id)}
        className="rounded-xl bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-500 hover:bg-rose-100 transition">
        Delete
      </button>
    </div>
  );
}