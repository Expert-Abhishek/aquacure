import type { Timestamp } from "firebase/firestore";

export interface AdminUser {
  username: string;
  password: string;
  name: string;
}

export interface Technician {
  id: string;
  name: string;
  phone: string;
}

export interface Customer {
  id: string;
  name: string;
  address: string;
  phone: string;
  amcMonth: string;
  amcPrice: string;
}

export interface Task {
  id: string;
  name: string;
  address: string;
  phone: string;
  type: string;
  comment: string;
  techId: string;
  status: StatusKey;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
  amcMonth: string;
  amcPrice: string;
  sharePhone: boolean;
}

export interface QueryItem {
  id: string;
  name: string;
  address: string;
  phone: string;
  comment: string;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
  amcMonth: string;
  amcPrice: string;
  sharePhone: boolean;
}

export interface Quotation {
  id: string;
  name: string;
  price: string;
  image: string;
  specs: string;
  createdAt: Timestamp | null;
}

export type StatusKey = "pending" | "inprogress" | "done";

export interface StatusMeta {
  label: string;
  bg: string;
  text: string;
}

export interface SelectOption {
  value: string;
  label: string;
}

export const ADMIN_USER: AdminUser = {
  username: "admin",
  password: "admin123",
  name: "Admin",
};

export const TECHNICIANS: Technician[] = [
  { id: "ravi", name: "Ravi", phone: "919958877474" },
  { id: "deepak", name: "Deepak", phone: "919711581142" },
  { id: "admin", name: "Admin", phone: "919650830901" },
];

export const TASK_TYPES: string[] = ["New RO", "Per Visit", "Complaint"];

export const STATUS = {
  PENDING: "pending" as const,
  INPROGRESS: "inprogress" as const,
  DONE: "done" as const,
};

export const STATUS_LABEL: Record<StatusKey, StatusMeta> = {
  pending: { label: "Pending", bg: "bg-amber-100", text: "text-amber-700" },
  inprogress: { label: "In Progress", bg: "bg-blue-100", text: "text-blue-700" },
  done: { label: "Done", bg: "bg-emerald-100", text: "text-emerald-700" },
};
