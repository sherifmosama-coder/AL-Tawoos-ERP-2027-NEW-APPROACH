import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { db } from '../firebase';
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc,
  serverTimestamp
} from 'firebase/firestore';
import {
  Layers,
  Plus,
  Edit3,
  Trash2,
  Sparkles,
  Building2,
  Store,
  ShoppingBag,
  ShoppingCart,
  Truck,
  Hotel,
  Globe,
  Boxes,
  Users,
  Landmark,
  Tag,
  Briefcase,
  Award,
  Package,
  Search,
  Check,
  AlertTriangle,
  X,
  UserCheck
} from 'lucide-react';

// Icon Map Registry for Segment Dynamic Rendering
export const SEGMENT_ICON_MAP = {
  Building2,
  Store,
  ShoppingBag,
  ShoppingCart,
  Truck,
  Hotel,
  Globe,
  Boxes,
  Users,
  Layers,
  Landmark,
  Tag,
  Briefcase,
  Award,
  Package,
  UserCheck
};

export const DEFAULT_SEGMENT_COLORS = [
  '#2563eb', // Blue
  '#059669', // Emerald
  '#0d9488', // Teal
  '#0891b2', // Cyan
  '#7c3aed', // Purple
  '#4f46e5', // Indigo
  '#d97706', // Amber
  '#ea580c', // Orange
  '#dc2626', // Red
  '#e11d48', // Rose
  '#0284c7', // Sky
  '#475569'  // Slate
];

export const PRESET_DEFAULT_SEGMENTS = [
  {
    id: 'seg_chains',
    nameAr: 'سلاسل تجارية / كبرى',
    nameEn: 'Chains & Modern Trade',
    color: '#2563eb',
    icon: 'Building2',
    displayOrder: 1,
    description: 'سلاسل الهايبر ماركت والسوبر ماركت الكبرى والمنافذ المركزية'
  },
  {
    id: 'seg_wholesalers',
    nameAr: 'جملة',
    nameEn: 'Wholesalers',
    color: '#059669',
    icon: 'Boxes',
    displayOrder: 2,
    description: 'كبار تجار الجملة والموزعين الرئيسيين في أسواق الجملة'
  },
  {
    id: 'seg_semi_wholesale',
    nameAr: 'نصف جملة',
    nameEn: 'Semi-Wholesale',
    color: '#0d9488',
    icon: 'Store',
    displayOrder: 3,
    description: 'محلات ومخازن نصف الجملة والتجار الإقليميين'
  },
  {
    id: 'seg_retail',
    nameAr: 'تجزئة',
    nameEn: 'Retail',
    color: '#0891b2',
    icon: 'ShoppingBag',
    displayOrder: 4,
    description: 'محلات التجزئة، البقالة، ومنافذ البيع المباشر للمستهلك'
  },
  {
    id: 'seg_distributors',
    nameAr: 'موزعين',
    nameEn: 'Distributors',
    color: '#7c3aed',
    icon: 'Truck',
    displayOrder: 5,
    description: 'وكلاء التوزيع وأصحاب أساطيل التوزيع الحصري'
  },
  {
    id: 'seg_horeca',
    nameAr: 'فنادق ومطاعم / HORECA',
    nameEn: 'HORECA & Hospitality',
    color: '#d97706',
    icon: 'Hotel',
    displayOrder: 6,
    description: 'الفنادق، المنتجعات السياحية، سلاسل المطاعم والمستشفيات'
  },
  {
    id: 'seg_export',
    nameAr: 'تصدير',
    nameEn: 'Export',
    color: '#dc2626',
    icon: 'Globe',
    displayOrder: 7,
    description: 'العملاء الدوليين وشركات التجارة الخارجية ووكلاء التصدير'
  }
];

export default function ClientSegmentsMaster({ currentUser = {}, permissions = null }) {
  const { i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  const isGeneralAdmin = currentUser?.isGeneralAdmin || currentUser?.role === 'general_admin';

  // Tab-scoped action permissions
  const canCreate = isGeneralAdmin || (
    permissions?.actions?.['client_segments.canCreate'] !== undefined
      ? permissions.actions['client_segments.canCreate'] === true
      : permissions?.actions?.canCreate === true
  );

  const canEdit = isGeneralAdmin || (
    permissions?.actions?.['client_segments.canEdit'] !== undefined
      ? permissions.actions['client_segments.canEdit'] === true
      : permissions?.actions?.canEdit === true
  );

  const canDelete = isGeneralAdmin || (
    permissions?.actions?.['client_segments.canDelete'] !== undefined
      ? permissions.actions['client_segments.canDelete'] === true
      : permissions?.actions?.canDelete === true
  );

  const [segments, setSegments] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSegment, setEditingSegment] = useState(null);
  const [deleteConfirmSegment, setDeleteConfirmSegment] = useState(null);
  const [isSeeding, setIsSeeding] = useState(false);
  const [formError, setFormError] = useState('');

  const [formData, setFormData] = useState({
    id: '',
    nameAr: '',
    nameEn: '',
    color: '#2563eb',
    icon: 'Building2',
    displayOrder: 1,
    description: ''
  });

  // Real-time listener for Client Segments
  useEffect(() => {
    const unsubSegments = onSnapshot(collection(db, 'client_segments'), (snapshot) => {
      const list = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data()
      }));
      list.sort((a, b) => (Number(a.displayOrder) || 99) - (Number(b.displayOrder) || 99));
      setSegments(list);
      setLoading(false);
    });

    const unsubClients = onSnapshot(collection(db, 'clients'), (snapshot) => {
      const cList = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        segmentId: docSnap.data().segmentId
      }));
      setClients(cList);
    });

    return () => {
      unsubSegments();
      unsubClients();
    };
  }, []);

  // Compute linked clients count per segment
  const getLinkedClientsCount = (segmentId) => {
    return clients.filter((c) => c.segmentId === segmentId).length;
  };

  const handleOpenCreateModal = () => {
    setEditingSegment(null);
    setFormError('');
    setFormData({
      id: `seg_${Date.now()}`,
      nameAr: '',
      nameEn: '',
      color: DEFAULT_SEGMENT_COLORS[Math.floor(Math.random() * DEFAULT_SEGMENT_COLORS.length)],
      icon: 'Building2',
      displayOrder: (segments.length > 0 ? Math.max(...segments.map((s) => Number(s.displayOrder) || 0)) + 1 : 1),
      description: ''
    });
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (segment) => {
    setEditingSegment(segment);
    setFormError('');
    setFormData({
      id: segment.id,
      nameAr: segment.nameAr || '',
      nameEn: segment.nameEn || '',
      color: segment.color || '#2563eb',
      icon: segment.icon || 'Building2',
      displayOrder: segment.displayOrder || 1,
      description: segment.description || ''
    });
    setIsModalOpen(true);
  };

  const handleSaveSegment = async (e) => {
    e.preventDefault();
    setFormError('');

    const cleanNameAr = formData.nameAr.trim();
    if (!cleanNameAr) {
      setFormError(isAr ? 'يرجى إدخال اسم التصنيف باللغة العربية' : 'Arabic segment name is required');
      return;
    }

    // Slug / ID generation or normalization
    let segmentId = editingSegment ? editingSegment.id : formData.id.trim();
    if (!segmentId) {
      segmentId = `seg_${cleanNameAr.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
    }

    try {
      const payload = {
        nameAr: cleanNameAr,
        nameEn: formData.nameEn.trim(),
        color: formData.color || '#2563eb',
        icon: formData.icon || 'Building2',
        displayOrder: Number(formData.displayOrder) || 1,
        description: formData.description.trim(),
        updatedAt: serverTimestamp()
      };

      if (!editingSegment) {
        payload.createdAt = serverTimestamp();
      }

      await setDoc(doc(db, 'client_segments', segmentId), payload, { merge: true });
      setIsModalOpen(false);
    } catch (err) {
      console.error('Error saving client segment:', err);
      setFormError(err.message || 'Failed to save client segment');
    }
  };

  const handleDeleteSegment = async (segment) => {
    const linkedCount = getLinkedClientsCount(segment.id);
    if (linkedCount > 0) {
      alert(
        isAr
          ? `لا يمكن حذف هذا التصنيف لوجود (${linkedCount}) عميل مرتبطين به حالياً. يرجى إعادة تعيين قطاعات هؤلاء العملاء أولاً.`
          : `Cannot delete this segment because (${linkedCount}) client(s) are currently assigned to it.`
      );
      return;
    }

    try {
      await deleteDoc(doc(db, 'client_segments', segment.id));
      setDeleteConfirmSegment(null);
    } catch (err) {
      console.error('Error deleting client segment:', err);
      alert(isAr ? 'حدث خطأ أثناء حذف التصنيف' : 'Error deleting segment');
    }
  };

  const handleSeedDefaultSegments = async () => {
    if (!confirm(isAr ? 'هل ترغب في تثبيت التصنيفات والقطاعات الافتراضية للعملاء؟' : 'Install default client segments?')) {
      return;
    }

    setIsSeeding(true);
    try {
      for (const seg of PRESET_DEFAULT_SEGMENTS) {
        await setDoc(doc(db, 'client_segments', seg.id), {
          ...seg,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        }, { merge: true });
      }
    } catch (err) {
      console.error('Error seeding segments:', err);
      alert(isAr ? 'فشل تثبيت التصنيفات الافتراضية' : 'Failed to seed default segments');
    } finally {
      setIsSeeding(false);
    }
  };

  // Filter segments
  const filteredSegments = segments.filter((seg) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      (seg.nameAr && seg.nameAr.toLowerCase().includes(q)) ||
      (seg.nameEn && seg.nameEn.toLowerCase().includes(q)) ||
      (seg.description && seg.description.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6">
      {/* Header & Action Bar */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center border border-purple-100 shadow-inner">
            <Layers className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-800">
              {isAr ? 'تصنيفات وقطاعات العملاء' : 'Client Segments & Categories'}
            </h1>
            <p className="text-sm text-slate-500 font-medium">
              {isAr
                ? 'إدارة فئات العملاء (سلاسل، جملة، تجزئة، تصدير) والتحكم في الألوان والأيقونات المعبرة'
                : 'Configure client market segments, visual color tags, and dashboard icons'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {segments.length === 0 && (
            <button
              onClick={handleSeedDefaultSegments}
              disabled={isSeeding}
              className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl text-sm font-bold shadow-md hover:from-purple-700 hover:to-indigo-700 transition"
            >
              <Sparkles className="w-4 h-4" />
              {isSeeding
                ? (isAr ? 'جاري التثبيت...' : 'Seeding...')
                : (isAr ? 'تثبيت التصنيفات الافتراضية' : 'Install Default Segments')}
            </button>
          )}

          {canCreate && (
            <button
              onClick={handleOpenCreateModal}
              className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-bold shadow-md hover:bg-emerald-700 transition"
            >
              <Plus className="w-4 h-4" />
              {isAr ? 'إضافة تصنيف جديد' : 'New Segment'}
            </button>
          )}
        </div>
      </div>

      {/* Search & Quick Stats Bar */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="relative w-full sm:w-96">
          <Search className="w-4 h-4 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={isAr ? 'بحث في أسماء التصنيفات...' : 'Search segment names...'}
            className="w-full ps-9 pe-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>

        <div className="text-xs font-bold text-slate-500 flex items-center gap-3">
          <span>
            {isAr ? 'إجمالي التصنيفات:' : 'Total Segments:'}{' '}
            <strong className="text-slate-800">{segments.length}</strong>
          </span>
          <span className="text-slate-300">•</span>
          <span>
            {isAr ? 'إجمالي العملاء المصنفين:' : 'Total Clients Categorized:'}{' '}
            <strong className="text-purple-600 font-black">{clients.length}</strong>
          </span>
        </div>
      </div>

      {/* Cards Grid */}
      {loading ? (
        <div className="p-12 text-center text-slate-400 font-bold">
          {isAr ? 'جاري تحميل التصنيفات...' : 'Loading segments...'}
        </div>
      ) : filteredSegments.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center border border-slate-200 space-y-4">
          <Layers className="w-12 h-12 text-slate-300 mx-auto" />
          <p className="text-slate-500 font-bold">
            {segments.length === 0
              ? (isAr ? 'لا توجد تصنيفات مسجلة بعد. يمكنك إضافة تصنيف أو تثبيت الافتراضيات بنقرة واحدة.' : 'No segments registered yet.')
              : (isAr ? 'لا توجد نتائج مطابقة لبحثك' : 'No matching segments found')}
          </p>
          {segments.length === 0 && (
            <button
              onClick={handleSeedDefaultSegments}
              disabled={isSeeding}
              className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-xl text-sm font-bold hover:bg-purple-700 transition"
            >
              <Sparkles className="w-4 h-4" />
              {isAr ? 'تثبيت التصنيفات الافتراضية الآن' : 'Seed Default Segments'}
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredSegments.map((seg) => {
            const IconComponent = SEGMENT_ICON_MAP[seg.icon] || Layers;
            const linkedClientsCount = getLinkedClientsCount(seg.id);

            return (
              <div
                key={seg.id}
                className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm hover:shadow-md transition-all flex flex-col justify-between group relative overflow-hidden"
              >
                {/* Visual Color Accent Bar */}
                <div
                  className="absolute top-0 start-0 end-0 h-1.5"
                  style={{ backgroundColor: seg.color || '#2563eb' }}
                />

                <div>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-12 h-12 rounded-xl flex items-center justify-center shadow-sm text-white flex-shrink-0"
                        style={{ backgroundColor: seg.color || '#2563eb' }}
                      >
                        <IconComponent className="w-6 h-6" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-black text-slate-800 text-base">
                            {seg.nameAr}
                          </h3>
                          <span className="text-[11px] font-mono font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                            #{seg.displayOrder}
                          </span>
                        </div>
                        {seg.nameEn && (
                          <p className="text-xs text-slate-400 font-semibold mt-0.5">
                            {seg.nameEn}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 opacity-90 group-hover:opacity-100 transition">
                      {canEdit && (
                        <button
                          onClick={() => handleOpenEditModal(seg)}
                          className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                          title={isAr ? 'تعديل التصنيف' : 'Edit Segment'}
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                      )}
                      {canDelete && (
                        <button
                          onClick={() => setDeleteConfirmSegment(seg)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                          title={isAr ? 'حذف التصنيف' : 'Delete Segment'}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {seg.description && (
                    <p className="text-xs text-slate-500 leading-relaxed line-clamp-2 mb-4 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                      {seg.description}
                    </p>
                  )}
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs mt-2">
                  <span className="text-slate-400 font-medium">
                    {isAr ? 'العملاء المسجلين' : 'Assigned Clients'}:
                  </span>
                  <span
                    className="font-black px-2.5 py-1 rounded-full text-xs shadow-sm"
                    style={{
                      backgroundColor: `${seg.color || '#2563eb'}15`,
                      color: seg.color || '#2563eb'
                    }}
                  >
                    {linkedClientsCount} {isAr ? 'عميل' : 'clients'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden animate__animated animate__fadeInUp animate__faster">
            <div className="px-6 py-5 bg-gradient-to-r from-slate-900 to-slate-800 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center shadow-md text-white"
                  style={{ backgroundColor: formData.color }}
                >
                  {React.createElement(SEGMENT_ICON_MAP[formData.icon] || Layers, { className: 'w-5 h-5' })}
                </div>
                <div>
                  <h3 className="font-black text-base">
                    {editingSegment
                      ? (isAr ? 'تعديل تصنيف عميل' : 'Edit Client Segment')
                      : (isAr ? 'إضافة تصنيف عميل جديد' : 'New Client Segment')}
                  </h3>
                  <p className="text-xs text-slate-300">
                    {isAr ? 'تحديد الاسم التجاري، الرمز اللوني، والأيقونة' : 'Define segment title, brand color, and icon'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSegment} className="p-6 space-y-4">
              {formError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold rounded-xl flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Names */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {isAr ? 'اسم التصنيف (عربي) *' : 'Segment Name (Ar) *'}
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.nameAr}
                    onChange={(e) => setFormData({ ...formData, nameAr: e.target.value })}
                    placeholder={isAr ? 'مثال: سلاسل تجارية' : 'e.g. Chains'}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {isAr ? 'اسم التصنيف (إنجليزي)' : 'Segment Name (En)'}
                  </label>
                  <input
                    type="text"
                    value={formData.nameEn}
                    onChange={(e) => setFormData({ ...formData, nameEn: e.target.value })}
                    placeholder="e.g. Modern Trade"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 text-left font-sans"
                    dir="ltr"
                  />
                </div>
              </div>

              {/* Order & Slug */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {isAr ? 'ترتيب العرض' : 'Display Order'}
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={formData.displayOrder}
                    onChange={(e) => setFormData({ ...formData, displayOrder: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {isAr ? 'الرمز اللوني المختار' : 'Selected Color Hex'}
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={formData.color}
                      onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                      className="w-9 h-9 p-0.5 rounded-lg border border-slate-200 cursor-pointer flex-shrink-0"
                    />
                    <input
                      type="text"
                      value={formData.color}
                      onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                </div>
              </div>

              {/* Color Presets Palette */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  {isAr ? 'لوحة الألوان المعتمدة' : 'Color Presets Palette'}
                </label>
                <div className="flex items-center gap-2 flex-wrap">
                  {DEFAULT_SEGMENT_COLORS.map((hex) => (
                    <button
                      key={hex}
                      type="button"
                      onClick={() => setFormData({ ...formData, color: hex })}
                      className={`w-7 h-7 rounded-lg transition transform hover:scale-110 flex items-center justify-center text-white shadow-sm ${
                        formData.color === hex ? 'ring-2 ring-offset-2 ring-slate-800 scale-105' : ''
                      }`}
                      style={{ backgroundColor: hex }}
                    >
                      {formData.color === hex && <Check className="w-4 h-4 stroke-[3]" />}
                    </button>
                  ))}
                </div>
              </div>

              {/* Icon Selector Grid */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  {isAr ? 'أيقونة التصنيف' : 'Segment Icon'}
                </label>
                <div className="grid grid-cols-8 gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200 max-h-36 overflow-y-auto">
                  {Object.keys(SEGMENT_ICON_MAP).map((iconKey) => {
                    const IconCmp = SEGMENT_ICON_MAP[iconKey];
                    const isSelected = formData.icon === iconKey;
                    return (
                      <button
                        key={iconKey}
                        type="button"
                        onClick={() => setFormData({ ...formData, icon: iconKey })}
                        className={`p-2 rounded-xl flex items-center justify-center transition ${
                          isSelected
                            ? 'bg-purple-600 text-white shadow-md'
                            : 'bg-white text-slate-600 hover:bg-slate-200 border border-slate-200'
                        }`}
                        title={iconKey}
                      >
                        <IconCmp className="w-4 h-4" />
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  {isAr ? 'وصف تفصيلي / ملاحظات' : 'Description / Notes'}
                </label>
                <textarea
                  rows={2}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder={isAr ? 'ملاحظات تعريفية بهذا القطاع...' : 'Segment definition and scope...'}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              {/* Actions */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl text-sm font-bold hover:bg-slate-200 transition"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-purple-600 text-white rounded-xl text-sm font-bold shadow-md hover:bg-purple-700 transition"
                >
                  {isAr ? 'حفظ التصنيف' : 'Save Segment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmSegment && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 space-y-4 text-center">
            <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h3 className="font-black text-slate-800 text-base">
              {isAr ? 'تأكيد حذف التصنيف' : 'Confirm Segment Deletion'}
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              {isAr
                ? `هل أنت متأكد من رغبتك في حذف التصنيف "${deleteConfirmSegment.nameAr}"؟`
                : `Are you sure you want to delete segment "${deleteConfirmSegment.nameAr}"?`}
            </p>
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                onClick={() => setDeleteConfirmSegment(null)}
                className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl text-sm font-bold hover:bg-slate-200 transition"
              >
                {isAr ? 'تراجع' : 'Cancel'}
              </button>
              <button
                onClick={() => handleDeleteSegment(deleteConfirmSegment)}
                className="px-4 py-2 bg-rose-600 text-white rounded-xl text-sm font-bold shadow-md hover:bg-rose-700 transition"
              >
                {isAr ? 'تأكيد الحذف' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
