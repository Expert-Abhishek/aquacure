"use client";

import { useEffect, useState } from "react";
import { collection, doc, onSnapshot, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { SectionCard } from "./ui";

interface PumpRecord {
  gpd100: number;
  gpd300: number;
}

const PERSONS = [
  { id: "ravi", name: "Ravi", role: "Technician / Stock Holder" },
  { id: "deepak", name: "Deepak", role: "Technician / Stock Holder" },
  { id: "gudda", name: "Gudda", role: "Technician / Stock Holder" },
];

export default function PumpBoard() {
  const [pumpData, setPumpData] = useState<Record<string, PumpRecord>>({
    ravi: { gpd100: 0, gpd300: 0 },
    deepak: { gpd100: 0, gpd300: 0 },
    gudda: { gpd100: 0, gpd300: 0 },
  });

  const [savingStatus, setSavingStatus] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  // Subscribe to real-time updates from Firestore 'pumps' collection
  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "pumps"),
      (snapshot) => {
        const newData: Record<string, PumpRecord> = {
          ravi: { gpd100: 0, gpd300: 0 },
          deepak: { gpd100: 0, gpd300: 0 },
          gudda: { gpd100: 0, gpd300: 0 },
        };

        snapshot.docs.forEach((docSnap) => {
          const id = docSnap.id.toLowerCase();
          if (id in newData) {
            const data = docSnap.data();
            newData[id] = {
              gpd100: typeof data.gpd100 === "number" ? data.gpd100 : Number(data.gpd100) || 0,
              gpd300: typeof data.gpd300 === "number" ? data.gpd300 : Number(data.gpd300) || 0,
            };
          }
        });

        setPumpData(newData);
        setLoading(false);
      },
      (error) => {
        console.error("Error fetching pump data from Firestore:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const handleValueChange = (personId: string, field: "gpd100" | "gpd300", val: string) => {
    const num = Math.max(0, parseInt(val, 10) || 0);
    setPumpData((prev) => ({
      ...prev,
      [personId]: {
        ...prev[personId],
        [field]: num,
      },
    }));
  };

  const handleIncrement = (personId: string, field: "gpd100" | "gpd300", delta: number) => {
    setPumpData((prev) => {
      const current = prev[personId]?.[field] ?? 0;
      const nextVal = Math.max(0, current + delta);
      return {
        ...prev,
        [personId]: {
          ...prev[personId],
          [field]: nextVal,
        },
      };
    });
  };

  const savePersonData = async (personId: string) => {
    setSavingStatus((prev) => ({ ...prev, [personId]: "saving" }));
    try {
      const record = pumpData[personId] || { gpd100: 0, gpd300: 0 };
      await setDoc(
        doc(db, "pumps", personId),
        {
          personId,
          name: PERSONS.find((p) => p.id === personId)?.name || personId,
          gpd100: Number(record.gpd100),
          gpd300: Number(record.gpd300),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      setSavingStatus((prev) => ({ ...prev, [personId]: "saved" }));
      setTimeout(() => {
        setSavingStatus((prev) => ({ ...prev, [personId]: "" }));
      }, 2500);
    } catch (err) {
      console.error(`Failed to save pump record for ${personId}:`, err);
      setSavingStatus((prev) => ({ ...prev, [personId]: "error" }));
    }
  };

  // Calculate totals
  const totalGpd100 = Object.values(pumpData).reduce((sum, item) => sum + (item.gpd100 || 0), 0);
  const totalGpd300 = Object.values(pumpData).reduce((sum, item) => sum + (item.gpd300 || 0), 0);
  const grandTotal = totalGpd100 + totalGpd300;

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center rounded-3xl border border-slate-200 bg-white p-8">
        <div className="flex items-center gap-3 text-slate-500">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent"></div>
          <span className="text-sm font-medium">Loading Pump stock data...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Header & Summary Stats */}
      <SectionCard
        title="Pump Stock Tracker"
        description="Track and update 100 GPD & 300 GPD pump quantities for Ravi, Deepak, and Gudda. New entries overwrite previous values."
      >
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4 transition">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-blue-700">Total 100 GPD</span>
              <span className="rounded-lg bg-blue-200/60 px-2 py-0.5 text-xs font-bold text-blue-800">100 GPD</span>
            </div>
            <p className="mt-2 text-3xl font-extrabold text-blue-950">{totalGpd100}</p>
            <p className="text-xs text-blue-600">Pumps allocated</p>
          </div>

          <div className="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4 transition">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-indigo-700">Total 300 GPD</span>
              <span className="rounded-lg bg-indigo-200/60 px-2 py-0.5 text-xs font-bold text-indigo-800">300 GPD</span>
            </div>
            <p className="mt-2 text-3xl font-extrabold text-indigo-950">{totalGpd300}</p>
            <p className="text-xs text-indigo-600">Pumps allocated</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-900 p-4 text-white shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">Grand Total</span>
              <span className="rounded-lg bg-slate-800 px-2 py-0.5 text-xs font-bold text-slate-200">Combined</span>
            </div>
            <p className="mt-2 text-3xl font-extrabold text-white">{grandTotal}</p>
            <p className="text-xs text-slate-400">Total Pumps across all 3</p>
          </div>
        </div>
      </SectionCard>

      {/* Person Cards */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {PERSONS.map((person) => {
          const pData = pumpData[person.id] || { gpd100: 0, gpd300: 0 };
          const personTotal = (pData.gpd100 || 0) + (pData.gpd300 || 0);
          const status = savingStatus[person.id];

          return (
            <div
              key={person.id}
              className="flex flex-col justify-between rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition hover:shadow-md"
            >
              <div>
                {/* Person Header */}
                <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-50 font-bold text-indigo-600 shadow-inner">
                      {person.name.charAt(0)}
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-slate-900">{person.name}</h3>
                      <p className="text-xs text-slate-500">{person.role}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="inline-block rounded-xl bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                      Total: {personTotal}
                    </span>
                  </div>
                </div>

                {/* Input Fields */}
                <div className="mt-6 space-y-5">
                  {/* 100 GPD Input */}
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600">
                      100 GPD Pump Count
                    </label>
                    <div className="mt-2 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleIncrement(person.id, "gpd100", -1)}
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-lg font-bold text-slate-700 transition hover:bg-slate-100 active:scale-95"
                      >
                        -
                      </button>
                      <input
                        type="number"
                        min="0"
                        value={pData.gpd100}
                        onChange={(e) => handleValueChange(person.id, "gpd100", e.target.value)}
                        className="h-11 w-full rounded-2xl border border-slate-300 bg-slate-50 px-4 text-center font-bold text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                      />
                      <button
                        type="button"
                        onClick={() => handleIncrement(person.id, "gpd100", 1)}
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-lg font-bold text-slate-700 transition hover:bg-slate-100 active:scale-95"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  {/* 300 GPD Input */}
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600">
                      300 GPD Pump Count
                    </label>
                    <div className="mt-2 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleIncrement(person.id, "gpd300", -1)}
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-lg font-bold text-slate-700 transition hover:bg-slate-100 active:scale-95"
                      >
                        -
                      </button>
                      <input
                        type="number"
                        min="0"
                        value={pData.gpd300}
                        onChange={(e) => handleValueChange(person.id, "gpd300", e.target.value)}
                        className="h-11 w-full rounded-2xl border border-slate-300 bg-slate-50 px-4 text-center font-bold text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                      />
                      <button
                        type="button"
                        onClick={() => handleIncrement(person.id, "gpd300", 1)}
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-lg font-bold text-slate-700 transition hover:bg-slate-100 active:scale-95"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action / Save Button */}
              <div className="mt-6 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={() => savePersonData(person.id)}
                  disabled={status === "saving"}
                  className={`w-full rounded-2xl py-3 text-sm font-bold shadow-sm transition active:scale-[0.98] ${
                    status === "saved"
                      ? "bg-emerald-600 text-white hover:bg-emerald-700"
                      : status === "error"
                      ? "bg-rose-600 text-white hover:bg-rose-700"
                      : "bg-slate-900 text-white hover:bg-slate-800"
                  }`}
                >
                  {status === "saving"
                    ? "Updating..."
                    : status === "saved"
                    ? "✓ Updated Successfully"
                    : status === "error"
                    ? "⚠️ Error! Retry"
                    : `Update ${person.name}'s Stock`}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
