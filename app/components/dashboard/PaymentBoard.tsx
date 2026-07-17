"use client";

import { useEffect, useState, useMemo } from "react";
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  type Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Input, Select, SectionCard } from "./ui";
import type { Customer } from "./types";

interface PaymentRecord {
  id: string;
  name: string;
  address: string;
  phone: string;
  amount: string;
  comment: string;
  status: "pending" | "received";
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

interface PaymentBoardProps {
  collectionName: "cash_memos" | "ro_payments";
  title: string;
  description: string;
  sheetCustomers: Customer[];
}

export default function PaymentBoard({
  collectionName,
  title,
  description,
  sheetCustomers,
}: PaymentBoardProps) {
  const [records, setRecords] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // Search & autocomplete states
  const [customerSearch, setCustomerSearch] = useState("");
  const [searchResults, setSearchResults] = useState<Customer[]>([]);

  // Form states for adding
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [amount, setAmount] = useState("");
  const [comment, setComment] = useState("");
  const [status, setStatus] = useState<"pending" | "received">("pending");
  const [error, setError] = useState("");

  // Edit states
  const [editingRecord, setEditingRecord] = useState<PaymentRecord | null>(null);

  // Search filter for table
  const [tableSearch, setTableSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  // Real-time Firestore Sync
  useEffect(() => {
    const q = query(collection(db, collectionName), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: PaymentRecord[] = [];
        snapshot.forEach((doc) => {
          const data = doc.data();
          list.push({
            id: doc.id,
            name: data.name ?? "",
            address: data.address ?? "",
            phone: data.phone ?? "",
            amount: data.amount ?? "",
            comment: data.comment ?? "",
            status: data.status ?? "pending",
            createdAt: data.createdAt ?? null,
            updatedAt: data.updatedAt ?? null,
          } as PaymentRecord);
        });
        setRecords(list);
        setLoading(false);
      },
      (err) => {
        console.error(`Error loading ${collectionName}:`, err);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, [collectionName]);

  // Handle autocomplete search
  const handleSearchChange = (value: string) => {
    setCustomerSearch(value);
    if (!value.trim() || !sheetCustomers.length) {
      setSearchResults([]);
      return;
    }
    const term = value.toLowerCase();
    const matches = sheetCustomers
      .filter(
        (c) =>
          c.name.toLowerCase().includes(term) ||
          c.phone.toLowerCase().includes(term) ||
          c.address.toLowerCase().includes(term)
      )
      .slice(0, 5);
    setSearchResults(matches);
  };

  const handleFillCustomer = (c: Customer) => {
    setName(c.name);
    setAddress(c.address);
    setPhone(c.phone);
    setAmount(c.amcPrice || "");
    setSearchResults([]);
    setCustomerSearch("");
  };

  // Add Record
  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Customer name is required.");
      return;
    }
    if (!address.trim()) {
      setError("Address is required.");
      return;
    }

    setError("");
    try {
      await addDoc(collection(db, collectionName), {
        name: name.trim(),
        address: address.trim(),
        phone: phone.trim(),
        amount: amount.trim(),
        comment: comment.trim(),
        status,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      // Clear form
      setName("");
      setAddress("");
      setPhone("");
      setAmount("");
      setComment("");
      setStatus("pending");
    } catch (err) {
      console.error(err);
      setError("Failed to add payment record.");
    }
  };

  // Save Edit
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRecord) return;
    if (!editingRecord.name.trim()) {
      setError("Customer name is required.");
      return;
    }
    if (!editingRecord.address.trim()) {
      setError("Address is required.");
      return;
    }

    setError("");
    try {
      await updateDoc(doc(db, collectionName, editingRecord.id), {
        name: editingRecord.name.trim(),
        address: editingRecord.address.trim(),
        phone: editingRecord.phone.trim(),
        amount: editingRecord.amount.trim(),
        comment: editingRecord.comment.trim(),
        status: editingRecord.status,
        updatedAt: serverTimestamp(),
      });
      setEditingRecord(null);
    } catch (err) {
      console.error(err);
      setError("Failed to update payment record.");
    }
  };

  // Delete Record
  const handleDelete = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this payment record?")) return;
    try {
      await deleteDoc(doc(db, collectionName, id));
    } catch (err) {
      console.error(err);
      alert("Failed to delete record.");
    }
  };

  // Filtered & Paginated records
  const filtered = useMemo(() => {
    let result = records;
    if (filterStatus !== "all") {
      result = result.filter((r) => r.status === filterStatus);
    }
    if (tableSearch.trim()) {
      const term = tableSearch.toLowerCase();
      result = result.filter(
        (r) =>
          r.name.toLowerCase().includes(term) ||
          r.phone.toLowerCase().includes(term) ||
          r.address.toLowerCase().includes(term) ||
          r.comment.toLowerCase().includes(term)
      );
    }
    return result;
  }, [records, filterStatus, tableSearch]);

  const totalPages = Math.ceil(filtered.length / pageSize) || 1;
  const pageRecords = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [page, filtered]);

  // Reset page on filter/search change
  useEffect(() => {
    setPage(1);
  }, [filterStatus, tableSearch]);

  return (
    <div className="space-y-6">
      {/* Search Customer from Sheet to auto-fill */}
      <SectionCard title={title} description={description}>
        <div className="mt-5 relative">
          <Input
            label="Search Customer from sheet (Optional)"
            value={customerSearch}
            onChange={handleSearchChange}
            placeholder="Type customer name, phone or address to auto-fill..."
          />
          {searchResults.length > 0 && (
            <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg">
              {searchResults.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => handleFillCustomer(c)}
                  className="flex w-full flex-col gap-0.5 border-b border-slate-100 px-4 py-3 text-left text-sm last:border-0 hover:bg-slate-50"
                >
                  <span className="font-medium text-slate-900">{c.name}</span>
                  <span className="text-xs text-slate-500">{c.address} · {c.phone}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <form onSubmit={handleAdd} className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Input label="Customer Name" value={name} onChange={setName} placeholder="Full name" />
          <Input label="Phone" value={phone} onChange={setPhone} placeholder="Mobile number" />
          <Input label="Address" value={address} onChange={setAddress} placeholder="Full address" />
          <Input label="Amount (₹)" value={amount} onChange={setAmount} placeholder="e.g. 2500" />
          <Input label="Comment / Notes" value={comment} onChange={setComment} placeholder="Additional info..." />
          <Select
            label="Payment Status"
            value={status}
            onChange={(v) => setStatus(v as any)}
            options={[
              { value: "pending", label: "Pending" },
              { value: "received", label: "Received" },
            ]}
          />
          <div className="md:col-span-2 lg:col-span-3 flex justify-end mt-2">
            <button
              type="submit"
              className="rounded-2xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-blue-500 cursor-pointer"
            >
              + Add Record
            </button>
          </div>
        </form>
        {error && !editingRecord && (
          <div className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
        )}
      </SectionCard>

      {/* Edit Form */}
      {editingRecord && (
        <SectionCard
          title={`Edit Record: ${editingRecord.name}`}
          description="Update payment details and save changes."
        >
          <form onSubmit={handleSaveEdit} className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Input
              label="Customer Name"
              value={editingRecord.name}
              onChange={(v) => setEditingRecord({ ...editingRecord, name: v })}
              placeholder="Full name"
            />
            <Input
              label="Phone"
              value={editingRecord.phone}
              onChange={(v) => setEditingRecord({ ...editingRecord, phone: v })}
              placeholder="Mobile number"
            />
            <Input
              label="Address"
              value={editingRecord.address}
              onChange={(v) => setEditingRecord({ ...editingRecord, address: v })}
              placeholder="Full address"
            />
            <Input
              label="Amount (₹)"
              value={editingRecord.amount}
              onChange={(v) => setEditingRecord({ ...editingRecord, amount: v })}
              placeholder="e.g. 2500"
            />
            <Input
              label="Comment / Notes"
              value={editingRecord.comment}
              onChange={(v) => setEditingRecord({ ...editingRecord, comment: v })}
              placeholder="Additional info..."
            />
            <Select
              label="Payment Status"
              value={editingRecord.status}
              onChange={(v) => setEditingRecord({ ...editingRecord, status: v as any })}
              options={[
                { value: "pending", label: "Pending" },
                { value: "received", label: "Received" },
              ]}
            />
            <div className="md:col-span-2 lg:col-span-3 flex gap-3 justify-end mt-2">
              <button
                type="button"
                onClick={() => setEditingRecord(null)}
                className="rounded-2xl bg-slate-100 px-6 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-200 cursor-pointer"
              >
                Cancel Edit
              </button>
              <button
                type="submit"
                className="rounded-2xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-blue-500 cursor-pointer"
              >
                Save Changes
              </button>
            </div>
          </form>
          {error && editingRecord && (
            <div className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
          )}
        </SectionCard>
      )}

      {/* Listing Card */}
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Payment Records List</h2>
            <p className="text-xs text-slate-500">List of pending and received payments.</p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600 outline-none focus:border-slate-400"
            >
              <option value="all">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="received">Received</option>
            </select>
          </div>
        </div>

        {/* Search */}
        <div className="mt-4 w-full sm:max-w-xs">
          <input
            type="text"
            placeholder="Search payments by customer details..."
            value={tableSearch}
            onChange={(e) => setTableSearch(e.target.value)}
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs outline-none focus:border-slate-400"
          />
        </div>

        {/* Table */}
        <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="w-full overflow-x-auto scrollbar-thin">
            <table className="w-full border-collapse text-left text-xs text-slate-500 min-w-[700px]">
              <thead className="bg-slate-50 text-[10px] font-semibold uppercase text-slate-700 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">Customer Name</th>
                  <th className="px-4 py-3">Address</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Notes</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                      Loading payment records...
                    </td>
                  </tr>
                ) : pageRecords.length > 0 ? (
                  pageRecords.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50/50 transition">
                      <td className="px-4 py-3 font-semibold text-slate-900">{r.name}</td>
                      <td className="px-4 py-3 max-w-[200px] truncate" title={r.address}>
                        {r.address}
                      </td>
                      <td className="px-4 py-3 font-mono">{r.phone || "—"}</td>
                      <td className="px-4 py-3 font-semibold text-slate-900">
                        {r.amount ? `₹${r.amount}` : "—"}
                      </td>
                      <td className="px-4 py-3 max-w-[150px] truncate" title={r.comment}>
                        {r.comment || "—"}
                      </td>
                      <td className="px-4 py-3">
                        {r.createdAt ? (
                          <span>
                            📅{" "}
                            {r.createdAt
                              .toDate()
                              .toLocaleDateString("en-IN", {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                              })}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${
                            r.status === "received"
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-amber-50 text-amber-700"
                          }`}
                        >
                          {r.status === "received" ? "Received" : "Pending"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setEditingRecord(r)}
                            className="rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-200 cursor-pointer"
                          >
                            ✏️ Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(r.id)}
                            className="rounded-xl bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-500 transition hover:bg-rose-100 cursor-pointer"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                      No payment records found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4">
            <span className="text-[11px] font-medium text-slate-500">
              Page {page} of {totalPages}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page === 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-xl border border-slate-200 px-3 py-1.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition cursor-pointer"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={page === totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="rounded-xl border border-slate-200 px-3 py-1.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition cursor-pointer"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
