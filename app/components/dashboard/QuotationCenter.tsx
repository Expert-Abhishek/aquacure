"use client";

import { useState } from "react";
import { jsPDF } from "jspdf";
import { Input, SectionCard } from "./ui";
import type { Customer, Quotation } from "./types";

interface QuotationCenterProps {
  sheetCustomers: Customer[];
  quotations: Quotation[];
  onAddQuotation: (name: string, price: string, image: string, specs: string) => Promise<void>;
  onDeleteQuotation: (id: string) => Promise<void>;
}

const DEFAULT_SPECS = `- Multi-stage purification (RO + UV + UF + TDS Controller)
- 12 Liters high-capacity storage tank
- High performance booster pump (75 GPD)
- Food-grade ABS leak-proof body
- Fully automatic water level sensor
- Suitable for borewell, tanker & tap water`;

const DEFAULT_TERMS = `1. Warranty: 12 Months Warranty on Electrical Parts (Pump & SMPS) and Membrane.
2. Installation: Free standard installation included.
3. Delivery: Within 24-48 hours of order confirmation.
4. Payment: 100% on installation/delivery via Cash or UPI.`;

export default function QuotationCenter({
  sheetCustomers,
  quotations,
  onAddQuotation,
  onDeleteQuotation,
}: QuotationCenterProps) {
  // Active Quotation Editor states
  const [roName, setRoName] = useState("");
  const [roPrice, setRoPrice] = useState("");
  const [roImage, setRoImage] = useState("");
  const [roSpecs, setRoSpecs] = useState(DEFAULT_SPECS);
  const [roTerms, setRoTerms] = useState(DEFAULT_TERMS);

  // Customer states for active sharing
  const [custSearch, setCustSearch] = useState("");
  const [custName, setCustName] = useState("");
  const [custPhone, setCustPhone] = useState("");
  const [searchResults, setSearchResults] = useState<Customer[]>([]);

  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState({ text: "", isError: false });

  // Handle customer search from sheet data
  const handleCustomerSearchChange = (value: string) => {
    setCustSearch(value);
    if (!value.trim()) {
      setSearchResults([]);
      return;
    }
    const query = value.toLowerCase();
    const matches = sheetCustomers.filter(
      (c) =>
        c.name.toLowerCase().includes(query) ||
        c.address.toLowerCase().includes(query) ||
        c.phone.toLowerCase().includes(query)
    );
    setSearchResults(matches.slice(0, 5));
  };

  const handleFillCustomer = (c: Customer) => {
    setCustName(c.name);
    setCustPhone(c.phone);
    setCustSearch("");
    setSearchResults([]);
  };

  // Canvas-based image resizer and compressor to keep Firestore under document limit (1MB)
  const compressImage = (base64Str: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.src = base64Str;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX_WIDTH = 450;
        const MAX_HEIGHT = 450;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject("Could not get 2D context");
          return;
        }

        // Draw white background (especially for transparent PNGs)
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, width, height);

        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.75));
      };
      img.onerror = (err) => reject(err);
    });
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = reader.result as string;
      try {
        const compressed = await compressImage(base64);
        setRoImage(compressed);
        setStatusMsg({ text: "Image uploaded and optimized successfully.", isError: false });
      } catch (err) {
        console.error(err);
        setRoImage(base64);
        setStatusMsg({ text: "Image loaded, but optimization failed.", isError: true });
      }
    };
    reader.readAsDataURL(file);
  };

  // Select a saved quotation template
  const handleSelectTemplate = (q: Quotation) => {
    setRoName(q.name);
    setRoPrice(q.price);
    setRoImage(q.image);
    setRoSpecs(q.specs || DEFAULT_SPECS);
    setStatusMsg({ text: `Loaded template: ${q.name}`, isError: false });
  };

  // Save the current active product info to Firestore templates
  const handleSaveAsTemplate = async () => {
    if (!roName.trim()) {
      setStatusMsg({ text: "Please enter product name to save template.", isError: true });
      return;
    }
    if (!roPrice.trim()) {
      setStatusMsg({ text: "Please enter product price to save template.", isError: true });
      return;
    }
    if (!roImage) {
      setStatusMsg({ text: "Please upload an RO image to save template.", isError: true });
      return;
    }

    setLoading(true);
    setStatusMsg({ text: "Saving template to database...", isError: false });
    try {
      await onAddQuotation(roName, roPrice, roImage, roSpecs);
      setStatusMsg({ text: "Template saved successfully!", isError: false });
    } catch {
      setStatusMsg({ text: "Failed to save template.", isError: true });
    } finally {
      setLoading(false);
    }
  };

  // Generate jsPDF instance
  const buildPDF = () => {
    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });

    // 1. Header background Accent Bar
    doc.setFillColor(15, 23, 42); // slate-900
    doc.rect(0, 0, 210, 8, "F");
    doc.setFillColor(14, 165, 233); // sky-500
    doc.rect(0, 8, 210, 2, "F");

    // 2. Company Identity
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.setTextColor(30, 58, 138); // blue-900
    doc.text("AQUATECH SERVICES", 15, 25);

    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105); // slate-600
    doc.text("Complete RO Water Purifier Solutions", 15, 30);

    // 3. Contact details (right side header)
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    doc.text("Mob: +91 96508 30901, 97115 81142", 135, 21);
    doc.text("Email: aquatechservices30@gmail.com", 135, 26);
    doc.text("New Delhi, India", 135, 31);

    // Decorative Separator Line
    doc.setDrawColor(226, 232, 240); // slate-200
    doc.setLineWidth(0.5);
    doc.line(15, 36, 195, 36);

    // 4. Quotation Meta
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(15, 23, 42);
    doc.text("QUOTATION", 15, 46);

    const todayStr = new Date().toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
    const quoteNo = `QT-${Date.now().toString().slice(-6)}`;
    const validStr = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    doc.text(`Quotation No: ${quoteNo}`, 135, 43);
    doc.text(`Date: ${todayStr}`, 135, 48);
    doc.text(`Valid Until: ${validStr}`, 135, 53);

    // 5. Customer & Company Info Blocks
    doc.setFillColor(248, 250, 252); // slate-50 background for customer info
    doc.roundedRect(15, 58, 85, 22, 2, 2, "F");
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(15, 58, 85, 22, 2, 2, "S");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139); // slate-500
    doc.text("PREPARED FOR:", 18, 63);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text(custName.trim() ? custName : "Valued Customer", 18, 69);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    if (custPhone.trim()) {
      doc.text(`Phone: +91 ${custPhone}`, 18, 75);
    } else {
      doc.text("Phone: Not specified", 18, 75);
    }

    // Company info block on right
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(110, 58, 85, 22, 2, 2, "F");
    doc.roundedRect(110, 58, 85, 22, 2, 2, "S");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text("PREPARED BY:", 113, 63);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text("Aquatech Services", 113, 69);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    doc.text("Mob: +91 96508 30901, 97115 81142", 113, 75);

    // 6. Main Pricing Table
    const tableY = 88;
    doc.setFillColor(15, 23, 42); // slate-900 header
    doc.rect(15, tableY, 180, 8, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    doc.text("Product Details & Description", 18, tableY + 5.5);
    doc.text("Qty", 125, tableY + 5.5);
    doc.text("Price (INR)", 148, tableY + 5.5);
    doc.text("Total (INR)", 175, tableY + 5.5);

    // Table Content Row
    doc.setFillColor(255, 255, 255);
    doc.rect(15, tableY + 8, 180, 14, "S");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text(roName.trim() ? roName : "RO Water Purifier System", 18, tableY + 14);
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.text("Complete unit including standard accessories", 18, tableY + 19);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text("1 Set", 125, tableY + 16);

    const priceNum = parseFloat(roPrice.replace(/[^0-9]/g, "")) || 0;
    const formattedPrice = `Rs. ${priceNum.toLocaleString("en-IN")}`;
    doc.text(formattedPrice, 148, tableY + 16);
    
    doc.setFont("helvetica", "bold");
    doc.text(formattedPrice, 175, tableY + 16);

    // 7. Image & Technical Specifications Layout
    const detailsY = 117;

    // Image Block on Left
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(30, 58, 138);
    doc.text("PRODUCT PREVIEW", 15, detailsY - 3);

    doc.setFillColor(250, 250, 250);
    doc.rect(15, detailsY, 75, 75, "F");
    doc.setDrawColor(226, 232, 240);
    doc.rect(15, detailsY, 75, 75, "S");

    if (roImage) {
      try {
        // Draw image stretched/fitted
        doc.addImage(roImage, "JPEG", 17, detailsY + 2, 71, 71);
      } catch (err) {
        console.error("PDF image drawing error:", err);
      }
    } else {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(148, 163, 184);
      doc.text("No image preview", 38, detailsY + 38);
    }

    // Specifications block on Right
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(30, 58, 138);
    doc.text("TECHNICAL SPECIFICATIONS", 100, detailsY - 3);

    doc.setFillColor(248, 250, 252);
    doc.rect(100, detailsY, 95, 75, "F");
    doc.rect(100, detailsY, 95, 75, "S");

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(51, 65, 85); // slate-700

    const specLines = roSpecs.split("\n");
    let lineY = detailsY + 7;
    specLines.forEach((line) => {
      if (line.trim()) {
        const text = line.trim().startsWith("-") ? line.trim() : `• ${line.trim()}`;
        // Wrap text to fit spec box width
        const splitText = doc.splitTextToSize(text, 87);
        splitText.forEach((st: string) => {
          doc.text(st, 104, lineY);
          lineY += 5;
        });
      }
    });

    // 8. Terms & Conditions
    const termsY = 205;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text("Terms & Conditions", 15, termsY);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);

    const termLines = roTerms.split("\n");
    let tY = termsY + 5;
    termLines.forEach((line) => {
      if (line.trim()) {
        const splitTerms = doc.splitTextToSize(line.trim(), 180);
        splitTerms.forEach((st: string) => {
          doc.text(st, 15, tY);
          tY += 4.5;
        });
      }
    });

    // 9. Signatures and Thank You Note
    const footerY = 250;
    doc.setDrawColor(226, 232, 240);
    doc.line(15, footerY, 195, footerY);

    // Signature Area
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.text("Client Confirmation", 15, footerY + 12);
    doc.text("For Aquatech Services", 150, footerY + 12);
    doc.text("Authorized Signatory", 150, footerY + 22);

    doc.setDrawColor(203, 213, 225);
    doc.line(15, footerY + 8, 55, footerY + 8);
    doc.line(150, footerY + 8, 190, footerY + 8);

    // Clean Water Tagline Centered
    doc.setFont("helvetica", "bolditalic");
    doc.setFontSize(9);
    doc.setTextColor(14, 165, 233); // sky-500
    doc.text("Clean Water for a Healthier Life", 80, footerY + 28);

    return doc;
  };

  const handleDownloadPDF = () => {
    if (!roName.trim()) {
      setStatusMsg({ text: "Please enter product name before generating PDF.", isError: true });
      return;
    }
    if (!roPrice.trim()) {
      setStatusMsg({ text: "Please enter price before generating PDF.", isError: true });
      return;
    }

    try {
      const doc = buildPDF();
      const filename = `Quotation_${roName.replace(/\s+/g, "_")}.pdf`;
      doc.save(filename);
      setStatusMsg({ text: "PDF downloaded successfully!", isError: false });
    } catch (err) {
      console.error(err);
      setStatusMsg({ text: "Failed to generate PDF.", isError: true });
    }
  };

  const handleSendWhatsApp = () => {
    if (!custPhone.trim()) {
      setStatusMsg({ text: "Please enter customer's mobile number to send via WhatsApp.", isError: true });
      return;
    }
    if (!roName.trim()) {
      setStatusMsg({ text: "Please enter product name before sending.", isError: true });
      return;
    }
    if (!roPrice.trim()) {
      setStatusMsg({ text: "Please enter price before sending.", isError: true });
      return;
    }

    // 1. Download PDF to customer device
    try {
      const doc = buildPDF();
      const filename = `Quotation_${roName.replace(/\s+/g, "_")}.pdf`;
      doc.save(filename);
    } catch (err) {
      console.error("PDF download fail before WhatsApp:", err);
    }

    // 2. Prefill professional text message and open WhatsApp
    const cleanPhone = custPhone.replace(/[^0-9]/g, "");
    // Ensure country code is added if not present (default to India +91)
    const formattedPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
    
    const priceNum = parseFloat(roPrice.replace(/[^0-9]/g, "")) || 0;
    const formattedPrice = `Rs. ${priceNum.toLocaleString("en-IN")}`;

    const text = `Hello *${custName.trim() ? custName : "Valued Customer"}*,\n\nHere is the official quotation for the *${roName}* RO Water Purifier from *Aquatech Services*.\n\n*Product details:*\n- Price: *${formattedPrice}*\n- Warranty: 1 year warranty on membrane & electrical parts\n- Installation: Free standard installation\n\nI have attached the professional PDF quotation for your review. Please download it and let us know if you have any questions.\n\nThank you,\n*Aquatech Services*`;
    
    const whatsappUrl = `https://api.whatsapp.com/send?phone=${formattedPhone}&text=${encodeURIComponent(text)}`;
    window.open(whatsappUrl, "_blank");

    setStatusMsg({ text: "PDF generated and WhatsApp redirect opened!", isError: false });
  };

  return (
    <div className="space-y-6">
      {/* Search Customer from Sheet to auto-fill */}
      <SectionCard title="Quotation Center" description="Generate professional PDF quotations for RO systems and share them directly with customers via WhatsApp.">
        <div className="mt-5 relative">
          <Input
            label="Search Customer from sheet (Optional)"
            value={custSearch}
            onChange={handleCustomerSearchChange}
            placeholder="Type customer name or phone to auto-fill details…"
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

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Input
            label="Customer Name"
            value={custName}
            onChange={setCustName}
            placeholder="Name for the PDF (e.g. John Doe)"
          />
          <Input
            label="Customer Phone Number (for WhatsApp)"
            value={custPhone}
            onChange={setCustPhone}
            placeholder="e.g. 9876543210"
          />
        </div>
      </SectionCard>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Columns - Active Product Editor */}
        <div className="space-y-6 lg:col-span-2">
          <SectionCard title="Quotation Editor" description="Fill in the RO Purifier model details. You can load a ready-made quotation template below, or enter custom values.">
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Input
                label="RO / Product Name"
                value={roName}
                onChange={setRoName}
                placeholder="e.g. Aquatech Elite Alkaline RO"
              />
              <Input
                label="Price (₹)"
                value={roPrice}
                onChange={setRoPrice}
                placeholder="e.g. 8500"
              />
            </div>

            <div className="mt-4">
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">
                Technical Specifications (One item per line)
              </label>
              <textarea
                value={roSpecs}
                onChange={(e) => setRoSpecs(e.target.value)}
                rows={5}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-slate-900"
                placeholder="Enter technical specifications..."
              />
            </div>

            <div className="mt-4">
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">
                Terms & Conditions
              </label>
              <textarea
                value={roTerms}
                onChange={(e) => setRoTerms(e.target.value)}
                rows={4}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-slate-900"
                placeholder="Enter terms and conditions..."
              />
            </div>

            {/* Image Upload Area */}
            <div className="mt-4">
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                RO System Image
              </label>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <div className="relative flex h-32 w-32 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 hover:bg-slate-100 transition">
                  {roImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={roImage} alt="Product preview" className="h-full w-full object-cover" />
                  ) : (
                    <div className="text-center p-2 text-slate-400">
                      <span className="text-2xl">📷</span>
                      <p className="text-[10px] mt-1">Upload Photo</p>
                    </div>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="absolute inset-0 cursor-pointer opacity-0"
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-slate-500">
                    Upload an image of the RO model. Images are automatically cropped and optimized to fit the professional PDF frame.
                  </p>
                  {roImage && (
                    <button
                      type="button"
                      onClick={() => setRoImage("")}
                      className="text-xs font-semibold text-rose-600 hover:text-rose-500 transition"
                    >
                      Clear Image
                    </button>
                  )}
                </div>
              </div>
            </div>

            {statusMsg.text && (
              <div
                className={`mt-4 rounded-2xl px-4 py-3 text-sm ${
                  statusMsg.isError ? "bg-rose-50 text-rose-700" : "bg-blue-50 text-blue-700"
                }`}
              >
                {statusMsg.text}
              </div>
            )}

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleDownloadPDF}
                className="rounded-2xl bg-slate-900 px-6 py-3 text-sm font-semibold text-white transition hover:bg-slate-700"
              >
                📄 Download PDF
              </button>
              <button
                type="button"
                onClick={handleSendWhatsApp}
                className="rounded-2xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500"
              >
                📲 Send via WhatsApp
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={handleSaveAsTemplate}
                className="rounded-2xl border border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
              >
                💾 Save as Template
              </button>
            </div>
          </SectionCard>
        </div>

        {/* Right Columns - Ready-Made / Saved Quotations Templates */}
        <div className="space-y-6 lg:col-span-1">
          <SectionCard
            title="Saved Templates"
            description="Select a template RO model to pre-fill the editor, or delete obsolete templates."
          >
            {quotations.length === 0 ? (
              <div className="py-8 text-center">
                <span className="text-3xl text-slate-300">📁</span>
                <p className="mt-2 text-sm text-slate-500">No quotation templates saved yet.</p>
                <p className="text-xs text-slate-400 mt-1">Fill the editor on the left and click &apos;Save as Template&apos;</p>
              </div>
            ) : (
              <div className="mt-4 space-y-4 max-h-[600px] overflow-y-auto pr-1">
                {quotations.map((q) => (
                  <div
                    key={q.id}
                    className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-3 hover:shadow-md transition flex gap-3"
                  >
                    <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-slate-100 bg-slate-50">
                      {q.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={q.image} alt={q.name} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-slate-300 text-lg">📷</div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0 pr-6">
                      <h4 className="font-semibold text-sm text-slate-900 truncate">{q.name}</h4>
                      <p className="text-xs font-semibold text-blue-600 mt-0.5">₹{parseFloat(q.price).toLocaleString("en-IN")}</p>
                      {q.specs && (
                        <p className="text-[10px] text-slate-400 truncate mt-0.5">
                          {q.specs.replace(/\n/g, ", ").replace(/-\s*/g, "")}
                        </p>
                      )}
                    </div>

                    <div className="absolute right-2 top-2 flex flex-col gap-1 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={() => handleSelectTemplate(q)}
                        className="rounded-lg bg-blue-50 p-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-100 transition"
                        title="Load into editor"
                      >
                        📂
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteQuotation(q.id)}
                        className="rounded-lg bg-rose-50 p-1.5 text-xs font-semibold text-rose-500 hover:bg-rose-100 transition"
                        title="Delete template"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
