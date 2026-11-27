import React, { useState, useEffect } from 'react';
import { db } from '../../firebase';
import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore';
import {
  CheckCircle2,
  Database,
  ExternalLink,
  FolderOpen,
  RefreshCw,
  GitBranch,
  Network,
  Table,
  Plus,
  Search,
  Edit3,
  Trash2,
  Workflow,
  X,
  Code,
  Save,
} from 'lucide-react';
import { APP_ARCHITECTURE } from '../../config/appArchitecture';
import PeacockLoader from '../PeacockLoader';
import {
  BACKUP_COLLECTIONS_REGISTRY,
  resolveDynamicEntityRelations,
  serializeForBackup,
  hydrateFromBackup,
} from '../../utils/adminCatalogs';

export default function DatabaseInspectorHub({ isAr = true }) {
  const [discoveredCollections, setDiscoveredCollections] = useState([]);
  const [selectedCollection, setSelectedCollection] = useState('');
  const [customCollectionInput, setCustomCollectionInput] = useState('');
  const [collectionDocs, setCollectionDocs] = useState([]);
  const [isScanningCollections, setIsScanningCollections] = useState(false);
  const [isLoadingDocs, setIsLoadingDocs] = useState(false);
  const [inspectorViewMode, setInspectorViewMode] = useState('diagram'); // 'diagram' | 'table'
  const [docSearchQuery, setDocSearchQuery] = useState('');
  const [selectedDocForEdit, setSelectedDocForEdit] = useState(null); // { id, data, isNew }
  const [docEditMode, setDocEditMode] = useState('fields'); // 'fields' | 'json'
  const [docJsonString, setDocJsonString] = useState('');
  const [docFieldsList, setDocFieldsList] = useState([]); // [{ key, value, type }]
  const [isSavingDoc, setIsSavingDoc] = useState(false);
  const [dbInspectorMsg, setDbInspectorMsg] = useState('');

// =========================================================================
  // 🔍 ZERO-HARDCODING DYNAMIC DATABASE SCANNER & LIVE CRUD ENGINE
  // =========================================================================
  const handleScanDatabaseCollections = async () => {
    setIsScanningCollections(true);
    setDbInspectorMsg('');
    try {
      // 1. Extract every known and custom collection dynamically
      const candidateSet = new Set(BACKUP_COLLECTIONS_REGISTRY);

      Object.values(APP_ARCHITECTURE.modules || {}).forEach((mod) => {
        Object.values(mod.tabs || {}).forEach((tab) => {
          if (tab.collection) candidateSet.add(tab.collection);
        });
      });

      // Include previously discovered custom user collections
      discoveredCollections.forEach((c) => candidateSet.add(c.name));
      if (selectedCollection) candidateSet.add(selectedCollection);

      // 2. Live Dynamic Probing: Query real document counts & sample payloads
      const scannedResults = [];
      for (const collName of Array.from(candidateSet)) {
        try {
          const snap = await getDocs(collection(db, collName));
          scannedResults.push({
            name: collName,
            count: snap.size,
            sampleDoc: snap.docs[0]?.data() || null,
            allDocsSample: snap.docs.slice(0, 10).map((d) => d.data()),
          });
        } catch (err) {
          // Skip inaccessible collections silently
        }
      }

      // Automatically sort with non-empty collections first, then alphabetically
      scannedResults.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
      setDiscoveredCollections(scannedResults);

      // Keep active selection valid, or switch to first active collection
      const targetStillExists = scannedResults.some((c) => c.name === selectedCollection);
      if ((!selectedCollection || !targetStillExists) && scannedResults.length > 0) {
        handleSelectCollection(scannedResults[0].name);
      }

      setDbInspectorMsg(
        isAr
          ? `اكتمل الفحص: تم اكتشاف (${scannedResults.length}) جدول وقاعدة بيانات نشطة بنجاح!`
          : `Scan complete: Discovered (${scannedResults.length}) active Firestore collections!`
      );
      setTimeout(() => setDbInspectorMsg(''), 4000);
    } catch (err) {
      console.error('Error scanning collections:', err);
      alert(isAr ? 'حدث خطأ أثناء فحص الجداول.' : 'Error scanning database.');
    } finally {
      setIsScanningCollections(false);
    }
  };

  const handleSelectCollection = async (collName) => {
    if (!collName) return;
    setSelectedCollection(collName);
    setIsLoadingDocs(true);
    try {
      const snap = await getDocs(collection(db, collName));
      const list = snap.docs.map((d) => ({
        _id: d.id,
        ...serializeForBackup(d.data()),
      }));
      setCollectionDocs(list);
    } catch (err) {
      console.error('Error fetching collection documents:', err);
      alert(isAr ? `فشل تحميل مستندات الجدول (${collName})` : `Failed to load docs for ${collName}`);
    } finally {
      setIsLoadingDocs(false);
    }
  };

  const handleOpenEditDocument = (docItem) => {
    const rawData = { ...docItem };
    delete rawData._id;

    // Convert object to field entries with inferred types
    const fields = Object.entries(rawData).map(([key, val]) => {
      let inferredType = typeof val;
      if (val === null) inferredType = 'null';
      else if (Array.isArray(val)) inferredType = 'array';
      else if (typeof val === 'object' && val?._type === 'firestore_timestamp') inferredType = 'timestamp';
      else if (typeof val === 'object') inferredType = 'object';

      return {
        key,
        value: typeof val === 'object' ? JSON.stringify(val, null, 2) : String(val),
        type: inferredType,
      };
    });

    setSelectedDocForEdit({
      id: docItem._id,
      isNew: false,
    });
    setDocFieldsList(fields);
    setDocJsonString(JSON.stringify(rawData, null, 2));
    setDocEditMode('fields');
  };

  const handleOpenCreateDocument = () => {
    if (!selectedCollection) {
      alert(isAr ? 'يرجى اختيار الجدول أولاً.' : 'Please select a collection first.');
      return;
    }

    const newId = `doc_${Date.now().toString().slice(-6)}`;
    setSelectedDocForEdit({
      id: newId,
      isNew: true,
    });
    setDocFieldsList([{ key: 'name', value: '', type: 'string' }]);
    setDocJsonString('{\n  "name": ""\n}');
    setDocEditMode('fields');
  };

  const handleSaveDocument = async (e) => {
    e.preventDefault();
    if (!selectedDocForEdit || !selectedCollection) return;

    setIsSavingDoc(true);
    try {
      let payload = {};

      if (docEditMode === 'json') {
        try {
          payload = JSON.parse(docJsonString);
        } catch (jsonErr) {
          alert(isAr ? 'صيغة JSON غير صحيحة.' : 'Invalid JSON format.');
          setIsSavingDoc(false);
          return;
        }
      } else {
        docFieldsList.forEach((f) => {
          if (!f.key.trim()) return;
          const k = f.key.trim();
          let v = f.value;

          if (f.type === 'number') v = Number(f.value) || 0;
          else if (f.type === 'boolean') v = String(f.value).toLowerCase() === 'true';
          else if (f.type === 'null') v = null;
          else if (f.type === 'array' || f.type === 'object') {
            try {
              v = JSON.parse(f.value);
            } catch {
              v = f.value;
            }
          }
          payload[k] = v;
        });
      }

      const hydrated = hydrateFromBackup(payload);
      await setDoc(doc(db, selectedCollection, selectedDocForEdit.id), hydrated, { merge: true });

      setSelectedDocForEdit(null);
      handleSelectCollection(selectedCollection);
      alert(isAr ? 'تم حفظ وتحديث المستند في السحابة بنجاح!' : 'Document saved successfully!');
    } catch (err) {
      console.error('Error saving document:', err);
      alert(isAr ? 'حدث خطأ أثناء حفظ المستند.' : 'Error saving document.');
    } finally {
      setIsSavingDoc(false);
    }
  };

  const handleDeleteDocument = async (docId) => {
    if (!window.confirm(isAr ? `هل أنت متأكد من حذف المستند (${docId}) نهائياً؟` : `Delete document (${docId}) permanently?`)) return;

    try {
      await deleteDoc(doc(db, selectedCollection, docId));
      handleSelectCollection(selectedCollection);
    } catch (err) {
      console.error('Error deleting document:', err);
      alert(isAr ? 'حدث خطأ أثناء حذف المستند.' : 'Error deleting document.');
    }
  };

  useEffect(() => {
    handleScanDatabaseCollections();
  }, []);

  return (
    <>
        <div className="space-y-4 animate-in fade-in duration-200">
          {isScanningCollections && (
            <PeacockLoader
              fullScreen
              size="xl"
              text={isAr ? 'جاري فحص الجداول واكتشاف قواعد البيانات النشطة...' : 'Scanning Database Collections...'}
            />
          )}

          {dbInspectorMsg && (
            <div className="p-3 bg-cyan-50 border border-cyan-200 text-cyan-950 rounded-xl text-xs font-bold flex items-center gap-2 animate-in fade-in">
              <CheckCircle2 className="h-4 w-4 text-cyan-600 shrink-0" />
              <span>{dbInspectorMsg}</span>
            </div>
          )}

          {/* Top Control Bar: Scanner, Collection Selector & Custom Input */}
          <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-2xs space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-cyan-50 text-cyan-700 border border-cyan-200 rounded-xl">
                  <Database className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900">
                    {isAr ? 'مستعرض ومحرر قواعد البيانات السحابية (Schema-Free DB Inspector)' : 'Universal Firestore Database Inspector & Editor'}
                  </h3>
                  <span className="text-[11px] text-slate-500 font-medium">
                    {isAr ? 'فحص واكتشاف الجداول، معاينة المستندات الحية، وتعديل وتصحيح الحقول مباشرة' : 'Auto-discover collections, inspect real-time documents, and edit schema fields'}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleScanDatabaseCollections}
                  className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
                >
                  <RefreshCw className="h-3.5 w-3.5 text-indigo-600" />
                  <span>{isAr ? 'إعادة فحص الجداول' : 'Rescan Collections'}</span>
                </button>

                {selectedCollection && (
                  <button
                    type="button"
                    onClick={handleOpenCreateDocument}
                    className="px-3.5 py-1.5 bg-cyan-600 hover:bg-cyan-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <Plus className="h-4 w-4" />
                    <span>{isAr ? 'إنشاء مستند جديد' : 'New Document'}</span>
                  </button>
                )}
              </div>
            </div>

            {/* Collection Discovery Chips & Ad-Hoc Input */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 pt-2 border-t border-slate-100 items-center">
              <div className="md:col-span-8 flex flex-wrap items-center gap-1.5 max-h-28 overflow-y-auto p-1">
                {discoveredCollections.map((col) => {
                  const isSelected = selectedCollection === col.name;
                  return (
                    <button
                      key={col.name}
                      type="button"
                      onClick={() => handleSelectCollection(col.name)}
                      className={`px-2.5 py-1 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                        isSelected
                          ? 'bg-slate-900 text-white shadow-xs'
                          : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200'
                      }`}
                    >
                      <span>{col.name}</span>
                      <span className={`font-mono text-[10px] px-1.5 py-0.2 rounded-full ${isSelected ? 'bg-cyan-500 text-slate-950 font-black' : 'bg-slate-200 text-slate-700'}`}>
                        {col.count}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Ad-Hoc Custom Collection Query */}
              <div className="md:col-span-4 flex items-center gap-1.5">
                <input
                  type="text"
                  placeholder={isAr ? 'اكتب اسم أي جدول آخر...' : 'Custom collection name...'}
                  value={customCollectionInput}
                  onChange={(e) => setCustomCollectionInput(e.target.value.trim())}
                  className="w-full p-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono focus:bg-white focus:ring-2 focus:ring-cyan-500 focus:outline-none"
                />
                <button
                  type="button"
                  disabled={!customCollectionInput}
                  onClick={() => {
                    handleSelectCollection(customCollectionInput);
                    setCustomCollectionInput('');
                  }}
                  className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition disabled:opacity-40 cursor-pointer"
                >
                  {isAr ? 'فتح' : 'Open'}
                </button>
              </div>
            </div>
          </div>

          {/* Document Inspector & Entity Relationship Diagram Hub */}
          {selectedCollection && (
            <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden space-y-3.5 p-4">
              {/* Top View Mode Switcher Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <span className="font-extrabold text-slate-900 text-xs flex items-center gap-1.5">
                    <FolderOpen className="h-4 w-4 text-cyan-600" />
                    <span>{isAr ? 'الجدول النشط:' : 'Active Collection:'}</span>
                    <span className="font-mono text-cyan-800 bg-cyan-50 px-2 py-0.5 rounded-lg border border-cyan-200 font-extrabold">
                      {selectedCollection}
                    </span>
                  </span>
                  <span className="font-mono text-xs text-slate-400 font-bold">
                    ({collectionDocs.length} {isAr ? 'مستند' : 'documents'})
                  </span>
                </div>

                {/* View Switcher: Diagram / Relations Graph vs. Document Table */}
                <div className="flex items-center gap-2">
                  <div className="flex items-center bg-slate-100 p-1 rounded-xl text-xs font-bold border border-slate-200">
                    <button
                      type="button"
                      onClick={() => setInspectorViewMode('diagram')}
                      className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                        inspectorViewMode === 'diagram'
                          ? 'bg-white text-indigo-900 shadow-xs border border-slate-200/80 font-extrabold'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Workflow className="h-3.5 w-3.5 text-indigo-600" />
                      <span>{isAr ? 'مخطط العلاقات والربط (ERD Graph)' : 'Relationship Diagram'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setInspectorViewMode('table')}
                      className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                        inspectorViewMode === 'table'
                          ? 'bg-white text-slate-900 shadow-xs border border-slate-200/80 font-extrabold'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Table className="h-3.5 w-3.5 text-cyan-600" />
                      <span>{isAr ? 'جدول المستندات الحية' : 'Live Documents Table'}</span>
                    </button>
                  </div>

                  {inspectorViewMode === 'table' && (
                    <div className="relative max-w-xs w-full">
                      <Search className="absolute start-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                      <input
                        type="text"
                        placeholder={isAr ? 'بحث في البيانات...' : 'Search docs...'}
                        value={docSearchQuery}
                        onChange={(e) => setDocSearchQuery(e.target.value)}
                        className="w-full ps-8 pe-3 py-1 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono focus:bg-white focus:outline-none"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* ========================================================================= */}
              {/* 📊 INTERACTIVE 3-TIER DYNAMIC ENTITY-RELATIONSHIP FLOW GRAPH              */}
              {/* ========================================================================= */}
              {inspectorViewMode === 'diagram' && (() => {
                // Dynamically resolve real-time relationships from live document schemas
                const relationMeta = resolveDynamicEntityRelations(
                  selectedCollection,
                  collectionDocs,
                  discoveredCollections
                );

                const upstreams = relationMeta.upstream || [];
                const downstreams = relationMeta.downstream || [];

                return (
                  <div className="p-5 bg-gradient-to-b from-slate-950 via-[#10141d] to-slate-950 text-white rounded-2xl border border-slate-800 space-y-6 shadow-inner animate-in fade-in">
                    {/* Visual Diagram Legend & Header */}
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3 text-xs">
                      <div className="flex items-center gap-2">
                        <Network className="h-4 w-4 text-cyan-400" />
                        <span className="font-extrabold text-sm text-white">
                          {isAr ? `مخطط الربط والاعتماديات لجدول: (${selectedCollection})` : `ERD Dependency Flow: ${selectedCollection}`}
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-cyan-950 border border-cyan-500/40 text-cyan-300">
                          {relationMeta.category}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 text-[11px] font-medium text-slate-400">
                        <span className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-indigo-400" />
                          <span>{isAr ? 'جداول مدخلات / مرجعية (Upstream)' : 'Parent Dependencies'}</span>
                        </span>
                        <span>•</span>
                        <span className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-cyan-400" />
                          <span>{isAr ? 'الجدول المحدد (Center Node)' : 'Current Entity'}</span>
                        </span>
                        <span>•</span>
                        <span className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                          <span>{isAr ? 'جداول مخرجات / تابعة (Downstream)' : 'Dependent Children'}</span>
                        </span>
                      </div>
                    </div>

                    {/* 3-Column Node Flow Canvas (Upstream ➔ Center Node ➔ Downstream) */}
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                      {/* Column 1: Upstream / Parent Dependencies */}
                      <div className="md:col-span-4 space-y-2.5">
                        <div className="text-[11px] font-extrabold text-indigo-400 uppercase tracking-wider flex items-center justify-between px-1">
                          <span>{isAr ? 'الجداول المرجعية (الأصل):' : 'Upstream Parents:'}</span>
                          <span className="font-mono text-[10px] bg-indigo-950/80 px-2 py-0.5 rounded border border-indigo-500/30">
                            {upstreams.length} {isAr ? 'ارتباطات' : 'links'}
                          </span>
                        </div>

                        {upstreams.length === 0 ? (
                          <div className="p-4 rounded-2xl bg-slate-900/60 border border-dashed border-slate-800 text-center text-slate-500 text-xs italic">
                            {isAr ? 'جدول رئيسي مستقل (لا يعتمد على جداول أصل)' : 'Root entity (No upstream parent references)'}
                          </div>
                        ) : (
                          upstreams.map((rel, idx) => (
                            <div
                              key={idx}
                              onClick={() => handleSelectCollection(rel.collection)}
                              className="p-3 bg-[#151a27] hover:bg-[#1e2538] border border-indigo-500/30 hover:border-indigo-400 rounded-2xl transition cursor-pointer group shadow-2xs space-y-1.5"
                              title={isAr ? `انقر للانتقال واستعراض جدول (${rel.collection})` : `Click to inspect ${rel.collection}`}
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-mono font-bold text-xs text-indigo-300 group-hover:text-white transition flex items-center gap-1">
                                  <GitBranch className="h-3.5 w-3.5 text-indigo-400" />
                                  <span>{rel.collection}</span>
                                </span>
                                <span className="text-[9px] font-mono font-extrabold text-indigo-300 bg-indigo-950/90 px-1.5 py-0.2 rounded border border-indigo-500/40">
                                  {rel.type}
                                </span>
                              </div>

                              <span className="text-[11px] text-slate-300 font-semibold block">{isAr ? rel.labelAr : rel.labelEn}</span>
                              <div className="text-[10px] font-mono text-slate-400 bg-black/40 px-2 py-0.5 rounded border border-slate-800 flex items-center justify-between">
                                <span>FK: {rel.key}</span>
                                <ExternalLink className="h-3 w-3 text-indigo-400 opacity-60 group-hover:opacity-100" />
                              </div>
                            </div>
                          ))
                        )}
                      </div>

                      {/* Column 2: Center Node (Selected Collection) */}
                      <div className="md:col-span-4 p-5 bg-[#172033] border-2 border-cyan-400 rounded-3xl text-center space-y-3.5 shadow-xl shadow-cyan-950/40 ring-4 ring-cyan-500/10 relative">
                        <div className="w-12 h-12 rounded-2xl bg-cyan-500/20 border border-cyan-400/40 flex items-center justify-center mx-auto text-cyan-300">
                          <Database className="h-6 w-6" />
                        </div>

                        <div>
                          <span className="font-mono text-lg font-black text-white tracking-tight block">
                            {selectedCollection}
                          </span>
                          <span className="text-xs font-bold text-cyan-300 block mt-0.5">
                            {isAr ? relationMeta.labelAr : relationMeta.labelEn}
                          </span>
                          <span className="text-[10px] font-mono text-slate-400 block mt-1">
                            Collection Key: `{selectedCollection}`
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-700/80 text-xs">
                          <div className="p-2 bg-black/40 rounded-xl border border-slate-800">
                            <span className="text-[10px] text-slate-400 block">{isAr ? 'عدد المستندات:' : 'Documents:'}</span>
                            <span className="font-mono font-black text-cyan-400 text-sm">{collectionDocs.length}</span>
                          </div>

                          <div className="p-2 bg-black/40 rounded-xl border border-slate-800">
                            <span className="text-[10px] text-slate-400 block">{isAr ? 'إجمالي الارتباطات:' : 'Total Relations:'}</span>
                            <span className="font-mono font-black text-emerald-400 text-sm">{upstreams.length + downstreams.length}</span>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => setInspectorViewMode('table')}
                          className="w-full py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 rounded-xl text-xs font-extrabold transition shadow-md flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <Table className="h-3.5 w-3.5" />
                          <span>{isAr ? 'فتح جدول المستندات وتعديل الحقول' : 'Open Live Table & Edit'}</span>
                        </button>
                      </div>

                      {/* Column 3: Downstream / Child Dependencies */}
                      <div className="md:col-span-4 space-y-2.5">
                        <div className="text-[11px] font-extrabold text-emerald-400 uppercase tracking-wider flex items-center justify-between px-1">
                          <span>{isAr ? 'الجداول التابعة والمستهلكة (المصب):' : 'Downstream Children:'}</span>
                          <span className="font-mono text-[10px] bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-500/30">
                            {downstreams.length} {isAr ? 'تأثيرات' : 'links'}
                          </span>
                        </div>

                        {downstreams.length === 0 ? (
                          <div className="p-4 rounded-2xl bg-slate-900/60 border border-dashed border-slate-800 text-center text-slate-500 text-xs italic">
                            {isAr ? 'جدول نهائي للمخرجات (لا توجد جداول أخرى تعتمد عليه)' : 'Terminal leaf table (No downstream child consumers)'}
                          </div>
                        ) : (
                          <div className="space-y-2 max-h-96 overflow-y-auto pe-1">
                            {downstreams.map((rel, idx) => (
                              <div
                                key={idx}
                                onClick={() => handleSelectCollection(rel.collection)}
                                className="p-3 bg-[#131e24] hover:bg-[#1a2932] border border-emerald-500/30 hover:border-emerald-400 rounded-2xl transition cursor-pointer group shadow-2xs space-y-1.5"
                                title={isAr ? `انقر للانتقال واستعراض جدول (${rel.collection})` : `Click to inspect ${rel.collection}`}
                              >
                                <div className="flex items-center justify-between">
                                  <span className="font-mono font-bold text-xs text-emerald-300 group-hover:text-white transition flex items-center gap-1">
                                    <GitBranch className="h-3.5 w-3.5 text-emerald-400" />
                                    <span>{rel.collection}</span>
                                  </span>
                                  <span className="text-[9px] font-mono font-extrabold text-emerald-300 bg-emerald-950/90 px-1.5 py-0.2 rounded border border-emerald-500/40">
                                    {rel.type}
                                  </span>
                                </div>

                                <span className="text-[11px] text-slate-300 font-semibold block">{isAr ? rel.labelAr : rel.labelEn}</span>
                                <div className="text-[10px] font-mono text-slate-400 bg-black/40 px-2 py-0.5 rounded border border-slate-800 flex items-center justify-between">
                                  <span>Ref: {rel.key}</span>
                                  <ExternalLink className="h-3 w-3 text-emerald-400 opacity-60 group-hover:opacity-100" />
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Data Grid Table View */}
              {inspectorViewMode === 'table' && (
              <div className="overflow-x-auto max-h-[500px] border border-slate-200 rounded-xl">
                {isLoadingDocs ? (
                  <div className="p-12 text-center">
                    <PeacockLoader size="md" text={isAr ? 'جاري قراءة المستندات...' : 'Loading documents...'} />
                  </div>
                ) : collectionDocs.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 text-xs italic">
                    {isAr ? 'هذا الجدول فارغ حالياً ولا يحتوي على أي مستندات.' : 'This collection has no documents.'}
                  </div>
                ) : (() => {
                  const filtered = collectionDocs.filter((d) => {
                    if (!docSearchQuery) return true;
                    return JSON.stringify(d).toLowerCase().includes(docSearchQuery.toLowerCase());
                  });

                  // Auto-detect all unique keys across documents
                  const detectedKeys = Array.from(
                    new Set(filtered.flatMap((d) => Object.keys(d).filter((k) => k !== '_id')))
                  ).slice(0, 10);

                  return (
                    <table className="w-full text-start border-collapse text-xs">
                      <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 sticky top-0 z-10">
                        <tr>
                          <th className="p-2.5 text-start border-e border-slate-200 w-44 font-mono">{isAr ? 'معرف المستند (ID)' : 'Document ID'}</th>
                          {detectedKeys.map((k) => (
                            <th key={k} className="p-2.5 text-start border-e border-slate-200 font-mono whitespace-nowrap">
                              {k}
                            </th>
                          ))}
                          <th className="p-2.5 text-center w-24">{isAr ? 'إجراء' : 'Actions'}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                        {filtered.map((docItem) => (
                          <tr key={docItem._id} className="hover:bg-slate-50 transition">
                            <td className="p-2.5 border-e border-slate-200 font-bold text-indigo-700 truncate max-w-[180px]" title={docItem._id}>
                              {docItem._id}
                            </td>

                            {detectedKeys.map((k) => {
                              const val = docItem[k];
                              const renderVal = typeof val === 'object' && val !== null ? JSON.stringify(val) : String(val ?? '—');

                              return (
                                <td key={k} className="p-2.5 border-e border-slate-100 text-slate-700 truncate max-w-[200px]" title={renderVal}>
                                  {renderVal}
                                </td>
                              );
                            })}

                            <td className="p-2.5 text-center">
                              <div className="flex items-center justify-center gap-1 font-sans">
                                <button
                                  type="button"
                                  onClick={() => handleOpenEditDocument(docItem)}
                                  className="p-1 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                                  title={isAr ? 'تعديل المستند' : 'Edit Document'}
                                >
                                  <Edit3 className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteDocument(docItem._id)}
                                  className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                                  title={isAr ? 'حذف المستند' : 'Delete'}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  );
                })()}
              </div>
              )}
            </div>
          )}
        </div>

      {/* ========================================================================= */}
      {/* 📝 LIVE DOCUMENT EDITOR & SCHEMA BUILDER MODAL                             */}
      {/* ========================================================================= */}
      {selectedDocForEdit && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 z-[99999] overflow-y-auto animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 my-auto max-h-[92vh] overflow-y-auto">
            {/* Header */}
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-cyan-50 text-cyan-700 rounded-xl">
                  <Edit3 className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-slate-900">
                    {selectedDocForEdit.isNew ? (isAr ? 'إنشاء مستند جديد' : 'Create Document') : (isAr ? 'تعديل بيانات المستند' : 'Edit Document')}
                  </h3>
                  <span className="font-mono text-xs text-indigo-700 font-bold">
                    {selectedCollection} / {selectedDocForEdit.id}
                  </span>
                </div>
              </div>

              {/* Mode Switcher */}
              <div className="flex items-center bg-slate-100 p-1 rounded-xl text-xs font-bold">
                <button
                  type="button"
                  onClick={() => {
                    // Sync JSON to fields list
                    try {
                      const parsed = JSON.parse(docJsonString);
                      const fList = Object.entries(parsed).map(([k, v]) => ({
                        key: k,
                        value: typeof v === 'object' ? JSON.stringify(v, null, 2) : String(v),
                        type: typeof v === 'object' ? 'object' : typeof v,
                      }));
                      setDocFieldsList(fList);
                    } catch {}
                    setDocEditMode('fields');
                  }}
                  className={`px-3 py-1 rounded-lg transition cursor-pointer ${
                    docEditMode === 'fields' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'
                  }`}
                >
                  {isAr ? 'حقول' : 'Fields'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    // Sync fields list to JSON
                    const obj = {};
                    docFieldsList.forEach((f) => {
                      if (!f.key.trim()) return;
                      let v = f.value;
                      if (f.type === 'number') v = Number(f.value) || 0;
                      else if (f.type === 'boolean') v = String(f.value).toLowerCase() === 'true';
                      else if (f.type === 'array' || f.type === 'object') {
                        try { v = JSON.parse(f.value); } catch { v = f.value; }
                      }
                      obj[f.key.trim()] = v;
                    });
                    setDocJsonString(JSON.stringify(obj, null, 2));
                    setDocEditMode('json');
                  }}
                  className={`px-3 py-1 rounded-lg transition cursor-pointer ${
                    docEditMode === 'json' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'
                  }`}
                >
                  <Code className="h-3 w-3 inline me-1" />
                  <span>JSON</span>
                </button>
              </div>
            </div>

            <form onSubmit={handleSaveDocument} className="space-y-4 text-xs">
              {/* Document ID */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1 font-mono">
                  {isAr ? 'معرف المستند (Document ID) *' : 'Document ID *'}
                </label>
                <input
                  type="text"
                  required
                  disabled={!selectedDocForEdit.isNew}
                  value={selectedDocForEdit.id}
                  onChange={(e) => setSelectedDocForEdit({ ...selectedDocForEdit, id: e.target.value })}
                  className="w-full p-2 border border-slate-300 rounded-xl font-mono font-bold bg-slate-50 disabled:text-slate-500"
                />
              </div>

              {/* Mode 1: Form Fields Builder */}
              {docEditMode === 'fields' ? (
                <div className="space-y-2.5 max-h-96 overflow-y-auto p-1">
                  {docFieldsList.map((field, fIdx) => (
                    <div key={fIdx} className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl grid grid-cols-12 gap-2 items-center">
                      <div className="col-span-4">
                        <input
                          type="text"
                          placeholder="fieldKey"
                          value={field.key}
                          onChange={(e) => {
                            const updated = [...docFieldsList];
                            updated[fIdx].key = e.target.value;
                            setDocFieldsList(updated);
                          }}
                          className="w-full p-1.5 border border-slate-300 rounded-lg font-mono text-xs bg-white font-bold"
                        />
                      </div>

                      <div className="col-span-3">
                        <select
                          value={field.type}
                          onChange={(e) => {
                            const updated = [...docFieldsList];
                            updated[fIdx].type = e.target.value;
                            setDocFieldsList(updated);
                          }}
                          className="w-full p-1.5 border border-slate-300 rounded-lg text-xs bg-white font-medium"
                        >
                          <option value="string">string</option>
                          <option value="number">number</option>
                          <option value="boolean">boolean</option>
                          <option value="array">array (JSON)</option>
                          <option value="object">object (JSON)</option>
                          <option value="timestamp">timestamp</option>
                        </select>
                      </div>

                      <div className="col-span-4">
                        <input
                          type="text"
                          placeholder="value"
                          value={field.value}
                          onChange={(e) => {
                            const updated = [...docFieldsList];
                            updated[fIdx].value = e.target.value;
                            setDocFieldsList(updated);
                          }}
                          className="w-full p-1.5 border border-slate-300 rounded-lg font-mono text-xs bg-white"
                        />
                      </div>

                      <div className="col-span-1 text-center">
                        <button
                          type="button"
                          onClick={() => setDocFieldsList(docFieldsList.filter((_, i) => i !== fIdx))}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}

                  <button
                    type="button"
                    onClick={() => setDocFieldsList([...docFieldsList, { key: '', value: '', type: 'string' }])}
                    className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs transition flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>{isAr ? 'إضافة حقل جديد' : 'Add Field'}</span>
                  </button>
                </div>
              ) : (
                /* Mode 2: Raw JSON Editor */
                <div>
                  <textarea
                    rows={12}
                    value={docJsonString}
                    onChange={(e) => setDocJsonString(e.target.value)}
                    className="w-full p-3 font-mono text-xs bg-slate-900 text-emerald-400 rounded-xl border border-slate-700 focus:outline-none"
                  />
                </div>
              )}

              {/* Modal Actions */}
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSelectedDocForEdit(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={isSavingDoc}
                  className="px-5 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-xl font-bold shadow-xs flex items-center gap-1.5"
                >
                  {isSavingDoc ? <PeacockLoader size="xxs" inline variant="white" /> : <Save className="h-3.5 w-3.5" />}
                  <span>{isAr ? 'حفظ وتحديث المستند' : 'Save Document'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </>
  );
}
