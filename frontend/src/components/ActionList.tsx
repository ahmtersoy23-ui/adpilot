import React, { useEffect, useState } from 'react';
import { getLatestSnapshot, getActions, Action, updateActionStatus, bulkUpdateActionStatus } from '../api/client';

export const ActionList: React.FC = () => {
  const [actions, setActions] = useState<Action[]>([]);
  const [filteredActions, setFilteredActions] = useState<Action[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedAction, setSelectedAction] = useState<Action | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // Filters
  const [channelFilter, setChannelFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  useEffect(() => {
    const fetchActions = async () => {
      try {
        setLoading(true);
        const snapshotRes = await getLatestSnapshot();
        if (snapshotRes.data?.id) {
          const actionsRes = await getActions(snapshotRes.data.id);
          setActions(actionsRes.data);
          setFilteredActions(actionsRes.data);
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load actions');
      } finally {
        setLoading(false);
      }
    };

    fetchActions();
  }, []);

  useEffect(() => {
    let filtered = actions;

    if (channelFilter !== 'all') {
      filtered = filtered.filter(a => a.application_channel === channelFilter);
    }

    if (priorityFilter !== 'all') {
      filtered = filtered.filter(a => a.priority === priorityFilter);
    }

    if (typeFilter !== 'all') {
      filtered = filtered.filter(a => a.action_type === typeFilter);
    }

    if (searchQuery.trim() !== '') {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(a =>
        a.target_campaign.toLowerCase().includes(query) ||
        (a.target_keyword && a.target_keyword.toLowerCase().includes(query)) ||
        (a.target_asin && a.target_asin.toLowerCase().includes(query)) ||
        (a.target_ad_group && a.target_ad_group.toLowerCase().includes(query)) ||
        a.reason.toLowerCase().includes(query)
      );
    }

    setFilteredActions(filtered);
  }, [channelFilter, priorityFilter, typeFilter, searchQuery, actions]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-xl text-gray-600">Loading actions...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-xl text-red-600">Error: {error}</div>
      </div>
    );
  }

  const totalSavings = filteredActions.reduce((sum, a) => sum + parseFloat(a.estimated_monthly_savings.toString()), 0);

  const getActionTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      'negative_add': 'Negative Keyword',
      'negative_asin_add': 'Negative ASIN',
      'campaign_pause': 'Campaign Pause',
      'asin_remove': 'ASIN Remove',
      'bid_change': 'Bid Change',
    };
    return labels[type] || type;
  };

  const getPriorityBadge = (priority: string) => {
    const badges: Record<string, { bg: string; text: string; icon: string; label: string }> = {
      'P1': { bg: 'bg-gradient-to-r from-red-500 to-red-600', text: 'text-white', icon: '🔥', label: 'Urgent' },
      'P2': { bg: 'bg-gradient-to-r from-yellow-500 to-orange-500', text: 'text-white', icon: '⚡', label: 'High' },
      'P3': { bg: 'bg-gradient-to-r from-blue-500 to-blue-600', text: 'text-white', icon: '📌', label: 'Medium' },
    };
    return badges[priority] || { bg: 'bg-gray-500', text: 'text-white', icon: '•', label: 'Unknown' };
  };

  const getChannelBadge = (channel: string) => {
    const badges: Record<string, string> = {
      'bulk_sheet': '🟢 Amazon Bulk',
      'perpetua': '🟠 Perpetua',
    };
    return badges[channel] || channel;
  };

  const getStatusBadge = (status: string) => {
    const badges: Record<string, { bg: string; text: string; icon: string; label: string }> = {
      'pending': { bg: 'bg-gray-100', text: 'text-gray-700', icon: '⏳', label: 'Beklemede' },
      'applied': { bg: 'bg-green-100', text: 'text-green-700', icon: '✅', label: 'Uygulandı' },
      'skipped': { bg: 'bg-yellow-100', text: 'text-yellow-700', icon: '⏭️', label: 'Atlandı' },
    };
    return badges[status] || { bg: 'bg-gray-100', text: 'text-gray-700', icon: '•', label: status };
  };

  const handleSelectAll = () => {
    if (selectedIds.size === filteredActions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredActions.map(a => a.id)));
    }
  };

  const handleSelectOne = (id: number) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const handleExportSelected = () => {
    const selectedActions = actions.filter(a => selectedIds.has(a.id));
    const csvContent = [
      ['Priority', 'Action Type', 'Channel', 'Campaign', 'Ad Group', 'Keyword', 'ASIN', 'Current Value', 'Recommended Value', 'Monthly Savings', 'Reason'].join(','),
      ...selectedActions.map(a => [
        a.priority,
        a.action_type,
        a.application_channel,
        `"${a.target_campaign}"`,
        `"${a.target_ad_group || ''}"`,
        `"${a.target_keyword || ''}"`,
        `"${a.target_asin || ''}"`,
        `"${a.current_value || ''}"`,
        `"${a.recommended_value || ''}"`,
        a.estimated_monthly_savings,
        `"${a.reason}"`
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `selected_actions_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleBulkStatusUpdate = async (status: 'pending' | 'applied' | 'skipped') => {
    try {
      await bulkUpdateActionStatus(Array.from(selectedIds), status);
      // Refresh actions
      const updatedActions = actions.map(a =>
        selectedIds.has(a.id) ? { ...a, status } : a
      );
      setActions(updatedActions);
      setSelectedIds(new Set());
    } catch (error) {
      console.error('Error updating status:', error);
      alert('Failed to update action status');
    }
  };

  const handleSingleStatusUpdate = async (actionId: number, status: 'pending' | 'applied' | 'skipped') => {
    try {
      await updateActionStatus(actionId, status);
      // Refresh actions
      const updatedActions = actions.map(a =>
        a.id === actionId ? { ...a, status } : a
      );
      setActions(updatedActions);
      if (selectedAction && selectedAction.id === actionId) {
        setSelectedAction({ ...selectedAction, status });
      }
    } catch (error) {
      console.error('Error updating status:', error);
      alert('Failed to update action status');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">⚡ Action List</h1>
              <p className="mt-1 text-sm text-gray-500">Optimization actions ready to implement</p>
            </div>
            <button
              onClick={() => window.location.href = '/'}
              className="bg-gray-600 hover:bg-gray-700 text-white font-medium py-2 px-4 rounded-lg transition duration-150"
            >
              ← Back to Dashboard
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        {/* Summary */}
        <div className="bg-white shadow rounded-lg mb-6 p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <p className="text-sm text-gray-500">Total Actions</p>
              <p className="text-2xl font-bold text-gray-900">{filteredActions.length.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Est. Monthly Savings</p>
              <p className="text-2xl font-bold text-green-600">${totalSavings.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Filters Active</p>
              <p className="text-2xl font-bold text-blue-600">
                {[channelFilter, priorityFilter, typeFilter].filter(f => f !== 'all').length + (searchQuery ? 1 : 0)}
              </p>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white shadow rounded-lg mb-6 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">🔍 Filters</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Channel</label>
              <select
                value={channelFilter}
                onChange={(e) => setChannelFilter(e.target.value)}
                className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="all">All Channels</option>
                <option value="bulk_sheet">Amazon Bulk Sheet</option>
                <option value="perpetua">Perpetua Dashboard</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Priority</label>
              <select
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
                className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="all">All Priorities</option>
                <option value="P1">P1 - Urgent</option>
                <option value="P2">P2 - High</option>
                <option value="P3">P3 - Medium</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Action Type</label>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="all">All Types</option>
                <option value="negative_add">Negative Keyword</option>
                <option value="negative_asin_add">Negative ASIN</option>
                <option value="campaign_pause">Campaign Pause</option>
                <option value="asin_remove">ASIN Remove</option>
                <option value="bid_change">Bid Change</option>
              </select>
            </div>
          </div>

          {/* Search Box */}
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">🔎 Search</label>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by campaign, keyword, ASIN, ad group, or reason..."
              className="block w-full px-4 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
            />
            {searchQuery && (
              <p className="mt-1 text-xs text-gray-500">
                Found {filteredActions.length} result{filteredActions.length !== 1 ? 's' : ''}
              </p>
            )}
          </div>

          {(channelFilter !== 'all' || priorityFilter !== 'all' || typeFilter !== 'all' || searchQuery !== '') && (
            <button
              onClick={() => {
                setChannelFilter('all');
                setPriorityFilter('all');
                setTypeFilter('all');
                setSearchQuery('');
              }}
              className="mt-4 text-sm text-blue-600 hover:text-blue-800"
            >
              Clear all filters
            </button>
          )}
        </div>

        {/* Bulk Actions */}
        {selectedIds.size > 0 && (
          <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4 mb-6 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <span className="text-sm font-semibold text-gray-900">
                {selectedIds.size} action{selectedIds.size !== 1 ? 's' : ''} selected
              </span>
              <button
                onClick={() => setSelectedIds(new Set())}
                className="text-sm text-gray-600 hover:text-gray-900"
              >
                Clear selection
              </button>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => handleBulkStatusUpdate('applied')}
                className="bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-4 rounded-lg transition flex items-center gap-2"
              >
                <span>✅</span>
                Mark Applied
              </button>
              <button
                onClick={() => handleBulkStatusUpdate('skipped')}
                className="bg-yellow-600 hover:bg-yellow-700 text-white font-medium py-2 px-4 rounded-lg transition flex items-center gap-2"
              >
                <span>⏭️</span>
                Mark Skipped
              </button>
              <button
                onClick={handleExportSelected}
                className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition flex items-center gap-2"
              >
                <span>📥</span>
                Export
              </button>
            </div>
          </div>
        )}

        {/* Actions Table */}
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left">
                    <input
                      type="checkbox"
                      checked={filteredActions.length > 0 && selectedIds.size === filteredActions.length}
                      onChange={handleSelectAll}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded cursor-pointer"
                    />
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Priority</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Channel</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Target</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Savings</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reason</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredActions.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-8 text-center text-gray-500 text-sm">
                      No actions found with current filters
                    </td>
                  </tr>
                ) : (
                  filteredActions.map((action) => {
                    const priorityBadge = getPriorityBadge(action.priority);
                    return (
                    <tr
                      key={action.id}
                      className="hover:bg-blue-50 transition"
                    >
                      <td
                        className="px-3 py-2 whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={selectedIds.has(action.id)}
                          onChange={() => handleSelectOne(action.id)}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded cursor-pointer"
                        />
                      </td>
                      <td
                        className="px-3 py-2 whitespace-nowrap cursor-pointer"
                        onClick={() => {
                          setSelectedAction(action);
                          setShowModal(true);
                        }}
                      >
                        <span className={`px-2 py-1 inline-flex items-center gap-1 text-xs font-bold rounded-lg shadow-sm ${priorityBadge.bg} ${priorityBadge.text}`}>
                          <span>{priorityBadge.icon}</span>
                          <span>{action.priority}</span>
                        </span>
                      </td>
                      <td
                        className="px-3 py-2 whitespace-nowrap text-xs text-gray-900 cursor-pointer"
                        onClick={() => {
                          setSelectedAction(action);
                          setShowModal(true);
                        }}
                      >
                        {getActionTypeLabel(action.action_type)}
                      </td>
                      <td
                        className="px-3 py-2 whitespace-nowrap text-xs text-gray-600 cursor-pointer"
                        onClick={() => {
                          setSelectedAction(action);
                          setShowModal(true);
                        }}
                      >
                        {getChannelBadge(action.application_channel)}
                      </td>
                      <td
                        className="px-3 py-2 text-xs text-gray-900 cursor-pointer"
                        onClick={() => {
                          setSelectedAction(action);
                          setShowModal(true);
                        }}
                      >
                        <div className="max-w-[180px]">
                          <p className="font-medium truncate text-xs">{action.target_campaign}</p>
                          {action.target_keyword && (
                            <p className="text-gray-500 truncate text-xs">KW: {action.target_keyword}</p>
                          )}
                          {action.target_asin && (
                            <p className="text-gray-500 truncate text-xs">ASIN: {action.target_asin}</p>
                          )}
                        </div>
                      </td>
                      <td
                        className="px-3 py-2 whitespace-nowrap text-xs font-medium text-green-600 cursor-pointer"
                        onClick={() => {
                          setSelectedAction(action);
                          setShowModal(true);
                        }}
                      >
                        ${parseFloat(action.estimated_monthly_savings.toString()).toFixed(0)}
                      </td>
                      <td
                        className="px-3 py-2 text-xs text-gray-600 cursor-pointer"
                        onClick={() => {
                          setSelectedAction(action);
                          setShowModal(true);
                        }}
                      >
                        <div className="max-w-[220px] truncate">{action.reason}</div>
                      </td>
                      <td
                        className="px-3 py-2 whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {(() => {
                          const statusBadge = getStatusBadge(action.status);
                          return (
                            <span className={`px-2 py-1 inline-flex items-center gap-1 text-xs font-semibold rounded ${statusBadge.bg} ${statusBadge.text}`}>
                              <span>{statusBadge.icon}</span>
                              <span>{statusBadge.label}</span>
                            </span>
                          );
                        })()}
                      </td>
                    </tr>
                  );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* Action Detail Modal */}
      {showModal && selectedAction && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={() => setShowModal(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-6 rounded-t-2xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-4xl">🎯</span>
                  <div>
                    <h2 className="text-2xl font-bold">Action Details</h2>
                    <p className="text-blue-100 text-sm mt-1">{getActionTypeLabel(selectedAction.action_type)}</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowModal(false)}
                  className="text-white hover:bg-white hover:bg-opacity-20 rounded-lg p-2 transition"
                >
                  <span className="text-3xl">×</span>
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-6">
              {/* Priority & Savings */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gradient-to-br from-red-50 to-orange-50 rounded-xl p-4 border-2 border-red-200">
                  <p className="text-sm text-gray-600 mb-1">Priority</p>
                  <div className="flex items-center gap-2">
                    {(() => {
                      const badge = getPriorityBadge(selectedAction.priority);
                      return (
                        <span className={`px-3 py-1.5 inline-flex items-center gap-1 text-sm font-bold rounded-lg shadow-md ${badge.bg} ${badge.text}`}>
                          <span>{badge.icon}</span>
                          <span>{selectedAction.priority} - {badge.label}</span>
                        </span>
                      );
                    })()}
                  </div>
                </div>
                <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-4 border-2 border-green-200">
                  <p className="text-sm text-gray-600 mb-1">Est. Monthly Savings</p>
                  <p className="text-3xl font-black text-green-600">
                    ${parseFloat(selectedAction.estimated_monthly_savings.toString()).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </p>
                </div>
              </div>

              {/* Target Information */}
              <div className="bg-gray-50 rounded-xl p-5">
                <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <span>🎯</span>
                  Target Information
                </h3>
                <div className="space-y-3">
                  <div>
                    <p className="text-xs text-gray-500 font-medium mb-1">Campaign</p>
                    <p className="text-sm font-semibold text-gray-900">{selectedAction.target_campaign}</p>
                  </div>
                  {selectedAction.target_ad_group && (
                    <div>
                      <p className="text-xs text-gray-500 font-medium mb-1">Ad Group</p>
                      <p className="text-sm font-semibold text-gray-900">{selectedAction.target_ad_group}</p>
                    </div>
                  )}
                  {selectedAction.target_keyword && (
                    <div>
                      <p className="text-xs text-gray-500 font-medium mb-1">Keyword</p>
                      <p className="text-sm font-semibold text-gray-900 bg-yellow-100 px-3 py-1 rounded inline-block">{selectedAction.target_keyword}</p>
                    </div>
                  )}
                  {selectedAction.target_asin && (
                    <div>
                      <p className="text-xs text-gray-500 font-medium mb-1">ASIN</p>
                      <p className="text-sm font-semibold text-gray-900 bg-blue-100 px-3 py-1 rounded inline-block">{selectedAction.target_asin}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Action Details */}
              <div className="bg-blue-50 rounded-xl p-5">
                <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <span>📋</span>
                  Recommended Action
                </h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-600">Current Value:</p>
                    <p className="text-sm font-semibold text-gray-900">{selectedAction.current_value || 'N/A'}</p>
                  </div>
                  <div className="flex items-center justify-center py-2">
                    <span className="text-2xl">→</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-600">Recommended:</p>
                    <p className="text-sm font-bold text-green-700 bg-green-100 px-3 py-1 rounded">{selectedAction.recommended_value || 'N/A'}</p>
                  </div>
                </div>
              </div>

              {/* Reason */}
              <div className="bg-purple-50 rounded-xl p-5">
                <h3 className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
                  <span>💡</span>
                  Why This Action?
                </h3>
                <p className="text-sm text-gray-700 leading-relaxed">{selectedAction.reason}</p>
              </div>

              {/* Channel & Status */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 rounded-xl p-4">
                  <p className="text-xs text-gray-500 font-medium mb-2">Application Channel</p>
                  <p className="text-sm font-bold text-gray-900">{getChannelBadge(selectedAction.application_channel)}</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-4">
                  <p className="text-xs text-gray-500 font-medium mb-2">Status</p>
                  {(() => {
                    const statusBadge = getStatusBadge(selectedAction.status);
                    return (
                      <span className={`px-3 py-1.5 inline-flex items-center gap-1 text-sm font-bold rounded-lg ${statusBadge.bg} ${statusBadge.text}`}>
                        <span>{statusBadge.icon}</span>
                        <span>{statusBadge.label}</span>
                      </span>
                    );
                  })()}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="bg-gray-50 p-6 rounded-b-2xl border-t space-y-3">
              {/* Status Update Buttons */}
              <div className="flex gap-2">
                <button
                  onClick={() => handleSingleStatusUpdate(selectedAction.id, 'applied')}
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded-xl shadow-lg transition transform hover:scale-105 flex items-center justify-center gap-2"
                  disabled={selectedAction.status === 'applied'}
                >
                  <span>✅</span>
                  Mark Applied
                </button>
                <button
                  onClick={() => handleSingleStatusUpdate(selectedAction.id, 'skipped')}
                  className="flex-1 bg-yellow-600 hover:bg-yellow-700 text-white font-bold py-3 px-4 rounded-xl shadow-lg transition transform hover:scale-105 flex items-center justify-center gap-2"
                  disabled={selectedAction.status === 'skipped'}
                >
                  <span>⏭️</span>
                  Mark Skipped
                </button>
                {selectedAction.status !== 'pending' && (
                  <button
                    onClick={() => handleSingleStatusUpdate(selectedAction.id, 'pending')}
                    className="flex-1 bg-gray-600 hover:bg-gray-700 text-white font-bold py-3 px-4 rounded-xl shadow-lg transition transform hover:scale-105 flex items-center justify-center gap-2"
                  >
                    <span>⏳</span>
                    Reset
                  </button>
                )}
              </div>
              {/* Close Button */}
              <button
                onClick={() => setShowModal(false)}
                className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-bold py-3 px-6 rounded-xl shadow-lg transition transform hover:scale-105"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
