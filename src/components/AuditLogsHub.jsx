import React, { useEffect, useMemo, useState } from 'react';
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import {
  ShieldCheck,
  Search,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Layers,
  Database,
  Clock,
  UserCheck,
  Filter,
  Boxes,
  Wallet,
  PackageCheck,
} from 'lucide-react';
import { db, functions } from '../firebase';
import PeacockLoader from './PeacockLoader';

const MODULE_BADGES = {
  finance: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  inventory: 'bg-amber-50 text-amber-800 border-amber-200',
  sales: 'bg-indigo-50 text-indigo-800 border-indigo-200',
  auth: 'bg-purple-50 text-purple-800 border-purple-200',
  system: 'bg-slate-100 text-slate-700 border-slate-200',
};

function formatAuditTime(ts) {
  if (!ts) return '—';
  try {
    const dt = ts?.toDate ? ts.toDate() : new Date(ts);
    if (Number.isNaN(dt.getTime())) return String(ts);
    return dt.toLocaleString('en-GB', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return String(ts);
  }
}

export default function AuditLogsHub({ isAr = false }) {
  const [logs, setLogs] = useState([]);
  const [aggregatesMap, setAggregatesMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [rebuilding, setRebuilding] = useState(false);
  const [rebuildMsg, setRebuildMsg] = useState('');
  const [moduleFilter, setModuleFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    const q = query(
      collection(db, 'audit_logs'),
      orderBy('timestamp', 'desc'),
      limit(250)
    );
    const unsubLogs = onSnapshot(
      q,
      (snap) => {
        setLogs(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      (err) => {
        console.warn('Error loading audit_logs:', err?.message);
        setLoading(false);
      }
    );

    const unsubAggs = onSnapshot(
      collection(db, 'aggregates'),
      (snap) => {
        const next = {};
        snap.docs.forEach((d) => {
          next[d.id] = { id: d.id, ...d.data() };
        });
        setAggregatesMap(next);
      },
      (err) => console.warn('Error loading aggregates:', err?.message)
    );

    return () => {
      unsubLogs();
      unsubAggs();
    };
  }, []);

  const handleRebuildRollups = async () => {
    setRebuilding(true);
    setRebuildMsg('');
    try {
      const fn = httpsCallable(functions, 'aggregatesRebuildAll');
      const res = await fn({});
      const counts = res?.data?.summary || {};
      setRebuildMsg(
        isAr
          ? `تم تحديث ملخصات الأرصدة السحابية (${counts.rawItemsCount || 0} خامة، ${counts.fgProductsCount || 0} منتج تام، ${counts.safesCount || 0} خزينة وبنك)`
          : `Rebuilt cloud rollups (${counts.rawItemsCount || 0} raw items, ${counts.fgProductsCount || 0} FG SKUs, ${counts.safesCount || 0} safes)`
      );
    } catch (err) {
      console.error('Error rebuilding aggregates:', err);
      setRebuildMsg(err?.message || (isAr ? 'تعذر تحديث الملخصات' : 'Failed rebuilding rollups'));
    } finally {
      setRebuilding(false);
    }
  };

  const filteredLogs = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return logs.filter((entry) => {
      if (moduleFilter !== 'all' && (entry.module || 'system') !== moduleFilter) return false;
      if (!q) return true;
      const haystack = [
        entry.action,
        entry.module,
        entry.collection,
        entry.docId,
        entry.summary,
        entry.effectiveUserName,
        entry.actorEmail,
        entry.actedAsPersona,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [logs, moduleFilter, searchTerm]);

  const rawAgg = aggregatesMap.raw_stock_balances;
  const fgAgg = aggregatesMap.fg_balances_live;
  const treasuryAgg = aggregatesMap.treasury_live;

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      {/* Cloud Materialized Rollups Card */}
      <div className="p-5 bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950 text-white rounded-3xl border border-slate-800 shadow-lg space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-indigo-500/20 border border-indigo-400/30">
              <Database className="w-5 h-5 text-indigo-300" />
            </div>
            <div>
              <h3 className="font-black text-sm">
                {isAr ? 'ملخصات الأرصدة السحابية السريعة (Aggregates)' : 'Cloud Materialized Balance Rollups'}
              </h3>
              <p className="text-[11px] text-slate-300">
                {isAr
                  ? 'ملخصات مجمعة من الخادم لتقليل قراءات قاعدة البيانات وتسريع لوحات المتابعة'
                  : 'Server-maintained rollup summaries (me-central1) minimizing Firestore read load'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleRebuildRollups}
            disabled={rebuilding}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-black transition cursor-pointer shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${rebuilding ? 'animate-spin' : ''}`} />
            <span>
              {rebuilding
                ? (isAr ? 'جاري التحديث...' : 'Rebuilding...')
                : (isAr ? 'إعادة حساب الملخصات الآن' : 'Rebuild Cloud Rollups')}
            </span>
          </button>
        </div>

        {rebuildMsg && (
          <div className="px-3.5 py-2 rounded-xl bg-emerald-500/15 border border-emerald-400/30 text-emerald-200 text-xs font-bold">
            {rebuildMsg}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 space-y-1">
            <div className="flex items-center justify-between text-[11px] text-slate-300 font-bold">
              <span className="inline-flex items-center gap-1.5">
                <Boxes className="w-3.5 h-3.5 text-amber-300" />
                {isAr ? 'ملخص أرصدة الخامات' : 'Raw Stock Rollup'}
              </span>
              <span className="font-mono text-[10px] text-slate-400">raw_stock_balances</span>
            </div>
            <div className="text-lg font-black font-mono">
              {rawAgg ? `${Number(rawAgg.totalUnits || 0).toLocaleString()} units` : '—'}
            </div>
            <div className="text-[10px] text-slate-400">
              {rawAgg
                ? `${rawAgg.itemCount || 0} items • ${formatAuditTime(rawAgg.updatedAt)}`
                : (isAr ? 'لم يتم الإنشاء بعد' : 'Not yet generated')}
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 space-y-1">
            <div className="flex items-center justify-between text-[11px] text-slate-300 font-bold">
              <span className="inline-flex items-center gap-1.5">
                <PackageCheck className="w-3.5 h-3.5 text-teal-300" />
                {isAr ? 'ملخص أرصدة الإنتاج التام' : 'FG Inventory Rollup'}
              </span>
              <span className="font-mono text-[10px] text-slate-400">fg_balances_live</span>
            </div>
            <div className="text-lg font-black font-mono">
              {fgAgg ? `${Number(fgAgg.totalCartonsOnFloor || 0).toLocaleString()} ctn` : '—'}
            </div>
            <div className="text-[10px] text-slate-400">
              {fgAgg
                ? `${fgAgg.skuCount || 0} SKUs • ${formatAuditTime(fgAgg.updatedAt)}`
                : (isAr ? 'لم يتم الإنشاء بعد' : 'Not yet generated')}
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 space-y-1">
            <div className="flex items-center justify-between text-[11px] text-slate-300 font-bold">
              <span className="inline-flex items-center gap-1.5">
                <Wallet className="w-3.5 h-3.5 text-emerald-300" />
                {isAr ? 'ملخص الخزائن والسيولة' : 'Treasury Live Rollup'}
              </span>
              <span className="font-mono text-[10px] text-slate-400">treasury_live</span>
            </div>
            <div className="text-lg font-black font-mono">
              {treasuryAgg ? `${Number(treasuryAgg.totalEgpBalance || 0).toLocaleString()} EGP` : '—'}
            </div>
            <div className="text-[10px] text-slate-400">
              {treasuryAgg
                ? `${treasuryAgg.safeCount || 0} vaults • ${formatAuditTime(treasuryAgg.updatedAt)}`
                : (isAr ? 'لم يتم الإنشاء بعد' : 'Not yet generated')}
            </div>
          </div>
        </div>
      </div>

      {/* Immutable Audit Logs Stream */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-100 text-emerald-700">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900">
                {isAr ? 'سجل التدقيق والمراجعة غير القابل للتعديل' : 'Immutable Server Audit Logs'}
              </h3>
              <p className="text-[11px] text-slate-500">
                {isAr
                  ? `عرض أحدث ${filteredLogs.length} سجل من العمليات الموثقة على الخادم`
                  : `Showing ${filteredLogs.length} server-stamped transactional audit entries`}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={isAr ? 'بحث بالإجراء، المستند، الموظف...' : 'Search action, docId, user...'}
                className="ps-8 pe-3 py-1.5 text-xs border border-slate-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 w-56"
              />
            </div>

            <div className="inline-flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-[11px] font-bold">
              <Filter className="w-3 h-3 text-slate-500 ms-1.5" />
              {['all', 'finance', 'inventory', 'sales', 'auth'].map((mod) => (
                <button
                  key={mod}
                  type="button"
                  onClick={() => setModuleFilter(mod)}
                  className={`px-2.5 py-1 rounded-lg transition cursor-pointer uppercase ${
                    moduleFilter === mod
                      ? 'bg-slate-900 text-white shadow-2xs'
                      : 'text-slate-600 hover:bg-white'
                  }`}
                >
                  {mod}
                </button>
              ))}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="p-10 flex justify-center">
            <PeacockLoader size="md" text={isAr ? 'جاري تحميل سجل التدقيق...' : 'Loading audit logs...'} />
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="p-10 text-center text-xs text-slate-500 font-bold">
            {isAr ? 'لا توجد سجلات تطابق معايير البحث الحالية.' : 'No audit logs match your current filters.'}
          </div>
        ) : (
          <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
            {filteredLogs.map((entry) => {
              const isOpen = expandedId === entry.id;
              const badgeCls = MODULE_BADGES[entry.module] || MODULE_BADGES.system;
              return (
                <div key={entry.id} className="p-3.5 hover:bg-slate-50/80 transition">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0 flex-wrap">
                      <span className={`px-2 py-0.5 rounded-md border text-[10px] font-black uppercase ${badgeCls}`}>
                        {entry.module || 'system'}
                      </span>
                      <span className="font-mono text-xs font-black text-slate-800">{entry.action}</span>
                      {entry.collection && (
                        <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                          {entry.collection}/{entry.docId}
                        </span>
                      )}
                      {entry.actedAsPersona && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 text-[10px] font-bold">
                          <UserCheck className="w-3 h-3" />
                          Persona: {entry.actedAsPersona}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3 text-[11px] text-slate-500 shrink-0">
                      <span className="font-bold text-slate-700">{entry.effectiveUserName || entry.actorEmail || entry.actorUid}</span>
                      <span className="inline-flex items-center gap-1 font-mono">
                        <Clock className="w-3 h-3" />
                        {formatAuditTime(entry.timestamp || entry.createdAt)}
                      </span>
                      {(entry.before || entry.after) && (
                        <button
                          type="button"
                          onClick={() => setExpandedId(isOpen ? null : entry.id)}
                          className="p-1 rounded-lg hover:bg-slate-200 text-slate-600 cursor-pointer"
                          title={isAr ? 'عرض التغييرات' : 'Inspect diff'}
                        >
                          {isOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </button>
                      )}
                    </div>
                  </div>

                  {entry.summary && (
                    <p className="text-xs text-slate-600 mt-1 break-words">{entry.summary}</p>
                  )}

                  {isOpen && (
                    <div className="mt-2.5 grid grid-cols-1 md:grid-cols-2 gap-2.5 text-[11px] font-mono">
                      <div className="p-2.5 rounded-xl bg-rose-50/70 border border-rose-200 overflow-x-auto">
                        <div className="text-[10px] font-bold text-rose-800 mb-1 flex items-center gap-1">
                          <Layers className="w-3 h-3" /> BEFORE
                        </div>
                        <pre className="whitespace-pre-wrap break-all text-slate-700">
                          {entry.before ? JSON.stringify(entry.before, null, 2) : 'null'}
                        </pre>
                      </div>
                      <div className="p-2.5 rounded-xl bg-emerald-50/70 border border-emerald-200 overflow-x-auto">
                        <div className="text-[10px] font-bold text-emerald-800 mb-1 flex items-center gap-1">
                          <Layers className="w-3 h-3" /> AFTER
                        </div>
                        <pre className="whitespace-pre-wrap break-all text-slate-700">
                          {entry.after ? JSON.stringify(entry.after, null, 2) : 'null'}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
