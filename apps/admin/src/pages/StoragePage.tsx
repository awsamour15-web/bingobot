import { useState, useEffect } from 'react';
import { adminApiRequest } from '../lib/api';

interface StorageStats {
  total: { size: string; bytes: number };
  tables: Array<{ table_name: string; total_size: string; bytes: number; estimated_rows: string }>;
  counts: {
    gameRounds: number;
    roundEntries: number;
    calledNumbers: number;
    roundWinners: number;
    promotionLogs: number;
    transactions: number;
    crashRounds: number;
    slotSpins: number;
    kenoRounds: number;
  };
  dateRange: { oldest: string | null; newest: string | null };
  potentialSavings: Array<{ days: number; rounds: number; entries: number; called: number }>;
}

export default function StoragePage() {
  const [stats, setStats] = useState<StorageStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [cleanupDays, setCleanupDays] = useState(7);
  const [dryRunResult, setDryRunResult] = useState<any>(null);
  const [cleanupLoading, setCleanupLoading] = useState(false);

  // Keep-last-N state
  const [keepCount, setKeepCount] = useState(24);
  const [keepDryResult, setKeepDryResult] = useState<any>(null);
  const [keepLoading, setKeepLoading] = useState(false);

  const loadStats = async () => {
    setLoading(true);
    try {
      const data = await adminApiRequest<StorageStats>('GET', '/api/admin/storage');
      setStats(data);
    } catch (err: any) {
      alert('Failed to load storage stats: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadStats(); }, []);

  const runDryRun = async () => {
    setCleanupLoading(true);
    setDryRunResult(null);
    try {
      const data = await adminApiRequest<any>('POST', '/api/admin/storage/cleanup', { days: cleanupDays, dryRun: true });
      setDryRunResult(data);
    } catch (err: any) {
      alert('Dry run failed: ' + err.message);
    } finally {
      setCleanupLoading(false);
    }
  };

  const runCleanup = async () => {
    if (!confirm(`⚠️ DELETE all game data older than ${cleanupDays} days?\n\nThis will permanently remove:\n- Game rounds\n- Round entries\n- Called numbers\n- Winners\n\nPlayer balances and transactions are NOT affected.\n\nContinue?`)) return;

    setCleanupLoading(true);
    try {
      const data = await adminApiRequest<any>('POST', '/api/admin/storage/cleanup', { days: cleanupDays, dryRun: false });
      alert(`✅ Cleanup successful!\n\nDeleted:\n- ${data.deleted.gameRounds.toLocaleString()} rounds\n- ${data.deleted.roundEntries.toLocaleString()} entries\n- ${data.deleted.calledNumbers.toLocaleString()} called numbers`);
      setDryRunResult(null);
      await loadStats();
    } catch (err: any) {
      alert('Cleanup failed: ' + err.message);
    } finally {
      setCleanupLoading(false);
    }
  };

  const runKeepLastDryRun = async () => {
    setKeepLoading(true);
    setKeepDryResult(null);
    try {
      const data = await adminApiRequest<any>('POST', '/api/admin/storage/cleanup-keep-last', { keep: keepCount, dryRun: true });
      setKeepDryResult(data);
    } catch (err: any) {
      alert('Preview failed: ' + err.message);
    } finally {
      setKeepLoading(false);
    }
  };

  const runKeepLast = async () => {
    if (!confirm(`⚠️ Keep only the last ${keepCount} completed bingo rounds and DELETE all others?\n\nCalled numbers, entries, and winners for old rounds will be permanently removed.\n\nContinue?`)) return;
    setKeepLoading(true);
    try {
      const data = await adminApiRequest<any>('POST', '/api/admin/storage/cleanup-keep-last', { keep: keepCount, dryRun: false });
      alert(`✅ Done!\n\nDeleted ${data.deleted.gameRounds.toLocaleString()} rounds, ${data.deleted.calledNumbers.toLocaleString()} called numbers, ${data.deleted.roundEntries.toLocaleString()} entries.`);
      setKeepDryResult(null);
      await loadStats();
    } catch (err: any) {
      alert('Cleanup failed: ' + err.message);
    } finally {
      setKeepLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <span style={{fontSize:32}}>⟳</span>
      </div>
    );
  }

  if (!stats) return <div className="p-4 text-red-500">Failed to load storage stats</div>;

  const bigTables = stats.tables.slice(0, 10);
  const gameDataBytes = stats.tables
    .filter(t => ['game_rounds', 'round_entries', 'called_numbers', 'round_winners'].includes(t.table_name))
    .reduce((sum, t) => sum + t.bytes, 0);
  const gameDataPct = ((gameDataBytes / stats.total.bytes) * 100).toFixed(1);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            💾 Storage Management
          </h1>
          <p className="text-gray-600 mt-1">Monitor and clean up database storage</p>
        </div>
        <button
          onClick={loadStats}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 flex items-center gap-2"
        >
          🔄 Refresh
        </button>
      </div>

      {/* Total Size */}
      <div className="bg-gradient-to-br from-blue-500 to-blue-600 text-white p-6 rounded-xl shadow-lg">
        <div className="flex items-center gap-3 mb-2">
          <span style={{fontSize:32}}>🖴</span>
          <div>
            <div className="text-sm opacity-90">Total Database Size</div>
            <div className="text-3xl font-bold">{stats.total.size}</div>
          </div>
        </div>
        <div className="text-sm opacity-75 mt-3">
          Game data uses ~{gameDataPct}% ({bigTables.find(t => t.table_name === 'game_rounds')?.total_size || '?'} rounds + 
          {' ' + bigTables.find(t => t.table_name === 'round_entries')?.total_size || '?'} entries + 
          {' ' + bigTables.find(t => t.table_name === 'called_numbers')?.total_size || '?'} called numbers)
        </div>
      </div>

      {/* Top Tables */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-4">Top 10 Tables by Size</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2">Table</th>
                <th className="text-right py-2">Size</th>
                <th className="text-right py-2">Rows</th>
              </tr>
            </thead>
            <tbody>
              {bigTables.map((t) => (
                <tr key={t.table_name} className="border-b last:border-0">
                  <td className="py-2 font-mono text-xs">{t.table_name}</td>
                  <td className="text-right font-semibold">{t.total_size}</td>
                  <td className="text-right text-gray-600">{parseInt(t.estimated_rows).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Date Range */}
      {stats.dateRange.oldest && (
        <div className="bg-gray-50 rounded-lg p-4 text-sm">
          <strong>Game Rounds Date Range:</strong>
          <div className="text-gray-600 mt-1">
            {new Date(stats.dateRange.oldest).toLocaleDateString()} → {new Date(stats.dateRange.newest!).toLocaleDateString()}
          </div>
        </div>
      )}

      {/* Keep Last N Rounds (recommended) */}
      <div className="bg-white rounded-lg shadow p-6 border-2 border-green-400">
        <div className="flex items-start gap-3 mb-4">
          <span style={{fontSize:24}}>♻️</span>
          <div className="flex-1">
            <h2 className="text-lg font-semibold">Auto-Clean: Keep Last N Rounds <span className="ml-2 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Recommended</span></h2>
            <p className="text-sm text-gray-600 mt-1">
              Keeps only the most recent completed bingo rounds. All called numbers, entries, and winner records for older rounds are permanently deleted. This runs automatically every night at 3:00 AM.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Number of recent rounds to keep:</label>
            <div className="flex gap-2 flex-wrap">
              {[10, 24, 50, 100].map((n) => (
                <button
                  key={n}
                  onClick={() => { setKeepCount(n); setKeepDryResult(null); }}
                  className={`px-4 py-2 rounded-lg font-medium ${
                    keepCount === n
                      ? 'bg-green-500 text-white'
                      : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                  }`}
                >
                  {n} rounds
                </button>
              ))}
            </div>
          </div>

          <div className="text-sm text-gray-500">
            Currently <strong className="text-gray-800">{stats.counts.gameRounds.toLocaleString()}</strong> total rounds • keeping {keepCount} means deleting up to <strong className="text-red-600">{Math.max(0, stats.counts.gameRounds - keepCount).toLocaleString()}</strong> old rounds
          </div>

          {keepDryResult && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="font-medium text-sm mb-2">✓ Preview Complete</div>
              <div className="text-sm space-y-1">
                <div>Would delete <strong>{keepDryResult.wouldDelete.gameRounds.toLocaleString()}</strong> game rounds</div>
                <div>Would delete <strong>{keepDryResult.wouldDelete.calledNumbers.toLocaleString()}</strong> called numbers</div>
                <div>Would delete <strong>{keepDryResult.wouldDelete.roundEntries.toLocaleString()}</strong> round entries</div>
                <div>Would delete <strong>{keepDryResult.wouldDelete.roundWinners.toLocaleString()}</strong> round winners</div>
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={runKeepLastDryRun}
              disabled={keepLoading}
              className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50"
            >
              {keepLoading ? 'Running...' : 'Preview'}
            </button>
            <button
              onClick={runKeepLast}
              disabled={keepLoading}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
            >
              ♻️ {keepLoading ? 'Cleaning...' : `Keep Last ${keepCount} & Delete Rest`}
            </button>
          </div>
        </div>
      </div>

      {/* Legacy: Delete by Age */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-start gap-3 mb-4">
          <span style={{fontSize:24}}>🗑️</span>
          <div className="flex-1">
            <h2 className="text-lg font-semibold">Delete Old Game Data (by Age)</h2>
            <p className="text-sm text-gray-600 mt-1">
              Permanently removes completed game rounds older than X days. Player balances and transaction history are NOT affected.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          {/* Days selector */}
          <div>
            <label className="block text-sm font-medium mb-2">Delete rounds older than:</label>
            <div className="flex gap-2">
              {[1, 2, 7, 14, 30].map((d) => (
                <button
                  key={d}
                  onClick={() => setCleanupDays(d)}
                  className={`px-4 py-2 rounded-lg font-medium ${
                    cleanupDays === d
                      ? 'bg-red-500 text-white'
                      : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                  }`}
                >
                  {d} day{d > 1 ? 's' : ''}
                </button>
              ))}
            </div>
          </div>

          {/* Potential savings */}
          {stats.potentialSavings.length > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div className="font-medium text-sm mb-2">What will be deleted:</div>
              {stats.potentialSavings
                .filter((s) => s.days === cleanupDays)
                .map((s) => (
                  <div key={s.days} className="text-sm space-y-1">
                    <div>• {s.rounds.toLocaleString()} game rounds</div>
                    <div>• {s.entries.toLocaleString()} round entries</div>
                    <div>• {s.called.toLocaleString()} called numbers</div>
                  </div>
                ))}
            </div>
          )}

          {/* Dry run result */}
          {dryRunResult && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="font-medium text-sm mb-2">✓ Dry Run Complete</div>
              <div className="text-sm space-y-1">
                <div>Would delete {dryRunResult.wouldDelete.gameRounds.toLocaleString()} rounds</div>
                <div>Would delete {dryRunResult.wouldDelete.roundEntries.toLocaleString()} entries</div>
                <div>Would delete {dryRunResult.wouldDelete.calledNumbers.toLocaleString()} called numbers</div>
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-3">
            <button
              onClick={runDryRun}
              disabled={cleanupLoading}
              className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50"
            >
              {cleanupLoading ? 'Running...' : 'Preview (Dry Run)'}
            </button>
            <button
              onClick={runCleanup}
              disabled={cleanupLoading}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
            >
              ⚠️ {cleanupLoading ? 'Deleting...' : 'Delete Permanently'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
  const [stats, setStats] = useState<StorageStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [cleanupDays, setCleanupDays] = useState(7);
  const [dryRunResult, setDryRunResult] = useState<any>(null);
  const [cleanupLoading, setCleanupLoading] = useState(false);

  const loadStats = async () => {
    setLoading(true);
    try {
      const data = await adminApiRequest<StorageStats>('GET', '/api/admin/storage');
      setStats(data);
    } catch (err: any) {
      alert('Failed to load storage stats: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadStats(); }, []);

  const runDryRun = async () => {
    setCleanupLoading(true);
    setDryRunResult(null);
    try {
      const data = await adminApiRequest<any>('POST', '/api/admin/storage/cleanup', { days: cleanupDays, dryRun: true });
      setDryRunResult(data);
    } catch (err: any) {
      alert('Dry run failed: ' + err.message);
    } finally {
      setCleanupLoading(false);
    }
  };

  const runCleanup = async () => {
    if (!confirm(`⚠️ DELETE all game data older than ${cleanupDays} days?\n\nThis will permanently remove:\n- Game rounds\n- Round entries\n- Called numbers\n- Winners\n\nPlayer balances and transactions are NOT affected.\n\nContinue?`)) return;

    setCleanupLoading(true);
    try {
      const data = await adminApiRequest<any>('POST', '/api/admin/storage/cleanup', { days: cleanupDays, dryRun: false });
      alert(`✅ Cleanup successful!\n\nDeleted:\n- ${data.deleted.gameRounds.toLocaleString()} rounds\n- ${data.deleted.roundEntries.toLocaleString()} entries\n- ${data.deleted.calledNumbers.toLocaleString()} called numbers`);
      setDryRunResult(null);
      await loadStats();
    } catch (err: any) {
      alert('Cleanup failed: ' + err.message);
    } finally {
      setCleanupLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <span style={{fontSize:32}}>⟳</span>
      </div>
    );
  }

  if (!stats) return <div className="p-4 text-red-500">Failed to load storage stats</div>;

  const bigTables = stats.tables.slice(0, 10);
  const gameDataBytes = stats.tables
    .filter(t => ['game_rounds', 'round_entries', 'called_numbers', 'round_winners'].includes(t.table_name))
    .reduce((sum, t) => sum + t.bytes, 0);
  const gameDataPct = ((gameDataBytes / stats.total.bytes) * 100).toFixed(1);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            💾 Storage Management
          </h1>
          <p className="text-gray-600 mt-1">Monitor and clean up database storage</p>
        </div>
        <button
          onClick={loadStats}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 flex items-center gap-2"
        >
          🔄 Refresh
        </button>
      </div>

      {/* Total Size */}
      <div className="bg-gradient-to-br from-blue-500 to-blue-600 text-white p-6 rounded-xl shadow-lg">
        <div className="flex items-center gap-3 mb-2">
          <span style={{fontSize:32}}>🖴</span>
          <div>
            <div className="text-sm opacity-90">Total Database Size</div>
            <div className="text-3xl font-bold">{stats.total.size}</div>
          </div>
        </div>
        <div className="text-sm opacity-75 mt-3">
          Game data uses ~{gameDataPct}% ({bigTables.find(t => t.table_name === 'game_rounds')?.total_size || '?'} rounds + 
          {' ' + bigTables.find(t => t.table_name === 'round_entries')?.total_size || '?'} entries + 
          {' ' + bigTables.find(t => t.table_name === 'called_numbers')?.total_size || '?'} called numbers)
        </div>
      </div>

      {/* Top Tables */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-4">Top 10 Tables by Size</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2">Table</th>
                <th className="text-right py-2">Size</th>
                <th className="text-right py-2">Rows</th>
              </tr>
            </thead>
            <tbody>
              {bigTables.map((t) => (
                <tr key={t.table_name} className="border-b last:border-0">
                  <td className="py-2 font-mono text-xs">{t.table_name}</td>
                  <td className="text-right font-semibold">{t.total_size}</td>
                  <td className="text-right text-gray-600">{parseInt(t.estimated_rows).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Date Range */}
      {stats.dateRange.oldest && (
        <div className="bg-gray-50 rounded-lg p-4 text-sm">
          <strong>Game Rounds Date Range:</strong>
          <div className="text-gray-600 mt-1">
            {new Date(stats.dateRange.oldest).toLocaleDateString()} → {new Date(stats.dateRange.newest!).toLocaleDateString()}
          </div>
        </div>
      )}

      {/* Cleanup Tool */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-start gap-3 mb-4">
          <span style={{fontSize:24}}>🗑️</span>
          <div className="flex-1">
            <h2 className="text-lg font-semibold">Delete Old Game Data</h2>
            <p className="text-sm text-gray-600 mt-1">
              Permanently removes completed game rounds older than X days. Player balances and transaction history are NOT affected.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          {/* Days selector */}
          <div>
            <label className="block text-sm font-medium mb-2">Delete rounds older than:</label>
            <div className="flex gap-2">
              {[1, 2, 7, 14, 30].map((d) => (
                <button
                  key={d}
                  onClick={() => setCleanupDays(d)}
                  className={`px-4 py-2 rounded-lg font-medium ${
                    cleanupDays === d
                      ? 'bg-red-500 text-white'
                      : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                  }`}
                >
                  {d} day{d > 1 ? 's' : ''}
                </button>
              ))}
            </div>
          </div>

          {/* Potential savings */}
          {stats.potentialSavings.length > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div className="font-medium text-sm mb-2">What will be deleted:</div>
              {stats.potentialSavings
                .filter((s) => s.days === cleanupDays)
                .map((s) => (
                  <div key={s.days} className="text-sm space-y-1">
                    <div>• {s.rounds.toLocaleString()} game rounds</div>
                    <div>• {s.entries.toLocaleString()} round entries</div>
                    <div>• {s.called.toLocaleString()} called numbers</div>
                  </div>
                ))}
            </div>
          )}

          {/* Dry run result */}
          {dryRunResult && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="font-medium text-sm mb-2">✓ Dry Run Complete</div>
              <div className="text-sm space-y-1">
                <div>Would delete {dryRunResult.wouldDelete.gameRounds.toLocaleString()} rounds</div>
                <div>Would delete {dryRunResult.wouldDelete.roundEntries.toLocaleString()} entries</div>
                <div>Would delete {dryRunResult.wouldDelete.calledNumbers.toLocaleString()} called numbers</div>
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-3">
            <button
              onClick={runDryRun}
              disabled={cleanupLoading}
              className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50"
            >
              {cleanupLoading ? 'Running...' : 'Preview (Dry Run)'}
            </button>
            <button
              onClick={runCleanup}
              disabled={cleanupLoading}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
            >
              ⚠️ {cleanupLoading ? 'Deleting...' : 'Delete Permanently'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
