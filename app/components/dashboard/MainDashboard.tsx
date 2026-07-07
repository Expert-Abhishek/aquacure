"use client";

import { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import TaskBoard from "./TaskBoard";
import QueryCenter from "./QueryCenter";
import { Input } from "./ui";
import {
  ADMIN_USER,
  STATUS,
  TASK_TYPES,
  TECHNICIANS,
  type Customer,
  type QueryItem,
  type StatusKey,
  type Task,
} from "./types";

interface MainDashboardProps {
  initialMenu?: "task" | "query" | "bills";
}

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
  const headers = values[0].map((header) => header.toString().toLowerCase().trim());
  const rows = values.slice(1).filter((row) => row.some((cell) => cell.toString().trim() !== ""));

  return rows.map((row) => {
    const map: Record<string, string> = {};
    headers.forEach((header, index) => {
      map[header] = row[index]?.toString().trim() ?? "";
    });

    return {
      name: map["name"] || map["customer"] || "",
      address: map["address"] || "",
      phone: map["telephone"] || map["mobile"] || map["contact"] || "",
      amcMonth: map["month of new amc"] || map["month"] || map["amc"] || "",
      amcPrice: map["2026"] || map["price of amc"] || map["amc price"] || "",
      _sheetId: sheetId,
    } as Omit<Customer, "id"> & { _sheetId: string };
  });
}

function buildWhatsAppUrl(techPhone: string, task: Task): string {
  const lines: string[] = [];
  lines.push(`Name: ${task.name}`);
  lines.push(`Address: ${task.address}`);
  if (task.sharePhone) {
    lines.push(`Phone: ${task.phone}`);
  }
  lines.push(`Type: ${task.type}`);
  if (task.amcMonth?.trim()) lines.push(`AMC Month: ${task.amcMonth}`);
  if (task.amcPrice?.trim()) lines.push(`2026 AMC Price: ${task.amcPrice}`);
  if (task.comment?.trim()) lines.push(`Note: ${task.comment}`);

  return `https://wa.me/${techPhone}?text=${encodeURIComponent(lines.join("\n"))}`;
}

function loadSetting(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function saveSetting(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

const SHEET_API_KEY = "AIzaSyAREcjS2RERBjhcMiN_SF2hIgMmjZ0H9Cw";
const SHEET_ID_CONST = "16Pq3hviILIce3ZQ9iMui2QjZgQ4-JAA-itRAKHu4YC8";
const SHEET_RANGE = "customer";

export default function MainDashboard({ initialMenu = "task" }: MainDashboardProps) {
  const [loggedIn, setLoggedIn] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");

  const [sheetLoading, setSheetLoading] = useState(false);
  const [sheetError, setSheetError] = useState("");

  const [tasks, setTasks] = useState<Task[]>([]);
  const [sheetCustomers, setSheetCustomers] = useState<Customer[]>([]);
  const [firestoreLoading, setFirestoreLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [taskName, setTaskName] = useState("");
  const [taskAddress, setTaskAddress] = useState("");
  const [taskPhone, setTaskPhone] = useState("");
  const [taskType, setTaskType] = useState(TASK_TYPES[0]);
  const [taskTech, setTaskTech] = useState(TECHNICIANS[0].id);
  const [taskError, setTaskError] = useState("");
  const [taskComment, setTaskComment] = useState("");
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentText, setEditingCommentText] = useState("");
  const [taskAmcMonth, setTaskAmcMonth] = useState("");
  const [taskAmcPrice, setTaskAmcPrice] = useState("");
  const [taskSharePhone, setTaskSharePhone] = useState(true);

  const [querySearch, setQuerySearch] = useState("");
  const [queryName, setQueryName] = useState("");
  const [queryPhone, setQueryPhone] = useState("");
  const [queryAddress, setQueryAddress] = useState("");
  const [queryComment, setQueryComment] = useState("");
  const [queryError, setQueryError] = useState("");
  const [queries, setQueries] = useState<QueryItem[]>([]);

  const [tab, setTab] = useState<"tasks" | "import">("tasks");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [filterStatus, setFilterStatus] = useState("all");
  const [activeMenu, setActiveMenu] = useState<"task" | "query" | "bills">(initialMenu);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const sidebarItems = [
    { key: "task" as const, label: "Task", description: "Active complaints and work queue" },
    { key: "query" as const, label: "Query", description: "Customer follow-ups and admin queries" },
    { key: "bills" as const, label: "Bills", description: "Billing and invoice tracking" },
  ];

  useEffect(() => {
    setLoggedIn(loadSetting("wpd-loggedIn", "") === "true");
  }, []);

  useEffect(() => {
    if (loggedIn) fetchSheet();
  }, [loggedIn]);

  useEffect(() => {
    saveSetting("wpd-loggedIn", String(loggedIn));
  }, [loggedIn]);

  useEffect(() => {
    const tasksQuery = query(collection(db, "tasks"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(
      tasksQuery,
      (snapshot) => {
        setTasks(
          snapshot.docs.map((docSnapshot) => ({
            id: docSnapshot.id,
            name: docSnapshot.data().name ?? "",
            address: docSnapshot.data().address ?? "",
            phone: docSnapshot.data().phone ?? "",
            type: docSnapshot.data().type ?? "",
            comment: docSnapshot.data().comment ?? "",
            techId: docSnapshot.data().techId ?? "",
            status: (docSnapshot.data().status ?? STATUS.PENDING) as StatusKey,
            createdAt: docSnapshot.data().createdAt ?? null,
            updatedAt: docSnapshot.data().updatedAt ?? null,
            amcMonth: docSnapshot.data().amcMonth ?? "",
            amcPrice: docSnapshot.data().amcPrice ?? "",
            sharePhone: docSnapshot.data().sharePhone ?? true,
          })),
        );
        setFirestoreLoading(false);
      },
      () => setFirestoreLoading(false),
    );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    getDocs(collection(db, "customers"))
      .then((snapshot) =>
        setSheetCustomers(
          snapshot.docs.map((docSnapshot) => ({
            id: docSnapshot.id,
            name: docSnapshot.data().name ?? "",
            address: docSnapshot.data().address ?? "",
            phone: docSnapshot.data().phone ?? "",
            amcMonth: docSnapshot.data().amcMonth ?? "",
            amcPrice: docSnapshot.data().amcPrice ?? "",
          })),
        ),
      )
      .catch(() => {});
  }, []);

  useEffect(() => {
    const queriesQuery = query(collection(db, "queries"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(
      queriesQuery,
      (snapshot) => {
        setQueries(
          snapshot.docs.map((docSnapshot) => ({
            id: docSnapshot.id,
            name: docSnapshot.data().name ?? "",
            address: docSnapshot.data().address ?? "",
            phone: docSnapshot.data().phone ?? "",
            comment: docSnapshot.data().comment ?? "",
            createdAt: docSnapshot.data().createdAt ?? null,
            updatedAt: docSnapshot.data().updatedAt ?? null,
            amcMonth: docSnapshot.data().amcMonth ?? "",
            amcPrice: docSnapshot.data().amcPrice ?? "",
            sharePhone: docSnapshot.data().sharePhone ?? true,
          })),
        );
      },
      () => {},
    );

    return () => unsubscribe();
  }, []);

  const filteredTasks = useMemo(() => {
    if (filterStatus !== "all") return tasks.filter((task) => task.status === filterStatus);
    return tasks;
  }, [tasks, filterStatus]);

  const totalPages = Math.max(1, Math.ceil(filteredTasks.length / pageSize));
  const pageTasks = useMemo(() => filteredTasks.slice((page - 1) * pageSize, page * pageSize), [filteredTasks, page, pageSize]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  useEffect(() => {
    setPage(1);
  }, [filterStatus, pageSize]);

  const searchResults = useMemo<Customer[]>(() => {
    const queryText = search.trim().toLowerCase();
    if (!queryText || !sheetCustomers.length) return [];

    return sheetCustomers
      .filter((customer) => customer.name.toLowerCase().includes(queryText) || customer.address.toLowerCase().includes(queryText))
      .slice(0, 6);
  }, [search, sheetCustomers]);

  const querySearchResults = useMemo<Customer[]>(() => {
    const queryText = querySearch.trim().toLowerCase();
    if (!queryText || !sheetCustomers.length) return [];

    return sheetCustomers
      .filter((customer) => customer.name.toLowerCase().includes(queryText) || customer.address.toLowerCase().includes(queryText))
      .slice(0, 6);
  }, [querySearch, sheetCustomers]);

  const handleLogin = () => {
    if (username === ADMIN_USER.username && password === ADMIN_USER.password) {
      setLoggedIn(true);
      setAuthError("");
      setUsername("");
      setPassword("");
    } else {
      setAuthError("Invalid username or password.");
    }
  };

  const fetchSheet = async () => {
    setSheetError("");
    setSheetLoading(true);

    try {
      const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID_CONST}/values/${encodeURIComponent(SHEET_RANGE)}?majorDimension=ROWS&key=${SHEET_API_KEY}`);
      const body = (await response.json().catch(() => ({}))) as { values?: string[][]; error?: { message?: string } };

      if (!response.ok) throw new Error(body.error?.message ?? `HTTP ${response.status}`);
      if (!Array.isArray(body.values)) throw new Error("No data returned. Check sheet visibility and range.");

      const parsed = parseSheetValues(body.values, SHEET_ID_CONST);
      const currentSnapshot = await getDocs(collection(db, "customers"));
      const batch = writeBatch(db);
      currentSnapshot.docs.forEach((docSnapshot) => batch.delete(docSnapshot.ref));
      parsed.forEach((customer) => batch.set(doc(collection(db, "customers")), customer));
      await batch.commit();

      const newSnapshot = await getDocs(collection(db, "customers"));
      setSheetCustomers(
        newSnapshot.docs.map((docSnapshot) => ({
          id: docSnapshot.id,
          name: docSnapshot.data().name ?? "",
          address: docSnapshot.data().address ?? "",
          phone: docSnapshot.data().phone ?? "",
          amcMonth: docSnapshot.data().amcMonth ?? "",
          amcPrice: docSnapshot.data().amcPrice ?? "",
        })),
      );
    } catch (error) {
      setSheetError(error instanceof Error ? error.message : "Unknown error");
    }

    setSheetLoading(false);
  };

  const fillFromCustomer = (customer: Customer) => {
    setTaskName(customer.name);
    setTaskAddress(customer.address);
    setTaskPhone(customer.phone);
    setTaskAmcMonth(customer.amcMonth);
    setTaskAmcPrice(customer.amcPrice);
    setSearch("");
  };

  const fillQueryFromCustomer = (customer: Customer) => {
    setQueryName(customer.name);
    setQueryAddress(customer.address);
    setQueryPhone(customer.phone);
    setQuerySearch("");
  };

  const addTask = async () => {
    if (!taskName.trim()) {
      setTaskError("Customer name is required.");
      return;
    }
    if (!taskAddress.trim()) {
      setTaskError("Address is required.");
      return;
    }
    if (taskSharePhone && !taskPhone.trim()) {
      setTaskError("Phone is required.");
      return;
    }

    try {
      await addDoc(collection(db, "tasks"), {
        name: taskName.trim(),
        address: taskAddress.trim(),
        phone: taskPhone.trim(),
        comment: taskComment.trim(),
        type: taskType,
        techId: taskTech,
        status: STATUS.PENDING,
        createdAt: serverTimestamp(),
        amcMonth: taskAmcMonth.trim(),
        amcPrice: taskAmcPrice.trim(),
        sharePhone: taskSharePhone,
      });

      setTaskName("");
      setTaskAddress("");
      setTaskPhone("");
      setTaskType(TASK_TYPES[0]);
      setTaskTech(TECHNICIANS[0].id);
      setTaskError("");
      setSearch("");
      setTaskComment("");
      setTaskAmcMonth("");
      setTaskAmcPrice("");
      setTaskSharePhone(true);
    } catch {
      setTaskError("Failed to save task. Check your Firestore connection.");
    }
  };

  const submitQuery = async () => {
    if (!queryName.trim()) {
      setQueryError("Customer name is required.");
      return;
    }
    if (!queryAddress.trim()) {
      setQueryError("Address is required.");
      return;
    }
    if (!queryComment.trim()) {
      setQueryError("Please add the customer query or concern.");
      return;
    }

    try {
      await addDoc(collection(db, "queries"), {
        name: queryName.trim(),
        phone: queryPhone.trim(),
        address: queryAddress.trim(),
        comment: queryComment.trim(),
        createdAt: serverTimestamp(),
      });

      setQueryName("");
      setQueryPhone("");
      setQueryAddress("");
      setQueryComment("");
      setQueryError("");
    } catch {
      setQueryError("Failed to save query. Check your Firestore connection.");
    }
  };

  const deleteQuery = async (queryId: string) => {
    if (!window.confirm("Delete this query?")) return;
    try {
      await deleteDoc(doc(db, "queries", queryId));
    } catch {
      alert("Failed to delete query.");
    }
  };

  const changeStatus = async (taskId: string, newStatus: StatusKey) => {
    const currentTask = tasks.find((task) => task.id === taskId);
    if (!currentTask) return;

    if (newStatus === STATUS.INPROGRESS) {
      const tech = TECHNICIANS.find((item) => item.id === currentTask.techId);
      if (tech) window.open(buildWhatsAppUrl(tech.phone, currentTask), "_blank");
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

  const updateComment = async (taskId: string) => {
    try {
      await updateDoc(doc(db, "tasks", taskId), {
        comment: editingCommentText.trim(),
        updatedAt: serverTimestamp(),
      });
      setEditingCommentId(null);
      setEditingCommentText("");
    } catch {
      alert("Failed to update comment.");
    }
  };

  const handleEditComment = (taskId: string, comment: string) => {
    setEditingCommentId(taskId);
    setEditingCommentText(comment);
  };

  if (!loggedIn) {
    return (
      <div className="min-h-screen bg-slate-50 px-4 py-10">
        <div className="mx-auto flex max-w-md flex-col rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="mb-2 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-600">
              <svg className="h-5 w-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
            <button type="button" onClick={handleLogin} className="w-full rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-500">
              Sign in
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950 lg:flex">
      <aside className={`fixed inset-y-0 left-0 z-30 w-72 border-r border-slate-200 bg-slate-900 p-5 text-white transition-transform duration-200 lg:static lg:translate-x-0 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-600">
            <svg className="h-5 w-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.78 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
            </svg>
          </div>
          <div>
            <p className="text-lg font-semibold">AquaServe</p>
            <p className="text-sm text-slate-300">Admin Dashboard</p>
          </div>
        </div>

        <nav className="mt-8 space-y-2">
          {sidebarItems.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => {
                setActiveMenu(item.key);
                setSidebarOpen(false);
              }}
              className={`w-full rounded-2xl px-4 py-3 text-left transition ${activeMenu === item.key ? "bg-white text-slate-900" : "text-slate-200 hover:bg-slate-800"}`}
            >
              <p className="font-semibold">{item.label}</p>
              <p className={`text-sm ${activeMenu === item.key ? "text-slate-600" : "text-slate-400"}`}>{item.description}</p>
            </button>
          ))}
        </nav>
      </aside>

      {sidebarOpen && <button type="button" aria-label="Close sidebar" onClick={() => setSidebarOpen(false)} className="fixed inset-0 z-20 bg-slate-950/40 lg:hidden" />}

      <div className="flex-1">
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
          <div className="mx-auto flex max-w-7xl items-center justify-between">
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setSidebarOpen(true)} className="rounded-xl border border-slate-200 bg-white p-2 text-slate-700 lg:hidden" aria-label="Open sidebar">
                ☰
              </button>
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600">
                <svg className="h-4 w-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.78 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                </svg>
              </div>
              <span className="font-bold text-slate-900">AquaServe</span>
            </div>
            <div className="flex items-center gap-3">
              {firestoreLoading && <span className="animate-pulse text-xs text-slate-400">Syncing…</span>}
              <span className="hidden rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 sm:block">Admin</span>
              <button type="button" onClick={() => { setLoggedIn(false); setAuthError(""); }} className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600 transition hover:bg-rose-100">
                Logout
              </button>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
          {activeMenu === "task" && (
            <div className="space-y-6">
              <div className="flex gap-2">
                {([['tasks','Tasks'], ['import','Sheet Import']] as const).map(([value, label]) => (
                  <button key={value} type="button" onClick={() => setTab(value)} className={`rounded-2xl px-4 py-2 text-sm font-semibold transition ${tab === value ? "bg-slate-900 text-white" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                    {label}
                  </button>
                ))}
              </div>

              {tab === "import" ? (
                <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                  <h2 className="text-lg font-semibold">Google Sheets Import</h2>
                  <p className="mt-1 text-sm text-slate-500">Customers are synced from Google Sheets into Firestore. Expected headers: name, address, phone, amc month, price.</p>
                  <div className="mt-4 flex items-center gap-4">
                    <button type="button" onClick={fetchSheet} disabled={sheetLoading} className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-50">
                      {sheetLoading ? "Loading…" : "↻ Reload Sheet"}
                    </button>
                    {sheetCustomers.length > 0 && <span className="text-sm font-medium text-emerald-600">✓ {sheetCustomers.length} customers loaded</span>}
                  </div>
                  {sheetError && <div className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{sheetError}</div>}
                </section>
              ) : (
                <TaskBoard
                  tasks={tasks}
                  firestoreLoading={firestoreLoading}
                  sheetCustomers={sheetCustomers}
                  search={search}
                  taskName={taskName}
                  taskAddress={taskAddress}
                  taskPhone={taskPhone}
                  taskComment={taskComment}
                  taskAmcMonth={taskAmcMonth}
                  taskAmcPrice={taskAmcPrice}
                  taskSharePhone={taskSharePhone}
                  taskType={taskType}
                  taskTech={taskTech}
                  taskError={taskError}
                  searchResults={searchResults}
                  pageSize={pageSize}
                  filterStatus={filterStatus}
                  page={page}
                  totalPages={totalPages}
                  filteredTasks={filteredTasks}
                  pageTasks={pageTasks}
                  onSearchChange={setSearch}
                  onTaskNameChange={setTaskName}
                  onTaskAddressChange={setTaskAddress}
                  onTaskPhoneChange={setTaskPhone}
                  onTaskCommentChange={setTaskComment}
                  onTaskAmcMonthChange={setTaskAmcMonth}
                  onTaskAmcPriceChange={setTaskAmcPrice}
                  onTaskSharePhoneChange={setTaskSharePhone}
                  onTaskTypeChange={setTaskType}
                  onTaskTechChange={setTaskTech}
                  onAddTask={addTask}
                  onFillFromCustomer={fillFromCustomer}
                  onFilterStatusChange={setFilterStatus}
                  onPageSizeChange={setPageSize}
                  onPageChange={setPage}
                  onUpdateComment={updateComment}
                  onEditComment={handleEditComment}
                  editingCommentId={editingCommentId}
                  editingCommentText={editingCommentText}
                  onEditingCommentTextChange={setEditingCommentText}
                  onStatusChange={changeStatus}
                  onDeleteTask={deleteTask}
                  onSetEditingCommentId={setEditingCommentId}
                />
              )}
            </div>
          )}

          {activeMenu === "query" && (
            <QueryCenter
              querySearch={querySearch}
              queryName={queryName}
              queryPhone={queryPhone}
              queryAddress={queryAddress}
              queryComment={queryComment}
              searchResults={querySearchResults}
              queries={queries}
              onQuerySearchChange={setQuerySearch}
              onQueryNameChange={setQueryName}
              onQueryPhoneChange={setQueryPhone}
              onQueryAddressChange={setQueryAddress}
              onQueryCommentChange={setQueryComment}
              onFillFromCustomer={fillQueryFromCustomer}
              onSubmitQuery={submitQuery}
              onDeleteQuery={deleteQuery}
              queryError={queryError}
            />
          )}

          {activeMenu === "bills" && (
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold">Bills Center</h2>
              <p className="mt-2 text-sm text-slate-500">Billing and invoice tracking will appear here.</p>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
