"use client";

import { useState, useRef, useMemo } from "react";
import {
  extractCardDataWithGemini,
  fileToBase64,
  findMatchingCustomer,
  DEFAULT_GEMINI_API_KEY,
  type ExtractedCardData,
} from "@/lib/geminiCardScanner";
import type { Customer } from "./types";

interface CardScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingCustomers: Customer[];
  onAddCustomer: (customer: {
    name: string;
    address: string;
    phone: string;
    amcMonth: string;
    amcPrice: string;
    balance?: string;
    active: string;
  }) => Promise<void>;
  onEditCustomer: (
    rowNum: number,
    customer: {
      name: string;
      address: string;
      phone: string;
      amcMonth: string;
      amcPrice: string;
      balance?: string;
      active: string;
    }
  ) => Promise<void>;
  onRefreshData: () => Promise<void>;
  geminiApiKey?: string;
}

const MONTH_OPTIONS = [
  "Auto Detect",
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export default function CardScannerModal({
  isOpen,
  onClose,
  existingCustomers,
  onAddCustomer,
  onEditCustomer,
  onRefreshData,
  geminiApiKey = DEFAULT_GEMINI_API_KEY,
}: CardScannerModalProps) {
  const [items, setItems] = useState<ExtractedCardData[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedMonth, setSelectedMonth] = useState<string>("Auto Detect");
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [processedCount, setProcessedCount] = useState<number>(0);
  const [totalToProcess, setTotalToProcess] = useState<number>(0);
  const [filterTab, setFilterTab] = useState<"all" | "new" | "existing" | "error">("all");
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveProgress, setSaveProgress] = useState<{ current: number; total: number } | null>(null);
  const [saveMessage, setSaveMessage] = useState<string>("");

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFilesSelected = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const fileArray = Array.from(files).slice(0, 100); // max 100 images
    const newItems: ExtractedCardData[] = [];

    for (let i = 0; i < fileArray.length; i++) {
      const file = fileArray[i];
      const preview = await fileToBase64(file);
      const id = `card_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 7)}`;

      newItems.push({
        id,
        fileName: file.name,
        imagePreview: preview,
        name: "",
        phone: "",
        address: "",
        amcMonth: selectedMonth !== "Auto Detect" ? selectedMonth : "",
        amcPrice: "",
        balance: "",
        isPenCutOrPaid: false,
        status: "pending",
      });
    }

    setItems((prev) => [...prev, ...newItems]);
    // Auto start processing
    processQueue(newItems);
  };

  const processQueue = async (queue: ExtractedCardData[]) => {
    setIsProcessing(true);
    setTotalToProcess(queue.length);
    setProcessedCount(0);

    const concurrency = 3; // Process 3 images at a time for optimal speed & rate limits
    let currentIndex = 0;

    const worker = async () => {
      while (currentIndex < queue.length) {
        const item = queue[currentIndex++];
        if (!item) break;

        // Mark as processing
        setItems((prev) =>
          prev.map((it) => (it.id === item.id ? { ...it, status: "processing" } : it))
        );

        try {
          const extracted = await extractCardDataWithGemini(
            item.imagePreview,
            geminiApiKey,
            selectedMonth !== "Auto Detect" ? selectedMonth : undefined
          );

          // Perform duplicate/existing customer matching
          const matched = findMatchingCustomer(
            {
              phone: extracted.phone,
              name: extracted.name,
              address: extracted.address,
              amcMonth: extracted.amcMonth,
            },
            existingCustomers
          );

          setItems((prev) =>
            prev.map((it) => {
              if (it.id !== item.id) return it;
              return {
                ...it,
                ...extracted,
                status: "success",
                matchType: matched ? "existing" : "new",
                matchedCustomer: matched || undefined,
              };
            })
          );

          // Auto-select for sync if successful
          setSelectedIds((prev) => new Set([...prev, item.id]));
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : "Extraction failed";
          setItems((prev) =>
            prev.map((it) =>
              it.id === item.id ? { ...it, status: "error", errorMessage: errMsg } : it
            )
          );
        } finally {
          setProcessedCount((c) => c + 1);
        }
      }
    };

    const workers = Array.from({ length: concurrency }, () => worker());
    await Promise.all(workers);
    setIsProcessing(false);
  };

  const handleFieldChange = (id: string, field: keyof ExtractedCardData, value: any) => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== id) return it;
        const updated = { ...it, [field]: value };

        // Re-evaluate match if phone or name changes
        if (field === "phone" || field === "name" || field === "address") {
          const matched = findMatchingCustomer(
            {
              phone: updated.phone,
              name: updated.name,
              address: updated.address,
            },
            existingCustomers
          );
          updated.matchType = matched ? "existing" : "new";
          updated.matchedCustomer = matched || undefined;
        }

        return updated;
      })
    );
  };

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAll = () => {
    const validIds = filteredItems
      .filter((it) => it.status === "success")
      .map((it) => it.id);
    setSelectedIds(new Set(validIds));
  };

  const handleDeselectAll = () => {
    setSelectedIds(new Set());
  };

  const handleRemoveItem = (id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const handleClearAll = () => {
    if (confirm("Are you sure you want to clear all uploaded cards?")) {
      setItems([]);
      setSelectedIds(new Set());
      setSaveMessage("");
    }
  };

  const handleSaveAllSelected = async () => {
    const toSave = items.filter((it) => selectedIds.has(it.id) && it.status === "success");
    if (toSave.length === 0) {
      alert("Please select at least one successfully extracted card to save.");
      return;
    }

    setIsSaving(true);
    setSaveProgress({ current: 0, total: toSave.length });
    setSaveMessage("Starting sync with Google Sheets & Database...");

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < toSave.length; i++) {
      const item = toSave[i];
      setSaveProgress({ current: i + 1, total: toSave.length });
      setSaveMessage(
        `Saving card ${i + 1}/${toSave.length}: "${item.name || "Customer"}" (${
          item.matchType === "existing" ? "Updating Row" : "Adding New"
        })...`
      );

      try {
        if (item.matchType === "existing" && item.matchedCustomer?.rowNum) {
          // Update existing customer in Google Sheet
          await onEditCustomer(item.matchedCustomer.rowNum, {
            name: item.name.trim(),
            address: item.address.trim(),
            phone: item.phone.trim(),
            amcMonth: item.amcMonth.trim(),
            amcPrice: item.amcPrice.trim(),
            balance: item.balance.trim(),
            active: "Active",
          });
        } else {
          // Add new customer to Google Sheet
          await onAddCustomer({
            name: item.name.trim(),
            address: item.address.trim(),
            phone: item.phone.trim(),
            amcMonth: item.amcMonth.trim(),
            amcPrice: item.amcPrice.trim(),
            balance: item.balance.trim(),
            active: "Active",
          });
        }
        successCount++;
      } catch (err) {
        console.error(`Failed to save card ${item.name}:`, err);
        failCount++;
      }
    }

    setSaveMessage(
      `Sync Complete! Successfully saved: ${successCount}${
        failCount > 0 ? `, Failed: ${failCount}` : ""
      }. Reloading sheet data...`
    );

    await onRefreshData();

    setTimeout(() => {
      setIsSaving(false);
      setSaveProgress(null);
      // Remove successfully saved cards from the view
      setItems((prev) => prev.filter((it) => !selectedIds.has(it.id)));
      setSelectedIds(new Set());
    }, 1500);
  };

  const filteredItems = useMemo(() => {
    if (filterTab === "new") return items.filter((it) => it.matchType === "new");
    if (filterTab === "existing") return items.filter((it) => it.matchType === "existing");
    if (filterTab === "error") return items.filter((it) => it.status === "error");
    return items;
  }, [items, filterTab]);

  const newCount = items.filter((it) => it.matchType === "new").length;
  const existingCount = items.filter((it) => it.matchType === "existing").length;
  const errorCount = items.filter((it) => it.status === "error").length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-3 sm:p-6 backdrop-blur-sm overflow-y-auto">
      <div className="relative flex max-h-[92vh] w-full max-w-6xl flex-col rounded-3xl bg-white shadow-2xl overflow-hidden border border-slate-200">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-blue-900 via-blue-800 to-indigo-900 px-6 py-4 text-white">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10 text-xl backdrop-blur-md">
              📸
            </div>
            <div>
              <h2 className="text-lg font-bold">AI Card Scanner & Batch Sync</h2>
              <p className="text-xs text-blue-200">
                Upload up to 100 service card photos. AI extracts details, matches existing cards, & updates pen-cut balances.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Upload Bar & Controls */}
        <div className="border-b border-slate-100 bg-slate-50 p-4 sm:px-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="file"
              ref={fileInputRef}
              onChange={(e) => handleFilesSelected(e.target.files)}
              multiple
              accept="image/*"
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isProcessing || isSaving}
              className="flex items-center gap-2 rounded-2xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-500 disabled:opacity-50 transition cursor-pointer"
            >
              <span>➕</span>
              <span>Upload Card Images (Max 100)</span>
            </button>

            <div className="flex items-center gap-2 text-xs font-medium text-slate-700 bg-white px-3 py-1.5 rounded-2xl border border-slate-200">
              <span>Default Month:</span>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="bg-transparent font-semibold text-blue-600 outline-none cursor-pointer"
              >
                {MONTH_OPTIONS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            {items.length > 0 && (
              <button
                onClick={handleClearAll}
                disabled={isProcessing || isSaving}
                className="rounded-2xl border border-rose-200 bg-white px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 transition cursor-pointer"
              >
                Clear All
              </button>
            )}
          </div>

          {/* Progress / Status */}
          {isProcessing && (
            <div className="flex items-center gap-3">
              <div className="h-2 w-36 overflow-hidden rounded-full bg-blue-100">
                <div
                  className="h-full bg-blue-600 transition-all duration-300"
                  style={{
                    width: `${totalToProcess ? (processedCount / totalToProcess) * 100 : 0}%`,
                  }}
                />
              </div>
              <span className="text-xs font-semibold text-blue-700 animate-pulse">
                Extracting {processedCount}/{totalToProcess}...
              </span>
            </div>
          )}

          {isSaving && saveProgress && (
            <div className="flex items-center gap-3">
              <div className="h-2 w-36 overflow-hidden rounded-full bg-emerald-100">
                <div
                  className="h-full bg-emerald-600 transition-all duration-300"
                  style={{
                    width: `${(saveProgress.current / saveProgress.total) * 100}%`,
                  }}
                />
              </div>
              <span className="text-xs font-semibold text-emerald-700 animate-pulse">
                Saving {saveProgress.current}/{saveProgress.total}...
              </span>
            </div>
          )}
        </div>

        {/* Feedback Message */}
        {saveMessage && (
          <div className="bg-blue-50 px-6 py-2 border-b border-blue-100 text-xs font-medium text-blue-800 flex items-center justify-between">
            <span>ℹ️ {saveMessage}</span>
          </div>
        )}

        {/* Filter Tabs & Bulk Selection */}
        {items.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-6 py-2.5 bg-white">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setFilterTab("all")}
                className={`rounded-xl px-3 py-1 text-xs font-semibold transition cursor-pointer ${
                  filterTab === "all"
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                All ({items.length})
              </button>
              <button
                onClick={() => setFilterTab("new")}
                className={`rounded-xl px-3 py-1 text-xs font-semibold transition cursor-pointer ${
                  filterTab === "new"
                    ? "bg-emerald-600 text-white"
                    : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                }`}
              >
                🟢 New Cards ({newCount})
              </button>
              <button
                onClick={() => setFilterTab("existing")}
                className={`rounded-xl px-3 py-1 text-xs font-semibold transition cursor-pointer ${
                  filterTab === "existing"
                    ? "bg-amber-500 text-white"
                    : "bg-amber-50 text-amber-700 hover:bg-amber-100"
                }`}
              >
                🟡 Existing Updates ({existingCount})
              </button>
              {errorCount > 0 && (
                <button
                  onClick={() => setFilterTab("error")}
                  className={`rounded-xl px-3 py-1 text-xs font-semibold transition cursor-pointer ${
                    filterTab === "error"
                      ? "bg-rose-600 text-white"
                      : "bg-rose-50 text-rose-700 hover:bg-rose-100"
                  }`}
                >
                  🔴 Errors ({errorCount})
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 text-xs">
              <button
                onClick={handleSelectAll}
                className="text-blue-600 font-semibold hover:underline cursor-pointer"
              >
                Select All
              </button>
              <span className="text-slate-300">|</span>
              <button
                onClick={handleDeselectAll}
                className="text-slate-500 font-medium hover:underline cursor-pointer"
              >
                Deselect All
              </button>
              <span className="text-slate-300">|</span>
              <span className="font-semibold text-slate-700">
                {selectedIds.size} Selected
              </span>
            </div>
          </div>
        )}

        {/* Card Items Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 max-h-[58vh]">
          {items.length === 0 ? (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-slate-200 bg-slate-50/50 p-12 text-center hover:border-blue-400 hover:bg-blue-50/20 transition cursor-pointer"
            >
              <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-blue-100 text-3xl text-blue-600 mb-3">
                📷
              </div>
              <h3 className="text-base font-bold text-slate-800">
                Click or Drag & Drop Service Card Images Here
              </h3>
              <p className="text-xs text-slate-500 max-w-md mt-1">
                Upload photos of physical cards (up to 100 images). AI will automatically read Customer Name, Phone, Address, AMC Month, 2026 Price, and detect pen-cut balances!
              </p>
              <div className="mt-4 flex items-center gap-2 rounded-2xl bg-white px-4 py-2 border border-slate-200 text-xs font-semibold text-blue-600 shadow-sm">
                📁 Browse Images from Computer / Mobile
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredItems.map((item, idx) => {
                const isSelected = selectedIds.has(item.id);
                const isExisting = item.matchType === "existing";

                return (
                  <div
                    key={item.id}
                    className={`rounded-2xl border p-4 transition-all shadow-sm ${
                      item.status === "error"
                        ? "border-rose-200 bg-rose-50/40"
                        : isSelected
                        ? "border-blue-300 bg-blue-50/30"
                        : "border-slate-200 bg-white"
                    }`}
                  >
                    <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
                      
                      {/* Left: Checkbox & Thumbnail */}
                      <div className="flex items-center gap-3 min-w-[220px]">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={item.status !== "success"}
                          onChange={() => handleToggleSelect(item.id)}
                          className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                        <div
                          onClick={() => setPreviewImage(item.imagePreview)}
                          className="relative h-16 w-24 flex-shrink-0 cursor-zoom-in overflow-hidden rounded-xl border border-slate-200 bg-slate-100 group shadow-sm"
                          title="Click to view full card photo"
                        >
                          <img
                            src={item.imagePreview}
                            alt="Card"
                            className="h-full w-full object-cover group-hover:scale-105 transition"
                          />
                          <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white text-[10px] font-bold">
                            🔍 View
                          </div>
                        </div>

                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold text-slate-800">
                              #{idx + 1}
                            </span>
                            {item.status === "pending" && (
                              <span className="rounded-md bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold text-slate-700">
                                Queued
                              </span>
                            )}
                            {item.status === "processing" && (
                              <span className="rounded-md bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold text-blue-700 animate-pulse">
                                Extracting...
                              </span>
                            )}
                            {item.status === "error" && (
                              <span className="rounded-md bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">
                                ⚠️ Failed
                              </span>
                            )}
                            {item.status === "success" && (
                              isExisting ? (
                                <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                                  🟡 Update (Row {item.matchedCustomer?.rowNum || "?"})
                                </span>
                              ) : (
                                <span className="rounded-md bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">
                                  🟢 New Card
                                </span>
                              )
                            )}
                          </div>
                          <p className="text-[11px] text-slate-400 truncate max-w-[130px] mt-0.5">
                            {item.fileName}
                          </p>
                          {isExisting && item.matchedCustomer && (
                            <p className="text-[10px] text-amber-700 font-medium">
                              Matches: {item.matchedCustomer.name} ({item.matchedCustomer.phone})
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Center: Editable Input Fields */}
                      {item.status === "success" ? (
                        <div className="grid flex-1 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 w-full">
                          <div>
                            <label className="text-[10px] font-semibold text-slate-500 block">Name</label>
                            <input
                              type="text"
                              value={item.name}
                              onChange={(e) => handleFieldChange(item.id, "name", e.target.value)}
                              className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 focus:border-blue-400 outline-none"
                              placeholder="Name"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-semibold text-slate-500 block">Phone</label>
                            <input
                              type="text"
                              value={item.phone}
                              onChange={(e) => handleFieldChange(item.id, "phone", e.target.value)}
                              className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 focus:border-blue-400 outline-none"
                              placeholder="Phone"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-semibold text-slate-500 block">Address</label>
                            <input
                              type="text"
                              value={item.address}
                              onChange={(e) => handleFieldChange(item.id, "address", e.target.value)}
                              className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 focus:border-blue-400 outline-none"
                              placeholder="Address"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-semibold text-slate-500 block">AMC Month</label>
                            <input
                              type="text"
                              value={item.amcMonth}
                              onChange={(e) => handleFieldChange(item.id, "amcMonth", e.target.value)}
                              className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 focus:border-blue-400 outline-none"
                              placeholder="Month"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-semibold text-slate-500 block">2026 Price</label>
                            <input
                              type="text"
                              value={item.amcPrice}
                              onChange={(e) => handleFieldChange(item.id, "amcPrice", e.target.value)}
                              className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 focus:border-blue-400 outline-none"
                              placeholder="Price"
                            />
                          </div>
                          <div>
                            <div className="flex items-center justify-between">
                              <label className="text-[10px] font-semibold text-slate-500 block">Balance</label>
                              {item.isPenCutOrPaid && (
                                <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-1 rounded">
                                  Cut/Paid
                                </span>
                              )}
                            </div>
                            <input
                              type="text"
                              value={item.balance}
                              onChange={(e) => handleFieldChange(item.id, "balance", e.target.value)}
                              className={`w-full rounded-xl border px-2.5 py-1.5 text-xs font-semibold outline-none ${
                                item.balance && item.balance !== "0"
                                  ? "border-rose-300 bg-rose-50 text-rose-700"
                                  : "border-slate-200 bg-white text-emerald-700"
                              }`}
                              placeholder="0"
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="flex-1 text-xs text-slate-500">
                          {item.status === "error" ? (
                            <span className="text-rose-600 font-medium">
                              {item.errorMessage || "Failed to read image. Please re-upload with clear lighting."}
                            </span>
                          ) : (
                            <span className="italic">Waiting for AI extraction to complete...</span>
                          )}
                        </div>
                      )}

                      {/* Right: Delete item */}
                      <button
                        onClick={() => handleRemoveItem(item.id)}
                        className="text-slate-400 hover:text-rose-600 p-1.5 rounded-lg hover:bg-slate-100 transition cursor-pointer"
                        title="Remove from list"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="border-t border-slate-100 bg-slate-50 p-4 sm:px-6 flex flex-wrap items-center justify-between gap-4">
          <div className="text-xs text-slate-600">
            {items.length > 0 && (
              <span>
                Ready to sync <strong>{selectedIds.size}</strong> of {items.length} cards ({newCount} new, {existingCount} updates).
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="rounded-2xl border border-slate-200 bg-white px-5 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition cursor-pointer"
            >
              Close
            </button>
            <button
              onClick={handleSaveAllSelected}
              disabled={selectedIds.size === 0 || isProcessing || isSaving}
              className="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-2.5 text-xs font-bold text-white shadow-md hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 transition cursor-pointer"
            >
              <span>⚡</span>
              <span>
                {isSaving
                  ? "Saving to Google Sheet..."
                  : `Sync Selected (${selectedIds.size}) to Google Sheet & Database`}
              </span>
            </button>
          </div>
        </div>

      </div>

      {/* Full Image Preview Zoom Modal */}
      {previewImage && (
        <div
          onClick={() => setPreviewImage(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm cursor-zoom-out"
        >
          <div className="relative max-h-[90vh] max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl">
            <img
              src={previewImage}
              alt="Service Card Large Preview"
              className="max-h-[85vh] w-auto object-contain"
            />
            <div className="absolute top-3 right-3">
              <button
                onClick={() => setPreviewImage(null)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
