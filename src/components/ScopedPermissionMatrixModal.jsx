import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { db } from '../firebase';
import { collection, doc, getDoc, setDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import {
  APP_ARCHITECTURE,
  DEFAULT_ROLE_PERMISSIONS,
  getPermissionCellMeta,
} from '../config/appArchitecture';
import { getRecordDepartmentIds } from '../utils/personnelDirectory';
import {
  ShieldCheck,
  User,
  Users,
  CheckCircle2,
  Lock,
  Save,
  Building2,
  X,
  Layers,
  RotateCcw,
} from 'lucide-react';
import PeacockLoader from './PeacockLoader';

export default function ScopedPermissionMatrixModal({
  isOpen,
  onClose,
  scopeType = 'module', // 'module' | 'tab' | 'all'
  targetKey = '',       // module key, tab key, or 'all'
  initialMode = 'users', // 'departments' | 'users'
  initialDepartmentId = null,
  initialUserId = null,
  currentUser = {},
  usersList = [],
  departmentsList = null,
}) {
  const { i18n } = useTranslation();
  const isAr = i18n.language === 'ar';

  const [activeMode, setActiveMode] = useState(initialMode || 'users');
  const [moduleFilter, setModuleFilter] = useState('all');
  const [userOverridesState, setUserOverridesState] = useState({});
  const [deptOverridesState, setDeptOverridesState] = useState({});
  const [liveDepartments, setLiveDepartments] = useState([]);
  const [selectedUserIds, setSelectedUserIds] = useState([]);
  const [selectedDeptIds, setSelectedDeptIds] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (isOpen) {
      setActiveMode(initialMode || 'users');
    }
  }, [isOpen, initialMode]);

  // Load latest permissions once on modal open so in-progress checkbox edits are never clobbered mid-edit
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setIsLoading(true);

    getDoc(doc(db, 'system_config', 'permissions'))
      .then((snap) => {
        if (cancelled) return;
        if (snap.exists()) {
          setUserOverridesState(snap.data().userOverrides || {});
          setDeptOverridesState(snap.data().departmentOverrides || {});
        } else {
          setUserOverridesState({});
          setDeptOverridesState({});
        }
        setIsLoading(false);
      })
      .catch((err) => {
        console.error('Failed loading permissions config:', err);
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  // Subscribe to departments only when not provided as a prop
  useEffect(() => {
    if (!isOpen || Array.isArray(departmentsList)) return undefined;
    const unsubDepts = onSnapshot(collection(db, 'departments'), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => String(a.code || a.id).localeCompare(String(b.code || b.id)));
      setLiveDepartments(list);
    });
    return () => unsubDepts();
  }, [isOpen, departmentsList]);

  const effectiveDepartments = useMemo(() => {
    return Array.isArray(departmentsList) ? departmentsList : liveDepartments;
  }, [departmentsList, liveDepartments]);

  const deptById = useMemo(() => {
    const m = {};
    effectiveDepartments.forEach((d) => {
      m[d.id] = d;
    });
    return m;
  }, [effectiveDepartments]);

  // Filter out General Admins from user columns since their permissions are immutable
  const standardUsers = useMemo(() => {
    return (usersList || []).filter((u) => !u.isGeneralAdmin && u.role !== 'general_admin');
  }, [usersList]);

  // Initialize selected users / departments on open
  useEffect(() => {
    if (!isOpen) return;
    if (initialUserId) {
      setSelectedUserIds([initialUserId]);
    } else if (standardUsers.length > 0 && selectedUserIds.length === 0) {
      setSelectedUserIds(standardUsers.map((u) => u.id));
    }
  }, [isOpen, initialUserId, standardUsers]);

  useEffect(() => {
    if (!isOpen) return;
    if (initialDepartmentId) {
      setSelectedDeptIds([initialDepartmentId]);
    } else if (effectiveDepartments.length > 0 && selectedDeptIds.length === 0) {
      setSelectedDeptIds(effectiveDepartments.map((d) => d.id));
    }
  }, [isOpen, initialDepartmentId, effectiveDepartments]);

  // Resolve Target Schema Scope (All vs Module vs Tab)
  const scopedTabsList = useMemo(() => {
    const tabs = [];
    const seen = new Set();

    const collectModuleTabs = (mod) => {
      if (!mod || !mod.tabs) return;
      Object.values(mod.tabs).forEach((tab) => {
        if (!tab?.id || seen.has(tab.id)) return;
        seen.add(tab.id);
        tabs.push({
          ...tab,
          moduleId: mod.id,
          moduleLabelAr: mod.labelAr,
          moduleLabelEn: mod.labelEn,
        });
      });
    };

    if (scopeType === 'all' || targetKey === 'all') {
      Object.values(APP_ARCHITECTURE.modules).forEach((mod) => {
        if (moduleFilter !== 'all' && mod.id !== moduleFilter) return;
        collectModuleTabs(mod);
      });
    } else if (scopeType === 'module') {
      if (targetKey === 'purchases' || targetKey === 'procurement' || targetKey === 'materials') {
        collectModuleTabs(APP_ARCHITECTURE.modules.materials);
        collectModuleTabs(APP_ARCHITECTURE.modules.procurement);
        collectModuleTabs(APP_ARCHITECTURE.modules.inventory);
      } else if (targetKey === 'production') {
        collectModuleTabs(APP_ARCHITECTURE.modules.production);
      } else if (APP_ARCHITECTURE.modules[targetKey]) {
        collectModuleTabs(APP_ARCHITECTURE.modules[targetKey]);
      }
    } else if (scopeType === 'tab') {
      const normalizedTabKey =
        targetKey === 'orders' ? 'purchase_orders' :
        targetKey === 'receipts' ? 'goods_receipts' :
        targetKey;

      Object.values(APP_ARCHITECTURE.modules).forEach((mod) => {
        Object.values(mod.tabs || {}).forEach((tab) => {
          if (tab.id === normalizedTabKey || tab.id === targetKey) {
            if (!seen.has(tab.id)) {
              seen.add(tab.id);
              tabs.push({
                ...tab,
                moduleId: mod.id,
                moduleLabelAr: mod.labelAr,
                moduleLabelEn: mod.labelEn,
              });
            }
          }
        });
      });
    }

    return tabs;
  }, [scopeType, targetKey, moduleFilter]);

  const visibleUsers = useMemo(
    () => standardUsers.filter((u) => selectedUserIds.includes(u.id)),
    [standardUsers, selectedUserIds]
  );

  const visibleDepts = useMemo(
    () => effectiveDepartments.filter((d) => selectedDeptIds.includes(d.id)),
    [effectiveDepartments, selectedDeptIds]
  );

  // Department-mode cell value resolver
  const getDeptCellValue = (deptId, tier, key) => {
    if (tier === 'actions' || tier === 'fields') {
      const tabId = key.split('.')[0];
      if (!getDeptCellValue(deptId, 'modules', tabId)) return false;
    }
    const override = deptOverridesState[deptId] || {};
    if (override[tier] && override[tier][key] !== undefined) {
      return override[tier][key] === true;
    }
    const baseDefault = DEFAULT_ROLE_PERMISSIONS.standard;
    if (tier === 'modules') return baseDefault.modules[key] !== false;
    if (tier === 'actions') {
      const shortKey = key.includes('.') ? key.split('.').slice(1).join('.') : key;
      return baseDefault.actions[key] !== false && baseDefault.actions[shortKey] !== false;
    }
    return true;
  };

  const resolveUserDeptIds = (user) => {
    return getRecordDepartmentIds(user, effectiveDepartments);
  };

  // User-mode 3-layer cell resolver (Role Default -> Multi-Dept Union -> User Override + Cascade)
  const getUserCellInfo = (user, tier, key) => {
    if (tier === 'actions' || tier === 'fields') {
      const tabId = key.split('.')[0];
      const tabInfo = getUserCellInfo(user, 'modules', tabId);
      if (!tabInfo.effectiveValue) {
        return {
          effectiveValue: false,
          source: tabInfo.source,
          hasUserOverride: tabInfo.hasUserOverride,
          cascadeDisabled: true,
        };
      }
    }
    const meta = getPermissionCellMeta({
      user,
      departmentIds: resolveUserDeptIds(user),
      departmentOverrides: deptOverridesState,
      userOverrides: userOverridesState,
      kind: tier,
      key,
      defaultRolePermissions: DEFAULT_ROLE_PERMISSIONS,
    });
    return { ...meta, cascadeDisabled: false };
  };

  // Toggle cell for Department or User with Cascade Rule
  const handleToggleCell = (entityId, tier, key) => {
    const isDeptMode = activeMode === 'departments';

    if (tier === 'actions' || tier === 'fields') {
      const tabId = key.split('.')[0];
      const tabEnabled = isDeptMode
        ? getDeptCellValue(entityId, 'modules', tabId)
        : getUserCellInfo(usersList.find((u) => u.id === entityId), 'modules', tabId).effectiveValue;
      if (!tabEnabled) return;
    }

    const currentVal = isDeptMode
      ? getDeptCellValue(entityId, tier, key)
      : getUserCellInfo(usersList.find((u) => u.id === entityId), tier, key).effectiveValue;
    const nextVal = !currentVal;

    const setter = isDeptMode ? setDeptOverridesState : setUserOverridesState;
    setter((prev) => {
      const entityOverrides = prev[entityId] || {};
      const tierOverrides = entityOverrides[tier] || {};

      const updatedEntity = {
        ...entityOverrides,
        [tier]: {
          ...tierOverrides,
          [key]: nextVal,
        },
      };

      // CASCADE RULE: disabling a tab automatically disables its child actions & fields
      if (tier === 'modules' && nextVal === false) {
        const tabSchema = scopedTabsList.find((t) => t.id === key);
        if (tabSchema) {
          const updatedActions = { ...(updatedEntity.actions || entityOverrides.actions || {}) };
          (tabSchema.actions || []).forEach((act) => {
            updatedActions[`${tabSchema.id}.${act.key}`] = false;
          });
          const updatedFields = { ...(updatedEntity.fields || entityOverrides.fields || {}) };
          Object.keys(tabSchema.fields || {}).forEach((fKey) => {
            updatedFields[`${tabSchema.id}.${fKey}`] = false;
          });
          updatedEntity.actions = updatedActions;
          updatedEntity.fields = updatedFields;
        }
      }

      return { ...prev, [entityId]: updatedEntity };
    });
  };

  const handleResetUserToDept = (userId) => {
    setUserOverridesState((prev) => {
      const next = { ...prev };
      delete next[userId];
      return next;
    });
  };

  const hasAnyUserOverride = (userId) => {
    const ov = userOverridesState[userId];
    if (!ov) return false;
    return ['modules', 'actions', 'fields', 'sensitive'].some(
      (k) => ov[k] && Object.keys(ov[k]).length > 0
    );
  };

  // Save both departmentOverrides and userOverrides to Firestore (using mergeFields so deleted/reset user overrides are cleanly removed!)
  const handleSaveMatrix = async () => {
    setIsSaving(true);
    try {
      const actorName =
        (isAr
          ? currentUser?.nameAr || currentUser?.name
          : currentUser?.name || currentUser?.nameAr) ||
        currentUser?.id ||
        'system';
      await setDoc(
        doc(db, 'system_config', 'permissions'),
        {
          departmentOverrides: deptOverridesState,
          userOverrides: userOverridesState,
          updatedAt: serverTimestamp(),
          updatedBy: actorName,
        },
        { mergeFields: ['departmentOverrides', 'userOverrides', 'updatedAt', 'updatedBy'] }
      );
      setSaveSuccess(true);
      setTimeout(() => {
        setSaveSuccess(false);
        onClose();
      }, 900);
    } catch (err) {
      console.error('Error saving permissions matrix:', err);
      alert(isAr ? `حدث خطأ أثناء حفظ الصلاحيات: ${err?.message || ''}` : `Error saving permissions matrix: ${err?.message || ''}`);
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  const isDeptMode = activeMode === 'departments';
  const activeColumns = isDeptMode ? visibleDepts : visibleUsers;

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 z-[9999] animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl max-w-6xl w-full p-5 sm:p-6 shadow-2xl border border-slate-200 flex flex-col max-h-[92vh] overflow-hidden space-y-3.5" dir={isAr ? 'rtl' : 'ltr'}>
        {isSaving && (
          <PeacockLoader
            fullScreen
            size="xl"
            text={isAr ? 'جاري حفظ ومزامنة مصفوفة الصلاحيات...' : 'Saving 3-Layer Permissions Matrix...'}
          />
        )}

        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-2xl shadow-2xs">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2 flex-wrap">
                <span>{isAr ? 'مصفوفة الصلاحيات (الأقسام ← تخصيص المستخدمين)' : '3-Layer Permissions Matrix (Departments → User Overrides)'}</span>
                {scopeType !== 'all' && targetKey !== 'all' && (
                  <span className="text-[11px] font-mono bg-indigo-50 text-indigo-800 border border-indigo-200 px-2 py-0.5 rounded-lg">
                    {scopeType === 'module'
                      ? (isAr ? `وحدة: ${targetKey}` : `Module: ${targetKey}`)
                      : (isAr ? `تبويب: ${targetKey}` : `Tab: ${targetKey}`)}
                  </span>
                )}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {isDeptMode
                  ? (isAr ? 'تحديد الصلاحيات الافتراضية لكل قسم — يرثها تلقائياً جميع مستخدمي القسم.' : 'Configure default permissions per Department — inherited automatically by all department users.')
                  : (isAr ? 'تخصيص صلاحيات فردية على مستوى المستخدم (الإطار الكهرماني = تخصيص فردي يعلو على القسم).' : 'Customize individual user overrides (amber ring = custom override over department template).')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Mode Switcher */}
            <div className="inline-flex rounded-xl bg-slate-100 p-1 border border-slate-200">
              <button
                type="button"
                onClick={() => setActiveMode('departments')}
                className={`px-3 py-1.5 rounded-lg text-xs font-black inline-flex items-center gap-1.5 transition cursor-pointer ${
                  isDeptMode ? 'bg-indigo-600 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Building2 className="w-3.5 h-3.5" />
                <span>{isAr ? 'صلاحيات الأقسام' : 'Departments'}</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveMode('users')}
                className={`px-3 py-1.5 rounded-lg text-xs font-black inline-flex items-center gap-1.5 transition cursor-pointer ${
                  !isDeptMode ? 'bg-emerald-600 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>{isAr ? 'تخصيص المستخدمين' : 'User Overrides'}</span>
              </button>
            </div>

            <button
              type="button"
              onClick={handleSaveMatrix}
              disabled={isSaving}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition cursor-pointer shadow-xs flex items-center gap-1.5 disabled:opacity-50"
            >
              {saveSuccess ? <CheckCircle2 className="h-4 w-4" /> : <Save className="h-4 w-4" />}
              <span>{saveSuccess ? (isAr ? 'تم الحفظ!' : 'Saved!') : (isAr ? 'حفظ الصلاحيات' : 'Save')}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Column Selector & Optional Module Filter */}
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl space-y-2 shrink-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              {isDeptMode ? <Building2 className="h-4 w-4 text-indigo-600" /> : <Users className="h-4 w-4 text-emerald-600" />}
              <span>
                {isDeptMode
                  ? (isAr ? 'تحديد الأقسام المعروضة:' : 'Select Departments:')
                  : (isAr ? 'تحديد المستخدمين المعروضين:' : 'Select Users:')}
              </span>
            </span>

            <div className="flex items-center gap-2 flex-wrap">
              {(scopeType === 'all' || targetKey === 'all') && (
                <select
                  value={moduleFilter}
                  onChange={(e) => setModuleFilter(e.target.value)}
                  className="px-2.5 py-1 text-[11px] font-bold border border-slate-300 rounded-lg bg-white"
                >
                  <option value="all">{isAr ? 'كل الوحدات' : 'All Modules'}</option>
                  {Object.values(APP_ARCHITECTURE.modules).map((mod) => (
                    <option key={mod.id} value={mod.id}>
                      {isAr ? mod.labelAr : mod.labelEn}
                    </option>
                  ))}
                </select>
              )}

              <button
                type="button"
                onClick={() =>
                  isDeptMode
                    ? setSelectedDeptIds(effectiveDepartments.map((d) => d.id))
                    : setSelectedUserIds(standardUsers.map((u) => u.id))
                }
                className="text-[11px] font-bold text-indigo-600 hover:underline cursor-pointer"
              >
                {isAr ? 'تحديد الكل' : 'Select All'}
              </button>
              <span className="text-slate-300">|</span>
              <button
                type="button"
                onClick={() => (isDeptMode ? setSelectedDeptIds([]) : setSelectedUserIds([]))}
                className="text-[11px] font-bold text-slate-500 hover:underline cursor-pointer"
              >
                {isAr ? 'إلغاء التحديد' : 'Deselect All'}
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 max-h-20 overflow-y-auto">
            {isDeptMode
              ? effectiveDepartments.map((d) => {
                  const isSel = selectedDeptIds.includes(d.id);
                  return (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() =>
                        setSelectedDeptIds((prev) =>
                          prev.includes(d.id) ? prev.filter((id) => id !== d.id) : [...prev, d.id]
                        )
                      }
                      className={`px-2.5 py-1 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                        isSel ? 'bg-indigo-600 text-white shadow-2xs' : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <Building2 className="h-3 w-3" />
                      <span>{isAr ? d.nameAr : d.nameEn || d.nameAr}</span>
                    </button>
                  );
                })
              : standardUsers.map((u) => {
                  const isSel = selectedUserIds.includes(u.id);
                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() =>
                        setSelectedUserIds((prev) =>
                          prev.includes(u.id) ? prev.filter((id) => id !== u.id) : [...prev, u.id]
                        )
                      }
                      className={`px-2.5 py-1 rounded-xl text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                        isSel ? 'bg-emerald-600 text-white shadow-2xs' : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <User className="h-3 w-3" />
                      <span>{isAr ? u.nameAr : (u.name || u.nameAr)}</span>
                    </button>
                  );
                })}
          </div>
        </div>

        {/* Dynamic 2D Matrix Grid */}
        <div className="flex-1 overflow-auto border border-slate-200 rounded-2xl shadow-inner bg-white">
          {isLoading ? (
            <div className="p-16 text-center">
              <PeacockLoader size="lg" text={isAr ? 'جاري تحميل مصفوفة الصلاحيات...' : 'Loading Matrix...'} />
            </div>
          ) : activeColumns.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-xs font-bold">
              {isDeptMode
                ? (isAr ? 'يرجى اختيار قسم واحد على الأقل من الشريط أعلاه (أو تأسيس الأقسام من تبويب الأقسام أولاً).' : 'Select at least one department above.')
                : (isAr ? 'يرجى اختيار مستخدم واحد على الأقل من الشريط أعلاه.' : 'Select at least one user above.')}
            </div>
          ) : (
            <table className="w-full text-start border-collapse text-xs">
              <thead className="bg-slate-100 text-slate-800 font-bold border-b border-slate-200 sticky top-0 z-20 shadow-2xs">
                <tr>
                  <th className="p-3 text-start border-e border-slate-200 min-w-[270px] bg-slate-100 sticky start-0 z-30">
                    {isAr ? 'مستويات الصلاحيات والعمليات' : 'Permission Node / Authority'}
                  </th>
                  {isDeptMode
                    ? visibleDepts.map((d) => (
                        <th key={d.id} className="p-3 text-center border-e border-slate-200 min-w-[140px]">
                          <div className="font-black text-slate-900 truncate">{isAr ? d.nameAr : d.nameEn || d.nameAr}</div>
                          <div className="font-mono text-[10px] text-indigo-700 font-bold">{d.code}</div>
                        </th>
                      ))
                    : visibleUsers.map((u) => {
                        const uDeptIds = resolveUserDeptIds(u);
                        const uDeptNames = uDeptIds
                          .map((id) => deptById[id])
                          .filter(Boolean)
                          .map((d) => (isAr ? d.nameAr : d.nameEn || d.nameAr));
                        const deptDisplay = uDeptNames.length > 0 ? uDeptNames.join(' + ') : (u.department || (isAr ? 'بدون قسم' : 'No Dept'));
                        const hasCustom = hasAnyUserOverride(u.id);
                        return (
                          <th key={u.id} className="p-2.5 text-center border-e border-slate-200 min-w-[155px]">
                            <div className="font-black text-slate-900 truncate">{isAr ? u.nameAr : (u.name || u.nameAr)}</div>
                            <div className="text-[10px] text-indigo-700 font-bold truncate" title={deptDisplay}>
                              {deptDisplay}
                            </div>
                            {hasCustom && (
                              <button
                                type="button"
                                onClick={() => handleResetUserToDept(u.id)}
                                className="mt-1 px-2 py-0.5 rounded-md bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-900 text-[9px] font-black inline-flex items-center gap-1 cursor-pointer"
                                title={isAr ? 'مسح كافة التخصيصات الفردية والعودة لصلاحيات القسم' : 'Clear custom overrides and inherit from department'}
                              >
                                <RotateCcw className="w-2.5 h-2.5" />
                                <span>{isAr ? 'إعادة للقسم' : 'Reset to Dept'}</span>
                              </button>
                            )}
                          </th>
                        );
                      })}
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {scopedTabsList.map((tab) => (
                  <React.Fragment key={tab.id}>
                    {/* LEVEL 1: Tab Visibility */}
                    <tr className="bg-slate-50/90 font-bold border-t-2 border-slate-200">
                      <td className="p-2.5 border-e border-slate-200 sticky start-0 bg-slate-50/95 z-10 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 text-slate-900">
                          <Layers className="h-4 w-4 text-emerald-600 shrink-0" />
                          <span>{isAr ? `إتاحة تبويب: ${tab.labelAr}` : `Tab: ${tab.labelEn}`}</span>
                        </div>
                        <span className="text-[9px] font-mono text-slate-400">({tab.id})</span>
                      </td>
                      {activeColumns.map((col) => {
                        if (isDeptMode) {
                          const checked = getDeptCellValue(col.id, 'modules', tab.id);
                          return (
                            <td key={col.id} className="p-2.5 text-center border-e border-slate-200">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => handleToggleCell(col.id, 'modules', tab.id)}
                                className="h-4 w-4 rounded accent-indigo-600 cursor-pointer"
                              />
                            </td>
                          );
                        }
                        const info = getUserCellInfo(col, 'modules', tab.id);
                        return (
                          <td key={col.id} className={`p-2 text-center border-e border-slate-200 ${info.hasUserOverride ? 'bg-amber-50/70' : ''}`}>
                            <div className="inline-flex flex-col items-center gap-0.5">
                              <input
                                type="checkbox"
                                checked={info.effectiveValue}
                                onChange={() => handleToggleCell(col.id, 'modules', tab.id)}
                                className={`h-4 w-4 rounded cursor-pointer ${info.hasUserOverride ? 'accent-amber-600 ring-2 ring-amber-400' : 'accent-emerald-600'}`}
                              />
                              <span className={`text-[8px] font-black ${info.hasUserOverride ? 'text-amber-700' : 'text-slate-400'}`}>
                                {info.hasUserOverride ? (isAr ? 'مخصّص' : 'Custom') : info.source === 'department' ? (isAr ? 'قسم' : 'Dept') : (isAr ? 'افتراضي' : 'Def')}
                              </span>
                            </div>
                          </td>
                        );
                      })}
                    </tr>

                    {/* LEVEL 2: Operational Actions */}
                    {(tab.actions || []).map((act) => {
                      const permKey = `${tab.id}.${act.key}`;
                      return (
                        <tr key={act.key} className="hover:bg-slate-50/50 transition">
                          <td className="p-2 ps-6 border-e border-slate-200 sticky start-0 bg-white z-10 text-slate-700">
                            <div className="flex items-center gap-1.5">
                              <span className="text-slate-300">↳</span>
                              <span className="font-medium">{isAr ? act.labelAr : act.labelEn}</span>
                            </div>
                          </td>
                          {activeColumns.map((col) => {
                            if (isDeptMode) {
                              const tabOn = getDeptCellValue(col.id, 'modules', tab.id);
                              const checked = getDeptCellValue(col.id, 'actions', permKey);
                              return (
                                <td key={col.id} className={`p-2 text-center border-e border-slate-100 ${!tabOn ? 'bg-slate-100/50' : ''}`}>
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    disabled={!tabOn}
                                    onChange={() => handleToggleCell(col.id, 'actions', permKey)}
                                    className={`h-4 w-4 rounded accent-indigo-600 ${!tabOn ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}`}
                                  />
                                </td>
                              );
                            }
                            const info = getUserCellInfo(col, 'actions', permKey);
                            return (
                              <td key={col.id} className={`p-1.5 text-center border-e border-slate-100 ${info.cascadeDisabled ? 'bg-slate-100/50' : info.hasUserOverride ? 'bg-amber-50/60' : ''}`}>
                                <div className="inline-flex items-center gap-1">
                                  <input
                                    type="checkbox"
                                    checked={info.effectiveValue}
                                    disabled={info.cascadeDisabled}
                                    onChange={() => handleToggleCell(col.id, 'actions', permKey)}
                                    className={`h-4 w-4 rounded ${info.cascadeDisabled ? 'opacity-30 cursor-not-allowed' : info.hasUserOverride ? 'accent-amber-600 ring-2 ring-amber-400 cursor-pointer' : 'accent-indigo-600 cursor-pointer'}`}
                                  />
                                  {info.hasUserOverride && !info.cascadeDisabled && (
                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" title={isAr ? 'تخصيص فردي' : 'Custom Override'} />
                                  )}
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}

                    {/* LEVEL 3: Sensitive Fields */}
                    {Object.entries(tab.fields || {})
                      .filter(([_, f]) => f.isSensitive)
                      .map(([fieldKey, fieldMeta]) => {
                        const permKey = `${tab.id}.${fieldKey}`;
                        return (
                          <tr key={fieldKey} className="hover:bg-amber-50/20 bg-amber-50/10 transition">
                            <td className="p-2 ps-6 border-e border-slate-200 sticky start-0 bg-amber-50/30 z-10 text-amber-950">
                              <div className="flex items-center gap-1.5">
                                <span className="text-amber-300">↳</span>
                                <Lock className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                                <span className="font-semibold">{isAr ? `إظهار حقل: ${fieldMeta.labelAr}` : `Show: ${fieldMeta.labelEn}`}</span>
                              </div>
                            </td>
                            {activeColumns.map((col) => {
                              if (isDeptMode) {
                                const tabOn = getDeptCellValue(col.id, 'modules', tab.id);
                                const checked = getDeptCellValue(col.id, 'fields', permKey);
                                return (
                                  <td key={col.id} className={`p-2 text-center border-e border-slate-100 ${!tabOn ? 'bg-slate-100/50' : ''}`}>
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      disabled={!tabOn}
                                      onChange={() => handleToggleCell(col.id, 'fields', permKey)}
                                      className={`h-4 w-4 rounded accent-amber-600 ${!tabOn ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}`}
                                    />
                                  </td>
                                );
                              }
                              const info = getUserCellInfo(col, 'fields', permKey);
                              return (
                                <td key={col.id} className={`p-1.5 text-center border-e border-slate-100 ${info.cascadeDisabled ? 'bg-slate-100/50' : info.hasUserOverride ? 'bg-amber-100/60' : ''}`}>
                                  <input
                                    type="checkbox"
                                    checked={info.effectiveValue}
                                    disabled={info.cascadeDisabled}
                                    onChange={() => handleToggleCell(col.id, 'fields', permKey)}
                                    className={`h-4 w-4 rounded ${info.cascadeDisabled ? 'opacity-30 cursor-not-allowed' : 'accent-amber-600 cursor-pointer'}`}
                                  />
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
