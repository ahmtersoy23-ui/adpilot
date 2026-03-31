import { useEffect, useState, useCallback } from 'react';
import {
  fetchLatestSnapshot,
  fetchOwnership,
} from '../lib/api';
import type { Snapshot, OwnershipRow } from '../lib/api';

const PAGE_SIZE = 100;

export default function Ownership() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [rows, setRows] = useState<OwnershipRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const snap = await fetchLatestSnapshot();
        if (!cancelled) setSnapshot(snap);
      } catch (err: unknown) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load');
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const loadData = useCallback(async (newOffset: number) => {
    if (!snapshot) return;
    setLoading(true);
    try {
      const params: { limit: number; offset: number; search?: string } = {
        limit: PAGE_SIZE,
        offset: newOffset,
      };
      if (search) params.search = search;
      const res = await fetchOwnership(snapshot.id, params);
      setRows(res.data);
      setTotal(res.total);
      setOffset(newOffset);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load ownership data');
    } finally {
      setLoading(false);
    }
  }, [snapshot, search]);

  useEffect(() => {
    if (snapshot) loadData(0);
  }, [snapshot, loadData]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearch(searchInput);
  }

  const contestedCount = rows.filter((r) => r.is_contested).length;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  if (error && !snapshot) {
    return (
      <div className="bg-rose-50 text-rose-700 px-4 py-3 rounded-lg text-sm">{error}</div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Ownership Matrix</h1>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-4">
          <p className="text-sm font-medium text-slate-500">Total Keywords</p>
          <p className="text-xl font-bold text-slate-900 mt-1">{total.toLocaleString()}</p>
        </div>
        <div className="bg-indigo-50 rounded-lg border border-slate-200 shadow-sm p-4">
          <p className="text-sm font-medium text-slate-500">Current Page</p>
          <p className="text-xl font-bold text-indigo-700 mt-1">{rows.length} keywords</p>
        </div>
        <div className="bg-amber-50 rounded-lg border border-slate-200 shadow-sm p-4">
          <p className="text-sm font-medium text-slate-500">Contested (this page)</p>
          <p className="text-xl font-bold text-amber-700 mt-1">{contestedCount}</p>
        </div>
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className="flex gap-3">
        <input
          type="text"
          placeholder="Search keywords..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="flex-1 max-w-md px-4 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
        />
        <button
          type="submit"
          className="px-4 py-2.5 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
        >
          Search
        </button>
      </form>

      {/* Table */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left py-3 px-4 font-semibold text-slate-600">Keyword</th>
                    <th className="text-left py-3 px-4 font-semibold text-slate-600">Hero ASIN</th>
                    <th className="text-left py-3 px-4 font-semibold text-slate-600">Product Group</th>
                    <th className="text-left py-3 px-4 font-semibold text-slate-600">Category</th>
                    <th className="text-right py-3 px-4 font-semibold text-slate-600">Score</th>
                    <th className="text-right py-3 px-4 font-semibold text-slate-600">Support</th>
                    <th className="text-right py-3 px-4 font-semibold text-slate-600">Competitors</th>
                    <th className="text-center py-3 px-4 font-semibold text-slate-600">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-400">
                        No keywords found
                      </td>
                    </tr>
                  ) : (
                    rows.map((row) => (
                      <tr
                        key={row.id}
                        className="border-b border-slate-100 hover:bg-slate-50 transition-colors"
                      >
                        <td className="py-3 px-4 font-medium text-slate-900 max-w-[250px] truncate">
                          {row.keyword_text}
                        </td>
                        <td className="py-3 px-4 text-slate-700 font-mono text-xs">
                          {row.hero_asin || '—'}
                        </td>
                        <td className="py-3 px-4 text-slate-700 max-w-[200px] truncate">
                          {row.hero_product_group}
                        </td>
                        <td className="py-3 px-4 text-slate-700">{row.category || '—'}</td>
                        <td className="py-3 px-4 text-right text-slate-700 font-medium">
                          {parseFloat(row.ownership_score).toFixed(2)}
                        </td>
                        <td className="py-3 px-4 text-right text-slate-700">{row.support_count}</td>
                        <td className="py-3 px-4 text-right text-slate-700">{row.total_competitors}</td>
                        <td className="py-3 px-4 text-center">
                          {row.is_contested ? (
                            <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-amber-100 text-amber-700">
                              Contested
                            </span>
                          ) : (
                            <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700">
                              Owned
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 bg-slate-50">
              <p className="text-sm text-slate-500">
                Page {currentPage} of {totalPages} ({total.toLocaleString()} keywords)
              </p>
              <div className="flex gap-2">
                <button
                  disabled={offset === 0}
                  onClick={() => loadData(Math.max(0, offset - PAGE_SIZE))}
                  className="px-3 py-1.5 rounded-md text-sm font-medium bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <button
                  disabled={currentPage >= totalPages}
                  onClick={() => loadData(offset + PAGE_SIZE)}
                  className="px-3 py-1.5 rounded-md text-sm font-medium bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
