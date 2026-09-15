import type { Customer } from "@/app/components/dashboard/types";

export interface ExtractedCardData {
  id: string;
  fileName: string;
  imagePreview: string; // base64 data url for preview
  name: string;
  phone: string;
  address: string;
  amcMonth: string;
  amcPrice: string;
  balance: string;
  isPenCutOrPaid: boolean;
  model?: string;
  techName?: string;
  notes?: string;
  status: "pending" | "processing" | "success" | "error";
  errorMessage?: string;
  matchType?: "new" | "existing";
  matchedCustomer?: Customer;
}

export const DEFAULT_GEMINI_API_KEY = "AIzaSyBRIIzjDvFfcht2G443mSxOw3sszAlFY7k";

const MONTH_NAMES = [
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

export function normalizeMonth(rawMonth: string): string {
  if (!rawMonth) return "";
  const cleaned = rawMonth.trim().toLowerCase();

  // Check direct month names
  for (const m of MONTH_NAMES) {
    if (m.toLowerCase().startsWith(cleaned.substring(0, 3))) {
      return m;
    }
  }

  // Check month numbers (e.g. 06 or 6)
  const num = parseInt(cleaned, 10);
  if (!isNaN(num) && num >= 1 && num <= 12) {
    return MONTH_NAMES[num - 1];
  }

  return rawMonth.trim();
}

export function cleanPhoneNumber(raw: string): string {
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  // If starts with 91 and length is 12, take last 10 digits
  if (digits.length === 12 && digits.startsWith("91")) {
    return digits.substring(2);
  }
  if (digits.length > 10) {
    return digits.slice(-10);
  }
  return digits;
}

export function normalizeText(str: string): string {
  return (str || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

/**
 * Match a scanned card with existing customer list
 * Option A: Match by 10-digit phone number first, then fallback to Name + Address
 */
export function findMatchingCustomer(
  scanned: { phone: string; name: string; address?: string; amcMonth?: string },
  customers: Customer[]
): Customer | null {
  const cleanPhone = cleanPhoneNumber(scanned.phone);

  // 1. Match by Phone Number (if phone has at least 7 digits)
  if (cleanPhone.length >= 7) {
    const matchedByPhone = customers.find((c) => {
      const cPhone = cleanPhoneNumber(c.phone);
      return (
        cPhone === cleanPhone ||
        (cPhone.length >= 7 &&
          cleanPhone.length >= 7 &&
          (cPhone.endsWith(cleanPhone) || cleanPhone.endsWith(cPhone)))
      );
    });
    if (matchedByPhone) return matchedByPhone;
  }

  // 2. Fallback: Match by Name + Address similarity
  const scanNormName = normalizeText(scanned.name);
  if (scanNormName.length >= 3) {
    const scanNormAddr = normalizeText(scanned.address || "");

    // Exact name match
    const exactNameMatch = customers.find(
      (c) => normalizeText(c.name) === scanNormName
    );
    if (exactNameMatch) return exactNameMatch;

    // Name match with address match or partial name match
    const partialMatch = customers.find((c) => {
      const cNormName = normalizeText(c.name);
      const cNormAddr = normalizeText(c.address || "");

      const nameOverlap =
        cNormName.includes(scanNormName) || scanNormName.includes(cNormName);
      if (!nameOverlap) return false;

      // If name overlaps, check if address also has keywords or phone matches
      if (scanNormAddr.length >= 4 && cNormAddr.length >= 4) {
        if (
          cNormAddr.includes(scanNormAddr) ||
          scanNormAddr.includes(cNormAddr)
        ) {
          return true;
        }
      }
      return nameOverlap && scanNormName.length > 6;
    });

    if (partialMatch) return partialMatch;
  }

  return null;
}

/**
 * Convert a File object to base64 string
 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (error) => reject(error);
  });
}

/**
 * Call Gemini Vision AI to extract service card details
 */
export async function extractCardDataWithGemini(
  base64DataUrl: string,
  apiKey: string = DEFAULT_GEMINI_API_KEY,
  defaultMonth?: string
): Promise<{
  name: string;
  phone: string;
  address: string;
  amcMonth: string;
  amcPrice: string;
  balance: string;
  isPenCutOrPaid: boolean;
  model?: string;
  techName?: string;
  notes?: string;
}> {
  // Strip the base64 prefix
  const base64Data = base64DataUrl.split(",")[1] || base64DataUrl;
  const mimeType =
    base64DataUrl.match(/data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+).*,.*/)?.[1] ||
    "image/jpeg";

  const systemPrompt = `You are an expert OCR & Document Parser AI specialized in reading handwritten & printed Indian RO Service/AMC cards (specifically "AQUATECH SERVICES SERVICE CARD").

Analyze this service card image carefully and extract all details in strictly JSON format.

FIELDS TO EXTRACT:
1. "name": Full customer / company name (from "Name of Customer" or "M/S ...").
2. "phone": 10-digit mobile / telephone number (from "Telephone No." or contact). Clean it to 10 digits without spaces or dashes.
3. "address": Full address (from "Address", including Plot No, Sector, Area, City).
4. "amcMonth": AMC period month name (e.g. "June", "January"). Look at:
   - Top-left validity date range (e.g. "01/06/26 - 01/06/27" -> Month is "June")
   - Or "Date of Installation"
   - Or "Month of new AMC"
5. "amcPrice": AMC rate or contract price (e.g. "2200", "2500", "3000", or amounts written near AMC/attended/2026 rate). If empty, leave "".
6. "balance": Pending balance amount if any.
   IMPORTANT RULE FOR BALANCE (Task 2):
   - Check if any balance amount has been crossed out with a pen (strikethrough / cut mark / single pen line across the number) OR written as "PAID", "NIL", or "0".
   - If crossed out / cut with a pen or marked Paid/Nil: set "balance" to "0" and set "isPenCutOrPaid" to true.
   - If there is an active pending balance that is NOT crossed out: set "balance" to that amount (e.g. "500") and set "isPenCutOrPaid" to false.
   - If no balance is mentioned: set "balance" to "0" and "isPenCutOrPaid" to false.
7. "isPenCutOrPaid": boolean (true if balance was crossed out/paid, false otherwise).
8. "model": RO model / capacity if visible (e.g. "100 L", "50 L", "Commercial").
9. "techName": Technician name if visible (e.g. "Mr. Deepak", "Ravi").
10. "notes": Any complaint / filter change remarks if noted.

OUTPUT STRICTLY VALID JSON ONLY (no markdown backticks, no extra text):
{
  "name": "...",
  "phone": "...",
  "address": "...",
  "amcMonth": "...",
  "amcPrice": "...",
  "balance": "...",
  "isPenCutOrPaid": false,
  "model": "...",
  "techName": "...",
  "notes": "..."
}`;

  const requestBody = {
    contents: [
      {
        parts: [
          { text: systemPrompt },
          {
            inlineData: {
              mimeType: mimeType,
              data: base64Data,
            },
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: "application/json",
    },
  };

  const keyToUse = apiKey.trim() || DEFAULT_GEMINI_API_KEY;
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${keyToUse}`;

  let response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });

  // Fallback to gemini-1.5-flash if 2.5-flash is not available
  if (!response.ok) {
    const fallbackEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${keyToUse}`;
    response = await fetch(fallbackEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });
  }

  if (!response.ok) {
    const errorJson = await response.json().catch(() => ({}));
    throw new Error(
      errorJson?.error?.message ||
        `Gemini API returned HTTP ${response.status}: ${response.statusText}`
    );
  }

  const result = await response.json();
  const rawText =
    result?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "{}";

  // Clean JSON string if enclosed in markdown backticks
  const cleanJsonStr = rawText
    .replace(/^```json/i, "")
    .replace(/^```/i, "")
    .replace(/```$/, "")
    .trim();

  try {
    const parsed = JSON.parse(cleanJsonStr);
    let finalMonth = normalizeMonth(parsed.amcMonth || "");
    if (!finalMonth && defaultMonth) {
      finalMonth = defaultMonth;
    }

    return {
      name: (parsed.name || "").toString().trim(),
      phone: cleanPhoneNumber((parsed.phone || "").toString().trim()),
      address: (parsed.address || "").toString().trim(),
      amcMonth: finalMonth,
      amcPrice: (parsed.amcPrice || "").toString().trim(),
      balance: (parsed.balance ?? "").toString().trim(),
      isPenCutOrPaid: Boolean(parsed.isPenCutOrPaid),
      model: (parsed.model || "").toString().trim(),
      techName: (parsed.techName || "").toString().trim(),
      notes: (parsed.notes || "").toString().trim(),
    };
  } catch (parseError) {
    console.error("JSON parsing error on Gemini response:", rawText, parseError);
    throw new Error("Could not parse AI extraction result into JSON.");
  }
}
