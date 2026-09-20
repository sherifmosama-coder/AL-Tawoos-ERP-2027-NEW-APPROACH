import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { db } from '../firebase';
import { doc, getDoc, setDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { APP_ARCHITECTURE, DEFAULT_ROLE_PERMISSIONS } from '../config/appArchitecture';
import {
  Shield,
  ShieldCheck,
  User,
  Users,
  Sliders,
  CheckCircle2,
  Lock,
  Save,
  Building2,
  Package,
  ShoppingCart,
  ArrowDownLeft,
  Boxes,
  LayoutDashboard,
  FileText,
  DollarSign,
  AlertTriangle,
  Sparkles,
  X,
  Search,
  CheckSquare,
  Square,
  Layers,
  Factory,
  Scale
} from 'lucide-react';
import PeacockLoader from './PeacockLoader';

export default function ScopedPermissionMatrixModal({
  isOpen,
  onClose,
  scopeType = 'module', // 'module' | 'tab'
  targetKey = '',       // module key (e.g. 'purchases', 'production') or tab key (e.g. 'suppliers', 'items', 'orders')
  currentUser = {},
  usersList = []
}) {
  const { i18n } = useTranslation();
  const isAr = i18n.language === 'ar';

  const [permissionsState, setPermissionsState] = useState({});
  const [selectedUserIds, setSelectedUserIds] = useState([]);
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Subscribe to live Firestore permissions config
  useEffect(() => {
    if (!isOpen) return;

    const unsub = onSnapshot(doc(db, 'system_config', 'permissions'), (snap) => {
      if (snap.exists()) {
        setPermissionsState(snap.data().userOverrides || {});
      }
      setIsLoading(false);
    });

    return () => unsub();
  }, [isOpen]);

  // Filter out General Admins by default from matrix columns since their permissions are immutable
  const standardUsers = useMemo(() => {
    return usersList.filter((u) => !u.isGeneralAdmin && u.role !== 'general_admin');
  }, [usersList]);

  // Initialize selected users on open
  useEffect(() => {
    if (isOpen && standardUsers.length > 0 && selectedUserIds.length === 0) {
      setSelectedUserIds(standardUsers.map((u) => u.id));
    }
  }, [isOpen, standardUsers]);

  // Resolve Target Schema Scope (Module vs Tab)
  const scopedTabsList = useMemo(() => {
    const tabs = [];

    // Helper: Collect tabs from a module object
    const collectModuleTabs = (mod) => {
      if (!mod || !mod.tabs) return;
      Object.values(mod.tabs).forEach((tab) => {
        tabs.push({
          ...tab,
          moduleId: mod.id,
          moduleLabelAr: mod.labelAr,
          moduleLabelEn: mod.labelEn
        });
      });
    };

    if (scopeType === 'module') {
      if (targetKey === 'purchases' || targetKey === 'procurement') {
        collectModuleTabs(APP_ARCHITECTURE.modules.procurement);
        collectModuleTabs(APP_ARCHITECTURE.modules.inventory);
      } else if (targetKey === 'production') {
        collectModuleTabs(APP_ARCHITECTURE.modules.production);
      } else if (APP_ARCHITECTURE.modules[targetKey]) {
        collectModuleTabs(APP_ARCHITECTURE.modules[targetKey]);
      }
    } else if (scopeType === 'tab') {
      // Find specific tab across all modules
      const normalizedTabKey =
        targetKey === 'orders' ? 'purchase_orders' :
        targetKey === 'receipts' ? 'goods_receipts' :
        targetKey;

      Object.values(APP_ARCHITECTURE.modules).forEach((mod) => {
        Object.values(mod.tabs || {}).forEach((tab) => {
          if (tab.id === normalizedTabKey || tab.id === targetKey) {
            tabs.push({
              ...tab,
              moduleId: mod.id,
              moduleLabelAr: mod.labelAr,
              moduleLabelEn: mod.labelEn
            });
          }
        });
      });
    }

    return tabs;
  }, [scopeType, targetKey]);

  // Compute Active Filtered Users in View
  const visibleUsers = useMemo(() => {
    return standardUsers.filter((u) => {
      const isSelected = selectedUserIds.includes(u.id);
      const matchesSearch =
        !userSearchTerm.trim() ||
        u.name?.toLowerCase().includes(userSearchTerm.toLowerCase()) ||
        u.nameAr?.includes(userSearchTerm) ||
        u.email?.toLowerCase().includes(userSearchTerm.toLowerCase()) ||
        u.department?.includes(userSearchTerm);

      return isSelected && matchesSearch;
    });
  }, [standardUsers, selectedUserIds, userSearchTerm]);

  // Resolve Effective Cell Value
  const getCellValue = (userId, tier, key) => {
    const user = usersList.find((u) => u.id === userId);
    if (!user) return false;

    const override = permissionsState[userId] || {};
    if (override[tier] && override[tier][key] !== undefined) {
      return override[tier][key] === true;
    }

    const baseDefault = DEFAULT_ROLE_PERMISSIONS.standard;
    if (tier === 'modules') return baseDefault.modules[key] !== false;
    if (tier === 'actions') return baseDefault.actions[key.split('.')[1] || key] !== false;
    if (tier === 'fields') return true;
    return true;
  };

  // Toggle Matrix Cell
  const handleToggleCell = (userId, tier, key) => {
    const currentVal = getCellValue(userId, tier, key);
    setPermissionsState((prev) => {
      const userOverrides = prev[userId] || {};
      const tierOverrides = userOverrides[tier] || {};

      return {
        ...prev,
        [userId]: {
          ...userOverrides,
          [tier]: {
            ...tierOverrides,
            [key]: !currentVal
          }
        }
      };
    });
  };

  // Save All Changes to Firestore
  const handleSaveMatrix = async () => {
    setIsSaving(true);
    try {
      await setDoc(
        doc(db, 'system_config', 'permissions'),
        {
          userOverrides: permissionsState,
          updatedAt: serverTimestamp(),
          updatedBy: isAr ? currentUser.nameAr : currentUser.name
        },
        { merge: true }
      );
      setSaveSuccess(true);
      setTimeout(() => {
        setSaveSuccess(false);
        onClose();
      }, 1200);
    } catch (err) {
      console.error('Error saving scoped permissions matrix:', err);
      alert(isAr ? 'حدث خطأ أثناء حفظ الصلاحيات.' : 'Error saving permissions matrix.');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 z-[9999] animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl max-w-6xl w-full p-6 shadow-2xl border border-slate-200 flex flex-col max-h-[92vh] overflow-hidden space-y-4">
        {/* Full-Screen Loading on Save */}
        {isSaving && (
          <PeacockLoader
            fullScreen
            size="xl"
            text={isAr ? 'جاري حفظ ومزامنة الصلاحيات سحابياً...' : 'Saving Permissions Matrix to Cloud...'}
          />
        )}

        {/* Modal Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-2xl shadow-2xs">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                <span>{isAr ? 'مصفوفة الصلاحيات الموجهة (Scoped Matrix)' : 'Scoped Permissions Matrix'}</span>
                <span className="text-[11px] font-mono bg-indigo-50 text-indigo-800 border border-indigo-200 px-2 py-0.5 rounded-lg">
                  {scopeType === 'module'
                    ? (isAr ? `وحدة: ${targetKey}` : `Module: ${targetKey}`)
                    : (isAr ? `تبويب: ${targetKey}` : `Tab: ${targetKey}`)}
                </span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {isAr
                  ? 'عرض وتعديل فوري لصلاحيات المستخدمين على مستوى التبويبات، العمليات، وحجب الحقول.'
                  : 'Multi-user grid to configure tab visibility, actions, and sensitive field masking.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSaveMatrix}
              disabled={isSaving}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition cursor-pointer shadow-xs flex items-center gap-1.5 disabled:opacity-50"
            >
              {saveSuccess ? <CheckCircle2 className="h-4 w-4" /> : <Save className="h-4 w-4" />}
              <span>{saveSuccess ? (isAr ? 'تم الحفظ والمزامنة!' : 'Saved & Synced!') : (isAr ? 'حفظ الصلاحيات' : 'Save Changes')}</span>
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

        {/* User Selection & Filter Bar */}
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl space-y-2.5 shrink-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Users className="h-4 w-4 text-indigo-600" />
              <span>{isAr ? 'تحديد المستخدمين المعروضين بالأعمدة:' : 'Filter Users in View:'}</span>
            </span>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSelectedUserIds(standardUsers.map((u) => u.id))}
                className="text-[11px] font-bold text-indigo-600 hover:underline cursor-pointer"
              >
                {isAr ? 'تحديد الكل' : 'Select All'}
              </button>
              <span className="text-slate-300">|</span>
              <button
                type="button"
                onClick={() => setSelectedUserIds([])}
                className="text-[11px] font-bold text-slate-500 hover:underline cursor-pointer"
              >
                {isAr ? 'إلغاء التحديد' : 'Deselect All'}
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 max-h-24 overflow-y-auto">
            {standardUsers.map((u) => {
              const isSelected = selectedUserIds.includes(u.id);
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => {
                    setSelectedUserIds((prev) =>
                      prev.includes(u.id) ? prev.filter((id) => id !== u.id) : [...prev, u.id]
                    );
                  }}
                  className={`px-2.5 py-1 rounded-xl text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                    isSelected
                      ? 'bg-indigo-600 text-white shadow-2xs'
                      : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <User className={`h-3 w-3 ${isSelected ? 'text-indigo-200' : 'text-slate-400'}`} />
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
              <PeacockLoader size="lg" text={isAr ? 'جاري تحميل مصفوفة الصلاحيات...' : 'Loading Scoped Matrix...'} />
            </div>
          ) : visibleUsers.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-xs">
              {isAr ? 'يرجى اختيار مستخدم واحد على الأقل من الشريط أعلاه لعرض الصلاحيات.' : 'Please select at least one user to display the matrix.'}
            </div>
          ) : scopedTabsList.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-xs">
              {isAr ? 'لا توجد تبويبات مرتبطة بهذا النطاق.' : 'No schema tabs found in this scope.'}
            </div>
          ) : (
            <table className="w-full text-start border-collapse text-xs">
              <thead className="bg-slate-100 text-slate-800 font-bold border-b border-slate-200 sticky top-0 z-20 shadow-2xs">
                <tr>
                  <th className="p-3 text-start border-e border-slate-200 min-w-[280px] bg-slate-100 sticky start-0 z-30">
                    {isAr ? 'مستويات الصلاحيات والعمليات' : 'Permission Node / Authority'}
                  </th>
                  {visibleUsers.map((u) => (
                    <th key={u.id} className="p-3 text-center border-e border-slate-200 min-w-[140px]">
                      <div className="font-bold text-slate-900 truncate">{isAr ? u.nameAr : (u.name || u.nameAr)}</div>
                      <div className="font-mono text-[10px] text-indigo-700 font-normal truncate">{u.department || u.email}</div>
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {scopedTabsList.map((tab) => {
                  return (
                    <React.Fragment key={tab.id}>
                      {/* LEVEL 1: Tab Navigation Visibility */}
                      <tr className="bg-slate-50/90 font-bold border-t-2 border-slate-200">
                        <td className="p-2.5 border-e border-slate-200 sticky start-0 bg-slate-50/95 z-10 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 text-slate-900">
                            <Layers className="h-4 w-4 text-emerald-600 shrink-0" />
                            <span>{isAr ? `إتاحة تبويب: ${tab.labelAr}` : `Tab: ${tab.labelEn}`}</span>
                          </div>
                          <span className="text-[9px] font-mono text-slate-400">({tab.id})</span>
                        </td>
                        {visibleUsers.map((u) => {
                          const isChecked = getCellValue(u.id, 'modules', tab.id);
                          return (
                            <td key={u.id} className="p-2.5 text-center border-e border-slate-200 bg-slate-50/50">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => handleToggleCell(u.id, 'modules', tab.id)}
                                className="h-4 w-4 rounded accent-emerald-600 cursor-pointer"
                                title={isChecked ? 'Enabled' : 'Disabled'}
                              />
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
                            {visibleUsers.map((u) => {
                              const isChecked = getCellValue(u.id, 'actions', permKey);
                              return (
                                <td key={u.id} className="p-2 text-center border-e border-slate-100">
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => handleToggleCell(u.id, 'actions', permKey)}
                                    className="h-4 w-4 rounded accent-indigo-600 cursor-pointer"
                                    title={isChecked ? 'Allowed' : 'Denied'}
                                  />
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}

                      {/* LEVEL 3: Sensitive Field Masking */}
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
                              {visibleUsers.map((u) => {
                                const isChecked = getCellValue(u.id, 'fields', permKey);
                                return (
                                  <td key={u.id} className="p-2 text-center border-e border-slate-100 bg-amber-50/10">
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={() => handleToggleCell(u.id, 'fields', permKey)}
                                      className="h-4 w-4 rounded accent-amber-600 cursor-pointer"
                                      title={isChecked ? 'Visible' : 'Hidden'}
                                    />
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}