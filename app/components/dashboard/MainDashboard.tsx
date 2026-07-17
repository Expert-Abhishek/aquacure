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
  type Quotation,
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

function parseSheetValues(values: string[][], sheetId: string): (Omit<Customer, "id"> & { _sheetId: string; rowNum: number })[] {
  if (!values || values.length === 0) return [];
  const headers = values[0].map((header) => header.toString().toLowerCase().trim());
  const parsedRows: (Omit<Customer, "id"> & { _sheetId: string; rowNum: number })[] = [];

  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const isNotEmpty = row.some((cell) => cell.toString().trim() !== "");
    if (isNotEmpty) {
      const map: Record<string, string> = {};
      headers.forEach((header, index) => {
        map[header] = row[index]?.toString().trim() ?? "";
      });

      parsedRows.push({
        name: map["name"] || map["customer"] || "",
        address: map["address"] || "",
        phone: map["telephone"] || map["mobile"] || map["contact"] || map["phone"] || "",
        amcMonth: map["month of new amc"] || map["month"] || map["amc"] || "",
        amcPrice: map["2026"] || map["price of amc"] || map["amc price"] || "",
        _sheetId: sheetId,
        rowNum: i + 1, // Row 1 is header, data starts at Row 2 (index 1)
      });
    }
  }

  return parsedRows;
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

  // Configurable spreadsheet states
  const [sheetId, setSheetId] = useState(loadSetting("sheetId", SHEET_ID_CONST));
  const [sheetApiKey, setSheetApiKey] = useState(loadSetting("sheetApiKey", SHEET_API_KEY));
  const [sheetScriptUrl, setSheetScriptUrl] = useState(loadSetting("sheetScriptUrl", ""));

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
  const [editingTask, setEditingTask] = useState<Task | null>(null);
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

  // Customer Management and Search States
  const [sheetSearch, setSheetSearch] = useState("");
  const [sheetPage, setSheetPage] = useState(1);
  const sheetPageSize = 10;

  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [customerModalMode, setCustomerModalMode] = useState<"add" | "edit">("add");
  const [customerEditRow, setCustomerEditRow] = useState<number | null>(null);

  const [custFormName, setCustFormName] = useState("");
  const [custFormAddress, setCustFormAddress] = useState("");
  const [custFormPhone, setCustFormPhone] = useState("");
  const [custFormAmcMonth, setCustFormAmcMonth] = useState("");
  const [custFormAmcPrice, setCustFormAmcPrice] = useState("");

  const [custFormLoading, setCustFormLoading] = useState(false);
  const [custFormError, setCustFormError] = useState("");
  const [custFormSuccess, setCustFormSuccess] = useState("");

  const [tab, setTab] = useState<"tasks" | "import" | "inactive">("tasks");
  const [inactiveCustomers, setInactiveCustomers] = useState<Customer[]>([]);
  const [inactiveSearch, setInactiveSearch] = useState("");
  const [inactivePage, setInactivePage] = useState(1);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [filterStatus, setFilterStatus] = useState("all");
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [activeMenu, setActiveMenu] = useState<"task" | "query" | "bills">(initialMenu || "task");
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
            rowNum: docSnapshot.data().rowNum ?? undefined,
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

  useEffect(() => {
    const inactiveQuery = query(collection(db, "inactive_customers"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(
      inactiveQuery,
      (snapshot) => {
        setInactiveCustomers(
          snapshot.docs.map((docSnapshot) => ({
            id: docSnapshot.id,
            name: docSnapshot.data().name ?? "",
            address: docSnapshot.data().address ?? "",
            phone: docSnapshot.data().phone ?? "",
            amcMonth: docSnapshot.data().amcMonth ?? "",
            amcPrice: docSnapshot.data().amcPrice ?? "",
            rowNum: docSnapshot.data().rowNum ?? undefined,
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

  const filteredSheetCustomers = useMemo(() => {
    // Filter out manually marked inactive customers
    const activeCustomers = sheetCustomers.filter(
      (c) => !inactiveCustomers.some((ic) => ic.phone === c.phone && ic.name === c.name)
    );
    if (!sheetSearch.trim()) return activeCustomers;
    const queryStr = sheetSearch.toLowerCase();
    return activeCustomers.filter(
      (c) =>
        c.name.toLowerCase().includes(queryStr) ||
        c.phone.toLowerCase().includes(queryStr) ||
        c.address.toLowerCase().includes(queryStr)
    );
  }, [sheetSearch, sheetCustomers, inactiveCustomers]);

  const totalSheetPages = Math.ceil(filteredSheetCustomers.length / sheetPageSize) || 1;
  const pageSheetCustomers = useMemo(() => {
    const start = (sheetPage - 1) * sheetPageSize;
    return filteredSheetCustomers.slice(start, start + sheetPageSize);
  }, [sheetPage, filteredSheetCustomers]);

  useEffect(() => {
    setSheetPage(1);
  }, [sheetSearch]);

  const displayInactiveCustomers = useMemo(() => {
    // 1. Manually marked inactive customers
    const manual = inactiveCustomers.map((ic) => ({
      ...ic,
      type: "inactive" as const,
    }));

    // 2. Sheet customers with "balance" in their price
    const balance = sheetCustomers
      .filter((c) => c.amcPrice?.toLowerCase().includes("balance"))
      .filter((c) => !inactiveCustomers.some((ic) => ic.phone === c.phone && ic.name === c.name))
      .map((c) => ({
        ...c,
        type: "balance" as const,
      }));

    return [...manual, ...balance];
  }, [inactiveCustomers, sheetCustomers]);

  const filteredInactiveCustomers = useMemo(() => {
    if (!inactiveSearch.trim()) return displayInactiveCustomers;
    const queryStr = inactiveSearch.toLowerCase();
    return displayInactiveCustomers.filter(
      (c) =>
        c.name.toLowerCase().includes(queryStr) ||
        c.phone.toLowerCase().includes(queryStr) ||
        c.address.toLowerCase().includes(queryStr)
    );
  }, [inactiveSearch, displayInactiveCustomers]);

  const inactivePageSize = 10;
  const totalInactivePages = Math.ceil(filteredInactiveCustomers.length / inactivePageSize) || 1;
  const pageInactiveCustomers = useMemo(() => {
    const start = (inactivePage - 1) * inactivePageSize;
    return filteredInactiveCustomers.slice(start, start + inactivePageSize);
  }, [inactivePage, filteredInactiveCustomers]);

  useEffect(() => {
    setInactivePage(1);
  }, [inactiveSearch]);

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
      const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(SHEET_RANGE)}?majorDimension=ROWS&key=${sheetApiKey}`);
      const body = (await response.json().catch(() => ({}))) as { values?: string[][]; error?: { message?: string } };

      if (!response.ok) throw new Error(body.error?.message ?? `HTTP ${response.status}`);
      if (!Array.isArray(body.values)) throw new Error("No data returned. Check sheet visibility and range.");

      const parsed = parseSheetValues(body.values, sheetId);
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
          rowNum: docSnapshot.data().rowNum ?? undefined,
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

  const addCustomerToSheet = async (customer: { name: string; address: string; phone: string; amcMonth: string; amcPrice: string }) => {
    if (!sheetScriptUrl.trim()) {
      throw new Error("Google Apps Script Web App URL is not configured. Please set it in the settings panel below.");
    }

    const res = await fetch(sheetScriptUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({
        action: "add",
        name: customer.name,
        address: customer.address,
        phone: customer.phone,
        amcMonth: customer.amcMonth,
        amcPrice: customer.amcPrice,
      }),
    });

    const body = await res.json().catch(() => ({}));
    if (body.success === false) {
      throw new Error(body.error || "Failed to add customer to Google Sheet.");
    }
  };

  const editCustomerInSheet = async (rowNum: number, customer: { name: string; address: string; phone: string; amcMonth: string; amcPrice: string }) => {
    if (!sheetScriptUrl.trim()) {
      throw new Error("Google Apps Script Web App URL is not configured. Please set it in the settings panel below.");
    }

    const res = await fetch(sheetScriptUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({
        action: "edit",
        rowNum,
        name: customer.name,
        address: customer.address,
        phone: customer.phone,
        amcMonth: customer.amcMonth,
        amcPrice: customer.amcPrice,
      }),
    });

    const body = await res.json().catch(() => ({}));
    if (body.success === false) {
      throw new Error(body.error || "Failed to update customer in Google Sheet.");
    }
  };

  const handleOpenAddCustomer = () => {
    setCustomerModalMode("add");
    setCustomerEditRow(null);
    setCustFormName("");
    setCustFormAddress("");
    setCustFormPhone("");
    setCustFormAmcMonth("");
    setCustFormAmcPrice("");
    setCustFormError("");
    setCustFormSuccess("");
    setShowCustomerModal(true);
  };

  const handleOpenEditCustomer = (customer: Customer) => {
    setCustomerModalMode("edit");
    setCustomerEditRow(customer.rowNum || null);
    setCustFormName(customer.name);
    setCustFormAddress(customer.address);
    setCustFormPhone(customer.phone);
    setCustFormAmcMonth(customer.amcMonth);
    setCustFormAmcPrice(customer.amcPrice);
    setCustFormError("");
    setCustFormSuccess("");
    setShowCustomerModal(true);
  };

  const handleSaveCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!custFormName.trim()) {
      setCustFormError("Name is required.");
      return;
    }
    if (!custFormAddress.trim()) {
      setCustFormError("Address is required.");
      return;
    }
    if (!custFormPhone.trim()) {
      setCustFormError("Phone number is required.");
      return;
    }

    setCustFormLoading(true);
    setCustFormError("");
    setCustFormSuccess("");

    try {
      if (customerModalMode === "add") {
        await addCustomerToSheet({
          name: custFormName.trim(),
          address: custFormAddress.trim(),
          phone: custFormPhone.trim(),
          amcMonth: custFormAmcMonth.trim(),
          amcPrice: custFormAmcPrice.trim(),
        });
        setCustFormSuccess("Customer successfully added to Google Sheet!");
      } else {
        if (!customerEditRow) throw new Error("Missing row number for editing.");
        await editCustomerInSheet(customerEditRow, {
          name: custFormName.trim(),
          address: custFormAddress.trim(),
          phone: custFormPhone.trim(),
          amcMonth: custFormAmcMonth.trim(),
          amcPrice: custFormAmcPrice.trim(),
        });
        setCustFormSuccess("Customer successfully updated in Google Sheet!");
      }

      // Reload sheet details to sync back to Firestore
      await fetchSheet();

      // Close modal after delay
      setTimeout(() => {
        setShowCustomerModal(false);
      }, 1500);
    } catch (err) {
      setCustFormError(err instanceof Error ? err.message : "An error occurred.");
    } finally {
      setCustFormLoading(false);
    }
  };

  const markCustomerInactive = async (customer: Customer) => {
    try {
      await addDoc(collection(db, "inactive_customers"), {
        name: customer.name,
        address: customer.address,
        phone: customer.phone,
        amcMonth: customer.amcMonth,
        amcPrice: customer.amcPrice,
        rowNum: customer.rowNum || null,
        createdAt: serverTimestamp(),
      });
    } catch (error) {
      console.error("Error marking customer inactive:", error);
      alert("Failed to mark customer as inactive.");
    }
  };

  const markCustomerActive = async (id: string) => {
    try {
      await deleteDoc(doc(db, "inactive_customers", id));
    } catch (error) {
      console.error("Error removing customer from inactive list:", error);
      alert("Failed to remove customer from inactive list.");
    }
  };

  const startTaskEdit = (task: Task) => {
    setEditingTask({ ...task });
  };

  const cancelTaskEdit = () => {
    setEditingTask(null);
  };

  const updateEditingTask = (updates: Partial<Task>) => {
    setEditingTask((prev) => (prev ? { ...prev, ...updates } : prev));
  };

  const saveTask = async () => {
    if (!editingTask) return;
    if (!editingTask.name.trim()) {
      setTaskError("Customer name is required.");
      return;
    }
    if (!editingTask.address.trim()) {
      setTaskError("Address is required.");
      return;
    }
    if (editingTask.sharePhone && !editingTask.phone.trim()) {
      setTaskError("Phone is required.");
      return;
    }

    try {
      await updateDoc(doc(db, "tasks", editingTask.id), {
        name: editingTask.name.trim(),
        address: editingTask.address.trim(),
        phone: editingTask.phone.trim(),
        comment: editingTask.comment.trim(),
        type: editingTask.type,
        techId: editingTask.techId,
        amcMonth: editingTask.amcMonth.trim(),
        amcPrice: editingTask.amcPrice.trim(),
        sharePhone: editingTask.sharePhone,
        updatedAt: serverTimestamp(),
      });
      cancelTaskEdit();
    } catch {
      setTaskError("Failed to save task. Check your Firestore connection.");
    }
  };

  const resendTask = async (taskId: string) => {
    const currentTask = tasks.find((task) => task.id === taskId);
    if (!currentTask) return;
    const tech = TECHNICIANS.find((item) => item.id === currentTask.techId);
    if (!tech) {
      alert("Technician not assigned.");
      return;
    }

    window.open(buildWhatsAppUrl(tech.phone, currentTask), "_blank");

    try {
      await updateDoc(doc(db, "tasks", taskId), {
        status: STATUS.INPROGRESS,
        updatedAt: serverTimestamp(),
      });
    } catch {
      alert("Failed to update task status after sending.");
    }
  };

  const onEditTaskNameChange = (value: string) => updateEditingTask({ name: value });
  const onEditTaskAddressChange = (value: string) => updateEditingTask({ address: value });
  const onEditTaskPhoneChange = (value: string) => updateEditingTask({ phone: value });
  const onEditTaskCommentChange = (value: string) => updateEditingTask({ comment: value });
  const onEditTaskAmcMonthChange = (value: string) => updateEditingTask({ amcMonth: value });
  const onEditTaskAmcPriceChange = (value: string) => updateEditingTask({ amcPrice: value });
  const onEditTaskTypeChange = (value: string) => updateEditingTask({ type: value });
  const onEditTaskTechChange = (value: string) => updateEditingTask({ techId: value });
  const onEditTaskSharePhoneChange = (value: boolean) => updateEditingTask({ sharePhone: value });

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
      setSelectedTaskIds((prev) => prev.filter((id) => id !== taskId));
    } catch {
      alert("Failed to delete task.");
    }
  };

  const toggleTaskSelection = (taskId: string) => {
    setSelectedTaskIds((prev) =>
      prev.includes(taskId) ? prev.filter((id) => id !== taskId) : [...prev, taskId],
    );
  };

  const toggleSelectAll = (selectAll: boolean) => {
    if (!selectAll) {
      setSelectedTaskIds([]);
      return;
    }

    setSelectedTaskIds((prev) => [...new Set([...prev, ...pageTasks.map((task) => task.id)])]);
  };

  const deleteSelectedTasks = async () => {
    if (!selectedTaskIds.length) return;
    if (!window.confirm(`Delete ${selectedTaskIds.length} selected task(s)?`)) return;

    try {
      const batch = writeBatch(db);
      selectedTaskIds.forEach((taskId) => batch.delete(doc(db, "tasks", taskId)));
      await batch.commit();
      setSelectedTaskIds([]);
    } catch {
      alert("Failed to delete selected tasks.");
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
                {([['tasks','Tasks'], ['import','Sheet Import'], ['inactive', 'Inactive']] as const).map(([value, label]) => (
                  <button key={value} type="button" onClick={() => setTab(value)} className={`rounded-2xl px-4 py-2 text-sm font-semibold transition ${tab === value ? "bg-slate-900 text-white" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                    {label}
                  </button>
                ))}
              </div>

              {tab === "import" && (
                <div className="space-y-6">
                  {/* Google Sheets Connection Settings Accordion */}
                  <details className="group rounded-3xl border border-slate-200 bg-white p-6 shadow-sm [&_summary::-webkit-details-marker]:hidden">
                    <summary className="flex cursor-pointer items-center justify-between font-semibold text-slate-900 list-none">
                      <div className="flex items-center gap-3">
                        <span className="text-xl">⚙️</span>
                        <div>
                          <h3 className="text-md font-semibold text-slate-900">Google Sheet Connection Credentials</h3>
                          <p className="text-xs text-slate-500 font-normal">Configure custom sheet IDs and API writes.</p>
                        </div>
                      </div>
                      <span className="transition group-open:rotate-180 text-slate-400">
                        <svg fill="none" height="24" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width="24"><path d="M6 9l6 6 6-6"></path></svg>
                      </span>
                    </summary>
                    <div className="mt-6 border-t border-slate-100 pt-6 space-y-4">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Input
                          label="Spreadsheet ID"
                          value={sheetId}
                          onChange={(v) => {
                            setSheetId(v);
                            saveSetting("sheetId", v);
                          }}
                          placeholder="Spreadsheet ID"
                        />
                        <Input
                          label="Sheets API Key (Read-only)"
                          value={sheetApiKey}
                          onChange={(v) => {
                            setSheetApiKey(v);
                            saveSetting("sheetApiKey", v);
                          }}
                          placeholder="API Key"
                        />
                      </div>
                      <Input
                        label="Google Apps Script Web App URL (For Add/Edit Writes)"
                        value={sheetScriptUrl}
                        onChange={(v) => {
                          setSheetScriptUrl(v);
                          saveSetting("sheetScriptUrl", v);
                        }}
                        placeholder="https://script.google.com/macros/s/.../exec"
                      />

                      {/* Setup Instructions Card */}
                      <div className="rounded-2xl border border-blue-100 bg-blue-50/50 p-5 mt-4">
                        <h4 className="text-sm font-bold text-blue-900 flex items-center gap-1.5">
                          <span>💡</span> Apps Script Connection Instructions
                        </h4>
                        <p className="text-xs text-blue-800 mt-1 leading-relaxed">
                          To support saving changes and adding new rows back to your spreadsheet from the app:
                        </p>
                        <ol className="list-decimal list-inside text-[11px] text-blue-700 mt-2 space-y-1 leading-relaxed">
                          <li>Open your Google Sheet and navigate to <strong>Extensions &rarr; Apps Script</strong>.</li>
                          <li>Delete any template code and paste the custom integration code (provided below).</li>
                          <li>Click <strong>Deploy &rarr; New Deployment</strong>, select <strong>Web App</strong>.</li>
                          <li>Set <strong>Execute as:</strong> <code>Me</code>, and <strong>Who has access:</strong> <code>Anyone</code>.</li>
                          <li>Deploy, authorize permissions, copy the Web App URL, and paste it into the field above.</li>
                        </ol>

                        <details className="mt-4 rounded-xl border border-blue-200 bg-white p-3 [&_summary::-webkit-details-marker]:hidden">
                          <summary className="cursor-pointer text-xs font-semibold text-blue-900 flex items-center justify-between">
                            <span>📋 View Apps Script Code</span>
                            <span className="text-[10px] bg-blue-100 px-2 py-0.5 rounded-full">Copy Code</span>
                          </summary>
                          <pre className="mt-2 block w-full overflow-x-auto rounded-lg bg-slate-900 p-3 text-[10px] font-mono text-slate-300">
{`function doGet(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("customer");
  var rows = sheet.getDataRange().getValues();
  return ContentService.createTextOutput(JSON.stringify({ values: rows }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var data = JSON.parse(e.postData.contents);
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("customer");
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var colMap = {};
  for (var i = 0; i < headers.length; i++) {
    colMap[headers[i].toString().toLowerCase().trim()] = i + 1;
  }
  
  var nameCol = colMap["name"] || colMap["customer"] || 1;
  var addrCol = colMap["address"] || 2;
  var phoneCol = colMap["telephone"] || colMap["mobile"] || colMap["contact"] || colMap["phone"] || 3;
  var monthCol = colMap["month of new amc"] || colMap["month"] || colMap["amc"] || 4;
  var priceCol = colMap["2026"] || colMap["price of amc"] || colMap["amc price"] || 5;

  if (data.action === "add") {
    var nextRow = sheet.getLastRow() + 1;
    sheet.getRange(nextRow, nameCol).setValue(data.name || "");
    sheet.getRange(nextRow, addrCol).setValue(data.address || "");
    sheet.getRange(nextRow, phoneCol).setValue(data.phone || "");
    sheet.getRange(nextRow, monthCol).setValue(data.amcMonth || "");
    sheet.getRange(nextRow, priceCol).setValue(data.amcPrice || "");
    return ContentService.createTextOutput(JSON.stringify({ success: true, rowNum: nextRow }))
      .setMimeType(ContentService.MimeType.JSON);
  } else if (data.action === "edit") {
    var rowNum = parseInt(data.rowNum);
    if (!rowNum || rowNum < 2) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: "Invalid rowNum" }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    if (data.name !== undefined) sheet.getRange(rowNum, nameCol).setValue(data.name);
    if (data.address !== undefined) sheet.getRange(rowNum, addrCol).setValue(data.address);
    if (data.phone !== undefined) sheet.getRange(rowNum, phoneCol).setValue(data.phone);
    if (data.amcMonth !== undefined) sheet.getRange(rowNum, monthCol).setValue(data.amcMonth);
    if (data.amcPrice !== undefined) sheet.getRange(rowNum, priceCol).setValue(data.amcPrice);
    return ContentService.createTextOutput(JSON.stringify({ success: true }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  return ContentService.createTextOutput(JSON.stringify({ success: false, error: "Invalid action" }))
    .setMimeType(ContentService.MimeType.JSON);
}`}
                          </pre>
                        </details>
                      </div>
                    </div>
                  </details>

                  {/* Main Customer List Directory */}
                  <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4">
                      <div>
                        <h2 className="text-lg font-bold text-slate-900">Sheet Customer Directory</h2>
                        <p className="text-xs text-slate-500">View, search, add, or edit customers in the synced Google Sheet.</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-3">
                        <button
                          type="button"
                          onClick={handleOpenAddCustomer}
                          className="rounded-2xl bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-blue-500 cursor-pointer"
                        >
                          ➕ Add Customer
                        </button>
                        <button
                          type="button"
                          onClick={fetchSheet}
                          disabled={sheetLoading}
                          className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
                        >
                          {sheetLoading ? "Syncing..." : "↻ Sync & Reload"}
                        </button>
                      </div>
                    </div>

                    {/* Search and Feedback Status */}
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
                      <div className="w-full sm:max-w-xs">
                        <input
                          type="text"
                          placeholder="Search directory by name, phone, address..."
                          value={sheetSearch}
                          onChange={(e) => setSheetSearch(e.target.value)}
                          className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs outline-none focus:border-slate-400"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        {sheetCustomers.length > 0 && (
                          <span className="text-xs font-medium text-emerald-600">
                            ✓ {sheetCustomers.length} records loaded ({filteredSheetCustomers.length} matches)
                          </span>
                        )}
                        {sheetError && (
                          <span className="text-xs font-medium text-rose-600">
                            ⚠️ Error: {sheetError}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Directory Table */}
                    <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                      <table className="w-full border-collapse text-left text-xs text-slate-500">
                        <thead className="bg-slate-50 text-[10px] font-semibold uppercase text-slate-700 border-b border-slate-200">
                          <tr>
                            <th className="px-4 py-3">Row</th>
                            <th className="px-4 py-3">Customer Name</th>
                            <th className="px-4 py-3">Address</th>
                            <th className="px-4 py-3">Phone</th>
                            <th className="px-4 py-3">AMC Month</th>
                            <th className="px-4 py-3">Price</th>
                            <th className="px-4 py-3 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {pageSheetCustomers.length > 0 ? (
                            pageSheetCustomers.map((c) => (
                              <tr key={c.id} className="hover:bg-slate-50/50 transition">
                                <td className="px-4 py-3 text-slate-400 font-mono">#{c.rowNum ?? "?"}</td>
                                <td className="px-4 py-3 font-semibold text-slate-900">{c.name}</td>
                                <td className="px-4 py-3 max-w-[200px] truncate" title={c.address}>{c.address}</td>
                                <td className="px-4 py-3 font-mono">{c.phone}</td>
                                <td className="px-4 py-3 font-medium text-slate-600">{c.amcMonth || "—"}</td>
                                <td className="px-4 py-3 font-semibold text-blue-600">
                                  {c.amcPrice ? `₹${parseFloat(c.amcPrice.replace(/[^0-9]/g, "") || "0").toLocaleString("en-IN")}` : "—"}
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <div className="flex justify-end gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => handleOpenEditCustomer(c)}
                                      className="rounded-lg bg-blue-50 px-2.5 py-1 text-[10px] font-semibold text-blue-600 hover:bg-blue-100 transition cursor-pointer"
                                    >
                                      Edit Details
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => markCustomerInactive(c)}
                                      className="rounded-lg bg-amber-50 px-2.5 py-1 text-[10px] font-semibold text-amber-600 hover:bg-amber-100 transition cursor-pointer"
                                    >
                                      Move to Inactive
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan={7} className="text-center py-8 text-slate-400">
                                No customer records found.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>

                    {/* Pagination Controls */}
                    {totalSheetPages > 1 && (
                      <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4">
                        <span className="text-[11px] text-slate-500">
                          Page {sheetPage} of {totalSheetPages}
                        </span>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={sheetPage === 1}
                            onClick={() => setSheetPage((p) => Math.max(1, p - 1))}
                            className="rounded-xl border border-slate-200 px-3 py-1.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition cursor-pointer"
                          >
                            Previous
                          </button>
                          <button
                            type="button"
                            disabled={sheetPage === totalSheetPages}
                            onClick={() => setSheetPage((p) => Math.min(totalSheetPages, p + 1))}
                            className="rounded-xl border border-slate-200 px-3 py-1.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition cursor-pointer"
                          >
                            Next
                          </button>
                        </div>
                      </div>
                    )}
                  </section>
                </div>
              )}

              {tab === "inactive" && (
                <div className="space-y-6">
                  <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4">
                      <div>
                        <h2 className="text-lg font-bold text-slate-900">Inactive & Balance Directory</h2>
                        <p className="text-xs text-slate-500">Call customers who are marked inactive or have pending balances.</p>
                      </div>
                    </div>

                    {/* Search and Feedback Status */}
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
                      <div className="w-full sm:max-w-xs">
                        <input
                          type="text"
                          placeholder="Search inactive by name, phone, address..."
                          value={inactiveSearch}
                          onChange={(e) => setInactiveSearch(e.target.value)}
                          className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs outline-none focus:border-slate-400"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        {displayInactiveCustomers.length > 0 && (
                          <span className="text-xs font-medium text-amber-600">
                            ✓ {displayInactiveCustomers.length} total records ({filteredInactiveCustomers.length} matches)
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Directory Table */}
                    <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                      <table className="w-full border-collapse text-left text-xs text-slate-500">
                        <thead className="bg-slate-50 text-[10px] font-semibold uppercase text-slate-700 border-b border-slate-200">
                          <tr>
                            <th className="px-4 py-3">Customer Name</th>
                            <th className="px-4 py-3">Address</th>
                            <th className="px-4 py-3">Phone</th>
                            <th className="px-4 py-3">AMC Month</th>
                            <th className="px-4 py-3">Status</th>
                            <th className="px-4 py-3">Price / Balance</th>
                            <th className="px-4 py-3 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {pageInactiveCustomers.length > 0 ? (
                            pageInactiveCustomers.map((c) => (
                              <tr key={c.id} className="hover:bg-slate-50/50 transition">
                                <td className="px-4 py-3 font-semibold text-slate-900">{c.name}</td>
                                <td className="px-4 py-3 max-w-[200px] truncate" title={c.address}>{c.address}</td>
                                <td className="px-4 py-3 font-mono">{c.phone}</td>
                                <td className="px-4 py-3 font-medium text-slate-600">{c.amcMonth || "—"}</td>
                                <td className="px-4 py-3">
                                  {c.type === "inactive" ? (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                                      💤 Inactive
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                                      💵 Balance Due
                                    </span>
                                  )}
                                </td>
                                <td className="px-4 py-3 font-semibold text-blue-600">
                                  {c.amcPrice || "—"}
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <div className="flex justify-end gap-1.5">
                                    <a
                                      href={`tel:${c.phone}`}
                                      className="rounded-lg bg-blue-50 px-2.5 py-1 text-[10px] font-semibold text-blue-600 hover:bg-blue-100 transition cursor-pointer"
                                    >
                                      📞 Call
                                    </a>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const cleanPhone = c.phone.replace(/[^0-9]/g, "");
                                        const formattedPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
                                        window.open(`https://wa.me/${formattedPhone}`, "_blank");
                                      }}
                                      className="rounded-lg bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-600 hover:bg-emerald-100 transition cursor-pointer"
                                    >
                                      💬 WhatsApp
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        fillFromCustomer(c);
                                        setTab("tasks");
                                      }}
                                      className="rounded-lg bg-purple-50 px-2.5 py-1 text-[10px] font-semibold text-purple-600 hover:bg-purple-100 transition cursor-pointer"
                                    >
                                      ⚙️ Create Task
                                    </button>
                                    {c.type === "inactive" && (
                                      <button
                                        type="button"
                                        onClick={() => markCustomerActive(c.id)}
                                        className="rounded-lg bg-amber-50 px-2.5 py-1 text-[10px] font-semibold text-amber-600 hover:bg-amber-100 transition cursor-pointer"
                                      >
                                        🔄 Activate
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan={7} className="text-center py-8 text-slate-400">
                                No inactive or balance records found.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>

                    {/* Pagination Controls */}
                    {totalInactivePages > 1 && (
                      <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4">
                        <span className="text-[11px] text-slate-500">
                          Page {inactivePage} of {totalInactivePages}
                        </span>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={inactivePage === 1}
                            onClick={() => setInactivePage((p) => Math.max(1, p - 1))}
                            className="rounded-xl border border-slate-200 px-3 py-1.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition cursor-pointer"
                          >
                            Previous
                          </button>
                          <button
                            type="button"
                            disabled={inactivePage === totalInactivePages}
                            onClick={() => setInactivePage((p) => Math.min(totalInactivePages, p + 1))}
                            className="rounded-xl border border-slate-200 px-3 py-1.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition cursor-pointer"
                          >
                            Next
                          </button>
                        </div>
                      </div>
                    )}
                  </section>
                </div>
              )}

              {tab === "tasks" && (
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
                  onSaveTask={saveTask}
                  onCancelEditTask={cancelTaskEdit}
                  onEditTask={startTaskEdit}
                  onEditTaskNameChange={onEditTaskNameChange}
                  onEditTaskAddressChange={onEditTaskAddressChange}
                  onEditTaskPhoneChange={onEditTaskPhoneChange}
                  onEditTaskCommentChange={onEditTaskCommentChange}
                  onEditTaskAmcMonthChange={onEditTaskAmcMonthChange}
                  onEditTaskAmcPriceChange={onEditTaskAmcPriceChange}
                  onEditTaskTypeChange={onEditTaskTypeChange}
                  onEditTaskTechChange={onEditTaskTechChange}
                  onEditTaskSharePhoneChange={onEditTaskSharePhoneChange}
                  onFillFromCustomer={fillFromCustomer}
                  editingTask={editingTask}
                  onSendTask={resendTask}
                  onFilterStatusChange={setFilterStatus}
                  onPageSizeChange={setPageSize}
                  onPageChange={setPage}
                  onDeleteTask={deleteTask}
                  selectedTaskIds={selectedTaskIds}
                  onToggleTaskSelection={toggleTaskSelection}
                  onToggleSelectAll={toggleSelectAll}
                  onDeleteSelectedTasks={deleteSelectedTasks}
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


        {/* Customer Add/Edit Modal */}
        {showCustomerModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
            <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
                <h3 className="text-lg font-bold text-slate-900">
                  {customerModalMode === "add" ? "Add Customer to Sheet" : "Edit Customer Details"}
                </h3>
                <button
                  type="button"
                  onClick={() => setShowCustomerModal(false)}
                  className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 hover:bg-slate-50 hover:text-slate-900 transition cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleSaveCustomer} className="space-y-4">
                <Input
                  label="Customer Name"
                  value={custFormName}
                  onChange={setCustFormName}
                  placeholder="e.g. Ramesh Kumar"
                />
                <Input
                  label="Address"
                  value={custFormAddress}
                  onChange={setCustFormAddress}
                  placeholder="e.g. Sector-15, Rohini, Delhi"
                />
                <Input
                  label="Phone / Mobile Number"
                  value={custFormPhone}
                  onChange={setCustFormPhone}
                  placeholder="e.g. 9876543210"
                />
                <div className="grid grid-cols-2 gap-4">
                  <Input
                    label="AMC Month"
                    value={custFormAmcMonth}
                    onChange={setCustFormAmcMonth}
                    placeholder="e.g. August"
                  />
                  <Input
                    label="AMC Price (₹)"
                    value={custFormAmcPrice}
                    onChange={setCustFormAmcPrice}
                    placeholder="e.g. 4500"
                  />
                </div>

                {custFormError && (
                  <div className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    {custFormError}
                  </div>
                )}
                {custFormSuccess && (
                  <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                    {custFormSuccess}
                  </div>
                )}

                <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowCustomerModal(false)}
                    className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={custFormLoading}
                    className="rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {custFormLoading ? "Saving..." : "Save Customer"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        </main>
      </div>
    </div>
  );
}
