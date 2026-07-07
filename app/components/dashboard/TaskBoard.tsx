"use client";

import { useMemo } from "react";
import { Badge, Input, Select, Checkbox, SectionCard } from "./ui";
import { STATUS, TASK_TYPES, TECHNICIANS, type Customer, type StatusKey, type Task } from "./types";

interface TaskBoardProps {
  tasks: Task[];
  firestoreLoading: boolean;
  sheetCustomers: Customer[];
  search: string;
  taskName: string;
  taskAddress: string;
  taskPhone: string;
  taskComment: string;
  taskAmcMonth: string;
  taskAmcPrice: string;
  taskSharePhone: boolean;
  taskType: string;
  taskTech: string;
  taskError: string;
  searchResults: Customer[];
  pageSize: number;
  filterStatus: string;
  page: number;
  totalPages: number;
  filteredTasks: Task[];
  pageTasks: Task[];
  onSearchChange: (value: string) => void;
  onTaskNameChange: (value: string) => void;
  onTaskAddressChange: (value: string) => void;
  onTaskPhoneChange: (value: string) => void;
  onTaskCommentChange: (value: string) => void;
  onTaskAmcMonthChange: (value: string) => void;
  onTaskAmcPriceChange: (value: string) => void;
  onTaskSharePhoneChange: (value: boolean) => void;
  onTaskTypeChange: (value: string) => void;
  onTaskTechChange: (value: string) => void;
  onAddTask: () => void;
  onFillFromCustomer: (customer: Customer) => void;
  onFilterStatusChange: (value: string) => void;
  onPageSizeChange: (value: number) => void;
  onPageChange: (value: number) => void;
  onUpdateComment: (taskId: string) => void;
  onEditComment: (taskId: string, comment: string) => void;
  editingCommentId: string | null;
  editingCommentText: string;
  onEditingCommentTextChange: (value: string) => void;
  onStatusChange: (taskId: string, newStatus: StatusKey) => void;
  onDeleteTask: (taskId: string) => void;
  onSetEditingCommentId: (taskId: string | null) => void;
}

function TaskActions({ task, onStatus, onDelete }: { task: Task; onStatus: (taskId: string, newStatus: StatusKey) => void; onDelete: (taskId: string) => void }) {
  const { status } = task;

  return (
    <div className="flex flex-wrap gap-2">
      {status === STATUS.PENDING && (
        <button type="button" onClick={() => onStatus(task.id, STATUS.INPROGRESS)} className="rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-500" title="Send to technician via WhatsApp and mark In Progress">
          📲 Send & Start
        </button>
      )}
      {status === STATUS.INPROGRESS && (
        <button type="button" onClick={() => onStatus(task.id, STATUS.DONE)} className="rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-500">
          ✓ Mark Done
        </button>
      )}
      {status === STATUS.DONE && <span className="rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-400">Completed</span>}
      <button type="button" onClick={() => onDelete(task.id)} className="rounded-xl bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-500 transition hover:bg-rose-100">
        Delete
      </button>
    </div>
  );
}

function renderDate(task: Task) {
  const ts = task.updatedAt ?? task.createdAt;
  if (!ts) return "—";
  const label = task.updatedAt ? "✏️" : "📅";
  return `${label} ${ts.toDate().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}`;
}

export default function TaskBoard({
  tasks,
  firestoreLoading,
  sheetCustomers,
  search,
  taskName,
  taskAddress,
  taskPhone,
  taskComment,
  taskAmcMonth,
  taskAmcPrice,
  taskSharePhone,
  taskType,
  taskTech,
  taskError,
  searchResults,
  pageSize,
  filterStatus,
  page,
  totalPages,
  filteredTasks,
  pageTasks,
  onSearchChange,
  onTaskNameChange,
  onTaskAddressChange,
  onTaskPhoneChange,
  onTaskCommentChange,
  onTaskAmcMonthChange,
  onTaskAmcPriceChange,
  onTaskSharePhoneChange,
  onTaskTypeChange,
  onTaskTechChange,
  onAddTask,
  onFillFromCustomer,
  onFilterStatusChange,
  onPageSizeChange,
  onPageChange,
  onUpdateComment,
  onEditComment,
  editingCommentId,
  editingCommentText,
  onEditingCommentTextChange,
  onStatusChange,
  onDeleteTask,
  onSetEditingCommentId,
}: TaskBoardProps) {
  const stats = useMemo(() => ({
    total: tasks.length,
    pending: tasks.filter((task) => task.status === STATUS.PENDING).length,
    inprogress: tasks.filter((task) => task.status === STATUS.INPROGRESS).length,
    done: tasks.filter((task) => task.status === STATUS.DONE).length,
  }), [tasks]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Total", value: stats.total, color: "bg-slate-900 text-white" },
          { label: "Pending", value: stats.pending, color: "bg-amber-500 text-white" },
          { label: "In Progress", value: stats.inprogress, color: "bg-blue-600 text-white" },
          { label: "Done", value: stats.done, color: "bg-emerald-600 text-white" },
        ].map((s) => (
          <div key={s.label} className={`rounded-3xl p-5 ${s.color}`}>
            <p className="text-3xl font-bold">{s.value}</p>
            <p className="mt-1 text-sm opacity-80">{s.label}</p>
          </div>
        ))}
      </div>

      <SectionCard title="Add New Task" description="Search a customer from the sheet, or fill in manually.">
        <div className="mt-5 relative">
          <Input label="Search customer (from sheet)" value={search} onChange={onSearchChange} placeholder="Type name or address…" />
          {searchResults.length > 0 && (
            <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg">
              {searchResults.map((customer) => (
                <button key={customer.id} type="button" onClick={() => onFillFromCustomer(customer)} className="flex w-full flex-col gap-0.5 border-b border-slate-100 px-4 py-3 text-left text-sm last:border-0 hover:bg-slate-50">
                  <span className="font-medium text-slate-900">{customer.name}</span>
                  <span className="text-xs text-slate-500">{customer.address} · {customer.phone}</span>
                  {(customer.amcMonth || customer.amcPrice) && (
                    <span className="text-xs text-blue-600">AMC: {customer.amcMonth || "-"} | 2026 Price: {customer.amcPrice || "-"}</span>
                  )}
                </button>
              ))}
            </div>
          )}
          {search.trim() && !searchResults.length && sheetCustomers.length > 0 && <p className="mt-1 text-xs text-slate-400">No match — fill in manually below.</p>}
          {search.trim() && !sheetCustomers.length && <p className="mt-1 text-xs text-amber-500">No sheet loaded yet. Go to Sheet Import tab.</p>}
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Input label="Customer Name" value={taskName} onChange={onTaskNameChange} placeholder="Full name" />
          <Input label="Phone" value={taskPhone} onChange={onTaskPhoneChange} placeholder="Mobile number" />
          <Input label="Address" value={taskAddress} onChange={onTaskAddressChange} placeholder="Full address" />
          <Input label="Comment / Notes" value={taskComment} onChange={onTaskCommentChange} placeholder="Optional note for the technician…" />
          <Input label="AMC Month" value={taskAmcMonth} onChange={onTaskAmcMonthChange} placeholder="e.g. January" />
          <Input label="2026 AMC Price" value={taskAmcPrice} onChange={onTaskAmcPriceChange} placeholder="e.g. ₹2,500" />
          <Select label="Type" value={taskType} onChange={onTaskTypeChange} options={TASK_TYPES.map((type) => ({ value: type, label: type }))} />
          <Select label="Assign Technician" value={taskTech} onChange={onTaskTechChange} options={TECHNICIANS.map((tech) => ({ value: tech.id, label: tech.name }))} />
        </div>

        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <Checkbox label="Phone Sharing" checked={taskSharePhone} onChange={onTaskSharePhoneChange} />
        </div>

        {taskError && <div className="mt-3 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{taskError}</div>}
        <button type="button" onClick={onAddTask} className="mt-5 rounded-2xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-blue-500">
          + Add Task
        </button>
      </SectionCard>

      <SectionCard title="All Tasks">
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex overflow-hidden rounded-2xl border border-slate-200 text-xs font-semibold">
              {([['all','All'], ['pending','Pending'], ['inprogress','In Progress'], ['done','Done']] as const).map(([value, label]) => (
                <button key={value} type="button" onClick={() => onFilterStatusChange(value)} className={`px-3 py-2 transition ${filterStatus === value ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}>
                  {label}
                </button>
              ))}
            </div>
            <select value={pageSize} onChange={(e) => onPageSizeChange(Number(e.target.value))} className="rounded-xl border border-slate-200 bg-slate-50 px-2 py-2 text-xs outline-none">
              {[5, 10, 20, 50].map((size) => <option key={size} value={size}>{size} / page</option>)}
            </select>
          </div>
        </div>

        <div className="mt-5 space-y-3 sm:hidden">
          {firestoreLoading ? (
            <p className="py-6 text-center text-sm text-slate-400 animate-pulse">Loading tasks…</p>
          ) : pageTasks.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">No tasks found.</p>
          ) : pageTasks.map((task) => {
            const tech = TECHNICIANS.find((item) => item.id === task.techId);
            return (
              <div key={task.id} className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-slate-900">{task.name}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{task.address}</p>
                  </div>
                  <Badge status={task.status} />
                </div>
                <div className="flex flex-wrap gap-2 text-xs text-slate-600">
                  <span className="rounded-lg border border-slate-200 bg-white px-2 py-1">{task.phone}</span>
                  {task.createdAt && <span className="rounded-lg border border-slate-200 bg-white px-2 py-1">📅 {task.createdAt.toDate().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</span>}
                  <span className="rounded-lg border border-slate-200 bg-white px-2 py-1">{task.type}</span>
                  {editingCommentId === task.id ? (
                    <div className="flex w-full gap-2">
                      <input autoFocus value={editingCommentText} onChange={(e) => onEditingCommentTextChange(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") onUpdateComment(task.id); if (e.key === "Escape") onSetEditingCommentId(null); }} className="flex-1 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs outline-none focus:border-blue-400" placeholder="Enter comment…" />
                      <button type="button" onClick={() => onUpdateComment(task.id)} className="rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500">Save</button>
                      <button type="button" onClick={() => onSetEditingCommentId(null)} className="rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200">✕</button>
                    </div>
                  ) : (
                    <div className="flex w-full items-start gap-1.5">
                      <p className="flex-1 text-xs italic text-slate-500">{task.comment ? `💬 ${task.comment}` : "No comment"}</p>
                      <button type="button" onClick={() => { onSetEditingCommentId(task.id); onEditComment(task.id, task.comment); }} className="shrink-0 rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-500 hover:bg-slate-200 hover:text-slate-700">✏️</button>
                    </div>
                  )}
                  {task.amcMonth && <span className="rounded-lg border border-blue-200 bg-blue-50 px-2 py-1 text-blue-700">AMC: {task.amcMonth}</span>}
                  {task.amcPrice && <span className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-emerald-700">2026: {task.amcPrice}</span>}
                  <span className="rounded-lg border border-slate-200 bg-white px-2 py-1">👷 {tech?.name}</span>
                  {!task.sharePhone && <span className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-amber-700">🔒 Phone hidden</span>}
                </div>
                <TaskActions task={task} onStatus={onStatusChange} onDelete={onDeleteTask} />
              </div>
            );
          })}
        </div>

        <div className="mt-5 hidden overflow-x-auto sm:block">
          <table className="min-w-full border-collapse text-left text-sm">
            <thead>
              <tr className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                {['Name','Address','Phone','Comment','Type','AMC Month','2026 Price','Technician','Date Added','Status','Actions'].map((header) => (
                  <th key={header} className="whitespace-nowrap border-b border-slate-200 px-4 py-3 font-semibold">{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {firestoreLoading ? (
                <tr><td colSpan={11} className="px-4 py-10 text-center text-slate-400 animate-pulse">Loading tasks…</td></tr>
              ) : pageTasks.length === 0 ? (
                <tr><td colSpan={11} className="px-4 py-10 text-center text-slate-400">No tasks found.</td></tr>
              ) : pageTasks.map((task) => {
                const tech = TECHNICIANS.find((item) => item.id === task.techId);
                return (
                  <tr key={task.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900">{task.name}</td>
                    <td className="max-w-xs px-4 py-3 text-slate-600">{task.address}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">{task.phone}{!task.sharePhone && <span className="ml-1 text-amber-500" title="Hidden from technician">🔒</span>}</td>
                    <td className="max-w-xs px-4 py-3 text-xs text-slate-500">
                      {editingCommentId === task.id ? (
                        <div className="flex min-w-[200px] gap-1.5">
                          <input autoFocus value={editingCommentText} onChange={(e) => onEditingCommentTextChange(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") onUpdateComment(task.id); if (e.key === "Escape") onSetEditingCommentId(null); }} className="flex-1 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs outline-none focus:border-blue-400" placeholder="Enter comment…" />
                          <button type="button" onClick={() => onUpdateComment(task.id)} className="rounded-lg bg-blue-600 px-2 py-1 text-xs font-semibold text-white hover:bg-blue-500">✓</button>
                          <button type="button" onClick={() => onSetEditingCommentId(null)} className="rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-600 hover:bg-slate-200">✕</button>
                        </div>
                      ) : (
                        <div className="group flex items-center gap-1.5">
                          <span className="flex-1">{task.comment || "—"}</span>
                          <button type="button" onClick={() => { onSetEditingCommentId(task.id); onEditComment(task.id, task.comment); }} className="rounded-lg bg-slate-100 px-1.5 py-0.5 text-xs text-slate-400 opacity-0 transition-opacity hover:bg-slate-200 hover:text-slate-700 group-hover:opacity-100">✏️</button>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3"><span className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">{task.type}</span></td>
                    <td className="px-4 py-3 text-xs text-slate-600">{task.amcMonth || "—"}</td>
                    <td className="px-4 py-3 text-xs font-medium text-slate-600">{task.amcPrice || "—"}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">👷 {tech?.name}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500"><span className="rounded-lg border border-slate-200 bg-white px-2 py-1">{renderDate(task)}</span></td>
                    <td className="px-4 py-3"><Badge status={task.status} /></td>
                    <td className="px-4 py-3"><TaskActions task={task} onStatus={onStatusChange} onDelete={onDeleteTask} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {filteredTasks.length > 0 && (
          <div className="mt-4 flex flex-col gap-2 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
            <span>Showing {Math.min((page - 1) * pageSize + 1, filteredTasks.length)}–{Math.min(page * pageSize, filteredTasks.length)} of {filteredTasks.length} tasks</span>
            <div className="flex gap-2">
              <button type="button" disabled={page === 1} onClick={() => onPageChange(Math.max(1, page - 1))} className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium disabled:opacity-40">← Prev</button>
              <span className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs">{page} / {totalPages}</span>
              <button type="button" disabled={page === totalPages} onClick={() => onPageChange(Math.min(totalPages, page + 1))} className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium disabled:opacity-40">Next →</button>
            </div>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
