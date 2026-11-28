import React, { useState } from 'react';
import { Users, UserPlus, Trash2 } from 'lucide-react';
import { autoEqualizeWorkerEfforts, sumWorkerEffortPct } from '../../utils/truckDispatchUtils.js';
import { WORKER_ROLE_LABELS } from './truckDispatchConstants.js';

// REUSABLE SUB-COMPONENT: Labour Task Roster & Effort Percentage Splitter
// =========================================================================
export default function LabourEffortRosterEditor({
  titleAr,
  titleEn,
  accentClass = 'indigo',
  workers = [],
  onChange,
  workerPool = [],
  disabled = false,
  isAr = true,
}) {
  const [selectedWorkerId, setSelectedWorkerId] = useState('');
  const { total, isBalanced } = sumWorkerEffortPct(workers);

  const selectedIds = new Set(workers.map((w) => w.workerId));
  const availableWorkers = workerPool.filter((w) => !selectedIds.has(w.id));

  const handleAddWorker = () => {
    if (!selectedWorkerId || disabled) return;
    const picked = workerPool.find((w) => w.id === selectedWorkerId);
    if (!picked) return;
    const nextList = autoEqualizeWorkerEfforts([
      ...workers,
      {
        workerId: picked.id,
        name: picked.nameAr || picked.name || picked.id,
        nameEn: picked.nameEn || picked.name || picked.id,
        role: picked.role || '',
        effortPct: 100,
      },
    ]);
    onChange(nextList);
    setSelectedWorkerId('');
  };

  const handleRemoveWorker = (workerId) => {
    if (disabled) return;
    const remaining = workers.filter((w) => w.workerId !== workerId);
    onChange(autoEqualizeWorkerEfforts(remaining));
  };

  const handlePctChange = (workerId, rawVal) => {
    if (disabled) return;
    const num = Math.max(0, Math.min(100, Number(rawVal) || 0));
    onChange(workers.map((w) => (w.workerId === workerId ? { ...w, effortPct: num } : w)));
  };

  const borderCls = accentClass === 'teal' ? 'border-teal-200 bg-teal-50/40' : 'border-indigo-200 bg-indigo-50/40';
  const badgeCls =
    workers.length === 0
      ? 'bg-slate-100 text-slate-600 border-slate-200'
      : isBalanced
      ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
      : 'bg-rose-100 text-rose-800 border-rose-300';

  return (
    <div className={`rounded-2xl border p-3 space-y-2.5 ${borderCls}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Users className={`w-4 h-4 ${accentClass === 'teal' ? 'text-teal-700' : 'text-indigo-700'}`} />
          <span className="text-xs font-black text-slate-900">{isAr ? titleAr : titleEn}</span>
        </div>

        <div className="flex items-center gap-1.5">
          {workers.length > 1 && !disabled && (
            <button
              type="button"
              onClick={() => onChange(autoEqualizeWorkerEfforts(workers))}
              className="px-2 py-0.5 rounded-lg bg-white hover:bg-slate-100 border border-slate-300 text-[10px] font-bold text-slate-700 transition cursor-pointer"
              title={isAr ? 'توزيع النسبة بالتساوي بين العمال' : 'Split effort equally across workers'}
            >
              {isAr ? 'توزيع متساوي' : 'Equal Split'}
            </button>
          )}
          <span className={`px-2 py-0.5 rounded-lg border font-mono text-[10px] font-black ${badgeCls}`}>
            {workers.length === 0
              ? (isAr ? 'بدون عمالة' : '0 workers')
              : `${total}% ${isBalanced ? '✓' : '≠ 100%'}`}
          </span>
        </div>
      </div>

      {/* Add Worker Picker */}
      {!disabled && (
        <div className="flex items-center gap-1.5">
          <select
            value={selectedWorkerId}
            onChange={(e) => setSelectedWorkerId(e.target.value)}
            className="flex-1 text-xs font-bold bg-white border border-slate-300 rounded-xl px-2.5 py-1.5 outline-none focus:border-teal-600"
          >
            <option value="">
              {isAr ? '— اختر عامل لإضافته لهذه المهمة —' : '— Select worker to add —'}
            </option>
            {availableWorkers.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name} {w.role ? `(${w.role})` : ''}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!selectedWorkerId}
            onClick={handleAddWorker}
            className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white text-xs font-bold inline-flex items-center gap-1 transition cursor-pointer"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>{isAr ? 'إضافة' : 'Add'}</span>
          </button>
        </div>
      )}

      {/* Workers List + Adjustable Effort % */}
      {workers.length === 0 ? (
        <div className="text-[11px] text-slate-500 font-medium text-center py-2 bg-white/60 rounded-xl border border-dashed border-slate-300">
          {isAr ? 'لم يتم تسجيل عمالة لهذا الدور حتى الآن.' : 'No workers assigned yet for this task.'}
        </div>
      ) : (
        <div className="space-y-1.5">
          {workers.map((w) => (
            <div
              key={w.workerId}
              className="flex items-center justify-between gap-2 bg-white px-2.5 py-1.5 rounded-xl border border-slate-200 shadow-2xs"
            >
              <div className="min-w-0 flex-1">
                <div className="text-xs font-extrabold text-slate-900 truncate">
                  {isAr ? w.name : w.nameEn || w.name}
                </div>
                {w.role && <div className="text-[10px] text-slate-400 font-medium truncate">{w.role}</div>}
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <div className="flex items-center gap-1 bg-slate-50 border border-slate-300 rounded-lg px-1.5 py-0.5">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.5"
                    disabled={disabled || workers.length === 1}
                    value={w.effortPct}
                    onChange={(e) => handlePctChange(w.workerId, e.target.value)}
                    className="w-14 text-center font-mono text-xs font-black bg-transparent outline-none disabled:text-slate-600"
                  />
                  <span className="text-[10px] font-mono font-bold text-slate-500">%</span>
                </div>
                {!disabled && (
                  <button
                    type="button"
                    onClick={() => handleRemoveWorker(w.workerId)}
                    className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                    title={isAr ? 'إزالة العامل' : 'Remove worker'}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

