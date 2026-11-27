import React, { useState } from 'react';
import { db } from '../../firebase';
import {
  collection,
  doc,
  getDocs,
  writeBatch,
} from 'firebase/firestore';
import {
  Archive,
  CheckCheck,
  CheckCircle2,
  Download,
  FileJson,
  HardDriveDownload,
  HardDriveUpload,
  Layers,
  RotateCcw,
} from 'lucide-react';
import { APP_ARCHITECTURE } from '../../config/appArchitecture';
import PeacockLoader from '../PeacockLoader';
import {
  MASTER_COLLECTIONS_REGISTRY,
  OPERATIONAL_COLLECTIONS_REGISTRY,
  BACKUP_COLLECTIONS_REGISTRY,
  COLLECTION_DISPLAY_NAMES,
  serializeForBackup,
  hydrateFromBackup,
} from '../../utils/adminCatalogs';

export default function BackupRestoreHub({ isAr = true, currentUser = {} }) {
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreFilePayload, setRestoreFilePayload] = useState(null);
  const [restoreStrategy, setRestoreStrategy] = useState('clean_slate'); // 'clean_slate' | 'merge_upsert'
  const [backupRestoreMsg, setBackupRestoreMsg] = useState('');
  const [restoreProgressText, setRestoreProgressText] = useState('');
  const [selectedBackupCollections, setSelectedBackupCollections] = useState([...BACKUP_COLLECTIONS_REGISTRY]);
  const [selectedRestoreCollections, setSelectedRestoreCollections] = useState([]);

  // =========================================================================
  // 🦚 MASTER DATA BACKUP & CHUNKED RESTORE ENGINE (DYNAMIC MULTI-COLLECTION)
  // =========================================================================

  // 1. Export Targeted Multi-Collection JSON Backup File
  const handleExportBackupJson = async () => {
    if (selectedBackupCollections.length === 0) {
      alert(isAr ? 'يرجى تحديد جدول واحد على الأقل للتصدير.' : 'Please select at least one collection to export.');
      return;
    }

    const targetCollections = selectedBackupCollections;

    setIsBackingUp(true);
    try {
      const collectionsData = {};
      const collectionCounts = {};
      let totalDocuments = 0;

      for (const collName of targetCollections) {
        const snap = await getDocs(collection(db, collName));
        const docsArray = snap.docs.map((docSnap) => ({
          _docId: docSnap.id,
          ...serializeForBackup(docSnap.data()),
        }));
        collectionsData[collName] = docsArray;
        collectionCounts[collName] = docsArray.length;
        totalDocuments += docsArray.length;
      }

      const now = new Date();
      const timestampIso = now.toISOString();
      const dateCompact = timestampIso.split('T')[0];
      const timeCompact = now.toTimeString().split(' ')[0].replace(/:/g, '-');

      const isFull = targetCollections.length === BACKUP_COLLECTIONS_REGISTRY.length;
      const filePrefix = isFull ? 'al_tawoos_erp_full_backup' : `al_tawoos_erp_partial_backup_${targetCollections.length}colls`;

      const backupEnvelope = {
        _backupHeader: {
          app: 'Al-Tawoos FMCG ERP',
          version: APP_ARCHITECTURE.version || '2.5',
          backupDate: timestampIso,
          exportedBy: isAr ? currentUser.nameAr : (currentUser.name || currentUser.email || 'General Admin'),
          isPartialBackup: !isFull,
          selectedCollections: targetCollections,
          totalCollections: targetCollections.length,
          totalDocuments,
          collectionCounts,
        },
        collections: collectionsData,
      };

      const jsonString = JSON.stringify(backupEnvelope, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `${filePrefix}_${dateCompact}_${timeCompact}.json`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setBackupRestoreMsg(
        isAr
          ? `تم إنشاء وتنزيل النسخة الاحتياطية بنجاح! تم تصدير (${totalDocuments}) مستند عبر (${targetCollections.length}) جدول مختار.`
          : `Backup downloaded successfully! (${totalDocuments}) documents exported across (${targetCollections.length}) selected collections.`
      );
      setTimeout(() => setBackupRestoreMsg(''), 6000);
    } catch (err) {
      console.error('Error generating backup:', err);
      alert(isAr ? 'حدث خطأ أثناء تصدير النسخة الاحتياطية.' : 'Error generating backup.');
    } finally {
      setIsBackingUp(false);
    }
  };

  // 2. Select & Parse Backup File for Pre-Restore Verification
  const handleSelectRestoreFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);
        if (!parsed._backupHeader || !parsed.collections) {
          alert(
            isAr
              ? 'ملف النسخة الاحتياطية غير صالح أو لا يحتوي على بنية البيانات المعتمدة.'
              : 'Invalid backup file structure.'
          );
          return;
        }
        setRestoreFilePayload(parsed);
        // Automatically pre-select all collections present in the loaded backup payload
        setSelectedRestoreCollections(Object.keys(parsed.collections || {}));
      } catch (err) {
        console.error('Error parsing JSON backup file:', err);
        alert(isAr ? 'فشل قراءة وتحليل ملف الـ JSON.' : 'Failed to parse JSON backup file.');
      }
    };
    reader.readAsText(file);
  };

  // 3. Execute Selective Chunked Batch Restore (Max 400 writes per batch)
  const handleExecuteChunkedRestore = async () => {
    if (!restoreFilePayload) return;

    const collectionsMap = restoreFilePayload.collections || {};
    const targetCollections = selectedRestoreCollections.filter((c) => Array.isArray(collectionsMap[c]));

    if (targetCollections.length === 0) {
      alert(isAr ? 'يرجى تحديد جدول واحد على الأقل للاستعادة.' : 'Please select at least one collection to restore.');
      return;
    }

    const totalDocsToRestore = targetCollections.reduce((sum, c) => sum + (collectionsMap[c]?.length || 0), 0);

    const confirmMsg = isAr
      ? `تحذير هام: أنت على وشك استعادة (${totalDocsToRestore}) مستند عبر (${targetCollections.length}) جدول مختار باستخدام استراتيجية (${restoreStrategy === 'clean_slate' ? 'مسح الجداول المحددة واستبدالها' : 'دمج وتحديث'}). هل ترغب في المتابعة؟`
      : `Warning: You are about to restore (${totalDocsToRestore}) documents across (${targetCollections.length}) selected collections using (${restoreStrategy}). Proceed?`;

    if (!window.confirm(confirmMsg)) return;

    setIsRestoring(true);
    setRestoreProgressText(isAr ? 'جاري بدء معالجة حزم الاستعادة...' : 'Initializing batch chunks...');

    try {
      // Strategy 1: Clean Slate (Purge ONLY the selected collections prior to writing)
      if (restoreStrategy === 'clean_slate') {
        setRestoreProgressText(isAr ? 'جاري تفريغ الجداول المحددة لضمان مطابقة 100%...' : 'Purging selected collections...');
        for (const collName of targetCollections) {
          const snap = await getDocs(collection(db, collName));
          if (!snap.empty) {
            const docsToPurge = snap.docs;
            const CHUNK_SIZE = 400;
            for (let i = 0; i < docsToPurge.length; i += CHUNK_SIZE) {
              const chunk = docsToPurge.slice(i, i + CHUNK_SIZE);
              const purgeBatch = writeBatch(db);
              chunk.forEach((d) => purgeBatch.delete(d.ref));
              await purgeBatch.commit();
            }
          }
        }
      }

      // Restore Documents with Hydration in Chunks of 400
      let totalCommitted = 0;
      for (const collName of targetCollections) {
        const rawDocsList = collectionsMap[collName] || [];
        if (rawDocsList.length === 0) continue;

        setRestoreProgressText(
          isAr
            ? `جاري استعادة جدول (${collName}) - (${rawDocsList.length} مستند)...`
            : `Restoring (${collName}) - (${rawDocsList.length} docs)...`
        );

        const CHUNK_SIZE = 400;
        for (let i = 0; i < rawDocsList.length; i += CHUNK_SIZE) {
          const chunk = rawDocsList.slice(i, i + CHUNK_SIZE);
          const restoreBatch = writeBatch(db);

          chunk.forEach((item) => {
            const docId = item._docId;
            if (!docId) return;

            const docData = { ...item };
            delete docData._docId;

            const hydratedData = hydrateFromBackup(docData);
            const targetRef = doc(db, collName, docId);

            restoreBatch.set(targetRef, hydratedData, { merge: restoreStrategy === 'merge_upsert' });
          });

          await restoreBatch.commit();
          totalCommitted += chunk.length;
        }
      }

      setBackupRestoreMsg(
        isAr
          ? `اكتملت الاستعادة بنجاح تام! تم كتابة وتوثيق (${totalCommitted}) مستند عبر (${targetCollections.length}) جدول مختار.`
          : `Restore completed successfully! Hydrated (${totalCommitted}) documents across (${targetCollections.length}) collections.`
      );
      setRestoreFilePayload(null);
      setSelectedRestoreCollections([]);
      setTimeout(() => setBackupRestoreMsg(''), 8000);
    } catch (err) {
      console.error('Error during chunked restore execution:', err);
      alert(isAr ? 'حدث خطأ أثناء تنفيذ عملية الاستعادة.' : 'Error executing restore.');
    } finally {
      setIsRestoring(false);
      setRestoreProgressText('');
    }
  };

  return (
        <div className="space-y-5 animate-in fade-in duration-200">
          {(isBackingUp || isRestoring) && (
            <PeacockLoader
              fullScreen
              size="xl"
              text={
                isBackingUp
                  ? (isAr ? 'جاري استخراج وتجميع النسخة الاحتياطية لكافة الجداول السحابية...' : 'Serializing all 16 collections to JSON...')
                  : (restoreProgressText || (isAr ? 'جاري تنفيذ الاستعادة السحابية...' : 'Executing Chunked Restore...'))
              }
            />
          )}

          {backupRestoreMsg && (
            <div className="p-4 bg-emerald-50 border border-emerald-300 text-emerald-950 rounded-2xl text-xs font-bold flex items-center gap-2.5 animate-in fade-in shadow-2xs">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
              <span>{backupRestoreMsg}</span>
            </div>
          )}

          {/* Dual Column Action Hub */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* 1. Selective Multi-Collection Backup Export Card */}
            <div className="p-5 bg-white border border-slate-200 rounded-3xl shadow-sm space-y-4 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-2xl shadow-2xs">
                    <HardDriveDownload className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-sm text-slate-900">
                      {isAr ? '١- تصدير نسخة احتياطية محددة / شاملة' : '1. Export Selective Backup (.json)'}
                    </h3>
                    <p className="text-xs text-slate-500 font-medium mt-0.5">
                      {isAr ? 'تحديد الجداول المطلوبة بدقة وتصدير مستنداتها مع المرفقات والتوقيتات' : 'Select target collections to serialize and download in JSON format'}
                    </p>
                  </div>
                </div>

                {/* Categorized Interactive Collection Selector */}
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-extrabold text-slate-800 flex items-center gap-1.5">
                      <Layers className="h-3.5 w-3.5 text-indigo-600" />
                      <span>{isAr ? 'اختر الجداول المراد تضمينها:' : 'Target Collections:'}</span>
                    </span>

                    {/* 1-Click Fast Presets */}
                    <div className="flex items-center gap-1.5 flex-wrap font-bold text-[10px]">
                      <button
                        type="button"
                        onClick={() => setSelectedBackupCollections([...MASTER_COLLECTIONS_REGISTRY])}
                        className="px-2 py-0.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 rounded-md cursor-pointer transition"
                      >
                        {isAr ? 'البيانات الأساسية فقط (١٢)' : 'Master Only (12)'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedBackupCollections([...OPERATIONAL_COLLECTIONS_REGISTRY])}
                        className="px-2 py-0.5 bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 rounded-md cursor-pointer transition"
                      >
                        {isAr ? 'الحركات التشغيلية فقط (١٦)' : 'Operational Only (16)'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedBackupCollections([...BACKUP_COLLECTIONS_REGISTRY])}
                        className="px-2 py-0.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 rounded-md cursor-pointer transition"
                      >
                        {isAr ? 'تحديد الكل' : 'All (28)'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedBackupCollections([])}
                        className="px-2 py-0.5 bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200 rounded-md cursor-pointer transition"
                      >
                        {isAr ? 'إلغاء' : 'None'}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-3 max-h-80 overflow-y-auto p-1 text-xs pe-1">
                    {/* Category 1: Master Data */}
                    <div className="p-2.5 bg-white border border-emerald-200/80 rounded-2xl space-y-2">
                      <div className="flex items-center justify-between border-b border-emerald-100 pb-1.5">
                        <span className="font-extrabold text-[11px] text-emerald-800 flex items-center gap-1.5">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                          <span>{isAr ? 'البيانات الأساسية الثابتة (Master Data)' : 'Master Data Records'}</span>
                        </span>
                        <span className="text-[10px] font-mono font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                          {selectedBackupCollections.filter((c) => MASTER_COLLECTIONS_REGISTRY.includes(c)).length} / {MASTER_COLLECTIONS_REGISTRY.length}
                        </span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                        {MASTER_COLLECTIONS_REGISTRY.map((collName) => {
                          const isChecked = selectedBackupCollections.includes(collName);
                          const meta = COLLECTION_DISPLAY_NAMES[collName] || {};
                          return (
                            <label
                              key={collName}
                              className={`p-1.5 rounded-xl border flex items-center gap-2 cursor-pointer transition select-none ${
                                isChecked
                                  ? 'bg-emerald-50/90 border-emerald-300 text-emerald-950 font-bold shadow-2xs'
                                  : 'bg-slate-50/60 border-slate-200 text-slate-500 hover:bg-slate-100'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => {
                                  const next = isChecked
                                    ? selectedBackupCollections.filter((c) => c !== collName)
                                    : [...selectedBackupCollections, collName];
                                  setSelectedBackupCollections(next);
                                }}
                                className="accent-emerald-600 rounded h-3.5 w-3.5 shrink-0"
                              />
                              <div className="min-w-0 flex-1 leading-tight">
                                <span className="block text-[11px] font-bold truncate">
                                  {isAr ? meta.ar || collName : meta.en || collName}
                                </span>
                                <span className="block font-mono text-[9px] text-slate-400 truncate">
                                  {collName}
                                </span>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </div>

                    {/* Category 2: Operational Data */}
                    <div className="p-2.5 bg-white border border-amber-200/80 rounded-2xl space-y-2">
                      <div className="flex items-center justify-between border-b border-amber-100 pb-1.5">
                        <span className="font-extrabold text-[11px] text-amber-800 flex items-center gap-1.5">
                          <RotateCcw className="h-3.5 w-3.5 text-amber-600" />
                          <span>{isAr ? 'الحركات والبيانات التشغيلية والدفترية (Operational)' : 'Operational & Transactional'}</span>
                        </span>
                        <span className="text-[10px] font-mono font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                          {selectedBackupCollections.filter((c) => OPERATIONAL_COLLECTIONS_REGISTRY.includes(c)).length} / {OPERATIONAL_COLLECTIONS_REGISTRY.length}
                        </span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                        {OPERATIONAL_COLLECTIONS_REGISTRY.map((collName) => {
                          const isChecked = selectedBackupCollections.includes(collName);
                          const meta = COLLECTION_DISPLAY_NAMES[collName] || {};
                          return (
                            <label
                              key={collName}
                              className={`p-1.5 rounded-xl border flex items-center gap-2 cursor-pointer transition select-none ${
                                isChecked
                                  ? 'bg-amber-50/90 border-amber-300 text-amber-950 font-bold shadow-2xs'
                                  : 'bg-slate-50/60 border-slate-200 text-slate-500 hover:bg-slate-100'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => {
                                  const next = isChecked
                                    ? selectedBackupCollections.filter((c) => c !== collName)
                                    : [...selectedBackupCollections, collName];
                                  setSelectedBackupCollections(next);
                                }}
                                className="accent-amber-600 rounded h-3.5 w-3.5 shrink-0"
                              />
                              <div className="min-w-0 flex-1 leading-tight">
                                <span className="block text-[11px] font-bold truncate">
                                  {isAr ? meta.ar || collName : meta.en || collName}
                                </span>
                                <span className="block font-mono text-[9px] text-slate-400 truncate">
                                  {collName}
                                </span>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-between items-center text-[11px] pt-1 text-slate-500 border-t border-slate-200/60 font-mono">
                    <span>{isAr ? 'عدد الجداول المحددة:' : 'Selected Collections:'}</span>
                    <b className="text-indigo-700 font-extrabold">
                      {selectedBackupCollections.length} / {BACKUP_COLLECTIONS_REGISTRY.length}
                    </b>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={handleExportBackupJson}
                disabled={isBackingUp || selectedBackupCollections.length === 0}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-xs font-bold transition shadow-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <HardDriveDownload className="h-4 w-4" />
                <span>
                  {selectedBackupCollections.length === 0
                    ? (isAr ? 'يرجى تحديد جدول واحد على الأقل' : 'Select at least 1 collection')
                    : (isAr
                        ? `تنزيل النسخة الاحتياطية (${selectedBackupCollections.length} جدول)`
                        : `Download Backup JSON (${selectedBackupCollections.length} collections)`)}
                </span>
              </button>
            </div>

            {/* 2. Selective Multi-Collection Restore Card */}
            <div className="p-5 bg-white border border-slate-200 rounded-3xl shadow-sm space-y-4 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-2xl shadow-2xs">
                    <HardDriveUpload className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-sm text-slate-900">
                      {isAr ? '٢- استعادة محددة من ملف احتياطي (Selective Restore)' : '2. Selective Restore from File'}
                    </h3>
                    <p className="text-xs text-slate-500 font-medium mt-0.5">
                      {isAr ? 'اختيار جداول ومستندات محددة للاستعادة مع خيار المسح أو الدمج' : 'Select collections from JSON to hydrate safely in 400-doc batches'}
                    </p>
                  </div>
                </div>

                {/* File Upload Zone */}
                <div className="p-3.5 bg-slate-50 border-2 border-dashed border-slate-300 rounded-2xl text-center space-y-2">
                  <FileJson className="h-7 w-7 text-slate-400 mx-auto" />
                  <div>
                    <label className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 rounded-xl text-xs font-bold cursor-pointer transition shadow-2xs">
                      <span>{isAr ? 'اختر ملف النسخة الاحتياطية (.json)' : 'Select Backup JSON File'}</span>
                      <input type="file" accept=".json,application/json" onChange={handleSelectRestoreFile} className="hidden" />
                    </label>
                  </div>
                  <span className="text-[10px] text-slate-400 block">
                    {restoreFilePayload ? (
                      <b className="text-emerald-700 font-mono">
                        {isAr ? 'تم تحميل الملف بنجاح:' : 'Loaded:'} {restoreFilePayload._backupHeader.backupDate?.split('T')[0]} ({restoreFilePayload._backupHeader.totalDocuments} {isAr ? 'مستند عبر' : 'docs in'} {Object.keys(restoreFilePayload.collections || {}).length} {isAr ? 'جدول' : 'colls'})
                      </b>
                    ) : (
                      (isAr ? 'يتم فحص بنية الملف واكتشاف الجداول تلقائياً' : 'Auto-inspects collections & doc counts before restore')
                    )}
                  </span>
                </div>

                {/* Restore Strategy Selection */}
                {restoreFilePayload && (
                  <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-2xl space-y-2 text-xs">
                    <span className="font-bold text-amber-950 block">
                      {isAr ? 'استراتيجية استعادة الجداول المحددة:' : 'Restore Strategy for Selected Tables:'}
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                      <label className={`p-2 border rounded-xl cursor-pointer flex items-center gap-2 transition ${restoreStrategy === 'clean_slate' ? 'bg-amber-100 border-amber-400 font-bold text-amber-950 shadow-2xs' : 'bg-white border-slate-200 text-slate-700'}`}>
                        <input
                          type="radio"
                          name="strategy"
                          checked={restoreStrategy === 'clean_slate'}
                          onChange={() => setRestoreStrategy('clean_slate')}
                          className="accent-amber-600"
                        />
                        <span className="text-[11px]">{isAr ? 'مسح واستبدال الجداول المحددة فقط' : 'Wipe & Replace Selected Only'}</span>
                      </label>

                      <label className={`p-2 border rounded-xl cursor-pointer flex items-center gap-2 transition ${restoreStrategy === 'merge_upsert' ? 'bg-amber-100 border-amber-400 font-bold text-amber-950 shadow-2xs' : 'bg-white border-slate-200 text-slate-700'}`}>
                        <input
                          type="radio"
                          name="strategy"
                          checked={restoreStrategy === 'merge_upsert'}
                          onChange={() => setRestoreStrategy('merge_upsert')}
                          className="accent-amber-600"
                        />
                        <span className="text-[11px]">{isAr ? 'دمج وتحديث (Upsert)' : 'Merge & Upsert'}</span>
                      </label>
                    </div>
                  </div>
                )}
              </div>

              {/* Restore Action Button */}
              <button
                type="button"
                disabled={!restoreFilePayload || isRestoring || selectedRestoreCollections.length === 0}
                onClick={handleExecuteChunkedRestore}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-xs font-bold transition shadow-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <CheckCheck className="h-4 w-4" />
                <span>
                  {isAr
                    ? `استعادة الجداول المحددة (${selectedRestoreCollections.length} جدول)`
                    : `Restore Selected (${selectedRestoreCollections.length} collections)`}
                </span>
              </button>
            </div>
          </div>

          {/* Granular Collection & Document Inspection & Checkbox Selector */}
          {restoreFilePayload && (
            <div className="p-5 bg-white border border-slate-200 rounded-3xl shadow-sm space-y-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                <div className="flex items-center gap-2">
                  <Archive className="h-4 w-4 text-indigo-600" />
                  <span className="font-extrabold text-xs text-slate-900">
                    {isAr ? 'حدد الجداول والمستندات المراد استعادتها من هذا الملف:' : 'Select Collections to Restore from File:'}
                  </span>
                </div>

                <div className="flex items-center gap-2 flex-wrap text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => {
                      const available = Object.keys(restoreFilePayload.collections || {});
                      setSelectedRestoreCollections(available.filter((c) => MASTER_COLLECTIONS_REGISTRY.includes(c)));
                    }}
                    className="px-2 py-0.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 rounded-md cursor-pointer transition text-[11px]"
                  >
                    {isAr ? 'البيانات الأساسية فقط' : 'Master Only'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const available = Object.keys(restoreFilePayload.collections || {});
                      setSelectedRestoreCollections(available.filter((c) => OPERATIONAL_COLLECTIONS_REGISTRY.includes(c)));
                    }}
                    className="px-2 py-0.5 bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 rounded-md cursor-pointer transition text-[11px]"
                  >
                    {isAr ? 'الحركات التشغيلية فقط' : 'Operational Only'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedRestoreCollections(Object.keys(restoreFilePayload.collections || {}))}
                    className="text-emerald-700 hover:underline cursor-pointer text-[11px]"
                  >
                    {isAr ? 'تحديد الكل' : 'Select All'}
                  </button>
                  <span className="text-slate-300">•</span>
                  <button
                    type="button"
                    onClick={() => setSelectedRestoreCollections([])}
                    className="text-slate-500 hover:underline cursor-pointer text-[11px]"
                  >
                    {isAr ? 'إلغاء' : 'Deselect All'}
                  </button>
                  <span className="font-mono text-xs font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-200 ms-1">
                    {selectedRestoreCollections.length} / {Object.keys(restoreFilePayload.collections || {}).length} {isAr ? 'محدد' : 'Selected'}
                  </span>
                </div>
              </div>

              {/* Collections Cards with Live Checkboxes */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
                {Object.entries(restoreFilePayload._backupHeader.collectionCounts || {}).map(([collName, count]) => {
                  const isSelected = selectedRestoreCollections.includes(collName);
                  const isMaster = MASTER_COLLECTIONS_REGISTRY.includes(collName);
                  const meta = COLLECTION_DISPLAY_NAMES[collName] || {};
                  return (
                    <label
                      key={collName}
                      className={`p-2.5 rounded-2xl border transition-all cursor-pointer select-none space-y-1.5 ${
                        isSelected
                          ? isMaster
                            ? 'bg-emerald-50/90 border-emerald-400 shadow-2xs ring-1 ring-emerald-400 text-emerald-950 font-bold'
                            : 'bg-amber-50/90 border-amber-400 shadow-2xs ring-1 ring-amber-400 text-amber-950 font-bold'
                          : 'bg-slate-50/70 border-slate-200 opacity-60 hover:opacity-100'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {
                            setSelectedRestoreCollections((prev) =>
                              prev.includes(collName) ? prev.filter((c) => c !== collName) : [...prev, collName]
                            );
                          }}
                          className={`rounded h-4 w-4 ${isMaster ? 'accent-emerald-600' : 'accent-amber-600'}`}
                        />
                        <span className="font-mono text-[11px] font-extrabold text-slate-800">{count} {isAr ? 'مستند' : 'docs'}</span>
                      </div>
                      <div className="min-w-0">
                        <span className="text-[11px] font-bold block truncate" title={isAr ? meta.ar || collName : meta.en || collName}>
                          {isAr ? meta.ar || collName : meta.en || collName}
                        </span>
                        <div className="flex items-center justify-between gap-1 mt-0.5">
                          <span className="font-mono text-[9px] text-slate-400 block truncate" title={collName}>
                            {collName}
                          </span>
                          <span className={`text-[8px] font-bold px-1 rounded uppercase shrink-0 ${isMaster ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                            {isMaster ? 'Master' : 'Ops'}
                          </span>
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </div>

  );
}
