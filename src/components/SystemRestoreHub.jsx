import React, { useState, useEffect, useMemo } from 'react';
import {
  History,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Clock,
  Calendar,
  RotateCcw,
  Plus,
  Pin,
  PinOff,
  Download,
  Trash2,
  Eye,
  Settings,
  CheckCircle2,
  AlertTriangle,
  Layers,
  Database,
  RefreshCw,
  Sparkles,
  Lock,
  ChevronDown,
  ChevronUp,
  Undo2,
  Cloud,
  Zap,
  Activity,
  X,
} from 'lucide-react';
import { APP_ARCHITECTURE } from '../config/appArchitecture';
import PeacockLoader from './PeacockLoader';
import {
  DEFAULT_RESTORE_CONFIG,
  resolveRestoreScopePlan,
  findNearestRestorePointForDateTime,
  formatLocalDateKey,
} from '../utils/systemRestoreScopeCatalog';
import {
  subscribeRestoreSchedulerConfig,
  saveRestoreSchedulerConfig,
  subscribeRestorePoints,
  subscribeRestoreLogs,
  createRestorePoint,
  togglePinRestorePoint,
  deleteRestorePoint,
  pruneExpiredRestorePoints,
  downloadRestorePointAsJson,
  previewRestoreOperation,
  executeRestoreOperation,
} from '../utils/systemRestoreEngine';

function formatBytes(bytes = 0) {
  const num = Number(bytes || 0);
  if (num < 1024) return `${num} B`;
  if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
  return `${(num / (1024 * 1024)).toFixed(2)} MB`;
}

function formatRelativeTime(ms, isAr) {
  const n = Number(ms || 0);
  if (!n) return isAr ? 'لم يتم بعد' : 'Not yet';
  const diffSec = Math.max(0, Math.floor((Date.now() - n) / 1000));
  if (diffSec < 60) return isAr ? 'منذ لحظات' : 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return isAr ? `منذ ${diffMin} دقيقة` : `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return isAr ? `منذ ${diffHr} ساعة` : `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  return isAr ? `منذ ${diffDays} يوم` : `${diffDays}d ago`;
}

function formatDateTimeDisplay(ms, isAr) {
  if (!ms) return '—';
  const d = new Date(Number(ms));
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(isAr ? 'ar-EG' : 'en-GB', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatDeltaDuration(deltaMs, isAr) {
  const absSec = Math.round(Math.abs(Number(deltaMs || 0)) / 1000);
  if (absSec < 60) return isAr ? `${absSec} ثانية` : `${absSec}s`;
  const mins = Math.round(absSec / 60);
  if (mins < 60) return isAr ? `${mins} دقيقة` : `${mins} min`;
  const hrs = (mins / 60).toFixed(1);
  return isAr ? `${hrs} ساعة` : `${hrs}h`;
}

export default function SystemRestoreHub({ currentUser = {}, isAr = true }) {
  const isGeneralAdmin = Boolean(currentUser?.isGeneralAdmin || currentUser?.role === 'general_admin');

  const [config, setConfig] = useState(DEFAULT_RESTORE_CONFIG);
  const [configDraft, setConfigDraft] = useState(DEFAULT_RESTORE_CONFIG);
  const [restorePoints, setRestorePoints] = useState([]);
  const [restoreLogs, setRestoreLogs] = useState([]);

  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [manualLabel, setManualLabel] = useState('');
  const [manualPinned, setManualPinned] = useState(true);

  const [kindFilter, setKindFilter] = useState('all'); // 'all' | 'auto' | 'daily' | 'manual' | 'safety'
  const [jumpDate, setJumpDate] = useState(() => formatLocalDateKey(Date.now()));
  const [jumpTime, setJumpTime] = useState(() => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  });
  const [jumpMatchResult, setJumpMatchResult] = useState(null);

  const [selectedPointId, setSelectedPointId] = useState('');

  // Scope state: System-Wide | Module | Tab
  const moduleOptions = useMemo(() => {
    return Object.values(APP_ARCHITECTURE.modules || {}).map((m) => ({
      id: m.id,
      labelAr: m.labelAr,
      labelEn: m.labelEn,
      tabs: Object.values(m.tabs || {}),
    }));
  }, []);

  const [scopeType, setScopeType] = useState('system'); // 'system' | 'module' | 'tab'
  const [selectedModuleId, setSelectedModuleId] = useState(() => moduleOptions[0]?.id || 'sales');
  const [selectedTabId, setSelectedTabId] = useState(() => moduleOptions[0]?.tabs?.[0]?.id || 'sales_orders');

  const activeModuleTabs = useMemo(() => {
    const mod = moduleOptions.find((m) => m.id === selectedModuleId);
    return mod?.tabs || [];
  }, [moduleOptions, selectedModuleId]);

  useEffect(() => {
    if (activeModuleTabs.length > 0 && !activeModuleTabs.some((t) => t.id === selectedTabId)) {
      setSelectedTabId(activeModuleTabs[0].id);
    }
  }, [activeModuleTabs, selectedTabId]);

  // Diff & Execution State
  const [diffPreview, setDiffPreview] = useState(null);
  const [confirmWord, setConfirmWord] = useState('');
  const [busyState, setBusyState] = useState({ active: false, text: '' });
  const [statusBanner, setStatusBanner] = useState(null); // { type: 'success'|'error'|'info', text, undoPointId, scopeType, moduleId, tabId }

  // Subscriptions
  useEffect(() => {
    if (!isGeneralAdmin) return undefined;
    const unsubCfg = subscribeRestoreSchedulerConfig((cfg) => {
      setConfig(cfg);
      setConfigDraft((prev) => ({ ...DEFAULT_RESTORE_CONFIG, ...prev, ...cfg }));
    });
    const unsubPts = subscribeRestorePoints((pts) => {
      setRestorePoints(pts);
      setSelectedPointId((curr) => (curr && pts.some((p) => p.id === curr) ? curr : pts[0]?.id || ''));
    });
    const unsubLogs = subscribeRestoreLogs((logs) => {
      setRestoreLogs(logs);
    });
    return () => {
      if (typeof unsubCfg === 'function') unsubCfg();
      if (typeof unsubPts === 'function') unsubPts();
      if (typeof unsubLogs === 'function') unsubLogs();
    };
  }, [isGeneralAdmin]);

  // Resolve current relational cascade scope plan dynamically
  const activeScopePlan = useMemo(() => {
    try {
      return resolveRestoreScopePlan({
        scopeType,
        moduleId: selectedModuleId,
        tabId: selectedTabId,
        architecture: APP_ARCHITECTURE,
      });
    } catch {
      return resolveRestoreScopePlan({ scopeType: 'system', architecture: APP_ARCHITECTURE });
    }
  }, [scopeType, selectedModuleId, selectedTabId]);

  // Invalidate diff preview whenever point or scope changes
  useEffect(() => {
    setDiffPreview(null);
    setConfirmWord('');
  }, [selectedPointId, scopeType, selectedModuleId, selectedTabId]);

  // Telemetry & KPI Stats
  const kpiStats = useMemo(() => {
    let autoCount = 0;
    let dailyCount = 0;
    let pinnedCount = 0;
    let safetyCount = 0;
    const uniqueBlobs = new Map();

    restorePoints.forEach((p) => {
      if (p.kind === 'auto') autoCount += 1;
      else if (p.kind === 'daily') dailyCount += 1;
      else if (p.kind === 'pre_restore' || p.kind === 'pre_purge') safetyCount += 1;
      if (p.pinned || p.kind === 'manual') pinnedCount += 1;
      Object.values(p.collections || {}).forEach((meta) => {
        if (meta?.sha256 && !uniqueBlobs.has(meta.sha256)) {
          uniqueBlobs.set(meta.sha256, Number(meta.compressedBytes || 0));
        }
      });
    });

    let uniqueCompressedBytes = 0;
    uniqueBlobs.forEach((b) => {
      uniqueCompressedBytes += b;
    });

    const todayKey = formatLocalDateKey(Date.now());
    const dailyReadsUsed =
      config.dailyReadCounterDate === todayKey ? Number(config.dailyReadsUsed || 0) : 0;
    const maxBudget = Math.max(1000, Number(config.maxDailyReadBudget || 35000));
    const readPct = Math.min(100, Math.round((dailyReadsUsed / maxBudget) * 100));

    return {
      autoCount,
      dailyCount,
      pinnedCount,
      safetyCount,
      uniqueCompressedBytes,
      uniqueBlobCount: uniqueBlobs.size,
      dailyReadsUsed,
      maxBudget,
      readPct,
    };
  }, [restorePoints, config]);

  const filteredPoints = useMemo(() => {
    return restorePoints.filter((p) => {
      if (kindFilter === 'all') return true;
      if (kindFilter === 'auto') return p.kind === 'auto';
      if (kindFilter === 'daily') return p.kind === 'daily';
      if (kindFilter === 'manual') return p.pinned || p.kind === 'manual';
      if (kindFilter === 'safety') return p.kind === 'pre_restore' || p.kind === 'pre_purge';
      return true;
    });
  }, [restorePoints, kindFilter]);

  const selectedPoint = useMemo(
    () => restorePoints.find((p) => p.id === selectedPointId) || null,
    [restorePoints, selectedPointId]
  );

  // Access Guard
  if (!isGeneralAdmin) {
    return (
      <div className="p-8 bg-rose-50 border border-rose-200 rounded-3xl text-center space-y-2">
        <Lock className="h-8 w-8 text-rose-600 mx-auto" />
        <h3 className="text-sm font-black text-rose-900">
          {isAr ? 'مقصور على المدير العام فقط' : 'Restricted to General Admin Only'}
        </h3>
        <p className="text-xs text-rose-700 font-medium">
          {isAr
            ? 'أداة آلة الزمن واستعادة النظام متاحة فقط لحساب المدير العام.'
            : 'Automated System Restore (Time Machine) is exclusively restricted to the General Admin account.'}
        </p>
      </div>
    );
  }

  // Handlers
  const handleCreateManualPoint = async () => {
    setBusyState({
      active: true,
      text: isAr ? 'جاري التقاط وحفظ نقطة استعادة شاملة مضغوطة...' : 'Capturing & compressing system checkpoint...',
    });
    setStatusBanner(null);
    try {
      const created = await createRestorePoint({
        kind: 'manual',
        source: 'manual_admin',
        labelAr: manualLabel.trim() || undefined,
        labelEn: manualLabel.trim() || undefined,
        pinned: manualPinned,
        actor: currentUser,
        onProgress: (p) => {
          setBusyState({
            active: true,
            text: isAr
              ? `جاري فحص وضغط الجداول (${p.completed}/${p.total}): ${p.currentCollection || ''}`
              : `Capturing (${p.completed}/${p.total}): ${p.currentCollection || ''}`,
          });
        },
      });
      setSelectedPointId(created.id);
      setShowCreateForm(false);
      setManualLabel('');
      setStatusBanner({
        type: 'success',
        text: isAr
          ? `تم إنشاء نقطة الاستعادة (${created.totalDocuments} مستند — ${created.collectionsReusedCount} جدول متطابق أُعيد استخدامه دون تكرار).`
          : `Checkpoint created (${created.totalDocuments} docs — ${created.collectionsReusedCount} unchanged collections deduplicated).`,
      });
    } catch (err) {
      console.error('Create restore point failed:', err);
      setStatusBanner({
        type: 'error',
        text: isAr ? `فشل إنشاء نقطة الاستعادة: ${err.message}` : `Failed creating checkpoint: ${err.message}`,
      });
    } finally {
      setBusyState({ active: false, text: '' });
    }
  };

  const handleSaveSettings = async () => {
    setBusyState({
      active: true,
      text: isAr ? 'جاري حفظ إعدادات الجدولة التلقائية...' : 'Saving scheduler configuration...',
    });
    try {
      const saved = await saveRestoreSchedulerConfig(configDraft, currentUser);
      setConfig(saved);
      setShowSettingsPanel(false);
      setStatusBanner({
        type: 'success',
        text: isAr ? 'تم تحديث سياسة النسخ الاحتياطي التلقائي بنجاح.' : 'Auto-scheduler configuration saved.',
      });
    } catch (err) {
      setStatusBanner({ type: 'error', text: err.message });
    } finally {
      setBusyState({ active: false, text: '' });
    }
  };

  const handlePruneNow = async () => {
    setBusyState({
      active: true,
      text: isAr ? 'جاري تنظيف النقاط المنتهية وحذف اللقطات اليتيمة...' : 'Pruning expired checkpoints & orphan blobs...',
    });
    try {
      const res = await pruneExpiredRestorePoints(config);
      setStatusBanner({
        type: 'info',
        text: isAr
          ? `تم تنظيف (${res.deletedPoints}) نقطة منتهية وتحرير (${res.deletedBlobs}) حزمة بيانات يتيمة.`
          : `Pruned (${res.deletedPoints}) expired points and reclaimed (${res.deletedBlobs}) orphan blobs.`,
      });
    } catch (err) {
      setStatusBanner({ type: 'error', text: err.message });
    } finally {
      setBusyState({ active: false, text: '' });
    }
  };

  const handleJumpToDateTime = () => {
    if (!jumpDate) return;
    const [hh = '00', mm = '00'] = String(jumpTime || '00:00').split(':');
    const [yyyy, mo, dd] = jumpDate.split('-').map(Number);
    const targetDate = new Date(yyyy, (mo || 1) - 1, dd || 1, Number(hh), Number(mm), 59, 999);
    const result = findNearestRestorePointForDateTime(restorePoints, targetDate.getTime());
    setJumpMatchResult(result);
    if (result.point) {
      setKindFilter('all');
      setSelectedPointId(result.point.id);
    }
  };

  const handlePreviewDiff = async (overridePointId = null, overrideScope = null) => {
    const pId = overridePointId || selectedPointId;
    if (!pId) return;
    const sType = overrideScope?.scopeType ?? scopeType;
    const mId = overrideScope?.moduleId ?? selectedModuleId;
    const tId = overrideScope?.tabId ?? selectedTabId;

    setBusyState({
      active: true,
      text: isAr ? 'جاري مقارنة اللقطة الزمنية بالبيانات الحية...' : 'Comparing snapshot vs live database...',
    });
    setStatusBanner(null);
    try {
      const preview = await previewRestoreOperation({
        pointId: pId,
        scopeType: sType,
        moduleId: mId,
        tabId: tId,
        onProgress: (p) => {
          setBusyState({
            active: true,
            text: isAr
              ? `جاري معاينة التغييرات (${p.completed}/${p.total}): ${p.currentCollection || ''}`
              : `Diffing (${p.completed}/${p.total}): ${p.currentCollection || ''}`,
          });
        },
      });
      setDiffPreview(preview);
    } catch (err) {
      console.error('Diff preview error:', err);
      setStatusBanner({
        type: 'error',
        text: isAr ? `فشل معاينة الفروقات: ${err.message}` : `Failed previewing diff: ${err.message}`,
      });
    } finally {
      setBusyState({ active: false, text: '' });
    }
  };

  const handleExecuteRestore = async () => {
    if (!selectedPointId || confirmWord.trim().toUpperCase() !== 'RESTORE') return;
    setBusyState({
      active: true,
      text: isAr
        ? 'الخطوة ١: جاري إنشاء نقطة أمان تلقائية قبل التعديل...'
        : 'Step 1: Capturing automatic pre-restore safety checkpoint...',
    });
    setStatusBanner(null);
    try {
      const res = await executeRestoreOperation({
        pointId: selectedPointId,
        scopeType,
        moduleId: selectedModuleId,
        tabId: selectedTabId,
        actor: currentUser,
        createSafetyCheckpoint: true,
        onProgress: (p) => {
          if (p.stage === 'diffing') {
            setBusyState({
              active: true,
              text: isAr
                ? `الخطوة ٢: مطابقة الفروقات (${p.completed}/${p.total}): ${p.currentCollection || ''}`
                : `Step 2: Computing diff (${p.completed}/${p.total}): ${p.currentCollection || ''}`,
            });
          } else if (p.stage === 'writing') {
            setBusyState({
              active: true,
              text: isAr
                ? `الخطوة ٣: استعادة البيانات المترابطة (${p.completed}/${p.total}): ${p.currentCollection || ''}`
                : `Step 3: Applying relational rollback (${p.completed}/${p.total}): ${p.currentCollection || ''}`,
            });
          } else if (p.stage === 'recalculating') {
            setBusyState({
              active: true,
              text: isAr
                ? `الخطوة ٤: إعادة احتساب أرصدة المخزون والخزائن والبنوك...`
                : `Step 4: Recalculating cached inventory & treasury balances...`,
            });
          }
        },
      });
      setDiffPreview(null);
      setConfirmWord('');
      setStatusBanner({
        type: 'success',
        text: isAr
          ? `تمت الاستعادة بنجاح! (+${res.diffPlan.totals.toCreate} مُعاد إنشاؤه، ~${res.diffPlan.totals.toUpdate} مُحدَّث، -${res.diffPlan.totals.toDelete} محذوف عبر ${res.diffPlan.totals.collectionsAffected} جدول).`
          : `Rollback completed! (+${res.diffPlan.totals.toCreate} recreated, ~${res.diffPlan.totals.toUpdate} reverted, -${res.diffPlan.totals.toDelete} removed across ${res.diffPlan.totals.collectionsAffected} collections).`,
        undoPointId: res.safetyPoint?.id || '',
        scopeType,
        moduleId: selectedModuleId,
        tabId: selectedTabId,
      });
    } catch (err) {
      console.error('Execute restore error:', err);
      setStatusBanner({
        type: 'error',
        text: isAr ? `فشل تنفيذ الاستعادة: ${err.message}` : `Restore execution failed: ${err.message}`,
      });
    } finally {
      setBusyState({ active: false, text: '' });
    }
  };

  const handleLoadUndoFromLog = async (logItem) => {
    if (!logItem?.safetyPointId) return;
    const nextScope = logItem.scopeType || 'system';
    const nextMod = logItem.moduleId || selectedModuleId;
    const nextTab = logItem.tabId || selectedTabId;
    setScopeType(nextScope);
    if (nextMod) setSelectedModuleId(nextMod);
    if (nextTab) setSelectedTabId(nextTab);
    setSelectedPointId(logItem.safetyPointId);
    await handlePreviewDiff(logItem.safetyPointId, {
      scopeType: nextScope,
      moduleId: nextMod,
      tabId: nextTab,
    });
  };

  const renderKindBadge = (p) => {
    if (p.kind === 'daily') {
      return (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-indigo-50 text-indigo-800 border border-indigo-200">
          {isAr ? 'يومي' : 'Daily'}
        </span>
      );
    }
    if (p.kind === 'manual') {
      return (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-50 text-emerald-800 border border-emerald-200">
          {isAr ? 'يدوي' : 'Manual'}
        </span>
      );
    }
    if (p.kind === 'pre_restore' || p.kind === 'pre_purge') {
      return (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-50 text-amber-800 border border-amber-200">
          {p.kind === 'pre_purge' ? (isAr ? 'أمان قبل التصفير' : 'Pre-Purge Safety') : (isAr ? 'أمان قبل الاستعادة' : 'Pre-Restore Safety')}
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-sky-50 text-sky-800 border border-sky-200">
        {isAr ? 'تلقائي' : 'Auto'}
      </span>
    );
  };

  return (
    <div dir={isAr ? 'rtl' : 'ltr'} className="space-y-5 animate-in fade-in duration-200">
      {busyState.active && <PeacockLoader fullScreen size="xl" text={busyState.text} />}

      {/* Top Status & KPI Header Card */}
      <div className="p-5 bg-white border border-slate-200 rounded-3xl shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-2xl shadow-2xs">
              <History className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-black text-slate-900">
                  {isAr ? 'آلة الزمن واستعادة النظام التلقائية' : 'Automated System Restore (Time Machine)'}
                </h2>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-black border inline-flex items-center gap-1 ${
                    config.enabled
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : 'bg-slate-100 text-slate-600 border-slate-300'
                  }`}
                >
                  <Zap className="h-3 w-3" />
                  <span>
                    {config.enabled
                      ? (isAr ? `نشط — كل ${config.intervalMinutes} دقيقة` : `Active — Every ${config.intervalMinutes}m`)
                      : (isAr ? 'متوقف مؤقتاً' : 'Paused')}
                  </span>
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                {isAr
                  ? 'نقاط استعادة تلقائية مضغوطة مع عزل كامل وتراجع مترابط على مستوى النظام أو الموديول أو التبويب.'
                  : 'Deduplicated compressed snapshots with relational cascade rollback by System, Module, or Tab.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setShowSettingsPanel((v) => !v)}
              className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition"
            >
              <Settings className="h-3.5 w-3.5" />
              <span>{isAr ? 'إعدادات الجدولة' : 'Scheduler Settings'}</span>
              {showSettingsPanel ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>

            <button
              type="button"
              onClick={() => setShowCreateForm((v) => !v)}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black inline-flex items-center gap-1.5 shadow-xs cursor-pointer transition"
            >
              <Plus className="h-4 w-4" />
              <span>{isAr ? 'إنشاء نقطة استعادة الآن' : 'Create Restore Point Now'}</span>
            </button>
          </div>
        </div>

        {/* 4 KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl">
            <div className="flex items-center justify-between text-slate-500 font-bold mb-1">
              <span>{isAr ? 'آخر نقطة استعادة' : 'Last Checkpoint'}</span>
              <Clock className="h-3.5 w-3.5 text-indigo-600" />
            </div>
            <div className="font-black text-slate-900">
              {restorePoints[0] ? formatRelativeTime(restorePoints[0].createdAtMs, isAr) : (isAr ? 'لا يوجد' : 'None')}
            </div>
            <div className="text-[10px] text-slate-500 font-mono mt-0.5 truncate">
              {restorePoints[0] ? formatDateTimeDisplay(restorePoints[0].createdAtMs, isAr) : '—'}
            </div>
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl">
            <div className="flex items-center justify-between text-slate-500 font-bold mb-1">
              <span>{isAr ? 'نقاط الاستعادة المتاحة' : 'Saved Checkpoints'}</span>
              <Layers className="h-3.5 w-3.5 text-emerald-600" />
            </div>
            <div className="font-black text-slate-900 font-mono">
              {restorePoints.length} {isAr ? 'نقطة' : 'points'}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">
              {isAr
                ? `يومي: ${kpiStats.dailyCount} | تلقائي: ${kpiStats.autoCount} | مثبت: ${kpiStats.pinnedCount}`
                : `Daily: ${kpiStats.dailyCount} | Auto: ${kpiStats.autoCount} | Pinned: ${kpiStats.pinnedCount}`}
            </div>
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl">
            <div className="flex items-center justify-between text-slate-500 font-bold mb-1">
              <span>{isAr ? 'الحجم السحابي المضغوط' : 'Compressed Cloud Footprint'}</span>
              <Database className="h-3.5 w-3.5 text-amber-600" />
            </div>
            <div className="font-black text-slate-900 font-mono">
              {formatBytes(kpiStats.uniqueCompressedBytes)}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">
              {isAr
                ? `${kpiStats.uniqueBlobCount} حزمة فريدة (منع تكرار SHA-256)`
                : `${kpiStats.uniqueBlobCount} unique SHA-256 blobs`}
            </div>
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl">
            <div className="flex items-center justify-between text-slate-500 font-bold mb-1">
              <span>{isAr ? 'استهلاك القراءة اليومي (Spark)' : 'Daily Read Quota'}</span>
              <Activity className="h-3.5 w-3.5 text-sky-600" />
            </div>
            <div className="flex items-center justify-between font-black text-slate-900 font-mono">
              <span>{kpiStats.dailyReadsUsed.toLocaleString()}</span>
              <span className="text-[10px] text-slate-500">/ {kpiStats.maxBudget.toLocaleString()}</span>
            </div>
            <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden mt-1.5">
              <div
                className={`h-full transition-all ${
                  kpiStats.readPct > 85 ? 'bg-rose-500' : kpiStats.readPct > 60 ? 'bg-amber-500' : 'bg-emerald-500'
                }`}
                style={{ width: `${kpiStats.readPct}%` }}
              />
            </div>
          </div>
        </div>

        {/* Quick Manual Checkpoint Drawer */}
        {showCreateForm && (
          <div className="p-4 bg-indigo-50/70 border border-indigo-200 rounded-2xl space-y-3 animate-in fade-in">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-indigo-950 flex items-center gap-1.5">
                <Sparkles className="h-4 w-4 text-indigo-600" />
                <span>{isAr ? 'إنشاء نقطة استعادة يدوية فورية' : 'Create Immediate Manual Checkpoint'}</span>
              </span>
              <button
                type="button"
                onClick={() => setShowCreateForm(false)}
                className="p-1 text-slate-500 hover:text-slate-800 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="text"
                dir="auto"
                value={manualLabel}
                onChange={(e) => setManualLabel(e.target.value)}
                placeholder={
                  isAr ? 'وصف اختياري (مثلاً: قبل ترحيل أرصدة نوفمبر)...' : 'Optional label (e.g., Before month-end close)...'
                }
                className="flex-1 min-w-[220px] px-3 py-2 bg-white border border-indigo-200 rounded-xl text-xs font-bold outline-none focus:border-indigo-500"
              />
              <label className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-950 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={manualPinned}
                  onChange={(e) => setManualPinned(e.target.checked)}
                  className="accent-indigo-600 h-4 w-4 rounded"
                />
                <span>{isAr ? 'تثبيت دائم (عدم المسح التلقائي)' : 'Pin permanently'}</span>
              </label>
              <button
                type="button"
                onClick={handleCreateManualPoint}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black cursor-pointer transition"
              >
                {isAr ? 'حفظ النقطة الآن' : 'Capture Checkpoint'}
              </button>
            </div>
          </div>
        )}

        {/* Collapsible Scheduler Settings Panel */}
        {showSettingsPanel && (
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-4 animate-in fade-in text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2.5">
              <span className="font-black text-slate-900 flex items-center gap-1.5">
                <Settings className="h-4 w-4 text-slate-600" />
                <span>{isAr ? 'سياسة اللقطات التلقائية والاحتفاظ' : 'Auto-Capture Frequency & Retention Policy'}</span>
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-sky-50 border border-sky-200 text-sky-900 text-[10px] font-bold inline-flex items-center gap-1.5">
                <Cloud className="h-3.5 w-3.5 text-sky-600" />
                <span>
                  {isAr
                    ? 'الوضع الهجين: لقطات تلقائية مجانية داخل التطبيق (Spark) + دالة سحابية جاهزة لباقة Blaze (scheduledSystemRestoreSnapshot)'
                    : 'Hybrid Mode: Free Spark in-app scheduler active + Cloud Function (scheduledSystemRestoreSnapshot) ready for Blaze'}
                </span>
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <label className="p-2.5 bg-white border border-slate-200 rounded-xl flex items-center justify-between cursor-pointer">
                <span className="font-bold text-slate-800">{isAr ? 'تفعيل الجدولة' : 'Auto-Capture'}</span>
                <input
                  type="checkbox"
                  checked={Boolean(configDraft.enabled)}
                  onChange={(e) => setConfigDraft((d) => ({ ...d, enabled: e.target.checked }))}
                  className="accent-indigo-600 h-4 w-4"
                />
              </label>

              <div className="p-2 bg-white border border-slate-200 rounded-xl">
                <label className="block text-[10px] font-bold text-slate-500 mb-1">
                  {isAr ? 'التكرار' : 'Frequency'}
                </label>
                <select
                  value={configDraft.intervalMinutes}
                  onChange={(e) => setConfigDraft((d) => ({ ...d, intervalMinutes: Number(e.target.value) }))}
                  className="w-full text-xs font-bold bg-transparent outline-none"
                >
                  <option value={15}>{isAr ? 'كل 15 دقيقة' : 'Every 15 min'}</option>
                  <option value={30}>{isAr ? 'كل 30 دقيقة' : 'Every 30 min'}</option>
                  <option value={60}>{isAr ? 'كل 60 دقيقة' : 'Every 60 min'}</option>
                </select>
              </div>

              <div className="p-2 bg-white border border-slate-200 rounded-xl">
                <label className="block text-[10px] font-bold text-slate-500 mb-1">
                  {isAr ? 'الاحتفاظ خلال اليوم' : 'Intra-Day Retention'}
                </label>
                <select
                  value={configDraft.intraDayRetentionHours}
                  onChange={(e) => setConfigDraft((d) => ({ ...d, intraDayRetentionHours: Number(e.target.value) }))}
                  className="w-full text-xs font-bold bg-transparent outline-none"
                >
                  <option value={6}>{isAr ? '6 ساعات' : '6 hours'}</option>
                  <option value={12}>{isAr ? '12 ساعة' : '12 hours'}</option>
                  <option value={24}>{isAr ? '24 ساعة' : '24 hours'}</option>
                </select>
              </div>

              <div className="p-2 bg-white border border-slate-200 rounded-xl">
                <label className="block text-[10px] font-bold text-slate-500 mb-1">
                  {isAr ? 'الاحتفاظ اليومي' : 'Daily Snapshots'}
                </label>
                <select
                  value={configDraft.dailyRetentionDays}
                  onChange={(e) => setConfigDraft((d) => ({ ...d, dailyRetentionDays: Number(e.target.value) }))}
                  className="w-full text-xs font-bold bg-transparent outline-none"
                >
                  <option value={7}>{isAr ? '7 أيام' : '7 days'}</option>
                  <option value={14}>{isAr ? '14 يوم' : '14 days'}</option>
                  <option value={30}>{isAr ? '30 يوم' : '30 days'}</option>
                </select>
              </div>

              <div className="p-2 bg-white border border-slate-200 rounded-xl">
                <label className="block text-[10px] font-bold text-slate-500 mb-1">
                  {isAr ? 'سقف القراءة اليومي' : 'Daily Read Budget'}
                </label>
                <input
                  type="number"
                  min={2000}
                  step={1000}
                  value={configDraft.maxDailyReadBudget}
                  onChange={(e) => setConfigDraft((d) => ({ ...d, maxDailyReadBudget: Number(e.target.value) || 35000 }))}
                  className="w-full text-xs font-bold font-mono bg-transparent outline-none"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="inline-flex items-center gap-2 font-bold text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(configDraft.skipWhenIdle)}
                  onChange={(e) => setConfigDraft((d) => ({ ...d, skipWhenIdle: e.target.checked }))}
                  className="accent-indigo-600 h-4 w-4"
                />
                <span>
                  {isAr
                    ? 'تخطي اللقطات أثناء السكون لتوفير حصة القراءة (مع نبضة كل 60 دقيقة)'
                    : 'Skip redundant snapshots when app is idle (60m heartbeat)'}
                </span>
              </label>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePruneNow}
                  className="px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 font-bold cursor-pointer transition inline-flex items-center gap-1"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span>{isAr ? 'تنظيف المنتهي الآن' : 'Prune Expired Now'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleSaveSettings}
                  className="px-4 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-black cursor-pointer transition"
                >
                  {isAr ? 'حفظ الإعدادات' : 'Save Settings'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Status Banner */}
      {statusBanner && (
        <div
          className={`p-4 rounded-2xl border text-xs font-bold flex flex-wrap items-center justify-between gap-3 animate-in fade-in ${
            statusBanner.type === 'error'
              ? 'bg-rose-50 border-rose-300 text-rose-950'
              : statusBanner.type === 'info'
              ? 'bg-sky-50 border-sky-300 text-sky-950'
              : 'bg-emerald-50 border-emerald-300 text-emerald-950'
          }`}
        >
          <div className="flex items-center gap-2">
            {statusBanner.type === 'error' ? (
              <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            )}
            <span>{statusBanner.text}</span>
          </div>
          {statusBanner.undoPointId && (
            <button
              type="button"
              onClick={() =>
                handleLoadUndoFromLog({
                  safetyPointId: statusBanner.undoPointId,
                  scopeType: statusBanner.scopeType,
                  moduleId: statusBanner.moduleId,
                  tabId: statusBanner.tabId,
                })
              }
              className="px-3 py-1.5 rounded-xl bg-white hover:bg-emerald-100 text-emerald-900 border border-emerald-300 text-xs font-black inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Undo2 className="h-3.5 w-3.5" />
              <span>{isAr ? 'التراجع عن هذه الاستعادة (Undo)' : 'Undo This Rollback'}</span>
            </button>
          )}
        </div>
      )}

      {/* Main Split Grid: Left = Timeline & Date/Time Jump | Right = Scope + Cascade + Diff Preview + Execute */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* LEFT COLUMN (5 cols): Date/Time Jump & Timeline */}
        <div className="lg:col-span-5 p-5 bg-white border border-slate-200 rounded-3xl shadow-sm space-y-4">
          <div className="space-y-2.5">
            <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
              <Calendar className="h-4 w-4 text-indigo-600" />
              <span>{isAr ? '١- الانتقال لتاريخ ووقت محدد' : '1. Jump to Date & Time'}</span>
            </h3>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl space-y-2.5">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1">
                    {isAr ? 'التاريخ' : 'Date'}
                  </label>
                  <input
                    type="date"
                    value={jumpDate}
                    onChange={(e) => setJumpDate(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold font-mono outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1">
                    {isAr ? 'الوقت' : 'Time'}
                  </label>
                  <input
                    type="time"
                    value={jumpTime}
                    onChange={(e) => setJumpTime(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold font-mono outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <button
                type="button"
                disabled={restorePoints.length === 0}
                onClick={handleJumpToDateTime}
                className="w-full py-2 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white text-xs font-black cursor-pointer transition"
              >
                {isAr ? 'الانتقال لأقرب نقطة زمنية' : 'Find Closest Restore Point'}
              </button>

              {jumpMatchResult?.point && (
                <div
                  className={`p-2 rounded-xl border text-[11px] font-bold ${
                    jumpMatchResult.matchType === 'earliest_available'
                      ? 'bg-amber-50 border-amber-200 text-amber-900'
                      : 'bg-indigo-50 border-indigo-200 text-indigo-900'
                  }`}
                >
                  {jumpMatchResult.matchType === 'earliest_available'
                    ? (isAr
                        ? `لا توجد لقطة أقدم من هذا التاريخ — تم تحديد أقدم نقطة متاحة (+${formatDeltaDuration(jumpMatchResult.deltaMs, true)})`
                        : `No snapshot earlier than target — selected earliest available (+${formatDeltaDuration(jumpMatchResult.deltaMs, false)})`)
                    : jumpMatchResult.matchType === 'exact'
                    ? (isAr ? 'تمت مطابقة اللقطة بالوقت الدقيق ✓' : 'Exact timestamp match found ✓')
                    : (isAr
                        ? `تم تحديد أقرب نقطة سابقة (قبل الموعد بـ ${formatDeltaDuration(jumpMatchResult.deltaMs, true)})`
                        : `Selected closest preceding checkpoint (${formatDeltaDuration(jumpMatchResult.deltaMs, false)} earlier)`)}
                </div>
              )}
            </div>
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1.5 flex-wrap text-[11px] font-bold">
            {[
              { id: 'all', labelAr: 'الكل', labelEn: 'All' },
              { id: 'auto', labelAr: 'تلقائي', labelEn: 'Auto' },
              { id: 'daily', labelAr: 'يومي', labelEn: 'Daily' },
              { id: 'manual', labelAr: 'يدوي / مثبت', labelEn: 'Manual/Pinned' },
              { id: 'safety', labelAr: 'نقاط الأمان', labelEn: 'Safety' },
            ].map((chip) => (
              <button
                key={chip.id}
                type="button"
                onClick={() => setKindFilter(chip.id)}
                className={`px-2.5 py-1 rounded-full border cursor-pointer transition ${
                  kindFilter === chip.id
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {isAr ? chip.labelAr : chip.labelEn}
              </button>
            ))}
          </div>

          {/* Snapshot Cards Timeline */}
          <div className="space-y-2.5 max-h-[540px] overflow-y-auto pe-1">
            {filteredPoints.length === 0 ? (
              <div className="p-8 text-center bg-slate-50 border border-dashed border-slate-300 rounded-2xl space-y-2">
                <History className="h-7 w-7 text-slate-400 mx-auto" />
                <p className="text-xs font-bold text-slate-600">
                  {isAr
                    ? 'لا توجد نقاط استعادة في هذا التصنيف حتى الآن. اضغط "إنشاء نقطة استعادة الآن" لبدء أول لقطة.'
                    : 'No checkpoints yet in this filter. Click "Create Restore Point Now" to capture the first snapshot.'}
                </p>
              </div>
            ) : (
              filteredPoints.map((pt) => {
                const isSelected = pt.id === selectedPointId;
                return (
                  <div
                    key={pt.id}
                    onClick={() => setSelectedPointId(pt.id)}
                    className={`p-3.5 rounded-2xl border cursor-pointer transition space-y-2 ${
                      isSelected
                        ? 'bg-indigo-50/80 border-indigo-400 shadow-xs ring-1 ring-indigo-300'
                        : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/70'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {renderKindBadge(pt)}
                          {pt.pinned && (
                            <span className="px-1.5 py-0.5 rounded-full text-[9px] font-black bg-emerald-100 text-emerald-900 inline-flex items-center gap-0.5">
                              <Pin className="h-2.5 w-2.5" />
                              <span>{isAr ? 'مثبت' : 'Pinned'}</span>
                            </span>
                          )}
                          {pt.source === 'cloud_function' && (
                            <span className="px-1.5 py-0.5 rounded-full text-[9px] font-black bg-slate-100 text-slate-700">
                              Cloud 24/7
                            </span>
                          )}
                        </div>
                        <div className="text-xs font-black text-slate-900 truncate" dir="auto">
                          {isAr ? pt.labelAr || pt.labelEn : pt.labelEn || pt.labelAr}
                        </div>
                        <div className="text-[11px] font-mono text-slate-600">
                          {formatDateTimeDisplay(pt.createdAtMs, isAr)} ({formatRelativeTime(pt.createdAtMs, isAr)})
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          title={pt.pinned ? (isAr ? 'إلغاء التثبيت' : 'Unpin') : (isAr ? 'تثبيت دائم' : 'Pin')}
                          onClick={() => togglePinRestorePoint(pt.id, !pt.pinned)}
                          className="p-1.5 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 text-slate-600 cursor-pointer"
                        >
                          {pt.pinned ? <PinOff className="h-3.5 w-3.5 text-amber-600" /> : <Pin className="h-3.5 w-3.5" />}
                        </button>
                        <button
                          type="button"
                          title={isAr ? 'تنزيل نسخة JSON' : 'Download JSON'}
                          onClick={() => downloadRestorePointAsJson(pt.id)}
                          className="p-1.5 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 text-slate-600 cursor-pointer"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          title={isAr ? 'حذف هذه النقطة' : 'Delete Point'}
                          onClick={async () => {
                            if (!window.confirm(isAr ? 'حذف نقطة الاستعادة هذه؟' : 'Delete this checkpoint?')) return;
                            await deleteRestorePoint(pt.id);
                          }}
                          className="p-1.5 rounded-lg bg-white hover:bg-rose-50 border border-slate-200 text-rose-600 cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-500 border-t border-slate-200/70 pt-1.5 font-mono">
                      <span>
                        {pt.totalDocuments || 0} {isAr ? 'مستند' : 'docs'} / {pt.collectionCount || 0}{' '}
                        {isAr ? 'جدول' : 'colls'}
                      </span>
                      <span>
                        {formatBytes(pt.totalCompressedBytes || 0)} |{' '}
                        {isAr ? `${pt.collectionsReusedCount || 0} متطابق` : `${pt.collectionsReusedCount || 0} reused`}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* RIGHT COLUMN (7 cols): Scope Selector, Relational Cascade & Safe Preview/Execute */}
        <div className="lg:col-span-7 p-5 bg-white border border-slate-200 rounded-3xl shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
              <RotateCcw className="h-4 w-4 text-emerald-600" />
              <span>{isAr ? '٢- تحديد نطاق الاستعادة المترابطة والتنفيذ الآمن' : '2. Scope Selection & Safe Relational Rollback'}</span>
            </h3>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-50 text-emerald-800 border border-emerald-200">
              {isAr ? 'تراجع مترابط تلقائياً (Full Cascade)' : 'Always Full Relational Cascade'}
            </span>
          </div>

          {/* 3-Button Scope Type Segmented Picker */}
          <div className="grid grid-cols-3 gap-2 text-xs">
            {[
              { id: 'system', labelAr: 'النظام بالكامل', labelEn: 'System-Wide' },
              { id: 'module', labelAr: 'موديول كامل', labelEn: 'Module' },
              { id: 'tab', labelAr: 'تبويب محدد', labelEn: 'Specific Tab' },
            ].map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setScopeType(opt.id)}
                className={`py-2.5 px-3 rounded-2xl border font-black cursor-pointer transition ${
                  scopeType === opt.id
                    ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {isAr ? opt.labelAr : opt.labelEn}
              </button>
            ))}
          </div>

          {/* Module / Tab Dropdowns */}
          {scopeType !== 'system' && (
            <div className={`grid gap-3 ${scopeType === 'tab' ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl">
                <label className="block text-[10px] font-bold text-slate-500 mb-1">
                  {isAr ? 'اختر الموديول' : 'Select Module'}
                </label>
                <select
                  value={selectedModuleId}
                  onChange={(e) => setSelectedModuleId(e.target.value)}
                  className="w-full text-xs font-bold bg-white border border-slate-200 rounded-xl px-2.5 py-2 outline-none"
                >
                  {moduleOptions.map((m) => (
                    <option key={m.id} value={m.id}>
                      {isAr ? m.labelAr : m.labelEn}
                    </option>
                  ))}
                </select>
              </div>

              {scopeType === 'tab' && (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl">
                  <label className="block text-[10px] font-bold text-slate-500 mb-1">
                    {isAr ? 'اختر التبويب' : 'Select Tab'}
                  </label>
                  <select
                    value={selectedTabId}
                    onChange={(e) => setSelectedTabId(e.target.value)}
                    className="w-full text-xs font-bold bg-white border border-slate-200 rounded-xl px-2.5 py-2 outline-none"
                  >
                    {activeModuleTabs.map((t) => (
                      <option key={t.id} value={t.id}>
                        {isAr ? t.labelAr : t.labelEn}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          {/* Resolved Scope Relational Impact Summary */}
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-2 text-xs">
            <div className="font-black text-slate-900">
              {isAr ? activeScopePlan.scopeLabelAr : activeScopePlan.scopeLabelEn}
            </div>
            {(activeScopePlan.noteAr || activeScopePlan.noteEn) && (
              <div className="text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-2">
                {isAr ? activeScopePlan.noteAr : activeScopePlan.noteEn}
              </div>
            )}
            <div className="flex flex-wrap gap-1.5">
              {activeScopePlan.entries.map((e) => (
                <span
                  key={e.collection}
                  className={`px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold border ${
                    e.isPrimary && e.mode === 'full'
                      ? 'bg-indigo-50 text-indigo-900 border-indigo-200'
                      : e.isPrimary
                      ? 'bg-sky-50 text-sky-900 border-sky-200'
                      : 'bg-amber-50 text-amber-900 border-amber-200'
                  }`}
                >
                  {e.collection} ({e.mode === 'full' ? (isAr ? 'كامل' : 'Full') : (isAr ? 'مرتبط' : 'Cascade')})
                </span>
              ))}
            </div>
            {(activeScopePlan.recalculate?.recalcItemsStock || activeScopePlan.recalculate?.recalcSafesAndBanks) && (
              <div className="text-[11px] font-bold text-teal-800">
                {isAr
                  ? '✓ سيتم تلقائياً إعادة احتساب الأرصدة المجمعة في الأصناف والخزائن والبنوك بعد الاستعادة.'
                  : '✓ Cached item stock & safe/bank balances will automatically recalculate after rollback.'}
              </div>
            )}
          </div>

          {/* Preview Diff Button */}
          <button
            type="button"
            disabled={!selectedPoint || busyState.active}
            onClick={() => handlePreviewDiff()}
            className="w-full py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white text-xs font-black inline-flex items-center justify-center gap-2 cursor-pointer transition shadow-xs"
          >
            <Eye className="h-4 w-4" />
            <span>
              {selectedPoint
                ? (isAr ? 'معاينة الفروقات الفعلية قبل التنفيذ' : 'Preview Exact Diff Before Restore')
                : (isAr ? 'اختر نقطة استعادة من القائمة أولاً' : 'Select a Restore Point First')}
            </span>
          </button>

          {/* Diff Impact Table + Safety Confirmation */}
          {diffPreview && (
            <div className="space-y-4 border-t border-slate-200 pt-4 animate-in fade-in">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
                <div className="p-2 bg-emerald-50 border border-emerald-200 rounded-xl">
                  <div className="text-[10px] font-bold text-emerald-700">{isAr ? 'إعادة إنشاء' : '+Recreate'}</div>
                  <div className="text-base font-black text-emerald-950 font-mono">
                    +{diffPreview.diffPlan.totals.toCreate}
                  </div>
                </div>
                <div className="p-2 bg-amber-50 border border-amber-200 rounded-xl">
                  <div className="text-[10px] font-bold text-amber-700">{isAr ? 'تعديل وعكس' : '~Revert'}</div>
                  <div className="text-base font-black text-amber-950 font-mono">
                    ~{diffPreview.diffPlan.totals.toUpdate}
                  </div>
                </div>
                <div className="p-2 bg-rose-50 border border-rose-200 rounded-xl">
                  <div className="text-[10px] font-bold text-rose-700">{isAr ? 'حذف مضاف لاحقاً' : '-Remove'}</div>
                  <div className="text-base font-black text-rose-950 font-mono">
                    -{diffPreview.diffPlan.totals.toDelete}
                  </div>
                </div>
                <div className="p-2 bg-slate-50 border border-slate-200 rounded-xl">
                  <div className="text-[10px] font-bold text-slate-600">{isAr ? 'بدون تغيير' : 'Unchanged'}</div>
                  <div className="text-base font-black text-slate-900 font-mono">
                    {diffPreview.diffPlan.totals.unchanged}
                  </div>
                </div>
              </div>

              <div className="max-h-60 overflow-y-auto border border-slate-200 rounded-2xl">
                <table className="w-full text-[11px] text-start border-collapse">
                  <thead className="bg-slate-100 text-slate-700 font-black sticky top-0">
                    <tr>
                      <th className="p-2 text-start">{isAr ? 'الجدول' : 'Collection'}</th>
                      <th className="p-2 text-center">{isAr ? 'النوع' : 'Scope'}</th>
                      <th className="p-2 text-center">+</th>
                      <th className="p-2 text-center">~</th>
                      <th className="p-2 text-center">-</th>
                      <th className="p-2 text-center">{isAr ? 'محايد' : 'Untouched'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono">
                    {diffPreview.diffPlan.entries.map((row) => (
                      <tr key={row.collection} className="hover:bg-slate-50">
                        <td className="p-2 font-bold text-slate-800">
                          {row.collection}
                          {row.skippedNotInSnapshot && (
                            <span className="ms-1 text-[9px] text-amber-700">
                              ({isAr ? 'غير موجود باللقطة — تم تخطيه' : 'Skipped'})
                            </span>
                          )}
                        </td>
                        <td className="p-2 text-center">
                          {row.mode === 'full' ? (isAr ? 'كامل' : 'Full') : (isAr ? 'مرتبط' : 'Cascade')}
                        </td>
                        <td className="p-2 text-center text-emerald-700 font-bold">{row.toCreate.length}</td>
                        <td className="p-2 text-center text-amber-700 font-bold">{row.toUpdate.length}</td>
                        <td className="p-2 text-center text-rose-700 font-bold">{row.toDelete.length}</td>
                        <td className="p-2 text-center text-slate-500">
                          {row.unchangedCount + (row.untouchedOtherCount || 0)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {diffPreview.diffPlan.totals.totalWriteOps === 0 ? (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-2xl text-xs font-bold flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span>
                    {isAr
                      ? 'البيانات الحالية مطابقة تماماً لهذه النقطة الزمنية في هذا النطاق (لا توجد تغييرات مطلوبة).'
                      : 'Live data in this scope is already 100% identical to this checkpoint (0 write operations needed).'}
                  </span>
                </div>
              ) : (
                <div className="p-4 bg-rose-50/70 border border-rose-200 rounded-2xl space-y-3">
                  <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-[11px] font-bold text-emerald-950 flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
                    <span>
                      {isAr
                        ? 'حماية مضمونة: سيتم تلقائياً التقاط نقطة أمان كاملة للحالة الحالية قبل تنفيذ الاستعادة للتراجع بضغطة واحدة عند الحاجة.'
                        : 'Guaranteed Safeguard: An automatic pre-restore safety checkpoint of your current state is captured FIRST so you can Undo in 1 click.'}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      value={confirmWord}
                      onChange={(e) => setConfirmWord(e.target.value)}
                      placeholder={isAr ? 'اكتب RESTORE للتأكيد...' : 'Type RESTORE to confirm...'}
                      className="flex-1 min-w-[180px] px-3 py-2 bg-white border border-rose-300 rounded-xl text-xs font-black font-mono uppercase outline-none focus:border-rose-600"
                    />
                    <button
                      type="button"
                      disabled={confirmWord.trim().toUpperCase() !== 'RESTORE' || busyState.active}
                      onClick={handleExecuteRestore}
                      className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:bg-slate-300 text-white text-xs font-black inline-flex items-center gap-1.5 cursor-pointer transition shadow-xs"
                    >
                      <ShieldAlert className="h-4 w-4" />
                      <span>{isAr ? 'تنفيذ الاستعادة الزمنية الآن' : 'Execute Rollback Now'}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Audit Log & 1-Click Undo */}
      <div className="p-5 bg-white border border-slate-200 rounded-3xl shadow-sm space-y-3">
        <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
          <Shield className="h-4 w-4 text-indigo-600" />
          <span>{isAr ? 'سجل عمليات الاستعادة والتراجع الفوري' : 'Restore Execution Audit Log & 1-Click Undo'}</span>
        </h3>

        {restoreLogs.length === 0 ? (
          <p className="text-xs text-slate-500 font-medium">
            {isAr ? 'لم يتم تنفيذ أي عمليات استعادة زمنية حتى الآن.' : 'No system restore operations have been executed yet.'}
          </p>
        ) : (
          <div className="overflow-x-auto border border-slate-200 rounded-2xl">
            <table className="w-full text-xs text-start border-collapse">
              <thead className="bg-slate-50 text-slate-700 font-black">
                <tr>
                  <th className="p-2.5 text-start">{isAr ? 'وقت التنفيذ' : 'Executed At'}</th>
                  <th className="p-2.5 text-start">{isAr ? 'النطاق المستعاد' : 'Scope'}</th>
                  <th className="p-2.5 text-start">{isAr ? 'اللقطة المستهدفة' : 'Target Point'}</th>
                  <th className="p-2.5 text-center">{isAr ? 'التعديلات' : 'Operations'}</th>
                  <th className="p-2.5 text-start">{isAr ? 'بواسطة' : 'Actor'}</th>
                  <th className="p-2.5 text-center">{isAr ? 'تراجع فوري' : 'Undo'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {restoreLogs.map((logItem) => (
                  <tr key={logItem.id} className="hover:bg-slate-50">
                    <td className="p-2.5 font-mono text-[11px]">{formatDateTimeDisplay(logItem.executedAtMs, isAr)}</td>
                    <td className="p-2.5 font-bold text-slate-800">
                      {isAr ? logItem.scopeLabelAr : logItem.scopeLabelEn}
                    </td>
                    <td className="p-2.5 text-[11px] text-slate-600">
                      {isAr ? logItem.pointLabelAr : logItem.pointLabelEn}
                    </td>
                    <td className="p-2.5 text-center font-mono text-[11px]">
                      +{logItem.totals?.toCreate || 0} / ~{logItem.totals?.toUpdate || 0} / -{logItem.totals?.toDelete || 0}
                    </td>
                    <td className="p-2.5 text-[11px] font-bold">{logItem.actorName || logItem.actorId}</td>
                    <td className="p-2.5 text-center">
                      {logItem.safetyPointId ? (
                        <button
                          type="button"
                          onClick={() => handleLoadUndoFromLog(logItem)}
                          className="px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 text-[11px] font-black inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Undo2 className="h-3 w-3" />
                          <span>{isAr ? 'تراجع' : 'Undo'}</span>
                        </button>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
