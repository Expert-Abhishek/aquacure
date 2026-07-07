"use client";

import { Input, SectionCard } from "./ui";
import type { Customer, QueryItem } from "./types";

interface QueryCenterProps {
  querySearch: string;
  queryName: string;
  queryPhone: string;
  queryAddress: string;
  queryComment: string;
  searchResults: Customer[];
  queries: QueryItem[];
  onQuerySearchChange: (value: string) => void;
  onQueryNameChange: (value: string) => void;
  onQueryPhoneChange: (value: string) => void;
  onQueryAddressChange: (value: string) => void;
  onQueryCommentChange: (value: string) => void;
  onFillFromCustomer: (customer: Customer) => void;
  onSubmitQuery: () => void;
  onDeleteQuery: (id: string) => void;
  queryError: string;
}

export default function QueryCenter({
  querySearch,
  queryName,
  queryPhone,
  queryAddress,
  queryComment,
  searchResults,
  queries,
  onQuerySearchChange,
  onQueryNameChange,
  onQueryPhoneChange,
  onQueryAddressChange,
  onQueryCommentChange,
  onFillFromCustomer,
  onSubmitQuery,
  onDeleteQuery,
  queryError,
}: QueryCenterProps) {
  return (
    <SectionCard title="Query Center" description="Track customer follow-ups with a simplified query form.">
      <div className="mt-5 relative">
        <Input label="Search customer (from sheet)" value={querySearch} onChange={onQuerySearchChange} placeholder="Type name or address…" />
        {searchResults.length > 0 && (
          <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg">
            {searchResults.map((customer) => (
              <button
                key={customer.id}
                type="button"
                onClick={() => onFillFromCustomer(customer)}
                className="flex w-full flex-col gap-0.5 border-b border-slate-100 px-4 py-3 text-left text-sm last:border-0 hover:bg-slate-50"
              >
                <span className="font-medium text-slate-900">{customer.name}</span>
                <span className="text-xs text-slate-500">{customer.address} · {customer.phone}</span>
              </button>
            ))}
          </div>
        )}
        {querySearch.trim() && !searchResults.length && <p className="mt-1 text-xs text-slate-400">No match — fill the fields manually.</p>}
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <Input label="Customer Name" value={queryName} onChange={onQueryNameChange} placeholder="Full name" />
        <Input label="Phone" value={queryPhone} onChange={onQueryPhoneChange} placeholder="Mobile number" />
        <Input label="Address" value={queryAddress} onChange={onQueryAddressChange} placeholder="Full address" />
        <Input label="Query / Notes" value={queryComment} onChange={onQueryCommentChange} placeholder="Add the customer concern" />
      </div>

      {queryError && <div className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{queryError}</div>}

      <button type="button" onClick={onSubmitQuery} className="mt-5 rounded-2xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-blue-500">
        Save Query
      </button>

      <div className="mt-8">
        <h3 className="text-sm font-semibold text-slate-900">Saved queries</h3>
        {queries.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">No queries yet. Add one to see it in the list.</p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-2xl border border-slate-200 bg-slate-50">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="bg-slate-100 text-xs uppercase tracking-wide text-slate-500">
                  <th className="whitespace-nowrap border-b border-slate-200 px-4 py-3">Name</th>
                  <th className="whitespace-nowrap border-b border-slate-200 px-4 py-3">Address</th>
                  <th className="whitespace-nowrap border-b border-slate-200 px-4 py-3">Phone</th>
                  <th className="whitespace-nowrap border-b border-slate-200 px-4 py-3">Query</th>
                  <th className="whitespace-nowrap border-b border-slate-200 px-4 py-3">Added</th>
                  <th className="whitespace-nowrap border-b border-slate-200 px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {queries.map((item) => (
                  <tr key={item.id} className="border-b border-slate-200 last:border-0">
                    <td className="px-4 py-3 text-slate-900">{item.name}</td>
                    <td className="px-4 py-3 text-slate-600">{item.address}</td>
                    <td className="px-4 py-3 text-slate-600">{item.phone || "—"}</td>
                    <td className="px-4 py-3 text-slate-600">{item.comment}</td>
                    <td className="px-4 py-3 text-slate-600">{item.createdAt ? item.createdAt.toDate().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"}</td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => onDeleteQuery(item.id)}
                        className="rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-600 transition hover:bg-rose-100"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </SectionCard>
  );
}
