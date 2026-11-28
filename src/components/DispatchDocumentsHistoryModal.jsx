import React, { useMemo, useState } from 'react';
import {
  X,
  FileText,
  Printer,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  Link2Off,
  Truck,
  User,
  Boxes,
  Clock,
  Hash,
} from 'lucide-react';
import { filterDispatchDocumentsByDate } from '../utils/dispatchDocumentRegistry.js';
import TruckNameBadge from './TruckNameBadge.jsx';

const fmtDateTime = (iso, isAr) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString(isAr ? 'ar-EG' : 'en-GB', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const fmtNum = (n) => {
  const v = Number(n || 0);
  if (!Number.isFinite(v)) return '0';
  return Number.isInteger(v) ? v.toLocaleString() : v.toLocaleString(undefined, { maximumFractionDigits: 2 });
};

export default function DispatchDocumentsHistoryModal({
  isOpen,
  onClose,
  documents = [],
  todayStr = new Date().toISOString().slice(0, 10),
  onPreviewOrPrint,
  highlightDocNumber = '',
  isAr = true,
}) {
  // Date-only filter: 'all' | 'today' | 'date'
  const [dateMode, setDateMode] = useState('all');
  const [selectedDate, setSelectedDate] = useState(todayStr);

  const filteredDocs = useMemo(() => {
    return filterDispatchDocumentsByDate(documents, {
      mode: dateMode,
      selectedDate,
      todayStr,
    });
  }, [documents, dateMode, selectedDate, todayStr]);

  const counts = useMemo(() => {
    let valid = 0;
    let legacy = 0;
    let unlinked = 0;
    filteredDocs.forEach((d) => {
      if (d.status === 'valid') valid += 1;
      else legacy += 1;
      if (!d.isLinkedToLiveTrip) unlinked += 1;
    });
    return { total: filteredDocs.length, valid, legacy, unlinked };
  }, [filteredDocs]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/65 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        dir={isAr ? 'rtl' : 'ltr'}
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-teal-500/20 border border-teal-400/30 flex items-center justify-center shrink-0">
              <FileText className="w-5 h-5 text-teal-300" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-black truncate">
                {isAr ? 'سجل مستندات الصرف المطبوعة (الأرشيف الكامل)' : 'Dispatch Documents Registry (Full History)'}
              </h3>
              <p className="text-[11px] text-slate-300 font-semibold truncate">
                {isAr
                  ? 'ترقيم تسلسلي محفوظ بالكامل لجميع أذون الصرف السارية والقديمة — بما فيها الرحلات الملغاة أو المعادة لمعلق'
                  : 'Intact sequential numbering for all Valid & Legacy dispatch documents — including unlinked, cancelled, or reversed trips'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition cursor-pointer shrink-0"
            title={isAr ? 'إغلاق' : 'Close'}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Date-Only Filter Bar & Summary Counts */}
        <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          {/* Date-Only Controls */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200 text-xs font-extrabold shadow-2xs">
              <button
                type="button"
                onClick={() => setDateMode('all')}
                className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                  dateMode === 'all'
                    ? 'bg-slate-900 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                {isAr ? 'كل التواريخ' : 'All Dates'}
              </button>
              <button
                type="button"
                onClick={() => setDateMode('today')}
                className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                  dateMode === 'today'
                    ? 'bg-slate-900 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                {isAr ? `اليوم (${todayStr})` : `Today (${todayStr})`}
              </button>
              <button
                type="button"
                onClick={() => setDateMode('date')}
                className={`px-3 py-1.5 rounded-lg transition cursor-pointer inline-flex items-center gap-1.5 ${
                  dateMode === 'date'
                    ? 'bg-slate-900 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>{isAr ? 'تاريخ محدد' : 'Pick Date'}</span>
              </button>
            </div>

            {dateMode === 'date' && (
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-xs font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            )}
          </div>

          {/* Compact Status Counters */}
          <div className="flex flex-wrap items-center gap-2 text-xs font-extrabold">
            <span className="px-2.5 py-1 rounded-xl bg-white border border-slate-200 text-slate-700">
              {isAr ? 'الإجمالي:' : 'Total:'} <strong className="font-mono text-slate-900">{counts.total}</strong>
            </span>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{isAr ? 'ساري:' : 'Valid:'}</span>
              <strong className="font-mono">{counts.valid}</strong>
            </span>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-rose-50 border border-rose-200 text-rose-800">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>{isAr ? 'قديم:' : 'Legacy:'}</span>
              <strong className="font-mono">{counts.legacy}</strong>
            </span>
            {counts.unlinked > 0 && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-amber-50 border border-amber-200 text-amber-800">
                <Link2Off className="w-3.5 h-3.5" />
                <span>{isAr ? 'غير مرتبط:' : 'Unlinked:'}</span>
                <strong className="font-mono">{counts.unlinked}</strong>
              </span>
            )}
          </div>
        </div>

        {/* Document List */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3 bg-slate-50/40">
          {filteredDocs.length === 0 ? (
            <div className="py-16 text-center bg-white rounded-2xl border border-dashed border-slate-300">
              <FileText className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-black text-slate-700">
                {isAr ? 'لا توجد مستندات صرف مطبوعة في هذا التاريخ' : 'No printed dispatch documents found for this date'}
              </p>
              <p className="text-xs text-slate-400 font-semibold mt-1">
                {isAr
                  ? 'سيتم تسجيل كل إذن صرف يتم طباعته تلقائياً برقم تسلسلي ثابت هنا'
                  : 'Every printed dispatch document is automatically archived here with an intact unique number'}
              </p>
            </div>
          ) : (
            filteredDocs.map((entry) => {
              const isValid = entry.status === 'valid';
              const isHighlighted = Boolean(highlightDocNumber && entry.docNumber === highlightDocNumber);

              return (
                <div
                  key={entry.id}
                  className={`rounded-2xl border p-4 transition shadow-2xs ${
                    isHighlighted
                      ? 'ring-2 ring-indigo-500 border-indigo-400 bg-indigo-50/40'
                      : isValid
                      ? 'bg-white border-emerald-200/90 hover:border-emerald-300'
                      : 'bg-white border-rose-200/80 hover:border-rose-300'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    {/* Left / Main Info */}
                    <div className="space-y-2 min-w-0 flex-1">
                      {/* Top Row: Unique Doc #, Version, Valid/Legacy Status, Unlinked tag */}
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          dir="ltr"
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-slate-900 text-white font-mono text-xs font-black tracking-wide"
                        >
                          <Hash className="w-3 h-3 text-teal-300" />
                          {entry.docNumber}
                        </span>

                        <span className="px-2 py-0.5 rounded-lg bg-slate-100 border border-slate-200 text-slate-700 font-mono text-[11px] font-black">
                          {isAr ? `رحلة #${entry.loadingOrderNumber || '—'}` : `Trip #${entry.loadingOrderNumber || '—'}`}
                          {entry.versionNumber ? ` · v${entry.versionNumber}` : ''}
                        </span>

                        {isValid ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-emerald-100 text-emerald-800 border border-emerald-300 text-[11px] font-black">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            {isAr ? 'ساري (Valid)' : 'Valid'}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-rose-100 text-rose-800 border border-rose-300 text-[11px] font-black">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            {isAr ? 'قديم / غير ساري (Legacy)' : 'Legacy'}
                          </span>
                        )}

                        {!entry.isLinkedToLiveTrip && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-100 text-amber-900 border border-amber-300 text-[10.5px] font-black">
                            <Link2Off className="w-3 h-3" />
                            {isAr ? 'غير مرتبط برحلة حالية' : 'Unlinked Trip'}
                          </span>
                        )}

                        {entry.isPreNumberingArchive && (
                          <span className="px-2 py-0.5 rounded-lg bg-slate-100 text-slate-500 border border-slate-200 text-[10px] font-bold">
                            {isAr ? 'أرشيف قبل الترقيم' : 'Pre-Numbering Archive'}
                          </span>
                        )}
                      </div>

                      {/* Valid Shipped w/ Undelivered Info Note */}
                      {isValid && entry.reasonCode === 'valid_shipped_with_undelivered' && (
                        <div className="px-3 py-1.5 rounded-xl bg-emerald-50/90 border border-emerald-200 text-[11.5px] font-bold text-emerald-900">
                          {isAr ? entry.reasonAr : entry.reasonEn}
                        </div>
                      )}

                      {/* Legacy Reason Banner (when Legacy) */}
                      {!isValid && (entry.reasonAr || entry.reasonEn) && (
                        <div className="px-3 py-1.5 rounded-xl bg-rose-50/90 border border-rose-200 text-[11.5px] font-bold text-rose-900 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <span>{isAr ? entry.reasonAr : entry.reasonEn}</span>
                          {entry.latestValidDocNumber && (
                            <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 font-mono text-[10.5px] font-black">
                              {isAr ? `البديل الساري: ${entry.latestValidDocNumber}` : `Current Valid: ${entry.latestValidDocNumber}`}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Frozen Metadata Grid */}
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-600 font-bold">
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          <span>{isAr ? 'تاريخ التحميل:' : 'Loading:'}</span>
                          <strong className="font-mono text-slate-900">{entry.loadingDate || '—'}</strong>
                        </span>

                        {(entry.vehicleName || entry.plateNumber) && (
                          <TruckNameBadge
                            name={entry.vehicleName}
                            plate={entry.plateNumber}
                            isAr={isAr}
                            iconClassName="w-3.5 h-3.5 text-teal-600 shrink-0 rtl:-scale-x-100"
                            nameClassName="font-bold text-slate-900"
                            copyClassName="border border-slate-200 bg-slate-50 p-1 rounded-md"
                          />
                        )}

                        {entry.driverName && entry.driverName !== '—' && (
                          <span className="inline-flex items-center gap-1">
                            <User className="w-3.5 h-3.5 text-slate-400" />
                            <span>{isAr ? 'السائق:' : 'Driver:'}</span>
                            <strong className="text-slate-800">{entry.driverName}</strong>
                          </span>
                        )}

                        <span className="inline-flex items-center gap-1">
                          <Boxes className="w-3.5 h-3.5 text-amber-600" />
                          <strong className="font-mono text-slate-900">{fmtNum(entry.totalLoaded)}</strong>
                          <span>{isAr ? 'كرتونة' : 'ctn'}</span>
                          {entry.totalExtras > 0 && (
                            <span className="text-[10.5px] font-mono text-teal-700 font-black">
                              (+{fmtNum(entry.totalExtras)} {isAr ? 'زيادات' : 'ext'})
                            </span>
                          )}
                        </span>
                      </div>

                      {/* Orders & Clients Snapshot */}
                      {(entry.orderSerials?.length > 0 || entry.clientNames?.length > 0) && (
                        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                          {entry.orderSerials?.map((ser, idx) => (
                            <span
                              key={`${entry.id}-ser-${idx}`}
                              className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-mono font-bold border border-slate-200"
                            >
                              #{ser}
                            </span>
                          ))}
                          {entry.clientNames?.length > 0 && (
                            <span className="text-slate-500 font-bold truncate max-w-full">
                              {entry.clientNames.join(isAr ? ' • ' : ' • ')}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Print Audit Footer */}
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400 font-bold">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {isAr ? 'وقت الإصدار:' : 'Printed:'} {fmtDateTime(entry.printedAt, isAr)}
                        </span>
                        {entry.printedBy && (
                          <span>
                            {isAr ? 'بواسطة:' : 'By:'} <strong className="text-slate-600">{entry.printedBy}</strong>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Right Action: Preview / Print */}
                    <div className="shrink-0 flex sm:flex-col items-stretch justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => onPreviewOrPrint && onPreviewOrPrint(entry)}
                        className={`inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black transition cursor-pointer shadow-2xs ${
                          isValid
                            ? 'bg-slate-900 hover:bg-slate-800 text-white'
                            : 'bg-rose-50 hover:bg-rose-100 text-rose-900 border border-rose-300'
                        }`}
                      >
                        <Printer className="w-3.5 h-3.5" />
                        <span>{isAr ? 'معاينة / طباعة' : 'Preview / Print'}</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
