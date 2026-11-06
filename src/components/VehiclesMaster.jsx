import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Truck,
  Plus,
  Search,
  Edit2,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Car,
  Fuel,
  Calendar,
  Users,
  Gauge,
  ShieldCheck,
  Save,
  X,
  Clock,
  Wrench,
  Activity
} from 'lucide-react';
import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot
} from 'firebase/firestore';
import { db } from '../firebase.js';

const VEHICLE_TYPES = [
  { id: 'van', labelAr: 'سيارة فان / توزيع', labelEn: 'Distribution Van', icon: Car },
  { id: 'pickup', labelAr: 'نصف نقل (بيك آب)', labelEn: 'Pickup Truck', icon: Truck },
  { id: 'truck', labelAr: 'شاحنة نقل ثقيل (جامبو/تريلا)', labelEn: 'Heavy Duty Truck', icon: Truck },
  { id: 'forklift', labelAr: 'كلارك / رافعة شوكية', labelEn: 'Forklift', icon: Wrench },
  { id: 'car', labelAr: 'سيارة ملاكي / إدارية', labelEn: 'Passenger / Admin Car', icon: Car }
];

const FUEL_TYPES = [
  { id: 'gasoline_92', labelAr: 'بنزين ٩٢', labelEn: 'Gasoline 92' },
  { id: 'gasoline_95', labelAr: 'بنزين ٩٥', labelEn: 'Gasoline 95' },
  { id: 'diesel', labelAr: 'سولار (ديزل)', labelEn: 'Diesel' },
  { id: 'natural_gas', labelAr: 'غاز طبيعي', labelEn: 'Natural Gas' }
];

export default function VehiclesMaster({ currentUser = {}, permissions = {} }) {
  const { i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  const isGeneralAdmin = Boolean(currentUser.isGeneralAdmin || currentUser.role === 'general_admin');

  const [vehiclesList, setVehiclesList] = useState([]);
  const [usersList, setUsersList] = useState([]);
  const [workersList, setWorkersList] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [toastMsg, setToastMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Vehicle Modal State
  const [vehicleModal, setVehicleModal] = useState({
    isOpen: false,
    isEdit: false,
    id: '',
    code: '',
    plateNumber: '',
    vehicleModel: '',
    vehicleType: 'van',
    driverUserId: '',
    driverName: '',
    fuelType: 'gasoline_92',
    licenseExpiryDate: '',
    chassisNumber: '',
    motorNumber: '',
    currentOdometerKm: 0,
    status: 'active', // 'active' | 'maintenance' | 'inactive'
    notes: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 1. Live Subscriptions
  useEffect(() => {
    const unsubVehicles = onSnapshot(collection(db, 'vehicles'), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (a.code || a.id).localeCompare(b.code || b.id));
      setVehiclesList(list);
    });

    const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
      setUsersList(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });

    const unsubWorkers = onSnapshot(collection(db, 'production_workers'), (snap) => {
      setWorkersList(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });

    return () => {
      unsubVehicles();
      unsubUsers();
      unsubWorkers();
    };
  }, []);

  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 4000);
  };

  // Unified Drivers List (Users + Production Workers)
  const availableDrivers = useMemo(() => {
    const list = [];
    usersList.forEach((u) => {
      list.push({ id: u.id, name: u.nameAr || u.name, subtitle: u.department || (isAr ? 'موظف' : 'Staff') });
    });
    workersList.forEach((w) => {
      list.push({ id: w.id, name: w.nameAr || w.nameEn || w.id, subtitle: isAr ? 'فني إنتاج / سائق' : 'Worker / Driver' });
    });
    return list;
  }, [usersList, workersList, isAr]);

  // Open Create Modal
  const handleOpenCreate = () => {
    const nextNum = vehiclesList.length + 1;
    const nextCode = `VEH-${String(nextNum).padStart(2, '0')}`;
    setVehicleModal({
      isOpen: true,
      isEdit: false,
      id: nextCode,
      code: nextCode,
      plateNumber: '',
      vehicleModel: '',
      vehicleType: 'van',
      driverUserId: '',
      driverName: '',
      fuelType: 'gasoline_92',
      licenseExpiryDate: '',
      chassisNumber: '',
      motorNumber: '',
      currentOdometerKm: 0,
      status: 'active',
      notes: ''
    });
  };

  // Open Edit Modal
  const handleOpenEdit = (v) => {
    setVehicleModal({
      isOpen: true,
      isEdit: true,
      id: v.id,
      code: v.code || v.id,
      plateNumber: v.plateNumber || '',
      vehicleModel: v.vehicleModel || '',
      vehicleType: v.vehicleType || 'van',
      driverUserId: v.driverUserId || '',
      driverName: v.driverName || '',
      fuelType: v.fuelType || 'gasoline_92',
      licenseExpiryDate: v.licenseExpiryDate || '',
      chassisNumber: v.chassisNumber || '',
      motorNumber: v.motorNumber || '',
      currentOdometerKm: Number(v.currentOdometerKm) || 0,
      status: v.status || 'active',
      notes: v.notes || ''
    });
  };

  // Save Vehicle
  const handleSaveVehicle = async (e) => {
    e.preventDefault();
    if (!vehicleModal.plateNumber.trim()) {
      setErrorMsg(isAr ? 'يرجى إدخال رقم اللوحة المعدنية' : 'Please provide license plate number');
      return;
    }
    if (!vehicleModal.vehicleModel.trim()) {
      setErrorMsg(isAr ? 'يرجى إدخال ماركة وموديل السيارة' : 'Please provide vehicle make and model');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg('');
    try {
      const nowIso = new Date().toISOString();
      const vehicleRef = doc(db, 'vehicles', vehicleModal.id);

      const resolvedDriver = availableDrivers.find((d) => d.id === vehicleModal.driverUserId);
      const driverName = resolvedDriver ? resolvedDriver.name : vehicleModal.driverName;

      const payload = {
        id: vehicleModal.id,
        code: vehicleModal.code || vehicleModal.id,
        plateNumber: vehicleModal.plateNumber.trim(),
        vehicleModel: vehicleModal.vehicleModel.trim(),
        vehicleType: vehicleModal.vehicleType,
        driverUserId: vehicleModal.driverUserId || '',
        driverName: driverName || '',
        fuelType: vehicleModal.fuelType,
        licenseExpiryDate: vehicleModal.licenseExpiryDate,
        chassisNumber: vehicleModal.chassisNumber.trim(),
        motorNumber: vehicleModal.motorNumber.trim(),
        currentOdometerKm: Number(vehicleModal.currentOdometerKm) || 0,
        status: vehicleModal.status,
        notes: vehicleModal.notes.trim(),
        updatedAt: nowIso
      };

      if (!vehicleModal.isEdit) {
        payload.createdAt = nowIso;
      }

      await setDoc(vehicleRef, payload, { merge: true });
      showToast(
        vehicleModal.isEdit
          ? (isAr ? 'تم تحديث بيانات المركبة بنجاح ✓' : 'Vehicle updated successfully ✓')
          : (isAr ? 'تم إضافة المركبة الجديدة لأسطول الشركة بنجاح ✓' : 'New vehicle added to fleet successfully ✓')
      );
      setVehicleModal((prev) => ({ ...prev, isOpen: false }));
    } catch (err) {
      console.error('Error saving vehicle:', err);
      setErrorMsg(err.message || 'Error saving vehicle');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete Vehicle
  const handleDeleteVehicle = async (vehId) => {
    if (!isGeneralAdmin) return;
    if (!window.confirm(isAr ? `هل تريد حذف المركبة (${vehId}) نهائياً؟` : `Delete vehicle (${vehId})?`)) {
      return;
    }
    try {
      await deleteDoc(doc(db, 'vehicles', vehId));
      showToast(isAr ? 'تم حذف المركبة' : 'Vehicle deleted');
    } catch (err) {
      console.error('Error deleting vehicle:', err);
      setErrorMsg(err.message || 'Error deleting vehicle');
    }
  };

  // Filtered Vehicles
  const filteredVehicles = useMemo(() => {
    return vehiclesList.filter((v) => {
      const q = searchTerm.toLowerCase().trim();
      const matchesSearch =
        !q ||
        v.id.toLowerCase().includes(q) ||
        (v.plateNumber || '').toLowerCase().includes(q) ||
        (v.vehicleModel || '').toLowerCase().includes(q) ||
        (v.driverName || '').toLowerCase().includes(q);

      const matchesType = typeFilter === 'all' || v.vehicleType === typeFilter;
      return matchesSearch && matchesType;
    });
  }, [vehiclesList, searchTerm, typeFilter]);

  // Check License Expiry Status (Expired, Expiring Soon within 30 days, Valid)
  const getLicenseStatus = (dateStr) => {
    if (!dateStr) return null;
    const expiry = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return { status: 'expired', labelAr: 'منتهية الترخيص!', labelEn: 'Expired License!' };
    if (diffDays <= 30) return { status: 'warning', labelAr: `تجديد خلال ${diffDays} يوم`, labelEn: `Renew in ${diffDays}d` };
    return { status: 'valid', labelAr: 'سارية', labelEn: 'Valid' };
  };

  return (
    <div className={`space-y-6 ${isAr ? 'text-right' : 'text-left'}`}>
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-emerald-950 to-slate-900 rounded-3xl p-6 text-white shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="p-3 bg-emerald-500/20 border border-emerald-400/30 rounded-2xl text-emerald-300">
            <Truck className="h-7 w-7" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-black">
                {isAr ? 'سجل أسطول الشاحنات والسيارات' : 'Vehicles & Fleet Master'}
              </h2>
              <span className="text-[10px] bg-white/10 px-2.5 py-0.5 rounded-full font-mono text-slate-300">
                {vehiclesList.length} {isAr ? 'مركبة' : 'Vehicles'}
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-1">
              {isAr
                ? 'إدارة سيارات وشاحنات الشركة، أرقام اللوحات، السائقين، ومتابعة مصروفات الوقود والتراخيص'
                : 'Manage company vehicles, license plates, drivers, fuel allocations, and registration expiries'}
            </p>
          </div>
        </div>

        {isGeneralAdmin && (
          <button
            type="button"
            onClick={handleOpenCreate}
            className="flex items-center gap-2 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs rounded-xl shadow-lg transition cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>{isAr ? 'إضافة مركبة جديدة +' : 'Add Vehicle +'}</span>
          </button>
        )}
      </div>

      {/* Toast Feedback */}
      {toastMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-2xl text-emerald-900 text-xs font-bold flex items-center gap-2 shadow-xs animate-fadeIn">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          <span>{toastMsg}</span>
        </div>
      )}
      {errorMsg && (
        <div className="p-3 bg-rose-50 border border-rose-300 rounded-2xl text-rose-900 text-xs font-bold flex items-center gap-2 shadow-xs animate-fadeIn">
          <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-bold text-slate-500 block">{isAr ? 'إجمالي أسطول الشركة' : 'Total Fleet Size'}</span>
          <div className="text-2xl font-black text-slate-900 font-mono mt-1">{vehiclesList.length}</div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-bold text-slate-500 block">{isAr ? 'مركبات في الخدمة' : 'Active in Service'}</span>
          <div className="text-2xl font-black text-emerald-600 font-mono mt-1">
            {vehiclesList.filter((v) => v.status === 'active').length}
          </div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-bold text-slate-500 block">{isAr ? 'سائقون مكلفون' : 'Assigned Drivers'}</span>
          <div className="text-2xl font-black text-indigo-600 font-mono mt-1">
            {vehiclesList.filter((v) => Boolean(v.driverUserId || v.driverName)).length}
          </div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-bold text-slate-500 block">{isAr ? 'في الصيانة' : 'Under Maintenance'}</span>
          <div className="text-2xl font-black text-amber-600 font-mono mt-1">
            {vehiclesList.filter((v) => v.status === 'maintenance').length}
          </div>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[240px]">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={isAr ? 'بحث برقم اللوحة، الموديل، أو السائق...' : 'Search by plate, model, driver...'}
              className="w-full ps-9 pe-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            />
          </div>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 cursor-pointer"
          >
            <option value="all">{isAr ? 'كافة فئات المركبات' : 'All Vehicle Types'}</option>
            {VEHICLE_TYPES.map((t) => (
              <option key={t.id} value={t.id}>{isAr ? t.labelAr : t.labelEn}</option>
            ))}
          </select>
        </div>

        <span className="text-xs font-bold text-slate-500">
          {filteredVehicles.length} {isAr ? 'مركبة' : 'vehicles'}
        </span>
      </div>

      {/* Vehicle Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredVehicles.length === 0 ? (
          <div className="col-span-full bg-white p-12 text-center rounded-3xl border border-slate-200 text-slate-400 space-y-2">
            <Truck className="h-10 w-10 mx-auto text-slate-300" />
            <p className="text-xs font-bold">
              {isAr ? 'لا توجد مركبات مسجلة مطابقة لبحثك' : 'No vehicles found matching current search'}
            </p>
          </div>
        ) : (
          filteredVehicles.map((veh) => {
            const typeConfig = VEHICLE_TYPES.find((t) => t.id === veh.vehicleType) || VEHICLE_TYPES[0];
            const fuelConfig = FUEL_TYPES.find((f) => f.id === veh.fuelType) || FUEL_TYPES[0];
            const licStatus = getLicenseStatus(veh.licenseExpiryDate);

            return (
              <div
                key={veh.id}
                className="bg-white rounded-3xl border border-slate-200 shadow-2xs hover:shadow-md transition p-5 flex flex-col justify-between space-y-4"
              >
                <div className="space-y-3">
                  {/* Plate Number & Status Header */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      {/* Egyptian License Plate Badge */}
                      <div className="inline-flex items-center border-2 border-slate-900 rounded-lg overflow-hidden shadow-2xs bg-white">
                        <div className="bg-sky-600 px-2 py-0.5 text-[9px] font-black text-white uppercase tracking-wider">
                          مصر
                        </div>
                        <div className="px-2.5 py-0.5 font-black text-sm font-sans tracking-wide text-slate-900">
                          {veh.plateNumber}
                        </div>
                      </div>
                      <div className="font-extrabold text-sm text-slate-900 mt-2 leading-tight">
                        {veh.vehicleModel}
                      </div>
                      <span className="font-mono text-[11px] text-slate-400 font-bold">{veh.id}</span>
                    </div>

                    <div className="flex flex-col items-end gap-1">
                      <span
                        className={`text-[9px] font-black px-2 py-0.5 rounded-full ${
                          veh.status === 'active'
                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                            : veh.status === 'maintenance'
                            ? 'bg-amber-50 text-amber-800 border border-amber-200'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {veh.status === 'active' ? (isAr ? 'بالخدمة' : 'Active') : veh.status === 'maintenance' ? (isAr ? 'تحت الصيانة' : 'Maintenance') : (isAr ? 'متوقفة' : 'Inactive')}
                      </span>

                      <span className="text-[10px] bg-slate-100 text-slate-700 font-bold px-2 py-0.5 rounded-lg">
                        {isAr ? typeConfig.labelAr : typeConfig.labelEn}
                      </span>
                    </div>
                  </div>

                  {/* Specifications & Driver Details */}
                  <div className="p-3 bg-slate-50 border border-slate-100 rounded-2xl space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 text-[11px] flex items-center gap-1.5 font-bold">
                        <Users className="h-3.5 w-3.5 text-slate-400" />
                        <span>{isAr ? 'السائق المكلف:' : 'Assigned Driver:'}</span>
                      </span>
                      <span className="font-bold text-slate-900">
                        {veh.driverName || (isAr ? 'غير محدد' : 'Unassigned')}
                      </span>
                    </div>

                    <div className="flex items-center justify-between pt-1 border-t border-slate-200/60">
                      <span className="text-slate-500 text-[11px] flex items-center gap-1.5 font-bold">
                        <Fuel className="h-3.5 w-3.5 text-amber-500" />
                        <span>{isAr ? 'نوع الوقود:' : 'Fuel Type:'}</span>
                      </span>
                      <span className="font-bold text-amber-900 bg-amber-50 px-2 py-0.5 rounded-md">
                        {isAr ? fuelConfig.labelAr : fuelConfig.labelEn}
                      </span>
                    </div>

                    {veh.licenseExpiryDate && (
                      <div className="flex items-center justify-between pt-1 border-t border-slate-200/60">
                        <span className="text-slate-500 text-[11px] flex items-center gap-1.5 font-bold">
                          <Calendar className="h-3.5 w-3.5 text-slate-400" />
                          <span>{isAr ? 'انتهاء الرخصة:' : 'License Expiry:'}</span>
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-bold text-slate-700">{veh.licenseExpiryDate}</span>
                          {licStatus && (
                            <span
                              className={`text-[9px] font-black px-1.5 py-0.2 rounded ${
                                licStatus.status === 'expired'
                                  ? 'bg-rose-100 text-rose-800'
                                  : licStatus.status === 'warning'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-emerald-100 text-emerald-800'
                              }`}
                            >
                              {isAr ? licStatus.labelAr : licStatus.labelEn}
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {Number(veh.currentOdometerKm) > 0 && (
                      <div className="flex items-center justify-between pt-1 border-t border-slate-200/60">
                        <span className="text-slate-500 text-[11px] flex items-center gap-1.5 font-bold">
                          <Gauge className="h-3.5 w-3.5 text-slate-400" />
                          <span>{isAr ? 'قراءة العداد:' : 'Odometer:'}</span>
                        </span>
                        <span className="font-mono font-bold text-slate-800">
                          {Number(veh.currentOdometerKm).toLocaleString()} {isAr ? 'كم' : 'km'}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Card Actions */}
                {isGeneralAdmin && (
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => handleDeleteVehicle(veh.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg transition cursor-pointer"
                      title={isAr ? 'حذف المركبة' : 'Delete Vehicle'}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(veh)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                      <span>{isAr ? 'تعديل البيانات' : 'Edit Details'}</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* CREATE / EDIT VEHICLE MODAL */}
      {vehicleModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden my-8 max-h-[90vh] flex flex-col text-start">
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-slate-900 text-white shadow-xs">
                  <Truck className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-sm">
                    {vehicleModal.isEdit ? (isAr ? 'تعديل بيانات المركبة' : 'Edit Vehicle Details') : (isAr ? 'إضافة مركبة جديدة للأسطول' : 'Add Vehicle to Fleet')}
                  </h3>
                  <span className="font-mono text-xs text-slate-400 font-bold">{vehicleModal.id}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setVehicleModal((prev) => ({ ...prev, isOpen: false }))}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-xl transition cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveVehicle} className="p-6 space-y-4 overflow-y-auto flex-1 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    {isAr ? 'رقم اللوحة المعدنية:' : 'License Plate #:'} *
                  </label>
                  <input
                    type="text"
                    required
                    value={vehicleModal.plateNumber}
                    onChange={(e) => setVehicleModal((prev) => ({ ...prev, plateNumber: e.target.value }))}
                    placeholder={isAr ? 'مثال: أ ب ج ١٢٣٤' : 'e.g. ABC 1234'}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    {isAr ? 'ماركة وموديل المركبة:' : 'Make & Model:'} *
                  </label>
                  <input
                    type="text"
                    required
                    value={vehicleModal.vehicleModel}
                    onChange={(e) => setVehicleModal((prev) => ({ ...prev, vehicleModel: e.target.value }))}
                    placeholder={isAr ? 'مثال: سوزوكي فان ٧ راكب' : 'e.g., Suzuki Van 7 Passenger'}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    {isAr ? 'فئة وتصنيف المركبة:' : 'Vehicle Category:'}
                  </label>
                  <select
                    value={vehicleModal.vehicleType}
                    onChange={(e) => setVehicleModal((prev) => ({ ...prev, vehicleType: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-emerald-500"
                  >
                    {VEHICLE_TYPES.map((t) => (
                      <option key={t.id} value={t.id}>{isAr ? t.labelAr : t.labelEn}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    {isAr ? 'نوع الوقود:' : 'Fuel Type:'}
                  </label>
                  <select
                    value={vehicleModal.fuelType}
                    onChange={(e) => setVehicleModal((prev) => ({ ...prev, fuelType: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-emerald-500"
                  >
                    {FUEL_TYPES.map((f) => (
                      <option key={f.id} value={f.id}>{isAr ? f.labelAr : f.labelEn}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Driver Assignment */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  {isAr ? 'السائق المكلف بالمركبة:' : 'Assigned Driver:'}
                </label>
                <select
                  value={vehicleModal.driverUserId}
                  onChange={(e) => setVehicleModal((prev) => ({ ...prev, driverUserId: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">{isAr ? 'غير محدد' : 'Unassigned'}</option>
                  {availableDrivers.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.subtitle})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    {isAr ? 'تاريخ انتهاء رخصة التسيير:' : 'Registration Expiry Date:'}
                  </label>
                  <input
                    type="date"
                    value={vehicleModal.licenseExpiryDate}
                    onChange={(e) => setVehicleModal((prev) => ({ ...prev, licenseExpiryDate: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:bg-white focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    {isAr ? 'قراءة العداد الحالية (كم):' : 'Current Odometer (km):'}
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={vehicleModal.currentOdometerKm}
                    onChange={(e) => setVehicleModal((prev) => ({ ...prev, currentOdometerKm: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    {isAr ? 'رقم الشاسيه:' : 'Chassis Number:'}
                  </label>
                  <input
                    type="text"
                    value={vehicleModal.chassisNumber}
                    onChange={(e) => setVehicleModal((prev) => ({ ...prev, chassisNumber: e.target.value }))}
                    placeholder="CH-XXXXXXX"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-medium text-slate-800 focus:bg-white focus:ring-2 focus:ring-emerald-500 uppercase"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    {isAr ? 'حالة المركبة:' : 'Vehicle Status:'}
                  </label>
                  <select
                    value={vehicleModal.status}
                    onChange={(e) => setVehicleModal((prev) => ({ ...prev, status: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="active">{isAr ? 'بالخدمة نشطة' : 'Active in service'}</option>
                    <option value="maintenance">{isAr ? 'تحت الصيانة' : 'Under maintenance'}</option>
                    <option value="inactive">{isAr ? 'متوقفة / خارج الخدمة' : 'Out of service'}</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  {isAr ? 'ملاحظات:' : 'Notes:'}
                </label>
                <textarea
                  rows={2}
                  value={vehicleModal.notes}
                  onChange={(e) => setVehicleModal((prev) => ({ ...prev, notes: e.target.value }))}
                  placeholder={isAr ? 'أي ملاحظات فنية أو إدارية...' : 'Any technical or administrative notes...'}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:ring-2 focus:ring-emerald-500 resize-none font-medium"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setVehicleModal((prev) => ({ ...prev, isOpen: false }))}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex items-center gap-1.5 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-black text-xs shadow-md transition cursor-pointer disabled:opacity-50"
                >
                  <Save className="h-4 w-4" />
                  <span>{isSubmitting ? (isAr ? 'جاري الحفظ...' : 'Saving...') : (isAr ? 'حفظ بيانات المركبة' : 'Save Vehicle')}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
