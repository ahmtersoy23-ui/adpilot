import { useState } from 'react';
import { fetchKeywordRecommendations } from '../lib/api';
import type { KeywordRecommendation } from '../lib/api';
import { formatMoney } from '../lib/format';

export default function Keywords() {
  const [asins, setAsins] = useState('');
  const [rows, setRows] = useState<KeywordRecommendation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searched, setSearched] = useState(false);

  async function handleSearch() {
    const parsed = asins.split(/[,\s]+/).map(s => s.trim()).filter(Boolean);
    if (!parsed.length) return;

    setLoading(true);
    setError('');
    setSearched(true);
    try {
      const data = await fetchKeywordRecommendations(parsed);
      setRows(data || []);
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Failed to fetch recommendations');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Keyword Discovery</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Find new keyword opportunities from Amazon's recommendation engine
        </p>
      </div>

      {/* Search */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5">
        <label className="block text-sm font-medium text-slate-700 mb-2">
          Enter ASINs (comma-separated)
        </label>
        <div className="flex gap-3">
          <input
            type="text"
            value={asins}
            onChange={e => setAsins(e.target.value)}
            placeholder="B094G8QSK8, B0C8B4DM21"
            className="flex-1 px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
          />
          <button
            onClick={handleSearch}
            disabled={loading || !asins.trim()}
            className="px-6 py-2.5 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Searching...' : 'Search'}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-rose-50 text-rose-700 px-4 py-3 rounded-lg text-sm">{error}</div>
      )}

      {loading && (
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
        </div>
      )}

      {!loading && searched && rows.length === 0 && !error && (
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-12 text-center text-slate-500">
          No keyword recommendations found for the given ASINs.
        </div>
      )}

      {!loading && rows.length > 0 && (
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">
              {rows.length} Keywords Found
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <Th align="left">#</Th>
                  <Th align="left">Keyword</Th>
                  <Th>Impression Rank</Th>
                  <Th>Impression Share</Th>
                  <Th>Bid (Broad)</Th>
                  <Th>Bid (Exact)</Th>
                  <Th>Bid (Phrase)</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, idx) => {
                  const broad = r.bidInfo?.find(b => b.matchType === 'BROAD');
                  const exact = r.bidInfo?.find(b => b.matchType === 'EXACT');
                  const phrase = r.bidInfo?.find(b => b.matchType === 'PHRASE');
                  return (
                    <tr key={r.recId} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-2.5 px-3 text-slate-400 text-sm">{idx + 1}</td>
                      <td className="py-2.5 px-3 font-medium text-slate-900">{r.keyword}</td>
                      <Td>{r.searchTermImpressionRank?.toLocaleString() || '—'}</Td>
                      <Td>
                        {r.searchTermImpressionShare != null
                          ? <ImpShareBar value={r.searchTermImpressionShare} />
                          : '—'}
                      </Td>
                      <Td>{broad ? <BidCell bid={broad} /> : '—'}</Td>
                      <Td>{exact ? <BidCell bid={exact} /> : '—'}</Td>
                      <Td>{phrase ? <BidCell bid={phrase} /> : '—'}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function BidCell({ bid }: { bid: { bid: number; suggestedBid: { rangeStart: number; rangeMedian: number; rangeEnd: number } } }) {
  // Amazon bids are in cents
  const median = bid.suggestedBid.rangeMedian / 100;
  const low = bid.suggestedBid.rangeStart / 100;
  const high = bid.suggestedBid.rangeEnd / 100;
  return (
    <span title={`$${low.toFixed(2)} — $${high.toFixed(2)}`} className="cursor-help">
      {formatMoney(median)}
    </span>
  );
}

function ImpShareBar({ value }: { value: number }) {
  return (
    <div className="flex items-center justify-end gap-2">
      <div className="w-16 bg-slate-100 rounded-full h-1.5">
        <div
          className="bg-indigo-500 h-1.5 rounded-full"
          style={{ width: `${Math.min(value, 100)}%` }}
        />
      </div>
      <span className="w-14 text-right">{value.toFixed(1)}%</span>
    </div>
  );
}

function Th({ children, align = 'right' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <th className={`py-2.5 px-3 font-semibold text-slate-600 text-${align} whitespace-nowrap`}>
      {children}
    </th>
  );
}

function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <td className={`py-2.5 px-3 text-right text-slate-700 whitespace-nowrap ${className}`}>
      {children}
    </td>
  );
}
