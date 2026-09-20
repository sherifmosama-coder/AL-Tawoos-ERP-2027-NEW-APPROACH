import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { db, fileToDataUrl, openBase64Document } from '../firebase';
import { 
  collection, 
  onSnapshot, 
  doc, 
  setDoc, 
  deleteDoc, 
  serverTimestamp 
} from 'firebase/firestore';
import {
  Plus,
  Search,
  Building2,
  Edit3,
  Trash2,
  Phone,
  Mail,
  User,
  FileText,
  Paperclip,
  UploadCloud,
  FileCheck,
  FileUp,
  XCircle,
  ExternalLink,
  Eye,
  EyeOff,
  PlusCircle,
  CreditCard,
  Calendar,
  AlertCircle,
  AlertTriangle,
  Zap,
  TrendingDown,
  X
} from 'lucide-react';

export default function SupplierMaster({ currentUser = {}, permissions = null }) {
  const { i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  const isGeneralAdmin = currentUser?.isGeneralAdmin || currentUser?.role === 'general_admin';

  // Tab-Scoped Action Resolvers (Checks 'suppliers.canX' first, then fallback)
  const canCreate = isGeneralAdmin || (
    permissions?.actions?.['suppliers.canCreate'] !== undefined
      ? permissions.actions['suppliers.canCreate'] === true
      : permissions?.actions?.canCreate === true
  );

  const canEdit = isGeneralAdmin || (
    permissions?.actions?.['suppliers.canEdit'] !== undefined
      ? permissions.actions['suppliers.canEdit'] === true
      : permissions?.actions?.canEdit === true
  );

  const canDelete = isGeneralAdmin || (
    permissions?.actions?.['suppliers.canDelete'] !== undefined
      ? permissions.actions['suppliers.canDelete'] === true
      : permissions?.actions?.canDelete === true
  );

  // Field Access Checker Helper
  const checkFieldAccess = (fieldKey, sensitiveNodeFallback = null) => {
    if (isGeneralAdmin) return true;
    if (!permissions) return true;
    const scopedKey = `suppliers.${fieldKey}`;
    if (permissions.fields && permissions.fields[scopedKey] !== undefined) {
      return permissions.fields[scopedKey] === true;
    }
    if (sensitiveNodeFallback && permissions.sensitive && permissions.sensitive[sensitiveNodeFallback] !== undefined) {
      return permissions.sensitive[sensitiveNodeFallback] === true;
    }
    return true;
  };

  const canViewTaxCard = checkFieldAccess('taxCardNumber', 'canViewConfidentialDocs');
  const canViewCR = checkFieldAccess('commercialRegister', 'canViewConfidentialDocs');
  const canViewOpeningBal = checkFieldAccess('openingBalance', 'canViewOpeningBalances');
  const canViewPaymentTerms = checkFieldAccess('paymentTermsCount', 'canViewOpeningBalances');
  const canViewContacts = isGeneralAdmin || checkFieldAccess('contacts', 'canViewConfidentialDocs');

  // Real-time Cloud Database State
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Subscribe to live Firestore updates
  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, 'suppliers'),
      (snapshot) => {
        const cloudData = snapshot.docs.map((docSnap) => ({
          ...docSnap.data(),
          id: docSnap.id
        }));
        setSuppliers(cloudData);
        setLoading(false);
      },
      (error) => {
        console.error('Firestore subscription error:', error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingSupplierId, setEditingSupplierId] = useState(null);
  const [compressionStats, setCompressionStats] = useState({}); // { [fieldKey]: statObj }

  // Initial Clean Form State
  const initialFormState = {
    name: '',
    taxpayerLegalName: '',
    taxpayerAddress: '',
    taxCardNumber: '',
    taxCardFile: '',
    commercialRegister: '',
    commercialRegisterFile: '',
    taxFileNumber: '',
    taxDistrict: '',
    openingBalance: 0,
    openingBalanceFile: '',
    whtCompliance: 'credit_notes',
    whtAdvanceExpiryDate: '',
    whtAdvanceCertFile: '',
    paymentTerms: {
      tranchesCount: 1,
      tranches: [{ percent: 100, days: 30, baseDate: 'delivery_date' }]
    },
    contacts: [
      {
        name: '',
        role: '',
        email: '',
        phones: ['']
      }
    ]
  };

  const [formData, setFormData] = useState(initialFormState);

  // Open Create Modal
  const handleOpenCreate = () => {
    setEditingSupplierId(null);
    setFormData(initialFormState);
    setShowModal(true);
  };

  const handleOpenEdit = (supplier) => {
    setEditingSupplierId(supplier.id);
    
    // Safely reconcile paymentTerms structure
    const existingPt = supplier.paymentTerms || {};
    const tranchesCount = Number(existingPt.tranchesCount) || existingPt.tranches?.length || 1;
    let tranches = Array.isArray(existingPt.tranches) && existingPt.tranches.length > 0
      ? existingPt.tranches.map((t) => ({
          percent: Number(t.percent) || 0,
          days: Number(t.days) || 0,
          baseDate: t.baseDate || 'delivery_date',
        }))
      : [{ percent: 100, days: 30, baseDate: 'delivery_date' }];

    // Ensure array length matches tranchesCount
    while (tranches.length < tranchesCount) {
      tranches.push({ percent: 0, days: 30 * (tranches.length + 1), baseDate: 'delivery_date' });
    }

    setFormData({
      id: supplier.id || '',
      name: supplier.name || '',
      taxpayerLegalName: supplier.taxpayerLegalName || supplier.name || '',
      taxpayerAddress: supplier.taxpayerAddress || '',
      taxCardNumber: supplier.taxCardNumber || '',
      taxCardFile: supplier.taxCardFile || '',
      commercialRegister: supplier.commercialRegister || '',
      commercialRegisterFile: supplier.commercialRegisterFile || '',
      taxFileNumber: supplier.taxFileNumber || '',
      taxDistrict: supplier.taxDistrict || '',
      openingBalance: supplier.openingBalance || 0,
      openingBalanceFile: supplier.openingBalanceFile || '',
      whtCompliance: supplier.whtCompliance || 'credit_notes',
      whtAdvanceExpiryDate: supplier.whtAdvanceExpiryDate || '',
      whtAdvanceCertFile: supplier.whtAdvanceCertFile || '',
      paymentTerms: {
        tranchesCount,
        tranches: tranches.slice(0, tranchesCount),
      },
      contacts: supplier.contacts?.length ? supplier.contacts : [{ name: '', role: '', email: '', phones: [''] }],
    });
    setShowModal(true);
  };

  // Delete Supplier from Firestore
  const handleDeleteSupplier = async (id, name) => {
    if (!canDelete) {
      alert(isAr ? 'عذراً، ليس لديك صلاحية حذف الموردين من المنظومة.' : 'You do not have permission to delete suppliers.');
      return;
    }

    const confirmMsg = isAr
      ? `هل أنت متأكد من حذف المورد (${name}) نهائياً من قاعدة البيانات السحابية؟`
      : `Are you sure you want to permanently delete supplier (${name}) from Cloud Database?`;

    if (window.confirm(confirmMsg)) {
      try {
        await deleteDoc(doc(db, 'suppliers', id));
      } catch (error) {
        console.error('Error deleting document:', error);
        alert(isAr ? 'حدث خطأ أثناء حذف المورد من السحابة.' : 'Error deleting supplier from cloud.');
      }
    }
  };

  // Smart Auto-Compressing Base64 Upload Handler
  // Format File Size Helper
  const formatFileSize = (bytes) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const readFileAsDataUrl = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
    });
  };

  // Rasterize multi-page PDF (up to 6 pages) and stitch into a single vertical image
  const rasterizeAndStitchPdf = async (file, maxPages = 6) => {
    if (!window.pdfjsLib) {
      throw new Error(isAr ? 'مكتبة معالجة الـ PDF غير محملة.' : 'PDF.js library is not loaded.');
    }
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = window.pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    const totalPages = pdf.numPages;
    const pagesToRender = Math.min(totalPages, maxPages);

    const pageCanvases = [];
    let totalHeight = 0;
    let maxWidth = 0;

    for (let pageNum = 1; pageNum <= pagesToRender; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const baseViewport = page.getViewport({ scale: 1.5 });
      const targetWidth = Math.min(1600, baseViewport.width);
      const scale = targetWidth / page.getViewport({ scale: 1.0 }).width;
      const viewport = page.getViewport({ scale });

      const pCanvas = document.createElement('canvas');
      pCanvas.width = viewport.width;
      pCanvas.height = viewport.height;
      const pCtx = pCanvas.getContext('2d');

      await page.render({ canvasContext: pCtx, viewport }).promise;

      pageCanvases.push(pCanvas);
      totalHeight += pCanvas.height;
      if (pCanvas.width > maxWidth) maxWidth = pCanvas.width;
    }

    const gap = pagesToRender > 1 ? 16 : 0;
    const combinedHeight = totalHeight + gap * (pagesToRender - 1);

    const stitchedCanvas = document.createElement('canvas');
    stitchedCanvas.width = maxWidth;
    stitchedCanvas.height = combinedHeight;
    const ctx = stitchedCanvas.getContext('2d');

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, maxWidth, combinedHeight);

    let currentY = 0;
    for (let i = 0; i < pageCanvases.length; i++) {
      const pCanvas = pageCanvases[i];
      const xOffset = Math.round((maxWidth - pCanvas.width) / 2);
      ctx.drawImage(pCanvas, xOffset, currentY);
      currentY += pCanvas.height;

      if (i < pageCanvases.length - 1) {
        ctx.fillStyle = '#CBD5E1';
        ctx.fillRect(24, currentY + 7, maxWidth - 48, 2);
        currentY += gap;
      }
    }

    const compressedDataUrl = stitchedCanvas.toDataURL('image/jpeg', 0.75);
    const base64Length = compressedDataUrl.length - (compressedDataUrl.indexOf(',') + 1);
    const compressedSize = Math.round((base64Length * 3) / 4);

    return {
      dataUrl: compressedDataUrl,
      fileName: file.name,
      fileType: 'image/jpeg',
      originalSize: file.size,
      compressedSize,
      savingsPercent: file.size > compressedSize ? Number((((file.size - compressedSize) / file.size) * 100).toFixed(1)) : 0,
      isCompressed: true,
      mode: 'compressed_pdf',
      totalPages,
      renderedPages: pagesToRender,
      dimensions: `${maxWidth}×${combinedHeight}px`,
    };
  };

  // Compress regular image
  const compressImageFile = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          const maxDim = 1600;

          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, width, height);
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, width, height);

          const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.75);
          const base64Length = compressedDataUrl.length - (compressedDataUrl.indexOf(',') + 1);
          const compressedSize = Math.round((base64Length * 3) / 4);
          const savingsPercent = file.size > compressedSize
            ? Number((((file.size - compressedSize) / file.size) * 100).toFixed(1))
            : 0;

          resolve({
            dataUrl: compressedDataUrl,
            fileName: file.name,
            fileType: 'image/jpeg',
            originalSize: file.size,
            compressedSize,
            savingsPercent,
            isCompressed: savingsPercent > 0,
            mode: 'compressed_image',
            dimensions: `${width}×${height}px`,
          });
        };
        img.onerror = () => reject(new Error('Failed to load image.'));
        img.src = event.target.result;
      };
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
    });
  };

  // Master Upload Handler (Supports optional mode: 'compress' | 'raw')
  const handleFileUpload = async (field, file, mode = 'compress') => {
    if (!file) return;

    const originalSize = file.size;
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    const isImage = file.type.startsWith('image/');
    const MAX_SAFE_RAW_BYTES = 700 * 1024;
    const startTime = performance.now();

    try {
      if (mode === 'raw') {
        if (originalSize > MAX_SAFE_RAW_BYTES) {
          const proceed = confirm(
            isAr
              ? `⚠️ تنبيه: حجم الملف الأصلي (${(originalSize / (1024 * 1024)).toFixed(2)} ميجابايت) يتجاوز الحد الآمن لقاعدة البيانات (700 كيلوبايت).\n\nهل ترغب في تحويله وضغطه ذكياً لتفادي فشل الحفظ؟\n(انقر OK للضغط والتحويل، أو Cancel للمحاولة كملف خام)`
              : `⚠️ Warning: Original file (${(originalSize / (1024 * 1024)).toFixed(2)} MB) exceeds 700 KB database limit.\n\nWould you like to compress and convert it automatically?\n(Click OK to compress, Cancel to force raw upload)`
          );
          if (proceed) {
            return handleFileUpload(field, file, 'compress');
          }
        }

        const rawDataUrl = await readFileAsDataUrl(file);
        const endTime = performance.now();
        setFormData((prev) => ({ ...prev, [field]: rawDataUrl }));
        setCompressionStats((prev) => ({
          ...prev,
          [field]: {
            originalSize,
            compressedSize: originalSize,
            savingsPercent: 0,
            isCompressed: false,
            mode: 'raw_original',
            fileType: file.type || (isPdf ? 'application/pdf' : 'application/octet-stream'),
            elapsedMs: Math.round(endTime - startTime),
          },
        }));
        return;
      }

      // MODE: SMART COMPRESS & CONVERT
      if (isPdf) {
        const result = await rasterizeAndStitchPdf(file, 6);
        const endTime = performance.now();
        setFormData((prev) => ({ ...prev, [field]: result.dataUrl }));
        setCompressionStats((prev) => ({
          ...prev,
          [field]: { ...result, elapsedMs: Math.round(endTime - startTime) },
        }));
      } else if (isImage) {
        const result = await compressImageFile(file);
        const endTime = performance.now();
        setFormData((prev) => ({ ...prev, [field]: result.dataUrl }));
        setCompressionStats((prev) => ({
          ...prev,
          [field]: { ...result, elapsedMs: Math.round(endTime - startTime) },
        }));
      } else {
        const rawDataUrl = await readFileAsDataUrl(file);
        const endTime = performance.now();
        setFormData((prev) => ({ ...prev, [field]: rawDataUrl }));
        setCompressionStats((prev) => ({
          ...prev,
          [field]: {
            originalSize,
            compressedSize: originalSize,
            savingsPercent: 0,
            isCompressed: false,
            mode: 'raw_original',
            fileType: file.type,
            elapsedMs: Math.round(endTime - startTime),
          },
        }));
      }
    } catch (error) {
      console.error('Error handling file upload:', error);
      alert(error.message || (isAr ? 'فشل معالجة الملف.' : 'Failed to process file.'));
    }
  };

  // Remove Uploaded File Handler
  const handleRemoveFile = (field) => {
    setFormData((prev) => ({
      ...prev,
      [field]: null
    }));
  };

  // Contact Persons Handlers
  const handleAddContact = () => {
    setFormData({
      ...formData,
      contacts: [
        ...formData.contacts,
        { name: '', role: '', email: '', phones: [''] }
      ]
    });
  };

  const handleRemoveContact = (cIndex) => {
    setFormData({
      ...formData,
      contacts: formData.contacts.filter((_, idx) => idx !== cIndex)
    });
  };

  const handleContactChange = (cIndex, field, value) => {
    const updated = [...formData.contacts];
    updated[cIndex][field] = value;
    setFormData({ ...formData, contacts: updated });
  };

  // Phone Numbers Handlers inside a specific contact
  const handleAddPhone = (cIndex) => {
    const updated = [...formData.contacts];
    updated[cIndex].phones.push('');
    setFormData({ ...formData, contacts: updated });
  };

  const handleRemovePhone = (cIndex, pIndex) => {
    const updated = [...formData.contacts];
    updated[cIndex].phones = updated[cIndex].phones.filter((_, idx) => idx !== pIndex);
    setFormData({ ...formData, contacts: updated });
  };

  const handlePhoneChange = (cIndex, pIndex, value) => {
    const updated = [...formData.contacts];
    updated[cIndex].phones[pIndex] = value;
    setFormData({ ...formData, contacts: updated });
  };

  // Payment Tranches Handlers
  const handleTranchesCountChange = (count) => {
    const newCount = Math.max(1, Number(count));
    let tranches = [...formData.paymentTerms.tranches];

    if (newCount > tranches.length) {
      for (let i = tranches.length; i < newCount; i++) {
        tranches.push({ percent: Math.round(100 / newCount), days: 30 * (i + 1), baseDate: 'delivery_date' });
      }
    } else {
      tranches = tranches.slice(0, newCount);
    }

    setFormData({
      ...formData,
      paymentTerms: { tranchesCount: newCount, tranches }
    });
  };

  const handleTrancheDetailChange = (index, field, value) => {
    const updated = [...formData.paymentTerms.tranches];
    updated[index][field] = field === 'percent' || field === 'days' ? Number(value) : value;
    setFormData({
      ...formData,
      paymentTerms: { ...formData.paymentTerms, tranches: updated }
    });
  };

  // Form Submission
  const handleSaveSupplier = async (e) => {
    e.preventDefault();

    if (editingSupplierId && !canEdit) {
      alert(isAr ? 'عذراً، ليس لديك صلاحية تعديل بيانات الموردين.' : 'You do not have permission to edit suppliers.');
      return;
    }
    if (!editingSupplierId && !canCreate) {
      alert(isAr ? 'عذراً، ليس لديك صلاحية تسجيل موردين جدد.' : 'You do not have permission to create suppliers.');
      return;
    }

    // Enforce Advance WHT validation
    if (formData.whtCompliance === 'advance_payment') {
      if (!formData.whtAdvanceExpiryDate) {
        alert(isAr ? 'يرجى تحديد تاريخ انتهاء سريان شهادة الدفعات المقدمة.' : 'Please specify the advance payment certificate expiry date.');
        return;
      }
      if (!formData.whtAdvanceCertFile) {
        alert(isAr ? 'يرجى إرفاق صورة/ملف شهادة سداد الدفعات المقدمة من مصلحة الضرائب.' : 'Please attach the official tax advance payment certificate.');
        return;
      }
    }

    // Check unique supplier trade name
    const trimmedName = formData.name.trim().toLowerCase();
    const duplicate = suppliers.find(
      (s) => s.id !== editingSupplierId && s.name.trim().toLowerCase() === trimmedName
    );

    if (duplicate) {
      alert(
        isAr
          ? 'اسم المورد مسجل بالفعل من قبل! يرجى اختيار اسم غير مكرر.'
          : 'Supplier name already exists! Duplicate names are not allowed.'
      );
      return;
    }

    try {
      const targetId = editingSupplierId || `SUP-${String(Date.now()).slice(-4)}`;
      
      // Save directly to Cloud Firestore collection 'suppliers'
      await setDoc(
        doc(db, 'suppliers', targetId),
        {
          ...formData,
          id: targetId,
          updatedAt: serverTimestamp()
        },
        { merge: true }
      );

      setShowModal(false);
    } catch (error) {
      console.error('Error saving supplier to Firestore:', error);
      alert(isAr ? 'حدث خطأ أثناء حفظ البيانات في السحابة.' : 'Error saving supplier to cloud database.');
    }
  };

  const filteredSuppliers = suppliers.filter(
    (s) =>
      s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.taxCardNumber.includes(searchTerm) ||
      s.commercialRegister.includes(searchTerm) ||
      s.taxDistrict.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div>
      {/* Header Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400 h-4 w-4" />
          <input
            type="text"
            placeholder={
              isAr
                ? 'بحث باسم المورد، السجل التجاري، البطاقة الضريبية...'
                : 'Search supplier, CR, Tax Card, District...'
            }
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full ps-10 pe-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
          />
        </div>

        {/* Add Supplier Button Guarded by canCreate */}
        {canCreate ? (
          <button
            onClick={handleOpenCreate}
            className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition cursor-pointer shadow-xs"
          >
            <Plus className="h-4 w-4" />
            <span>{isAr ? 'إضافة مورد جديد' : 'Add New Supplier'}</span>
          </button>
        ) : (
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 border border-slate-200 rounded-lg text-xs text-slate-500 font-medium">
            <Lock className="h-3.5 w-3.5" />
            <span>{isAr ? 'وضع القراءة فقط' : 'Read-Only Mode'}</span>
          </div>
        )}
      </div>

      {/* Supplier Grid / Table */}
      <div className="overflow-x-auto border border-slate-200 rounded-xl shadow-xs bg-white">
        <table className="w-full text-start border-collapse text-sm">
          <thead>
            <tr className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
              <th className="p-3 text-start">{isAr ? 'الكود والمورد' : 'Supplier & Code'}</th>
              {(canViewTaxCard || canViewCR) && (
                <th className="p-3 text-start">{isAr ? 'البيانات الضريبية والرسمية' : 'Tax & Statutory Info'}</th>
              )}
              {canViewContacts && (
                <th className="p-3 text-start">{isAr ? 'جهات الاتصال والتواصل' : 'Contacts Directory'}</th>
              )}
              <th className="p-3 text-start">{isAr ? 'الخصم والإضافة' : 'WHT Compliance'}</th>
              {canViewPaymentTerms && (
                <th className="p-3 text-start">{isAr ? 'شروط السداد والائتمان' : 'Payment Terms'}</th>
              )}
              {canViewOpeningBal && (
                <th className="p-3 text-start">{isAr ? 'الرصيد الافتتاحي' : 'Opening Bal.'}</th>
              )}
              {(canEdit || canDelete) && (
                <th className="p-3 text-center">{isAr ? 'إجراء' : 'Actions'}</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredSuppliers.map((sup) => (
              <tr key={sup.id} className="hover:bg-slate-50/70 transition">
                {/* Supplier Identity */}
                <td className="p-3 align-top">
                  <div className="font-bold text-slate-900">{sup.name}</div>
                  <div className="text-xs text-slate-500 font-mono mt-0.5">{sup.id}</div>
                  <div className="text-xs text-slate-400 mt-1 max-w-[200px] truncate" title={sup.taxpayerLegalName}>
                    {sup.taxpayerLegalName}
                  </div>
                </td>

                {/* Tax & Legal Info (Completely Omitted if Both Fields are Unchecked) */}
                {(canViewTaxCard || canViewCR) && (
                  <td className="p-3 align-top text-xs text-slate-600 space-y-1.5">
                    {canViewTaxCard && sup.taxCardNumber && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-400">{isAr ? 'ب.ض:' : 'Tax Card:'}</span>{' '}
                        <span className="font-mono font-medium text-slate-800">{sup.taxCardNumber}</span>
                        {sup.taxCardFile && (
                          <button
                            type="button"
                            onClick={() => openBase64Document(sup.taxCardFile)}
                            className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-800 bg-emerald-100 hover:bg-emerald-200 px-1.5 py-0.5 rounded border border-emerald-300 transition cursor-pointer"
                            title={isAr ? 'عرض مرفق البطاقة الضريبية' : 'View Tax Card'}
                          >
                            <Paperclip className="h-2.5 w-2.5" />
                            <span>{isAr ? 'ب.ض' : 'Tax Card'}</span>
                            <ExternalLink className="h-2.5 w-2.5" />
                          </button>
                        )}
                      </div>
                    )}
                    {canViewCR && sup.commercialRegister && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-400">{isAr ? 'س.ت:' : 'CR:'}</span>{' '}
                        <span className="font-mono font-medium text-slate-800">{sup.commercialRegister}</span>
                        {sup.commercialRegisterFile && (
                          <button
                            type="button"
                            onClick={() => openBase64Document(sup.commercialRegisterFile)}
                            className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-800 bg-emerald-100 hover:bg-emerald-200 px-1.5 py-0.5 rounded border border-emerald-300 transition cursor-pointer"
                            title={isAr ? 'عرض مرفق السجل التجاري' : 'View Commercial Register'}
                          >
                            <Paperclip className="h-2.5 w-2.5" />
                            <span>{isAr ? 'س.ت' : 'CR'}</span>
                            <ExternalLink className="h-2.5 w-2.5" />
                          </button>
                        )}
                      </div>
                    )}
                    {sup.taxDistrict && (
                      <div className="text-slate-500 truncate max-w-[180px]" title={sup.taxDistrict}>
                        {sup.taxDistrict}
                      </div>
                    )}
                  </td>
                )}

                {/* Contacts Directory (Completely Omitted if Unpermitted) */}
                {canViewContacts && (
                  <td className="p-3 align-top text-xs">
                    {(sup.contacts || []).map((c, i) => (
                      <div key={i} className="mb-2 last:mb-0 p-1.5 bg-slate-50 rounded border border-slate-100">
                        <div className="font-semibold text-slate-800 flex items-center gap-1">
                          <User className="h-3 w-3 text-slate-400" />
                          <span>{c.name || '—'}</span>
                          <span className="text-[10px] text-slate-400 font-normal">({c.role || '—'})</span>
                        </div>
                        {c.email && (
                          <div className="text-slate-500 flex items-center gap-1 mt-0.5 font-mono text-[11px]">
                            <Mail className="h-2.5 w-2.5 text-slate-400" />
                            <span>{c.email}</span>
                          </div>
                        )}
                        <div className="flex flex-wrap gap-1 mt-1">
                          {(c.phones || []).map((p, pIdx) => (
                            <span
                              key={pIdx}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-mono text-[11px] bg-emerald-50 text-emerald-800 border border-emerald-200"
                            >
                              <Phone className="h-2.5 w-2.5 text-slate-400" />
                              {p || '—'}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </td>
                )}

                {/* WHT Compliance */}
                <td className="p-3 align-top text-xs">
                  {sup.whtCompliance === 'credit_notes' ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium bg-blue-50 text-blue-700 border border-blue-200">
                      {isAr ? 'يقبل إشعارات خصم (1%)' : 'Accepts WHT (1%)'}
                    </span>
                  ) : (
                    <div className="space-y-1.5">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                        {isAr ? 'سداد ضرائب مقدماً' : 'Advance Tax Paid'}
                      </span>
                      <div className="text-[11px] text-slate-500">
                        <span className="text-slate-400">{isAr ? 'ساري حتى:' : 'Expires:'}</span>{' '}
                        <span className="font-mono font-bold text-slate-700">{sup.whtAdvanceExpiryDate || '—'}</span>
                      </div>
                      {sup.whtAdvanceCertFile && (
                        <div>
                          <button
                            type="button"
                            onClick={() => openBase64Document(sup.whtAdvanceCertFile)}
                            className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-900 bg-amber-100 hover:bg-amber-200 px-1.5 py-0.5 rounded border border-amber-300 transition cursor-pointer"
                            title={isAr ? 'عرض شهادة الدفعات المقدمة' : 'View WHT Certificate'}
                          >
                            <Paperclip className="h-2.5 w-2.5 text-amber-700" />
                            <span>{isAr ? 'شهادة الضرائب' : 'Cert.'}</span>
                            <ExternalLink className="h-2.5 w-2.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </td>

                {/* Payment Terms (Completely Omitted if Unpermitted) */}
                {canViewPaymentTerms && (
                  <td className="p-3 align-top text-xs text-slate-600">
                    <div className="font-semibold text-slate-800 mb-1">
                      {sup.paymentTerms?.tranchesCount || 1}{' '}
                      {isAr ? ((sup.paymentTerms?.tranchesCount || 1) === 1 ? 'دفعة واحدة' : 'دفعات') : 'Tranche(s)'}
                    </div>
                    <div className="space-y-0.5">
                      {(sup.paymentTerms?.tranches || []).map((t, idx) => (
                        <div key={idx} className="text-slate-500 text-[11px]">
                          • {t.percent}% ({t.days} {isAr ? 'يوم' : 'days'}) -{' '}
                          <span className="text-slate-400">
                            {t.baseDate === 'delivery_date'
                              ? isAr ? 'من التوريد' : 'from delivery'
                              : isAr ? 'نهاية الشهر' : 'end of month'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </td>
                )}

                {/* Opening Balance (Completely Omitted if Unpermitted) */}
                {canViewOpeningBal && (
                  <td className="p-3 align-top">
                    <span className="font-mono font-bold text-slate-800 text-sm block">
                      {(Number(sup.openingBalance) || 0).toLocaleString()}{' '}
                      <span className="text-xs font-normal text-slate-500">{isAr ? 'ج.م' : 'EGP'}</span>
                    </span>
                    {sup.openingBalanceFile && (
                      <button
                        type="button"
                        onClick={() => openBase64Document(sup.openingBalanceFile)}
                        className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-800 bg-blue-100 hover:bg-blue-200 px-1.5 py-0.5 rounded border border-blue-300 transition cursor-pointer mt-1"
                        title={isAr ? 'عرض كشف حساب المصادقة' : 'View Statement'}
                      >
                        <Paperclip className="h-2.5 w-2.5" />
                        <span>{isAr ? 'كشف حساب' : 'Statement'}</span>
                        <ExternalLink className="h-2.5 w-2.5" />
                      </button>
                    )}
                  </td>
                )}

                {/* Actions (Completely Omitted if neither canEdit nor canDelete is granted) */}
                {(canEdit || canDelete) && (
                  <td className="p-3 align-top text-center">
                    <div className="flex items-center justify-center gap-1">
                      {canEdit && (
                        <button
                          onClick={() => handleOpenEdit(sup)}
                          className="p-1.5 text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition cursor-pointer"
                          title={isAr ? 'تعديل البيانات' : 'Edit Supplier'}
                        >
                          <Edit3 className="h-4 w-4" />
                        </button>
                      )}
                      {canDelete && (
                        <button
                          onClick={() => handleDeleteSupplier(sup.id, sup.name)}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition cursor-pointer"
                          title={isAr ? 'حذف المورد' : 'Delete Supplier'}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Supplier Create / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            {/* Sticky Modal Header */}
            <div className="sticky -top-6 -mt-6 pt-6 bg-white z-30 flex justify-between items-center pb-3 mb-4 border-b border-slate-100">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  {editingSupplierId
                    ? isAr
                      ? `تعديل بيانات المورد (${formData.name})`
                      : `Edit Supplier (${formData.name})`
                    : isAr
                    ? 'تسجيل مورد جديد'
                    : 'Register New Supplier'}
                </h3>
                <p className="text-xs text-slate-500">
                  {isAr
                    ? 'البيانات التجارية، الملف الضريبي، وجهات الاتصال'
                    : 'Statutory records, tax registration, and payment terms'}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold text-slate-700 bg-slate-100 border border-slate-300 px-2.5 py-1 rounded-md">
                  {editingSupplierId || 'NEW-SUP'}
                </span>

                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition cursor-pointer"
                  title={isAr ? 'إغلاق' : 'Close'}
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <form onSubmit={handleSaveSupplier} className="space-y-5">
              {/* Section 1: Corporate & Tax Identity */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-emerald-800 uppercase tracking-wider">
                  {isAr ? '١- البيانات التجارية والرسمية' : '1. Corporate & Official Identity'}
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      {isAr ? 'اسم الشهرة التجاري للمورد *' : 'Supplier Trade Name *'}
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="مثال: شركة الأمل للبتروكيماويات"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full p-2 border border-slate-300 rounded-lg text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      {isAr ? 'اسم الممول الرسمي (في الأوراق الرسمية)' : 'Taxpayer Official Registered Name'}
                    </label>
                    <input
                      type="text"
                      placeholder="الاسم المسجل في السجل التجاري والبطاقة الضريبية"
                      value={formData.taxpayerLegalName}
                      onChange={(e) => setFormData({ ...formData, taxpayerLegalName: e.target.value })}
                      className="w-full p-2 border border-slate-300 rounded-lg text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {isAr ? 'عنوان الممول المسجل' : 'Registered Tax Address'}
                  </label>
                  <input
                    type="text"
                    placeholder="العنوان التفصيلي طبقا للأوراق الرسمية"
                    value={formData.taxpayerAddress}
                    onChange={(e) => setFormData({ ...formData, taxpayerAddress: e.target.value })}
                    className="w-full p-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      {isAr ? 'رقم البطاقة الضريبية' : 'Tax Card No.'}
                    </label>
                    <input
                      type="text"
                      placeholder="xxx-xxx-xxx"
                      value={formData.taxCardNumber}
                      onChange={(e) => setFormData({ ...formData, taxCardNumber: e.target.value })}
                      className="w-full p-2 border border-slate-300 rounded-lg text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      {isAr ? 'رقم السجل التجاري' : 'CR No.'}
                    </label>
                    <input
                      type="text"
                      placeholder="رقم السجل"
                      value={formData.commercialRegister}
                      onChange={(e) => setFormData({ ...formData, commercialRegister: e.target.value })}
                      className="w-full p-2 border border-slate-300 rounded-lg text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      {isAr ? 'رقم الملف الضريبي' : 'Tax File No.'}
                    </label>
                    <input
                      type="text"
                      placeholder="رقم الملف"
                      value={formData.taxFileNumber}
                      onChange={(e) => setFormData({ ...formData, taxFileNumber: e.target.value })}
                      className="w-full p-2 border border-slate-300 rounded-lg text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      {isAr ? 'المأمورية التابع لها' : 'Tax District'}
                    </label>
                    <input
                      type="text"
                      placeholder="اسم المأمورية"
                      value={formData.taxDistrict}
                      onChange={(e) => setFormData({ ...formData, taxDistrict: e.target.value })}
                      className="w-full p-2 border border-slate-300 rounded-lg text-sm"
                    />
                  </div>
                </div>

                {/* 3. Regulatory Documents & Attachments with Dual Optional Modes */}
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-4">
                  <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <FileText className="h-4 w-4 text-emerald-600" />
                    <span>{isAr ? 'المستندات القانونية والمرفقات' : 'Statutory Documents'}</span>
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {[
                      { field: 'taxCardFile', labelAr: 'مرفق البطاقة الضريبية', labelEn: 'Tax Card Document' },
                      { field: 'commercialRegisterFile', labelAr: 'مرفق السجل التجاري', labelEn: 'Commercial Register Document' },
                      ...(formData.whtCompliance === 'advance_payment' ? [{ field: 'whtAdvanceCertFile', labelAr: 'شهادة الدفعات المقدمة', labelEn: 'WHT Advance Exemption Certificate' }] : []),
                      ...(Number(formData.openingBalance) > 0 ? [{ field: 'openingBalanceFile', labelAr: 'مستند المصادقة على الرصيد الافتتاحي', labelEn: 'Opening Balance Statement Document' }] : []),
                    ].map((slot) => {
                      const hasFile = Boolean(formData[slot.field]);
                      const stat = compressionStats[slot.field];

                      return (
                        <div key={slot.field} className="space-y-1.5 bg-white p-3 rounded-xl border border-slate-200">
                          <label className="block text-xs font-bold text-slate-700">
                            {isAr ? slot.labelAr : slot.labelEn}
                          </label>

                          <div className="flex flex-wrap items-center gap-2">
                            {hasFile ? (
                              <div className="flex items-center gap-2 w-full justify-between">
                                <span className="text-xs text-emerald-700 font-bold flex items-center gap-1">
                                  <FileCheck className="h-4 w-4 text-emerald-600" />
                                  <span>{isAr ? 'تم إرفاق المستند' : 'Attached'}</span>
                                </span>
                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => openBase64Document(formData[slot.field])}
                                    className="p-1.5 text-indigo-600 hover:bg-indigo-50 border border-indigo-200 rounded-lg cursor-pointer transition flex items-center gap-1 text-xs font-bold shadow-2xs"
                                    title={isAr ? 'معاينة' : 'Preview'}
                                  >
                                    <Eye className="h-3.5 w-3.5" />
                                    <span>{isAr ? 'معاينة' : 'Preview'}</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setFormData((prev) => ({ ...prev, [slot.field]: '' }));
                                      setCompressionStats((prev) => {
                                        const upd = { ...prev };
                                        delete upd[slot.field];
                                        return upd;
                                      });
                                    }}
                                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                                    title={isAr ? 'إزالة' : 'Remove'}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex flex-wrap items-center gap-2 w-full">
                                {/* Option 1: Smart Compress & Convert */}
                                <label className="flex-1 min-w-[130px] flex items-center justify-center gap-1.5 p-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg cursor-pointer transition text-xs font-bold shadow-2xs">
                                  <Zap className="h-3.5 w-3.5" />
                                  <span>{isAr ? 'ضغط وتحويل ذكي' : 'Smart Compress'}</span>
                                  <input
                                    type="file"
                                    accept="image/*,application/pdf"
                                    onChange={(e) => handleFileUpload(slot.field, e.target.files?.[0], 'compress')}
                                    className="hidden"
                                  />
                                </label>

                                {/* Option 2: Upload Original As-Is */}
                                <label className="flex-1 min-w-[130px] flex items-center justify-center gap-1.5 p-2 border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg cursor-pointer transition text-xs font-semibold shadow-2xs">
                                  <FileUp className="h-3.5 w-3.5 text-slate-500" />
                                  <span>{isAr ? 'الأصلي كما هو' : 'Original As-Is'}</span>
                                  <input
                                    type="file"
                                    accept="image/*,application/pdf"
                                    onChange={(e) => handleFileUpload(slot.field, e.target.files?.[0], 'raw')}
                                    className="hidden"
                                  />
                                </label>
                              </div>
                            )}
                          </div>

                          {/* Dynamic Metric Badge */}
                          {hasFile && stat && (
                            stat.isCompressed ? (
                              <div className="p-2 bg-emerald-50 border border-emerald-200 rounded-lg text-[10px] font-mono text-emerald-900 flex items-center justify-between">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-slate-400 line-through">{formatFileSize(stat.originalSize)}</span>
                                  <span className="text-emerald-700 font-bold">{isAr ? '←' : '➔'}</span>
                                  <span className="font-bold text-emerald-800 bg-white px-1 rounded border border-emerald-300">
                                    {formatFileSize(stat.compressedSize)}
                                  </span>
                                  <span className="bg-emerald-600 text-white px-1.5 rounded-full font-sans font-bold">
                                    -{stat.savingsPercent}%
                                  </span>
                                  {stat.mode === 'compressed_pdf' && (
                                    <span className="text-emerald-800 font-sans">({stat.renderedPages}/{stat.totalPages} pgs)</span>
                                  )}
                                </div>
                                <span className="text-emerald-700">{stat.elapsedMs}ms</span>
                              </div>
                            ) : (
                              <div className="p-1.5 bg-indigo-50 border border-indigo-200 rounded-lg text-[10px] text-indigo-900 flex items-center justify-between">
                                <span>{isAr ? 'ملف أصلي غير مضغوط' : 'Original Uncompressed'}</span>
                                <span className="font-mono font-bold">{formatFileSize(stat.originalSize)}</span>
                              </div>
                            )
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Section 2: Contact Persons */}
              <div className="space-y-3 pt-3 border-t border-slate-100">
                <div className="flex justify-between items-center">
                  <h4 className="text-xs font-bold text-emerald-800 uppercase tracking-wider">
                    {isAr ? '٢- مسؤولي التواصل وجهات الاتصال' : '2. Contacts Directory'}
                  </h4>
                    <button
                      type="button"
                      onClick={handleAddContact}
                      className="flex items-center gap-1 text-xs text-emerald-700 hover:text-emerald-800 font-semibold cursor-pointer"
                    >
                      <PlusCircle className="h-3.5 w-3.5" />
                      <span>{isAr ? 'إضافة مسؤول تواصل' : 'Add Contact Person'}</span>
                    </button>
                  </div>

                  <div className="space-y-3">
                    {formData.contacts.map((contact, cIdx) => (
                      <div key={cIdx} className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                              {isAr ? 'اسم الشخص المسئول' : 'Contact Name'}
                            </label>
                            <input
                              type="text"
                              placeholder="الاسم"
                              value={contact.name}
                              onChange={(e) => handleContactChange(cIdx, 'name', e.target.value)}
                              className="w-full p-1.5 border border-slate-300 rounded-md text-xs bg-white"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                              {isAr ? 'الصفة / المنصب' : 'Role / Designation'}
                            </label>
                            <input
                              type="text"
                              placeholder="مثال: مدير مبيعات"
                              value={contact.role}
                              onChange={(e) => handleContactChange(cIdx, 'role', e.target.value)}
                              className="w-full p-1.5 border border-slate-300 rounded-md text-xs bg-white"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                              {isAr ? 'البريد الإلكتروني' : 'Email Address'}
                            </label>
                            <input
                              type="email"
                              placeholder="name@domain.com"
                              value={contact.email}
                              onChange={(e) => handleContactChange(cIdx, 'email', e.target.value)}
                              className="w-full p-1.5 border border-slate-300 rounded-md text-xs bg-white"
                            />
                          </div>
                        </div>

                        {/* Phone numbers list */}
                        <div>
                          <div className="flex justify-between items-center mb-1">
                            <label className="text-[11px] font-semibold text-slate-600">
                              {isAr ? 'أرقام التليفون' : 'Phone Numbers'}
                            </label>
                            <button
                              type="button"
                              onClick={() => handleAddPhone(cIdx)}
                              className="text-[11px] text-emerald-700 hover:underline cursor-pointer"
                            >
                              + {isAr ? 'إضافة رقم آخر' : 'Add Phone'}
                            </button>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            {contact.phones.map((phone, pIdx) => (
                              <div key={pIdx} className="flex items-center gap-1">
                                <input
                                  type="text"
                                  placeholder="01xxxxxxxxx"
                                  value={phone}
                                  onChange={(e) => handlePhoneChange(cIdx, pIdx, e.target.value)}
                                  className="p-1.5 border border-slate-300 rounded-md text-xs bg-white w-36 font-mono"
                                />
                                {contact.phones.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => handleRemovePhone(cIdx, pIdx)}
                                    className="text-slate-400 hover:text-red-500 p-1"
                                  >
                                    ×
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>

                        {formData.contacts.length > 1 && (
                          <div className="text-end pt-1">
                            <button
                              type="button"
                              onClick={() => handleRemoveContact(cIdx)}
                              className="text-xs text-red-600 hover:underline cursor-pointer"
                            >
                              {isAr ? 'حذف جهة الاتصال' : 'Remove Contact'}
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

              {/* Section 3: Financial Baseline & WHT Compliance */}
              <div className="space-y-3 pt-3 border-t border-slate-100">
                <h4 className="text-xs font-bold text-emerald-800 uppercase tracking-wider">
                  {isAr ? '٣- الرصيد الافتتاحي والخصم والإضافة' : '3. Financial Baseline & WHT'}
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      {isAr ? 'الرصيد الافتتاحي (ج.م) *' : 'Opening Balance (EGP) *'}
                    </label>
                    <input
                      type="number"
                      required
                      value={formData.openingBalance}
                      onChange={(e) => setFormData({ ...formData, openingBalance: Number(e.target.value) })}
                      className="w-full p-2 border border-slate-300 rounded-lg text-sm font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      {isAr ? 'موقف ضريبة الخصم والإضافة (WHT) *' : 'WHT Compliance Status *'}
                    </label>
                    <select
                      value={formData.whtCompliance}
                      onChange={(e) => setFormData({ ...formData, whtCompliance: e.target.value })}
                      className="w-full p-2 border border-slate-300 rounded-lg text-sm bg-white font-medium"
                    >
                      <option value="credit_notes">
                        {isAr ? 'يقبل إشعارات الخصم والإضافة (خصم 1% لصالح الضرائب)' : 'Accepts WHT Credit Notes (1%)'}
                      </option>
                      <option value="advance_payment">
                        {isAr ? 'سداد ضرائب مقدماً (معفى بموجب شهادة دفعات مقدمة)' : 'Advance Tax Settlement (0% Deduction)'}
                      </option>
                    </select>
                  </div>
                </div>

                {/* Optional Opening Balance Document Attachment */}
                <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1.5">
                    {isAr ? 'مرفق مصادقة الرصيد الافتتاحي / كشف الحساب (اختياري)' : 'Opening Balance Statement / Reconciliation (Optional)'}
                  </label>
                  {formData.openingBalanceFile ? (
                    <div className="flex items-center justify-between p-2 bg-white border border-blue-200 rounded-lg">
                      <div className="flex items-center gap-2 truncate">
                        <FileCheck className="h-4 w-4 text-blue-600 shrink-0" />
                        <span className="text-xs font-medium text-slate-800 truncate">
                          {typeof formData.openingBalanceFile === 'object' ? formData.openingBalanceFile.name : formData.openingBalanceFile}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveFile('openingBalanceFile')}
                        className="text-slate-400 hover:text-red-600 transition p-1"
                      >
                        <XCircle className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <label className="flex items-center justify-center gap-2 p-2 border-2 border-dashed border-slate-300 hover:border-blue-500 bg-white rounded-lg cursor-pointer transition">
                      <UploadCloud className="h-4 w-4 text-slate-400" />
                      <span className="text-xs text-slate-500 font-medium">
                        {isAr ? 'اختر ملف كشف الحساب والمصادقة' : 'Upload Statement Attachment'}
                      </span>
                      <input
                        type="file"
                        accept=".pdf,image/*,.xlsx,.xls"
                        className="hidden"
                        onChange={(e) => handleFileUpload('openingBalanceFile', e)}
                      />
                    </label>
                  )}
                </div>

                {/* Conditional Mandatory Fields for Advance Tax Payment with Real File Upload */}
                {formData.whtCompliance === 'advance_payment' && (
                  <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl space-y-3">
                    <div className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                      <AlertCircle className="h-4 w-4 text-amber-600" />
                      <span>{isAr ? 'بيانات شهادة سداد الدفعات المقدمة الإلزامية' : 'Mandatory Advance Tax Certificate Details'}</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-amber-900 mb-1">
                          {isAr ? 'تاريخ انتهاء سريان الشهادة *' : 'Certificate Expiry Date *'}
                        </label>
                        <input
                          type="date"
                          required
                          value={formData.whtAdvanceExpiryDate}
                          onChange={(e) => setFormData({ ...formData, whtAdvanceExpiryDate: e.target.value })}
                          className="w-full p-2 border border-amber-300 rounded-lg text-xs bg-white"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-amber-900 mb-1">
                          {isAr ? 'مرفق الشهادة المعتمدة من الضرائب *' : 'Tax Certificate Document Upload *'}
                        </label>
                        {formData.whtAdvanceCertFile ? (
                          <div className="flex items-center justify-between p-2 bg-white border border-amber-300 rounded-lg">
                            <div className="flex items-center gap-2 truncate">
                              <FileCheck className="h-4 w-4 text-amber-600 shrink-0" />
                              <span className="text-xs font-medium text-slate-800 truncate">
                                {typeof formData.whtAdvanceCertFile === 'object' ? formData.whtAdvanceCertFile.name : formData.whtAdvanceCertFile}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRemoveFile('whtAdvanceCertFile')}
                              className="text-slate-400 hover:text-red-600 transition p-1"
                            >
                              <XCircle className="h-4 w-4" />
                            </button>
                          </div>
                        ) : (
                          <label className="flex items-center justify-center gap-2 p-2 border-2 border-dashed border-amber-300 hover:border-amber-500 bg-white rounded-lg cursor-pointer transition">
                            <UploadCloud className="h-4 w-4 text-amber-600" />
                            <span className="text-xs text-amber-900 font-medium">
                              {isAr ? 'اختر ملف الشهادة (PDF/صورة)' : 'Upload Official Certificate'}
                            </span>
                            <input
                              type="file"
                              accept=".pdf,image/*"
                              className="hidden"
                              onChange={(e) => handleFileUpload('whtAdvanceCertFile', e)}
                            />
                          </label>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Section 4: Payment Terms Engine */}
              <div className="space-y-3 pt-3 border-t border-slate-100">
                <div className="flex justify-between items-center">
                  <h4 className="text-xs font-bold text-emerald-800 uppercase tracking-wider">
                    {isAr ? '٤- شروط السداد والائتمان' : '4. Payment Terms & Installments'}
                  </h4>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-600">{isAr ? 'عدد الدفعات:' : 'Tranches:'}</span>
                    <select
                      value={formData.paymentTerms.tranchesCount}
                      onChange={(e) => handleTranchesCountChange(e.target.value)}
                      className="p-1 border border-slate-300 rounded text-xs bg-white"
                    >
                      <option value={1}>1</option>
                      <option value={2}>2</option>
                      <option value={3}>3</option>
                      <option value={4}>4</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  {formData.paymentTerms.tranches.map((tranche, tIdx) => (
                    <div key={tIdx} className="grid grid-cols-1 sm:grid-cols-3 gap-2 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs items-center">
                      <div className="flex items-center gap-1">
                        <span className="font-semibold text-slate-700">{isAr ? `الدفعة ${tIdx + 1}:` : `Tranche ${tIdx + 1}:`}</span>
                        <input
                          type="number"
                          value={tranche.percent}
                          onChange={(e) => handleTrancheDetailChange(tIdx, 'percent', e.target.value)}
                          className="w-16 p-1 border border-slate-300 rounded bg-white font-mono text-center"
                        />
                        <span>%</span>
                      </div>

                      <div className="flex items-center gap-1">
                        <span>{isAr ? 'فترة الائتمان:' : 'Grace Period:'}</span>
                        <input
                          type="number"
                          value={tranche.days}
                          onChange={(e) => handleTrancheDetailChange(tIdx, 'days', e.target.value)}
                          className="w-16 p-1 border border-slate-300 rounded bg-white font-mono text-center"
                        />
                        <span>{isAr ? 'يوم' : 'days'}</span>
                      </div>

                      <div>
                        <select
                          value={tranche.baseDate}
                          onChange={(e) => handleTrancheDetailChange(tIdx, 'baseDate', e.target.value)}
                          className="w-full p-1 border border-slate-300 rounded bg-white"
                        >
                          <option value="delivery_date">
                            {isAr ? 'من تاريخ التوريد' : 'From Delivery Date'}
                          </option>
                          <option value="end_of_month">
                            {isAr ? 'من نهاية شهر التوريد' : 'From End of Supply Month'}
                          </option>
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-sm text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-bold cursor-pointer shadow-xs"
                >
                  {editingSupplierId
                    ? isAr
                      ? 'حفظ التعديلات'
                      : 'Save Changes'
                    : isAr
                    ? 'تسجيل المورد'
                    : 'Register Supplier'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}