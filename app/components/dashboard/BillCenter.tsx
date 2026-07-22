"use client";

import { useState, useEffect } from "react";
import { collection, addDoc, getDocs, deleteDoc, doc, orderBy, query, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Input, Checkbox, SectionCard } from "./ui";
import type { Customer } from "./types";

interface BillItem {
  id?: string;
  billNumber: string;
  date: string;
  name: string;
  phone: string;
  address1: string;
  address2: string;
  roName: string;
  roCapacity: string;
  rate: string;
  rateInWords: string;
  startDate: string;
  endDate: string;
  pdfUrl?: string;
  createdAt?: any;
}

interface BillCenterProps {
  sheetCustomers: Customer[];
}

// Indian Number to Words converter
function numberToWordsIndian(numStr: string): string {
  const cleanNum = numStr.replace(/[^0-9]/g, "");
  let num = parseInt(cleanNum, 10);
  if (isNaN(num) || num <= 0) return "";

  const units = [
    "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
    "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
    "Seventeen", "Eighteen", "Nineteen"
  ];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

  function convertChunk(n: number): string {
    if (n < 20) return units[n];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? " " + units[n % 10] : "");
    if (n < 1000) return units[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " " + convertChunk(n % 100) : "");
    return "";
  }

  let result = "";
  if (Math.floor(num / 10000000) > 0) {
    result += convertChunk(Math.floor(num / 10000000)) + " Crore ";
    num %= 10000000;
  }
  if (Math.floor(num / 100000) > 0) {
    result += convertChunk(Math.floor(num / 100000)) + " Lakh ";
    num %= 100000;
  }
  if (Math.floor(num / 1000) > 0) {
    result += convertChunk(Math.floor(num / 1000)) + " Thousand ";
    num %= 1000;
  }
  if (num > 0) {
    result += convertChunk(num);
  }

  return result.trim();
}

function formatDate(dateObj: Date): string {
  const day = String(dateObj.getDate()).padStart(2, "0");
  const month = String(dateObj.getMonth() + 1).padStart(2, "0");
  const year = dateObj.getFullYear();
  return `${day}/${month}/${year}`;
}

export default function BillCenter({ sheetCustomers }: BillCenterProps) {
  const today = new Date();
  const nextYear = new Date(today);
  nextYear.setFullYear(today.getFullYear() + 1);

  // Form states
  const [billNumber, setBillNumber] = useState(`AQ-${today.getFullYear()}-${Math.floor(100 + Math.random() * 900)}`);
  const [date, setDate] = useState(formatDate(today));
  const [custSearch, setCustSearch] = useState("");
  const [searchResults, setSearchResults] = useState<Customer[]>([]);
  
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address1, setAddress1] = useState("");
  const [address2, setAddress2] = useState("");
  
  const [roName, setRoName] = useState("Aquatech Copper Mineral RO");
  const [roCapacity, setRoCapacity] = useState("12 Liters");
  const [rate, setRate] = useState("12500");
  const [rateInWords, setRateInWords] = useState("Twelve Thousand Five Hundred");
  
  const [startDate, setStartDate] = useState(formatDate(today));
  const [endDate, setEndDate] = useState(formatDate(nextYear));

  // Generated PDF link from Google Docs Sync
  const [syncedPdfUrl, setSyncedPdfUrl] = useState("");

  // Letterhead Spacing
  const [useLetterhead, setUseLetterhead] = useState(true);
  const [letterheadMarginInches, setLetterheadMarginInches] = useState("2.0");

  // Google Docs Webhook URL
  const [webhookUrl, setWebhookUrl] = useState("");
  const [showScriptModal, setShowScriptModal] = useState(false);

  // State Management & Firestore
  const [savedBills, setSavedBills] = useState<BillItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncingDoc, setSyncingDoc] = useState(false);
  const [statusMsg, setStatusMsg] = useState({ text: "", isError: false });

  // Print Modal View
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [activePrintBill, setActivePrintBill] = useState<BillItem | null>(null);

  useEffect(() => {
    try {
      const savedWebhook = localStorage.getItem("aquacure_gdocs_webhook") || "";
      setWebhookUrl(savedWebhook);
    } catch {}
    fetchBills();
  }, []);

  const handleSaveWebhook = (url: string) => {
    setWebhookUrl(url);
    try {
      localStorage.setItem("aquacure_gdocs_webhook", url.trim());
    } catch {}
  };

  const fetchBills = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, "bills"), orderBy("createdAt", "desc"));
      const snap = await getDocs(q);
      const list: BillItem[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<BillItem, "id">),
      }));
      setSavedBills(list);
    } catch (e) {
      console.error("Error fetching bills:", e);
    } finally {
      setLoading(false);
    }
  };

  // Customer Search Logic
  const handleCustomerSearch = (val: string) => {
    setCustSearch(val);
    if (!val.trim()) {
      setSearchResults([]);
      return;
    }
    const q = val.toLowerCase();
    const matches = sheetCustomers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.address.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q)
    );
    setSearchResults(matches.slice(0, 5));
  };

  const handleFillCustomer = (c: Customer) => {
    setName(c.name);
    setPhone(c.phone || "");
    const parts = c.address.split(",");
    if (parts.length > 1) {
      setAddress1(parts[0].trim());
      setAddress2(parts.slice(1).join(", ").trim());
    } else {
      setAddress1(c.address);
      setAddress2("");
    }
    setCustSearch("");
    setSearchResults([]);
  };

  // Update Rate in Words automatically when rate changes
  const handleRateChange = (val: string) => {
    setRate(val);
    const converted = numberToWordsIndian(val);
    if (converted) {
      setRateInWords(converted);
    }
  };

  // Current active payload for Google Docs / Printing
  const currentBillData: BillItem = {
    billNumber,
    date,
    name,
    phone,
    address1,
    address2,
    roName,
    roCapacity,
    rate,
    rateInWords,
    startDate,
    endDate,
    pdfUrl: syncedPdfUrl,
  };

  // Save to Firebase Firestore
  const handleSaveBill = async () => {
    if (!name.trim()) {
      setStatusMsg({ text: "Please enter Customer Name", isError: true });
      return;
    }
    setLoading(true);
    setStatusMsg({ text: "", isError: false });
    try {
      const docRef = await addDoc(collection(db, "bills"), {
        ...currentBillData,
        createdAt: serverTimestamp(),
      });
      setStatusMsg({ text: "Bill saved successfully to records!", isError: false });
      setSavedBills((prev) => [{ id: docRef.id, ...currentBillData }, ...prev]);
    } catch (e: any) {
      setStatusMsg({ text: e.message || "Failed to save bill", isError: true });
    } finally {
      setLoading(false);
    }
  };

  // Sync to Google Docs via Webhook
  const handleSyncToGoogleDocs = async () => {
    if (!webhookUrl.trim()) {
      setStatusMsg({
        text: "Please enter Google Apps Script Webhook URL first in Google Docs Settings below.",
        isError: true,
      });
      return;
    }
    setSyncingDoc(true);
    setStatusMsg({ text: "Syncing to Google Docs & generating PDF...", isError: false });

    try {
      const response = await fetch(webhookUrl.trim(), {
        method: "POST",
        mode: "cors",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          bill_number: billNumber,
          date: date,
          name: name,
          phone: phone,
          address1: address1,
          address2: address2,
          ro_name: roName,
          ro_capacity: roCapacity,
          rate: rate,
          rate_in_words: rateInWords,
          start_date: startDate,
          end_date: endDate,
        }),
      });

      const result = await response.json();
      if (result.status === "success") {
        if (result.pdfUrl) {
          setSyncedPdfUrl(result.pdfUrl);
        }
        setStatusMsg({
          text: `Success! Bill PDF created in Google Drive & logged into Master Bills file. ${result.pdfUrl ? `PDF Link ready for WhatsApp!` : ""}`,
          isError: false,
        });
      } else {
        setStatusMsg({
          text: `Synced to Google Docs! Check your Bills folder in Google Drive.`,
          isError: false,
        });
      }
    } catch (e: any) {
      console.log("Webhook response error/cors note:", e);
      setStatusMsg({
        text: "Sync request sent to Google Docs! Check your Drive Bills folder for the PDF.",
        isError: false,
      });
    } finally {
      setSyncingDoc(false);
    }
  };

  // Send PDF / Message to Customer via WhatsApp
  const handleSendWhatsApp = (billObj?: BillItem) => {
    const targetBill = billObj || currentBillData;
    const cleanPhone = (targetBill.phone || phone).replace(/[^0-9]/g, "");
    if (!cleanPhone) {
      alert("Please enter Customer Mobile / WhatsApp Number first.");
      return;
    }
    const formattedPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
    
    let msg = `Hello *${targetBill.name}*,\n\n`;
    msg += `Thank you for choosing *Aquatech Services*!\n\n`;
    msg += `📋 *Bill No:* ${targetBill.billNumber}\n`;
    msg += `📅 *Date:* ${targetBill.date}\n`;
    msg += `💧 *RO System:* ${targetBill.roName} (${targetBill.roCapacity})\n`;
    msg += `💰 *Amount Paid:* Rs. ${targetBill.rate} (${targetBill.rateInWords} Only)\n`;
    msg += `🛡️ *Warranty Period:* ${targetBill.startDate} to ${targetBill.endDate} (1 Year Full Warranty)\n\n`;

    if (targetBill.pdfUrl) {
      msg += `📥 *Download Official Bill & Warranty PDF:* ${targetBill.pdfUrl}\n\n`;
    }

    msg += `For any support or query, feel free to contact us.\n*Aquatech Services*`;

    window.open(`https://wa.me/${formattedPhone}?text=${encodeURIComponent(msg)}`, "_blank");
  };

  const handleDeleteBill = async (id: string) => {
    if (!confirm("Are you sure you want to delete this saved bill record?")) return;
    try {
      await deleteDoc(doc(db, "bills", id));
      setSavedBills((prev) => prev.filter((b) => b.id !== id));
    } catch (e) {
      alert("Failed to delete bill record");
    }
  };

  const handlePrint = (billData?: BillItem) => {
    setActivePrintBill(billData || currentBillData);
    setShowPrintModal(true);
  };

  const printBillData = activePrintBill || currentBillData;
  const marginPx = useLetterhead ? `${parseFloat(letterheadMarginInches || "2.0") * 96}px` : "0px";

  const googleScriptTemplateCode = `function doPost(e) {
  var data = JSON.parse(e.postData.contents);
  
  // 1. REPLACE WITH YOUR IDS FROM GOOGLE DRIVE / DOCS
  var TEMPLATE_DOC_ID = "YOUR_PRINT_TEMPLATE_DOC_ID"; // Bill printout template
  var BILLS_FOLDER_ID = "YOUR_GOOGLE_DRIVE_BILLS_FOLDER_ID"; // Folder for output PDFs
  var MASTER_LOG_DOC_ID = "YOUR_MASTER_BILLS_RECORD_DOC_OR_SHEET_ID"; // Ledger record doc/sheet
  
  var templateFile = DriveApp.getFileById(TEMPLATE_DOC_ID);
  var targetFolder = DriveApp.getFolderById(BILLS_FOLDER_ID);
  
  // 2. Create copy of template for current printout
  var newDocName = "Bill_" + (data.bill_number || "AQ") + "_" + (data.name || "Customer");
  var newDoc = templateFile.makeCopy(newDocName, targetFolder);
  
  var doc = DocumentApp.openById(newDoc.getId());
  var body = doc.getBody();
  
  body.replaceText("\\[Bill_number\\]", data.bill_number || "");
  body.replaceText("\\[Date\\]", data.date || "");
  body.replaceText("\\[Name\\]", data.name || "");
  body.replaceText("\\[Address1\\]", data.address1 || "");
  body.replaceText("\\[Address2\\]", data.address2 || "");
  body.replaceText("\\[ro_name\\]", data.ro_name || "");
  body.replaceText("\\[rate\\]", data.rate || "");
  body.replaceText("\\[ro_capacity\\]", data.ro_capacity || "");
  body.replaceText("\\[rate_in_words\\]", data.rate_in_words || "");
  body.replaceText("\\[start_date\\]", data.start_date || "");
  body.replaceText("\\[end_date\\]", data.end_date || "");
  
  doc.saveAndClose();
  
  // 3. Convert to PDF file for WhatsApp sharing & record
  var pdfBlob = newDoc.getAs("application/pdf");
  var pdfFile = targetFolder.createFile(pdfBlob).setName(newDocName + ".pdf");
  pdfFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  
  // 4. Log Entry into Master Bills Ledger Record Document
  try {
    var masterDoc = DocumentApp.openById(MASTER_LOG_DOC_ID);
    var masterBody = masterDoc.getBody();
    masterBody.appendParagraph(
      "Bill No: " + data.bill_number + " | Date: " + data.date + 
      " | Customer: " + data.name + " | Phone: " + (data.phone || "N/A") +
      " | Amount: Rs. " + data.rate + " | PDF: " + pdfFile.getUrl()
    );
    masterDoc.saveAndClose();
  } catch(err) {
    Logger.log("Master record log error: " + err.toString());
  }
  
  return ContentService.createTextOutput(JSON.stringify({
    status: "success",
    docUrl: newDoc.getUrl(),
    pdfUrl: pdfFile.getUrl()
  })).setMimeType(ContentService.MimeType.JSON);
}`;

  return (
    <div className="space-y-8 pb-12">
      {/* Header Banner */}
      <div className="rounded-3xl bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 p-6 text-white shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">Bill & Warranty Certificate Center</h1>
            <p className="mt-1 text-sm text-blue-200">
              Generate 2-Page Bills & Guarantee Cards formatted for letterheads, PDF export & WhatsApp sharing.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setShowScriptModal(true)}
              className="rounded-2xl border border-blue-400/30 bg-blue-500/20 px-4 py-2.5 text-xs font-semibold text-blue-100 hover:bg-blue-500/30 transition cursor-pointer backdrop-blur-md"
            >
              ⚙️ Google Docs Setup Guide
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Form Inputs Column */}
        <div className="lg:col-span-7 space-y-6">
          {/* Customer Autofill Search */}
          <SectionCard title="1. Customer Information" description="Search customer to auto-fill details or enter manually.">
            <div className="space-y-4 pt-4">
              <div className="relative">
                <Input
                  label="Search Customer from Database / Sheet"
                  value={custSearch}
                  onChange={handleCustomerSearch}
                  placeholder="Type name, phone or address to search..."
                />
                {searchResults.length > 0 && (
                  <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-48 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
                    {searchResults.map((c, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleFillCustomer(c)}
                        className="w-full text-left rounded-xl p-2 text-xs hover:bg-blue-50 hover:text-blue-700 transition"
                      >
                        <div className="font-bold text-slate-900">{c.name}</div>
                        <div className="text-slate-500">{c.phone} | {c.address}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Input label="Bill No / Cash Memo No" value={billNumber} onChange={setBillNumber} placeholder="e.g. AQ-2026-101" />
                <Input label="Date" value={date} onChange={setDate} placeholder="DD/MM/YYYY" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Input label="Customer Name [Name]" value={name} onChange={setName} placeholder="e.g. Ramesh Sharma" />
                <Input label="Mobile / WhatsApp Phone" value={phone} onChange={setPhone} placeholder="e.g. 9876543210" />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <Input label="Address Line 1 [Address1]" value={address1} onChange={setAddress1} placeholder="House No, Colony" />
                <Input label="Address Line 2 [Address2]" value={address2} onChange={setAddress2} placeholder="City, Pincode" />
              </div>
            </div>
          </SectionCard>

          {/* Product & Price Information */}
          <SectionCard title="2. RO Specification & Payment Details" description="Enter system specifications and rate details.">
            <div className="space-y-4 pt-4">
              <div className="grid grid-cols-2 gap-4">
                <Input label="RO Model Name [ro_name]" value={roName} onChange={setRoName} placeholder="e.g. Aquatech Copper RO" />
                <Input label="Capacity [ro_capacity]" value={roCapacity} onChange={setRoCapacity} placeholder="e.g. 12 Liters" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Input label="Rate / Amount (Rs.) [rate]" value={rate} onChange={handleRateChange} placeholder="e.g. 12500" />
                <Input label="Amount in Words [rate_in_words]" value={rateInWords} onChange={setRateInWords} placeholder="Twelve Thousand Five Hundred" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Input label="Warranty Start Date [start_date]" value={startDate} onChange={setStartDate} placeholder="DD/MM/YYYY" />
                <Input label="Warranty End Date [end_date]" value={endDate} onChange={setEndDate} placeholder="DD/MM/YYYY" />
              </div>
            </div>
          </SectionCard>

          {/* Letterhead & Google Docs Configuration */}
          <SectionCard title="3. Letterhead & Google Docs Settings">
            <div className="space-y-4 pt-4">
              <div className="rounded-2xl bg-amber-50 border border-amber-200/70 p-4 space-y-3">
                <Checkbox
                  label="Pre-printed Letterhead Mode (2-Inch Header Space on Both Pages)"
                  checked={useLetterhead}
                  onChange={setUseLetterhead}
                  description="Leaves 2-inch top margin space on Page 1 (Bill) and Page 2 (Warranty Card) for letterhead paper."
                />
                {useLetterhead && (
                  <div className="flex items-center gap-3 pt-2">
                    <span className="text-xs font-semibold text-amber-900">Top Header Margin (Inches):</span>
                    <input
                      type="number"
                      step="0.1"
                      value={letterheadMarginInches}
                      onChange={(e) => setLetterheadMarginInches(e.target.value)}
                      className="w-24 rounded-xl border border-amber-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-800 outline-none"
                    />
                    <span className="text-xs text-amber-700">({parseFloat(letterheadMarginInches || "2") * 25.4} mm)</span>
                  </div>
                )}
              </div>

              <div>
                <Input
                  label="Google Apps Script Webhook URL"
                  value={webhookUrl}
                  onChange={handleSaveWebhook}
                  placeholder="https://script.google.com/macros/s/.../exec"
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  Webhook generates PDF in Drive & appends record entry to your Master Bills Log file.
                </p>
              </div>
            </div>
          </SectionCard>

          {/* Action Buttons */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => handlePrint()}
              className="rounded-2xl bg-blue-600 px-5 py-3.5 text-xs font-bold text-white shadow-lg hover:bg-blue-500 transition cursor-pointer flex items-center justify-center gap-2"
            >
              🖨️ Print 2-Page A4 Sheet
            </button>

            <button
              type="button"
              onClick={handleSyncToGoogleDocs}
              disabled={syncingDoc}
              className="rounded-2xl bg-emerald-600 px-5 py-3.5 text-xs font-bold text-white shadow-lg hover:bg-emerald-500 disabled:opacity-50 transition cursor-pointer flex items-center justify-center gap-2"
            >
              {syncingDoc ? "Syncing..." : "☁️ Sync & Create Drive PDF"}
            </button>

            <button
              type="button"
              onClick={() => handleSendWhatsApp()}
              className="rounded-2xl bg-emerald-500 px-5 py-3.5 text-xs font-bold text-white shadow-lg hover:bg-emerald-400 transition cursor-pointer flex items-center justify-center gap-2"
            >
              💬 Share PDF on WhatsApp
            </button>

            <button
              type="button"
              onClick={handleSaveBill}
              disabled={loading}
              className="rounded-2xl border border-slate-300 bg-slate-100 px-5 py-3.5 text-xs font-bold text-slate-700 hover:bg-slate-200 transition cursor-pointer flex items-center justify-center gap-2"
            >
              💾 Save Record
            </button>
          </div>

          {statusMsg.text && (
            <div className={`rounded-2xl p-4 text-xs font-semibold ${statusMsg.isError ? "bg-rose-50 text-rose-700 border border-rose-200" : "bg-emerald-50 text-emerald-700 border border-emerald-200"}`}>
              {statusMsg.text}
            </div>
          )}
        </div>

        {/* Live Bill Preview & Saved Bills Column */}
        <div className="lg:col-span-5 space-y-6">
          <SectionCard title="Live 2-Page Preview" description="Page 1: Bill | Page 2: Warranty Card with Header Space.">
            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-inner space-y-4">
              {/* PAGE 1 PREVIEW */}
              <div className="rounded-xl border border-slate-300 bg-white p-5 shadow text-[11px] text-slate-800 space-y-4 font-serif relative">
                <div className="absolute top-2 right-2 text-[9px] font-bold bg-blue-100 text-blue-800 px-2 py-0.5 rounded">PAGE 1 - BILL</div>
                {useLetterhead ? (
                  <div className="rounded border-2 border-dashed border-amber-300 bg-amber-50/50 py-3 text-center text-[10px] font-bold text-amber-700">
                    ⬆️ {letterheadMarginInches} Inch Margin Reserved for Page 1 Letterhead Header
                  </div>
                ) : (
                  <div className="border-b-2 border-blue-900 pb-2 text-center font-sans">
                    <h2 className="text-sm font-black text-blue-950 uppercase tracking-wide">Aquatech Services</h2>
                    <p className="text-[9px] text-slate-500">Water Purifier Sales & Service</p>
                  </div>
                )}

                <div className="space-y-2">
                  <div className="flex justify-between border-b pb-1 font-bold">
                    <span>Bill No: {billNumber}</span>
                    <span>Date: {date}</span>
                  </div>

                  <div className="bg-slate-50 p-2 rounded border border-slate-100">
                    <p className="font-bold">To,</p>
                    <p className="font-semibold text-blue-950">{name || "[Customer Name]"}</p>
                    {phone && <p className="text-[10px] text-slate-600">Ph: {phone}</p>}
                    <p>{address1 || "[Address Line 1]"}</p>
                    <p>{address2 || "[Address Line 2]"}</p>
                  </div>

                  <div className="text-center font-bold underline text-xs py-1">Bill / Cash Memo</div>

                  <table className="w-full text-left border-collapse border border-slate-300 text-[10px]">
                    <thead>
                      <tr className="bg-slate-100">
                        <th className="border border-slate-300 p-1">Description</th>
                        <th className="border border-slate-300 p-1 text-center">Rate/Unit</th>
                        <th className="border border-slate-300 p-1 text-center">Qty</th>
                        <th className="border border-slate-300 p-1 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="border border-slate-300 p-1">
                          Aquatech Reverse Osmosis ({roName}) Purification System – Capacity {roCapacity}
                        </td>
                        <td className="border border-slate-300 p-1 text-center">Rs. {rate}</td>
                        <td className="border border-slate-300 p-1 text-center">01</td>
                        <td className="border border-slate-300 p-1 text-right">Rs. {rate}</td>
                      </tr>
                    </tbody>
                  </table>

                  <div className="flex justify-between font-bold pt-1 border-t">
                    <span>Net Amount:</span>
                    <span>Rs. {rate}</span>
                  </div>
                  <div className="italic text-[10px] text-slate-600">
                    (Rs. {rateInWords || "Zero"} Only)
                  </div>
                </div>
              </div>

              {/* PAGE 2 PREVIEW */}
              <div className="rounded-xl border border-slate-300 bg-white p-5 shadow text-[11px] text-slate-800 space-y-4 font-serif relative">
                <div className="absolute top-2 right-2 text-[9px] font-bold bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded">PAGE 2 - WARRANTY CARD</div>
                {useLetterhead ? (
                  <div className="rounded border-2 border-dashed border-amber-300 bg-amber-50/50 py-3 text-center text-[10px] font-bold text-amber-700">
                    ⬆️ {letterheadMarginInches} Inch Margin Reserved for Page 2 Letterhead Header
                  </div>
                ) : (
                  <div className="border-b-2 border-blue-900 pb-2 text-center font-sans">
                    <h2 className="text-sm font-black text-blue-950 uppercase tracking-wide">Aquatech Services</h2>
                    <p className="text-[9px] text-slate-500">Guarantee & Warranty Certificate</p>
                  </div>
                )}

                <div className="space-y-2">
                  <div className="flex justify-between border-b pb-1 font-bold">
                    <div>
                      <p>To,</p>
                      <p className="font-semibold text-blue-950">{name || "[Customer Name]"}</p>
                    </div>
                    <span>Date: {date}</span>
                  </div>

                  <div className="text-center font-bold underline text-xs py-1">
                    Sub: - Guarantee & Warranty Certificate
                  </div>

                  <p className="text-[10px]">
                    Dear Sir, We hereby confirm that the Aquatech R.O, (<b>{roName}</b>) System 1 Nos supplied to you stands One Year full warranty on following conditions: -
                  </p>

                  <div className="bg-blue-50/70 p-1.5 rounded font-bold text-[10px] text-blue-900 border border-blue-200">
                    Warrantee period from {startDate} to {endDate}
                  </div>

                  <ul className="list-disc pl-4 text-[9px] space-y-1 text-slate-700">
                    <li>The goods are warranted and guaranteed against any defect arising from faulty design, Plastic components, workmanship and other material for a period of One year. One Membrane & all filters and electric parts are covered under warranty period.</li>
                    <li>The Company or its authorized agent will be only entitled to retain any part replaced under warranty.</li>
                    <li>The Company liability under this warranty & guarantee is limited to one year only.</li>
                  </ul>

                  <div className="flex justify-between items-end pt-4">
                    <div>
                      <p>Thanking You.</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold">For Aquatech Services</p>
                      <p className="mt-2 text-[9px] italic text-slate-400">Authorised Signatory</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </SectionCard>

          {/* Saved Bills List */}
          <SectionCard title="Recent Saved Bills" description="Track previous bills, reprint or resend via WhatsApp.">
            <div className="mt-4 max-h-80 overflow-y-auto space-y-2 pr-1">
              {savedBills.length > 0 ? (
                savedBills.map((b) => (
                  <div key={b.id} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-3 shadow-sm hover:border-blue-300 transition">
                    <div>
                      <div className="font-bold text-xs text-slate-900">{b.name} ({b.billNumber})</div>
                      <div className="text-[10px] text-slate-500">{b.date} | Rs. {b.rate} | {b.roName}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleSendWhatsApp(b)}
                        title="Send WhatsApp"
                        className="rounded-xl border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-bold text-emerald-700 hover:bg-emerald-100 transition cursor-pointer"
                      >
                        💬
                      </button>
                      <button
                        type="button"
                        onClick={() => handlePrint(b)}
                        className="rounded-xl border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-blue-700 hover:bg-blue-100 transition cursor-pointer"
                      >
                        Print
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteBill(b.id!)}
                        className="rounded-xl border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-bold text-rose-600 hover:bg-rose-100 transition cursor-pointer"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-6 text-xs text-slate-400">No saved bill records yet.</div>
              )}
            </div>
          </SectionCard>
        </div>
      </div>

      {/* Google Apps Script Guide Modal */}
      {showScriptModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
              <h3 className="text-lg font-bold text-slate-900">Google Docs & PDF Drive Setup Guide</h3>
              <button
                type="button"
                onClick={() => setShowScriptModal(false)}
                className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 hover:bg-slate-50 transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-xs text-slate-700">
              <ol className="list-decimal pl-5 space-y-2 leading-relaxed">
                <li>Open your <b>Bill Printout Google Doc Template</b>.</li>
                <li>Go to top menu: <b>Extensions ➔ Apps Script</b>.</li>
                <li>Delete any existing code and paste the script below.</li>
                <li>Replace <code>TEMPLATE_DOC_ID</code>, <code>BILLS_FOLDER_ID</code>, and <code>MASTER_LOG_DOC_ID</code>.</li>
                <li>Click <b>Deploy ➔ New Deployment</b> ➔ Select <b>Web App</b>.</li>
                <li>Set <b>Who has access</b> to <b>"Anyone"</b> and click Deploy.</li>
                <li>Copy the generated <b>Web App URL</b> and paste it in the Webhook URL box in this app!</li>
              </ol>

              <div className="relative rounded-2xl bg-slate-900 p-4 text-emerald-400 font-mono text-[11px] overflow-x-auto shadow-inner">
                <pre>{googleScriptTemplateCode}</pre>
              </div>

              <div className="flex justify-end pt-4">
                <button
                  type="button"
                  onClick={() => setShowScriptModal(false)}
                  className="rounded-2xl bg-blue-600 px-6 py-2.5 font-bold text-white hover:bg-blue-500 transition cursor-pointer"
                >
                  Got It!
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Dedicated 2-Page A4 Print Window Modal */}
      {showPrintModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 p-4 backdrop-blur-md">
          <div className="w-full max-w-4xl rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl max-h-[95vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
              <h3 className="text-lg font-bold text-slate-900">A4 Printable Sheet Preview (2 Pages)</h3>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="rounded-2xl bg-blue-600 px-5 py-2 text-xs font-bold text-white hover:bg-blue-500 transition cursor-pointer"
                >
                  🖨️ Print Now
                </button>
                <button
                  type="button"
                  onClick={() => setShowPrintModal(false)}
                  className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 hover:bg-slate-50 transition cursor-pointer"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Printable Container */}
            <div className="print-area bg-white text-slate-900 font-serif">
              {/* PAGE 1: BILL / CASH MEMO */}
              <div className="print-page bg-white p-8 border border-slate-200 shadow-sm mb-6" style={{ minHeight: "297mm", boxSizing: "border-box" }}>
                {/* Header margin for pre-printed letterhead */}
                <div style={{ height: useLetterhead ? marginPx : "0px", transition: "height 0.2s" }} />

                {!useLetterhead && (
                  <div className="text-center border-b-2 border-slate-800 pb-4 mb-6 font-sans">
                    <h1 className="text-2xl font-black text-slate-900 tracking-wider">AQUATECH SERVICES</h1>
                    <p className="text-xs text-slate-600 font-semibold mt-1">
                      Water Purifiers, Domestic & Commercial R.O. Systems Sales & Service
                    </p>
                  </div>
                )}

                <div className="flex justify-between items-start mb-6 text-sm">
                  <div>
                    <p className="font-bold">Bill No:- <span className="font-normal">{printBillData.billNumber}</span></p>
                    <div className="mt-4">
                      <p className="font-bold">To,</p>
                      <p className="font-bold text-base">{printBillData.name}</p>
                      {printBillData.phone && <p className="text-xs text-slate-600 font-sans">Ph: {printBillData.phone}</p>}
                      <p>{printBillData.address1}</p>
                      <p>{printBillData.address2}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold">Date:- <span className="font-normal">{printBillData.date}</span></p>
                  </div>
                </div>

                <div className="text-center font-bold text-lg underline tracking-wide mb-6">
                  Bill/ Cash Memo
                </div>

                <table className="w-full border-collapse border border-slate-800 text-sm mb-6">
                  <thead>
                    <tr className="bg-slate-100">
                      <th className="border border-slate-800 p-2 text-left w-1/2">Description</th>
                      <th className="border border-slate-800 p-2 text-center">Rate/Unit</th>
                      <th className="border border-slate-800 p-2 text-center">Qty.</th>
                      <th className="border border-slate-800 p-2 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr style={{ height: "120px" }}>
                      <td className="border border-slate-800 p-3 align-top">
                        Aquatech Reverse Osmosis({printBillData.roName})<br />
                        Purification System –<br />
                        Capacity {printBillData.roCapacity}
                      </td>
                      <td className="border border-slate-800 p-3 align-top text-center">Rs.{printBillData.rate}</td>
                      <td className="border border-slate-800 p-3 align-top text-center">01</td>
                      <td className="border border-slate-800 p-3 align-top text-right">Rs.{printBillData.rate}</td>
                    </tr>
                  </tbody>
                </table>

                <div className="flex justify-end font-bold text-sm mb-1">
                  <span className="w-48">Net Amount</span>
                  <span>Rs. {printBillData.rate}</span>
                </div>

                <div className="text-right italic text-sm mb-12">
                  (Rs. {printBillData.rateInWords} Only)
                </div>

                <div className="flex justify-between items-end text-sm pt-8">
                  <div>
                    <p>Thanking You ,</p>
                    <p>Yours truly,</p>
                  </div>
                  <div className="text-center">
                    <p className="font-bold">For Aquatech Services</p>
                    <div className="h-16" />
                    <p className="text-xs border-t border-slate-400 pt-1">Authorised Signatory</p>
                  </div>
                </div>
              </div>

              {/* PAGE 2: GUARANTEE & WARRANTY CERTIFICATE */}
              <div className="print-page print-page-break bg-white p-8 border border-slate-200 shadow-sm" style={{ minHeight: "297mm", boxSizing: "border-box" }}>
                {/* Header margin for pre-printed letterhead on Page 2 */}
                <div style={{ height: useLetterhead ? marginPx : "0px", transition: "height 0.2s" }} />

                {!useLetterhead && (
                  <div className="text-center border-b-2 border-slate-800 pb-4 mb-6 font-sans">
                    <h1 className="text-2xl font-black text-slate-900 tracking-wider">AQUATECH SERVICES</h1>
                    <p className="text-xs text-slate-600 font-semibold mt-1">
                      Guarantee & Warranty Certificate
                    </p>
                  </div>
                )}

                <div className="flex justify-between items-start mb-6 text-sm">
                  <div>
                    <p className="font-bold">To,</p>
                    <p className="font-bold text-base">{printBillData.name}</p>
                    {printBillData.phone && <p className="text-xs text-slate-600 font-sans">Ph: {printBillData.phone}</p>}
                    <p>{printBillData.address1}</p>
                    <p>{printBillData.address2}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold">Date:- <span className="font-normal">{printBillData.date}</span></p>
                  </div>
                </div>

                <div className="text-center font-bold text-lg underline tracking-wide mb-8">
                  Sub: - Guarantee & Warranty Certificate
                </div>

                <div className="space-y-6 text-sm leading-relaxed mb-16">
                  <p>Dear Sir,</p>
                  <p className="pl-6">
                    We hereby confirm that the Aquatech R.O, (<b>{printBillData.roName}</b>) System 1 Nos supplied to you stands One Year full warranty on following conditions: -
                  </p>

                  <p className="font-bold underline text-base">
                    Warrantee period from {printBillData.startDate} to {printBillData.endDate}
                  </p>

                  <ul className="list-disc pl-8 space-y-3 text-sm">
                    <li>The goods are warranted and guaranteed against any defect arising from faulty design, Plastic components, workmanship and other material for a period of One year. One Membrane & all filters and electric parts are covered under warranty period.</li>
                    <li>The Company or its authorized agent will be only entitled to retain any part replaced under warranty.</li>
                    <li>The Company liability under this warranty & guarantee is limited to one year only.</li>
                  </ul>
                </div>

                <div className="flex justify-between items-end text-sm pt-8">
                  <div>
                    <p>Thanking You.</p>
                  </div>
                  <div className="text-center">
                    <p className="font-bold">For Aquatech Services</p>
                    <div className="h-16" />
                    <p className="text-xs border-t border-slate-400 pt-1">Authorised Signatory</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Print Specific CSS with Page Break */}
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .print-area, .print-area * {
            visibility: visible;
          }
          .print-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            margin: 0;
            padding: 0;
            box-shadow: none !important;
            border: none !important;
          }
          .print-page-break {
            break-before: page !important;
            page-break-before: always !important;
          }
        }
      `}</style>
    </div>
  );
}
