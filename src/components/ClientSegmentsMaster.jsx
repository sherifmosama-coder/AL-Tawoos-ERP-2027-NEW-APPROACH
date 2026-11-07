import React, { useState, useEffect, useMemo } from 'react';
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
  UserCheck,
  // --- Food & Beverage / Dining Icons (19) ---
  Utensils,
  UtensilsCrossed,
  ChefHat,
  Coffee,
  CupSoda,
  Pizza,
  Sandwich,
  Soup,
  Salad,
  Cake,
  Cookie,
  Croissant,
  Apple,
  Wheat,
  Fish,
  Beef,
  Egg,
  Milk,
  IceCream,
  // --- Shipping, Logistics & Transport Icons (12) ---
  Ship,
  Plane,
  Container,
  Anchor,
  Warehouse,
  Factory,
  PackageCheck,
  PackageOpen,
  Bike,
  MapPin,
  Compass,
  Navigation,
  // --- Commercial, Institutional & Market Icons (8) ---
  Building,
  School,
  HeartPulse,
  Crown,
  BadgePercent,
  Receipt,
  Gift,
  Target
} from 'lucide-react';

// Icon Map Registry for Segment Dynamic Rendering (55 Curated Icons)
export const SEGMENT_ICON_MAP = {
  // Food & Beverage / HORECA
  Utensils,
  UtensilsCrossed,
  ChefHat,
  Coffee,
  CupSoda,
  Pizza,
  Sandwich,
  Soup,
  Salad,
  Cake,
  Cookie,
  Croissant,
  Apple,
  Wheat,
  Fish,
  Beef,
  Egg,
  Milk,
  IceCream,

  // Shipping, Transport & Logistics
  Truck,
  Ship,
  Plane,
  Container,
  Anchor,
  Warehouse,
  Factory,
  Package,
  PackageCheck,
  PackageOpen,
  Boxes,
  Bike,
  MapPin,
  Compass,
  Navigation,

  // Commercial, Retail & Institutional
  Building2,
  Store,
  ShoppingBag,
  ShoppingCart,
  Hotel,
  Globe,
  Building,
  Landmark,
  School,
  HeartPulse,
  Crown,
  Award,
  BadgePercent,
  Receipt,
  Gift,
  Target,
  Users,
  Briefcase,
  UserCheck,
  Tag,
  Layers
};

export const SEGMENT_ICON_CATEGORIES = [
  { id: 'all', labelAr: 'الكل', labelEn: 'All' },
  { id: 'food', labelAr: 'أغذية ومطاعم', labelEn: 'Food & Dining' },
  { id: 'shipping', labelAr: 'شحن ولوجستيات', labelEn: 'Shipping & Logistics' },
  { id: 'commercial', labelAr: 'تجارة ومؤسسات', labelEn: 'Retail & Corporate' }
];

export const SEGMENT_ICONS_METADATA = [
  // --- Food & Beverage / HORECA (19) ---
  { key: 'Utensils', category: 'food', labelAr: 'مطاعم وتناول طعام', labelEn: 'Restaurants & Dining' },
  { key: 'UtensilsCrossed', category: 'food', labelAr: 'مطاعم راقية وضيافة', labelEn: 'Fine Dining & Hospitality' },
  { key: 'ChefHat', category: 'food', labelAr: 'مطابخ سحابية وشيف', labelEn: 'Cloud Kitchens & Chefs' },
  { key: 'Coffee', category: 'food', labelAr: 'كافيهات ومشروبات ساخنة', labelEn: 'Cafes & Hot Drinks' },
  { key: 'CupSoda', category: 'food', labelAr: 'عصائر ومشروبات باردة', labelEn: 'Beverages & Soft Drinks' },
  { key: 'Pizza', category: 'food', labelAr: 'وجبات سريعة وفطائر', labelEn: 'Fast Food & Pizzerias' },
  { key: 'Sandwich', category: 'food', labelAr: 'كافتيريات وسندوتشات', labelEn: 'Snacks & Delis' },
  { key: 'Soup', category: 'food', labelAr: 'أكلات ومطابخ شعبية', labelEn: 'Soups & Local Eateries' },
  { key: 'Salad', category: 'food', labelAr: 'أغذية صحية وسلطات', labelEn: 'Healthy Food & Salads' },
  { key: 'Cake', category: 'food', labelAr: 'حلويات وتورت ومناسبات', labelEn: 'Pastries & Bakery' },
  { key: 'Cookie', category: 'food', labelAr: 'مخابز وبسكويت', labelEn: 'Bakeries & Biscuits' },
  { key: 'Croissant', category: 'food', labelAr: 'مخبوزات أفرنجية وكرواسون', labelEn: 'French Bakery' },
  { key: 'Apple', category: 'food', labelAr: 'خضروات وفواكه طازجة', labelEn: 'Fresh Produce' },
  { key: 'Wheat', category: 'food', labelAr: 'حبوب وغلال ومطاحن', labelEn: 'Grains & Mills' },
  { key: 'Fish', category: 'food', labelAr: 'مأكولات بحرية وأسماك', labelEn: 'Seafood & Fish' },
  { key: 'Beef', category: 'food', labelAr: 'لحوم وجزارة ومصنعات', labelEn: 'Meats & Butcheries' },
  { key: 'Egg', category: 'food', labelAr: 'بيض ودواجن وألبان', labelEn: 'Poultry & Eggs' },
  { key: 'Milk', category: 'food', labelAr: 'ألبان ومصنعات حليب', labelEn: 'Milk & Dairy' },
  { key: 'IceCream', category: 'food', labelAr: 'جيلاتي ومثلجات', labelEn: 'Ice Cream & Gelato' },

  // --- Shipping, Logistics & Delivery (15) ---
  { key: 'Truck', category: 'shipping', labelAr: 'شاحنات وأسطول نقل بري', labelEn: 'Trucks & Road Transport' },
  { key: 'Ship', category: 'shipping', labelAr: 'شحن بحري وملاحة وتفريغ', labelEn: 'Ocean Shipping & Freight' },
  { key: 'Plane', category: 'shipping', labelAr: 'شحن جوي وتصدير سريع', labelEn: 'Air Cargo & Express' },
  { key: 'Container', category: 'shipping', labelAr: 'حاويات ومحطات شحن', labelEn: 'Cargo Containers & Depots' },
  { key: 'Anchor', category: 'shipping', labelAr: 'موانئ ومناطق جمركية', labelEn: 'Ports & Customs' },
  { key: 'Warehouse', category: 'shipping', labelAr: 'مستودعات ومراكز توزيع', labelEn: 'Distribution Warehouses' },
  { key: 'Factory', category: 'shipping', labelAr: 'مصانع وتصنيع للغير', labelEn: 'Industrial Plants & Packing' },
  { key: 'Package', category: 'shipping', labelAr: 'طرود وشحنات بضاعة', labelEn: 'Parcels & Packages' },
  { key: 'PackageCheck', category: 'shipping', labelAr: 'تسليم معتمد ومحقق', labelEn: 'Verified Deliveries' },
  { key: 'PackageOpen', category: 'shipping', labelAr: 'توزيع وتفريغ طرود', labelEn: 'Cross-Docking & Distribution' },
  { key: 'Boxes', category: 'shipping', labelAr: 'كراتين وبضائع مجمعة', labelEn: 'Bulk Cartons & Cargo' },
  { key: 'Bike', category: 'shipping', labelAr: 'مناديب وتوصيل سريع', labelEn: 'Last-Mile Delivery' },
  { key: 'MapPin', category: 'shipping', labelAr: 'فروع ومواقع جغرافية', labelEn: 'Geographical Hubs' },
  { key: 'Compass', category: 'shipping', labelAr: 'خطوط سير ومسارات شحن', labelEn: 'Shipping Routes' },
  { key: 'Navigation', category: 'shipping', labelAr: 'توجيه لوجستي وملاحة', labelEn: 'Logistics Navigation' },

  // --- Commercial, Retail & Institutional (21) ---
  { key: 'Building2', category: 'commercial', labelAr: 'سلاسل تجارية ومولات', labelEn: 'Modern Trade & Chains' },
  { key: 'Store', category: 'commercial', labelAr: 'محلات ومتاجر تجزئة', labelEn: 'Retail Stores' },
  { key: 'ShoppingBag', category: 'commercial', labelAr: 'مراكز تسوق وأكياس', labelEn: 'Shopping Outlets' },
  { key: 'ShoppingCart', category: 'commercial', labelAr: 'سوبرماركت وعربات تسوق', labelEn: 'Supermarkets' },
  { key: 'Hotel', category: 'commercial', labelAr: 'فنادق وقرى سياحية', labelEn: 'Hotels & Resorts' },
  { key: 'Globe', category: 'commercial', labelAr: 'تصدير وأسواق دولية', labelEn: 'International Markets' },
  { key: 'Building', category: 'commercial', labelAr: 'شركات ومقرات إدارية', labelEn: 'Corporate Offices' },
  { key: 'Landmark', category: 'commercial', labelAr: 'هيئات ومؤسسات رسمية', labelEn: 'Government & Public' },
  { key: 'School', category: 'commercial', labelAr: 'مدارس وجامعات وتعليم', labelEn: 'Schools & Universities' },
  { key: 'HeartPulse', category: 'commercial', labelAr: 'مستشفيات ومراكز طبية', labelEn: 'Hospitals & Healthcare' },
  { key: 'Crown', category: 'commercial', labelAr: 'عملاء كبار VIP', labelEn: 'VIP & Key Accounts' },
  { key: 'Award', category: 'commercial', labelAr: 'عملاء ذهبيين ومميزين', labelEn: 'Premier Tier Clients' },
  { key: 'BadgePercent', category: 'commercial', labelAr: 'منافذ عروض وتخفيضات', labelEn: 'Discount Outlets' },
  { key: 'Receipt', category: 'commercial', labelAr: 'كاش آند كاري ومبيعات', labelEn: 'Cash & Carry' },
  { key: 'Gift', category: 'commercial', labelAr: 'معارض وهدايا ومواسم', labelEn: 'Seasonal & Gift Accounts' },
  { key: 'Target', category: 'commercial', labelAr: 'حسابات استراتيجية مستهدفة', labelEn: 'Strategic Target Accounts' },
  { key: 'Users', category: 'commercial', labelAr: 'نقابات وجمعيات فئوية', labelEn: 'Syndicates & Associations' },
  { key: 'Briefcase', category: 'commercial', labelAr: 'وكالات أعمال ووسطاء', labelEn: 'Business Agencies' },
  { key: 'UserCheck', category: 'commercial', labelAr: 'عملاء معتمدين بالعقود', labelEn: 'Contract Clients' },
  { key: 'Tag', category: 'commercial', labelAr: 'علامات تجارية وتوكيلات', labelEn: 'Brand Agencies' },
  { key: 'Layers', category: 'commercial', labelAr: 'قطاعات متعددة المستويات', labelEn: 'Multi-Tier Segments' }
];

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
  const [iconCategoryFilter, setIconCategoryFilter] = useState('all');

  const displayedIcons = useMemo(() => {
    if (iconCategoryFilter === 'all') return SEGMENT_ICONS_METADATA;
    return SEGMENT_ICONS_METADATA.filter((m) => m.category === iconCategoryFilter);
  }, [iconCategoryFilter]);

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
    setIconCategoryFilter('all');
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
    const foundMeta = SEGMENT_ICONS_METADATA.find((m) => m.key === segment.icon);
    if (foundMeta) {
      setIconCategoryFilter(foundMeta.category);
    } else {
      setIconCategoryFilter('all');
    }
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
      {/* Search, Stats & Action Ribbon */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3 flex-1">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={isAr ? 'بحث في أسماء التصنيفات...' : 'Search segment names...'}
              className="w-full ps-9 pe-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          <div className="text-xs font-bold text-slate-500 flex items-center gap-2">
            <span>
              {isAr ? 'التصنيفات:' : 'Segments:'}{' '}
              <strong className="text-slate-800">{segments.length}</strong>
            </span>
            <span className="text-slate-300">•</span>
            <span>
              {isAr ? 'العملاء المصنفين:' : 'Clients:'}{' '}
              <strong className="text-purple-600 font-black">{clients.length}</strong>
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          {segments.length === 0 && (
            <button
              onClick={handleSeedDefaultSegments}
              disabled={isSeeding}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl text-xs font-bold shadow-md hover:from-purple-700 hover:to-indigo-700 transition cursor-pointer"
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
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>{isAr ? 'إضافة تصنيف جديد' : 'New Segment'}</span>
            </button>
          )}
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
          <div className="bg-white rounded-3xl max-w-xl w-full shadow-2xl border border-slate-200 overflow-hidden animate__animated animate__fadeInUp animate__faster">
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

            <form onSubmit={handleSaveSegment} className="p-5 sm:p-6 space-y-4 max-h-[85vh] overflow-y-auto">
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

              {/* Icon Selector Grid with Category Tabs */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-slate-700">
                    {isAr ? 'أيقونة التصنيف' : 'Segment Icon'}:{' '}
                    <span className="text-purple-600 font-black">
                      {isAr
                        ? (SEGMENT_ICONS_METADATA.find((m) => m.key === formData.icon)?.labelAr || formData.icon)
                        : (SEGMENT_ICONS_METADATA.find((m) => m.key === formData.icon)?.labelEn || formData.icon)}
                    </span>
                  </label>
                  <span className="text-[10px] text-slate-400 font-mono font-semibold">
                    {displayedIcons.length} {isAr ? 'أيقونة' : 'icons'}
                  </span>
                </div>

                {/* Category Filter Tabs */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
                  {SEGMENT_ICON_CATEGORIES.map((cat) => {
                    const count = cat.id === 'all'
                      ? SEGMENT_ICONS_METADATA.length
                      : SEGMENT_ICONS_METADATA.filter((m) => m.category === cat.id).length;
                    const isActive = iconCategoryFilter === cat.id;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setIconCategoryFilter(cat.id)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition shrink-0 cursor-pointer ${
                          isActive
                            ? 'bg-purple-600 text-white shadow-xs'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {isAr ? cat.labelAr : cat.labelEn} ({count})
                      </button>
                    );
                  })}
                </div>

                {/* Grid of Icons */}
                <div className="grid grid-cols-7 sm:grid-cols-9 gap-1.5 bg-slate-50 p-2.5 rounded-xl border border-slate-200 max-h-48 overflow-y-auto">
                  {displayedIcons.map((meta) => {
                    const iconKey = meta.key;
                    const IconCmp = SEGMENT_ICON_MAP[iconKey] || Layers;
                    const isSelected = formData.icon === iconKey;
                    const label = isAr ? meta.labelAr : meta.labelEn;
                    return (
                      <button
                        key={iconKey}
                        type="button"
                        onClick={() => setFormData({ ...formData, icon: iconKey })}
                        className={`p-2 rounded-xl flex items-center justify-center transition cursor-pointer relative ${
                          isSelected
                            ? 'bg-purple-600 text-white shadow-md ring-2 ring-purple-300 scale-105'
                            : 'bg-white text-slate-600 hover:bg-slate-200 hover:text-slate-900 border border-slate-200'
                        }`}
                        title={`${label} (${iconKey})`}
                      >
                        <IconCmp className="w-4 h-4 shrink-0" />
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
