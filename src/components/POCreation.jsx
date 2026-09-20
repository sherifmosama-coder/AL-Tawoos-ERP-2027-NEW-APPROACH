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
  Plus,
  Search,
  Printer,
  CheckCircle2,
  Clock,
  Truck,
  Send,
  Trash2,
  Edit3,
  Building2,
  Calendar,
  Layers,
  PlusCircle,
  XCircle,
  AlertCircle,
  X,
  Receipt,
  Globe,
  History,
  CreditCard,
  Lock,
  Ban,
  Eye,
  AlertTriangle,
  SlidersHorizontal,
  Sparkles
} from 'lucide-react';
import PeacockLoader from './PeacockLoader';
import SearchableSelect from './SearchableSelect';

export default function POCreation({ currentUser = {}, permissions = null }) {
  const canViewPrices = permissions ? permissions.sensitive?.canViewPrices !== false : true;
  const canViewTotals = permissions ? permissions.sensitive?.canViewTotals !== false : true;
  const { i18n } = useTranslation();
  const isAr = i18n.language === 'ar';

  const isGeneralAdmin = currentUser?.isGeneralAdmin || currentUser?.role === 'general_admin';
  const isPurchasingAdmin = currentUser?.isPurchasingAdmin || isGeneralAdmin;
  const currentUserName = isAr ? (currentUser?.nameAr || 'المسؤول') : (currentUser?.name || 'Admin User');

  // Live Cloud Collections
  const [orders, setOrders] = useState([]);
  const [itemsMaster, setItemsMaster] = useState([]);
  const [suppliersMaster, setSuppliersMaster] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filter & Modal States
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState('create'); // 'create' | 'edit_major' | 'adjust_minor' | 'review_readonly'
  const [editingPo, setEditingPo] = useState(null);
  const [printPoData, setPrintPoData] = useState(null);
  const [printLang, setPrintLang] = useState('ar');
  const [auditPoData, setAuditPoData] = useState(null);

  // Review & Adjustment Feedback States
  const [isRequestingAdjustments, setIsRequestingAdjustments] = useState(false);
  const [adjustmentComment, setAdjustmentComment] = useState('');
  const [initialFormSnapshot, setInitialFormSnapshot] = useState('');
  const [isSavingPo, setIsSavingPo] = useState(false);

  // General Admin Specs Decision Dialog State
  const [specDecisionModal, setSpecDecisionModal] = useState(null);

  // Form State
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [isTaxOfficial, setIsTaxOfficial] = useState(true);
  const [showPaymentTerms, setShowPaymentTerms] = useState(true);
  const [notes, setNotes] = useState('');
  const [poLines, setPoLines] = useState([
    {
      itemId: '',
      code: '',
      variantCode: '',
      nameAr: '',
      nameEn: '',
      specs: '',
      initialMasterSpecs: '',
      isSpecsModified: false,
      smallUnit: '',
      qty: 1000,
      unitPrice: '',
      currency: 'EGP',
      vatPercent: 14,
      whtPercent: 1,
    }
  ]);

  // Version Calculation Helpers
  const getNextMinorVersion = (currentVer) => {
    const num = parseFloat(currentVer) || 1.0;
    return (num + 0.1).toFixed(1);
  };

  const getNextMajorVersion = (currentVer) => {
    const num = parseFloat(currentVer) || 1.0;
    return (Math.floor(num) + 1.0).toFixed(1);
  };

  const formatVersionTag = (ver) => {
    if (!ver) return 'v1.0';
    const num = parseFloat(ver);
    return isNaN(num) ? `v${ver}` : `v${num.toFixed(1)}`;
  };

  // Subscribe to Firestore Collections
  useEffect(() => {
    const unsubOrders = onSnapshot(collection(db, 'purchase_orders'), (snap) => {
      const list = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
      list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setOrders(list);
      setLoading(false);
    });

    const unsubItems = onSnapshot(collection(db, 'items'), (snap) => {
      setItemsMaster(snap.docs.map((d) => ({ ...d.data(), code: d.id })));
    });

    const unsubSuppliers = onSnapshot(collection(db, 'suppliers'), (snap) => {
      setSuppliersMaster(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
    });

    return () => {
      unsubOrders();
      unsubItems();
      unsubSuppliers();
    };
  }, []);

  const selectedSupplier = useMemo(() => {
    return suppliersMaster.find((s) => s.id === selectedSupplierId) || null;
  }, [suppliersMaster, selectedSupplierId]);

  // Filter items linked to the selected supplier via active variations
  const availableItemsForSupplier = useMemo(() => {
    if (!selectedSupplierId) return [];
    return itemsMaster.filter((item) => {
      if (item.status === 'inactive') return false;
      return (item.variations || []).some((v) => v.supplierId === selectedSupplierId);
    });
  }, [itemsMaster, selectedSupplierId]);

  // Supplier Change Handler with line reset confirmation
  const handleSupplierChange = (newSupplierId) => {
    if (poLines.some((l) => l.itemId)) {
      const confirmChange = window.confirm(
        isAr
          ? 'تغيير المورد سيؤدي إلى إعادة تعيين بنود الخامات لتتوافق مع قائمة خامات المورد الجديد. هل تريد المتابعة؟'
          : 'Changing supplier will reset current line items to match new supplier. Proceed?'
      );
      if (!confirmChange) return;
    }

    setSelectedSupplierId(newSupplierId);
    setPoLines([
      {
        itemId: '',
        code: '',
        variantCode: '',
        nameAr: '',
        nameEn: '',
        specs: '',
        initialMasterSpecs: '',
        isSpecsModified: false,
        smallUnit: '',
        qty: 1000,
        unitPrice: '',
        currency: 'EGP',
        vatPercent: 14,
        whtPercent: 1,
      }
    ]);
  };

  // Format Payment Terms
  const formatPaymentTerms = (terms, lang = 'ar') => {
    if (!terms || !terms.tranches || terms.tranches.length === 0) {
      return lang === 'ar' ? 'سداد نقدي عند الاستلام' : 'Cash upon delivery';
    }

    if (terms.tranchesCount === 1) {
      const t = terms.tranches[0];
      const baseText = t.baseDate === 'delivery_date' 
        ? (lang === 'ar' ? 'من تاريخ التوريد الفعلي' : 'from actual delivery date')
        : (lang === 'ar' ? 'من نهاية شهر التوريد' : 'from end of supply month');
      
      return lang === 'ar'
        ? `سداد 100% خلال ${t.days} يوماً ${baseText}.`
        : `100% payment within ${t.days} days ${baseText}.`;
    }

    if (lang === 'ar') {
      const parts = terms.tranches.map((t, idx) => {
        const baseText = t.baseDate === 'delivery_date' ? 'من تاريخ التوريد' : 'من نهاية شهر التوريد';
        return `دفعة (${idx + 1}): ${t.percent}% خلال ${t.days} يوم ${baseText}`;
      });
      return `السداد على ${terms.tranchesCount} دفعات [ ${parts.join(' | ')} ].`;
    } else {
      const parts = terms.tranches.map((t, idx) => {
        const baseText = t.baseDate === 'delivery_date' ? 'from delivery' : 'from end of month';
        return `Tranche (${idx + 1}): ${t.percent}% within ${t.days} days ${baseText}`;
      });
      return `Payment in ${terms.tranchesCount} installments [ ${parts.join(' | ')} ].`;
    }
  };

  // Generate Automated PO ID: PO-YYYYMMDDXX
  const generatePoId = () => {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const datePrefix = `PO-${yyyy}${mm}${dd}`;

    const todayOrders = orders.filter((o) => o.id?.startsWith(datePrefix));
    const nextSeq = String(todayOrders.length + 1).padStart(2, '0');
    return `${datePrefix}${nextSeq}`;
  };

  // Line Item Handlers
  const handleAddLine = () => {
    setPoLines([
      ...poLines,
      {
        itemId: '',
        code: '',
        variantCode: '',
        nameAr: '',
        nameEn: '',
        specs: '',
        initialMasterSpecs: '',
        isSpecsModified: false,
        smallUnit: '',
        qty: 1000,
        unitPrice: '',
        currency: poLines[0]?.currency || 'EGP',
        vatPercent: 14,
        whtPercent: 1,
      }
    ]);
  };

  const handleRemoveLine = (index) => {
    if (poLines.length === 1) return;
    setPoLines(poLines.filter((_, idx) => idx !== index));
  };

  const handleItemSelect = (index, itemCode) => {
    const selectedItem = itemsMaster.find((i) => i.code === itemCode);
    const updated = [...poLines];

    if (selectedItem) {
      let whtRate = selectedItem.whtRate === '3%' ? 3 : 1;
      if (selectedSupplier && selectedSupplier.whtCompliance === 'advance_payment') {
        whtRate = 0;
      }

      const supplierVariants = (selectedItem.variations || []).filter(
        (v) => v.supplierId === selectedSupplierId
      );

      const defaultVariant = supplierVariants.length === 1 ? supplierVariants[0] : null;

      const activeCode = defaultVariant ? defaultVariant.variantCode : selectedItem.code;
      const activeSpecs = defaultVariant ? defaultVariant.mergedSpecs : (selectedItem.mergedSpecs || '');
      const activeUnit = defaultVariant ? (defaultVariant.smallUnit || selectedItem.smallUnit) : selectedItem.smallUnit;

      updated[index] = {
        ...updated[index],
        itemId: selectedItem.code,
        code: activeCode,
        variantCode: defaultVariant ? defaultVariant.variantCode : '',
        nameAr: selectedItem.nameAr,
        nameEn: selectedItem.nameEn,
        specs: activeSpecs,
        initialMasterSpecs: activeSpecs,
        isSpecsModified: false,
        smallUnit: activeUnit || '',
        vatPercent: selectedItem.vatRate === '0%' ? 0 : 14,
        whtPercent: whtRate,
      };
    } else {
      updated[index] = {
        ...updated[index],
        itemId: '',
        code: '',
        variantCode: '',
        nameAr: '',
        nameEn: '',
        specs: '',
        initialMasterSpecs: '',
        isSpecsModified: false,
        smallUnit: '',
      };
    }
    setPoLines(updated);
  };

  const handleVariantSelect = (index, variantCode) => {
    const updated = [...poLines];
    const line = updated[index];
    const selectedItem = itemsMaster.find((i) => i.code === line.itemId);
    if (!selectedItem) return;

    if (variantCode) {
      const variant = (selectedItem.variations || []).find((v) => v.variantCode === variantCode);
      if (variant) {
        updated[index] = {
          ...line,
          code: variant.variantCode,
          variantCode: variant.variantCode,
          specs: variant.mergedSpecs || '',
          initialMasterSpecs: variant.mergedSpecs || '',
          isSpecsModified: false,
          smallUnit: variant.smallUnit || selectedItem.smallUnit || '',
        };
      }
    } else {
      updated[index] = {
        ...line,
        code: selectedItem.code,
        variantCode: '',
        specs: selectedItem.mergedSpecs || '',
        initialMasterSpecs: selectedItem.mergedSpecs || '',
        isSpecsModified: false,
        smallUnit: selectedItem.smallUnit || '',
      };
    }

    setPoLines(updated);
  };

  const handleLineChange = (index, field, value) => {
    const updated = [...poLines];
    updated[index][field] = value;

    if (field === 'specs') {
      updated[index].isSpecsModified = value !== updated[index].initialMasterSpecs;
    }

    setPoLines(updated);
  };

  // Compute Totals
  const computedTotals = useMemo(() => {
    let subtotal = 0;
    let totalVat = 0;
    let totalWht = 0;
    let hasPricing = false;
    const detectedCurrency = poLines.find((l) => l.unitPrice && l.currency)?.currency || poLines[0]?.currency || 'EGP';

    poLines.forEach((line) => {
      const price = parseFloat(line.unitPrice);
      const qty = parseFloat(line.qty) || 0;

      if (!isNaN(price) && price > 0) {
        hasPricing = true;
        const lineSubtotal = qty * price;
        const vatRate = isTaxOfficial ? (line.vatPercent || 0) / 100 : 0;
        const lineVat = lineSubtotal * vatRate;

        let effectiveWhtRate = (line.whtPercent || 0) / 100;
        if (selectedSupplier?.whtCompliance === 'advance_payment') {
          effectiveWhtRate = 0;
        }
        const lineWht = lineSubtotal * effectiveWhtRate;

        subtotal += lineSubtotal;
        totalVat += lineVat;
        totalWht += lineWht;
      }
    });

    const netPayable = subtotal + totalVat - totalWht;

    return {
      hasPricing,
      currency: detectedCurrency,
      subtotal,
      totalVat,
      totalWht,
      netPayable,
    };
  }, [poLines, isTaxOfficial, selectedSupplier]);

  // Track changes to enable/disable resubmit button
  const hasFormChanges = useMemo(() => {
    if (!initialFormSnapshot) return false;
    const currentSnapshot = JSON.stringify({
      supplierId: selectedSupplierId || '',
      deliveryDate: deliveryDate || '',
      isTaxOfficial: Boolean(isTaxOfficial),
      showPaymentTerms: Boolean(showPaymentTerms),
      notes: notes || '',
      lines: poLines.map((l) => ({
        itemId: l.itemId || '',
        code: l.code || '',
        variantCode: l.variantCode || '',
        qty: Number(l.qty) || 0,
        unitPrice: l.unitPrice !== '' && l.unitPrice !== undefined ? Number(l.unitPrice) : '',
        currency: l.currency || 'EGP',
        specs: l.specs || '',
      })),
    });
    return currentSnapshot !== initialFormSnapshot;
  }, [initialFormSnapshot, selectedSupplierId, deliveryDate, isTaxOfficial, showPaymentTerms, notes, poLines]);

  // Modal Open Handlers
  const handleOpenCreate = () => {
    setModalMode('create');
    setEditingPo(null);
    setSelectedSupplierId(suppliersMaster[0]?.id || '');
    setDeliveryDate('');
    setIsTaxOfficial(true);
    setShowPaymentTerms(true);
    setNotes('');
    setIsRequestingAdjustments(false);
    setAdjustmentComment('');
    setPoLines([
      {
        itemId: '',
        code: '',
        variantCode: '',
        nameAr: '',
        nameEn: '',
        specs: '',
        initialMasterSpecs: '',
        isSpecsModified: false,
        smallUnit: '',
        qty: 1000,
        unitPrice: '',
        currency: 'EGP',
        vatPercent: 14,
        whtPercent: 1,
      }
    ]);
    setShowModal(true);
  };

  // Route A: Targeted Adjustment Flow (+0.1 minor version)
  const handleOpenAdjustmentRoute = (po) => {
    setModalMode('adjust_minor');
    setEditingPo(po);
    setSelectedSupplierId(po.supplierId || '');
    setDeliveryDate(po.deliveryDate || '');
    setIsTaxOfficial(po.isTaxOfficial !== false);
    setShowPaymentTerms(po.showPaymentTerms !== false);
    setNotes(po.notes || '');
    setIsRequestingAdjustments(false);
    setAdjustmentComment('');
    
    const lines = po.lines
      ? po.lines.map((l) => ({
          ...l,
          initialMasterSpecs: l.specs || '',
          isSpecsModified: false,
          currency: l.currency || po.financials?.currency || 'EGP',
        }))
      : [];
    setPoLines(lines);

    setInitialFormSnapshot(
      JSON.stringify({
        supplierId: po.supplierId || '',
        deliveryDate: po.deliveryDate || '',
        isTaxOfficial: po.isTaxOfficial !== false,
        showPaymentTerms: po.showPaymentTerms !== false,
        notes: po.notes || '',
        lines: lines.map((l) => ({
          itemId: l.itemId || '',
          code: l.code || '',
          variantCode: l.variantCode || '',
          qty: Number(l.qty) || 0,
          unitPrice: l.unitPrice !== '' && l.unitPrice !== undefined ? Number(l.unitPrice) : '',
          currency: l.currency || 'EGP',
          specs: l.specs || '',
        })),
      })
    );

    setShowModal(true);
  };

  // Route B: Standard Edit Flow (+1.0 major version)
  const handleOpenStandardEdit = (po) => {
    setModalMode('edit_major');
    setEditingPo(po);
    setSelectedSupplierId(po.supplierId || '');
    setDeliveryDate(po.deliveryDate || '');
    setIsTaxOfficial(po.isTaxOfficial !== false);
    setShowPaymentTerms(po.showPaymentTerms !== false);
    setNotes(po.notes || '');
    setIsRequestingAdjustments(false);
    setAdjustmentComment('');
    setPoLines(
      po.lines
        ? po.lines.map((l) => ({
            ...l,
            initialMasterSpecs: l.specs || '',
            isSpecsModified: false,
            currency: l.currency || po.financials?.currency || 'EGP',
          }))
        : []
    );
    setShowModal(true);
  };

  // Approval Inspection Flow (Read-Only Mode)
  const handleOpenApprovalReview = (po) => {
    setModalMode('review_readonly');
    setEditingPo(po);
    setSelectedSupplierId(po.supplierId || '');
    setDeliveryDate(po.deliveryDate || '');
    setIsTaxOfficial(po.isTaxOfficial !== false);
    setShowPaymentTerms(po.showPaymentTerms !== false);
    setNotes(po.notes || '');
    setIsRequestingAdjustments(false);
    setAdjustmentComment('');
    setPoLines(
      po.lines
        ? po.lines.map((l) => ({
            ...l,
            initialMasterSpecs: l.specs || '',
            isSpecsModified: false,
            currency: l.currency || po.financials?.currency || 'EGP',
          }))
        : []
    );
    setShowModal(true);
  };

  // Permission Checks
  const canEditPo = (po) => {
    if (po.status === 'delivered' || po.status === 'cancelled') return false;
    if (po.status === 'draft' || po.status === 'pending' || po.status === 'pending_adjustments') return true;
    if (po.status === 'approved' || po.status === 'partially_delivered') {
      if (isGeneralAdmin) return true;
      if (po.approvedBy && (po.approvedBy === currentUser.name || po.approvedBy === currentUser.nameAr)) return true;
      return false;
    }
    return false;
  };

  const canCancelPo = (po) => {
    if (po.status === 'delivered' || po.status === 'cancelled') return false;
    return isPurchasingAdmin || isGeneralAdmin || (po.status === 'draft' && po.createdBy === currentUserName);
  };

  // Save / Approve / Adjust PO Handler
  const handleSavePo = async (targetStatus = 'draft', customLineOverrides = null) => {
    if (modalMode !== 'review_readonly') {
      if (!selectedSupplierId) {
        alert(isAr ? 'يرجى اختيار المورد' : 'Please select a supplier');
        return;
      }
      if (!deliveryDate) {
        alert(isAr ? 'يرجى تحديد تاريخ التوريد المتوقع' : 'Please select delivery date');
        return;
      }
      if (poLines.some((l) => !l.itemId || !l.qty || l.qty <= 0)) {
        alert(isAr ? 'يرجى استكمال بيانات جميع بنود الخامات والكميات' : 'Please complete all item lines and quantities');
        return;
      }

      if (isGeneralAdmin && !customLineOverrides) {
        const modifiedLineIndex = poLines.findIndex((l) => l.isSpecsModified);
        if (modifiedLineIndex !== -1) {
          setSpecDecisionModal({
            lineIndex: modifiedLineIndex,
            targetStatus,
            line: poLines[modifiedLineIndex]
          });
          return;
        }
      }
    }

    setIsSavingPo(true);
    try {
      const isNew = !editingPo;
      const poId = editingPo ? editingPo.id : generatePoId();
      
      let currentVersion = editingPo?.version || '1.0';
      let nextVersion = currentVersion;

      if (isNew) {
        nextVersion = '1.0';
      } else if (modalMode === 'adjust_minor') {
        nextVersion = getNextMinorVersion(currentVersion);
      } else if (modalMode === 'edit_major') {
        nextVersion = getNextMajorVersion(currentVersion);
      } else if (modalMode === 'review_readonly') {
        nextVersion = currentVersion;
      }

      let actionKey = isNew ? 'created' : 'modified';
      let actionNoteAr = isNew ? 'إنشاء أمر الشراء لأول مرة' : `تعديل وتحديث أمر الشراء (${formatVersionTag(nextVersion)})`;
      let actionNoteEn = isNew ? 'Initial PO Creation' : `PO Updated (${formatVersionTag(nextVersion)})`;

      if (targetStatus === 'approved') {
        actionKey = 'approved';
        actionNoteAr = `تم اعتماد أمر الشراء للتوريد (${formatVersionTag(nextVersion)})`;
        actionNoteEn = `PO Approved for Warehouse Delivery (${formatVersionTag(nextVersion)})`;
      } else if (targetStatus === 'pending_adjustments') {
        actionKey = 'adjustments_requested';
        actionNoteAr = `طلب تعديل من الإدارة (${currentUserName}): ${adjustmentComment}`;
        actionNoteEn = `Management (${currentUserName}) requested adjustments: ${adjustmentComment}`;
      } else if (modalMode === 'adjust_minor' && targetStatus === 'pending') {
        actionKey = 'adjustments_resubmitted';
        actionNoteAr = `تم تطبيق التعديلات المطلوبة وإعادة الإرسال للاعتماد (${formatVersionTag(nextVersion)})`;
        actionNoteEn = `Adjustments resolved and resubmitted for approval (${formatVersionTag(nextVersion)})`;
      }

      const existingAudit = editingPo?.auditTrail || [];
      const newAuditEntry = {
        version: nextVersion,
        action: actionKey,
        status: targetStatus,
        performedBy: currentUserName,
        timestamp: new Date().toISOString(),
        noteAr: actionNoteAr,
        noteEn: actionNoteEn,
      };

      const finalStatus = targetStatus === 'keep' ? (editingPo?.status || 'draft') : targetStatus;
      const linesToSave = customLineOverrides || poLines;

      const poPayload = {
        id: poId,
        supplierId: selectedSupplierId || '',
        supplierName: selectedSupplier?.name || editingPo?.supplierName || '',
        supplierTaxNumber: selectedSupplier?.taxCardNumber || editingPo?.supplierTaxNumber || '',
        supplierAddress: selectedSupplier?.taxpayerAddress || editingPo?.supplierAddress || '',
        paymentTermsFormattedAr: formatPaymentTerms(selectedSupplier?.paymentTerms, 'ar'),
        paymentTermsFormattedEn: formatPaymentTerms(selectedSupplier?.paymentTerms, 'en'),
        showPaymentTerms: Boolean(showPaymentTerms),
        deliveryDate: deliveryDate || '',
        isTaxOfficial: Boolean(isTaxOfficial),
        notes: notes || '',
        latestAdjustmentComment: targetStatus === 'pending_adjustments' 
          ? (adjustmentComment || '') 
          : (targetStatus === 'approved' ? null : (editingPo?.latestAdjustmentComment || null)),
        adjustmentRequestedBy: targetStatus === 'pending_adjustments' 
          ? currentUserName 
          : (targetStatus === 'approved' ? null : (editingPo?.adjustmentRequestedBy || null)),
        adjustmentRequestedAt: targetStatus === 'pending_adjustments' 
          ? new Date().toISOString() 
          : (targetStatus === 'approved' ? null : (editingPo?.adjustmentRequestedAt || null)),
        lines: linesToSave.map((l) => ({
          itemId: l.itemId || '',
          code: l.code || '',
          variantCode: l.variantCode || '',
          nameAr: l.nameAr || '',
          nameEn: l.nameEn || '',
          specs: l.specs || '',
          smallUnit: l.smallUnit || '',
          qty: Number(l.qty) || 0,
          unitPrice: l.unitPrice !== '' && l.unitPrice !== undefined ? Number(l.unitPrice) : '',
          currency: l.currency || 'EGP',
          vatPercent: Number(l.vatPercent) || 0,
          whtPercent: Number(l.whtPercent) || 0,
        })),
        financials: computedTotals,
        status: finalStatus,
        version: nextVersion,
        revision: parseFloat(nextVersion) || 1.0,
        auditTrail: [...existingAudit, newAuditEntry],
        createdBy: editingPo?.createdBy || currentUserName,
        updatedAt: serverTimestamp(),
        approvedBy: (finalStatus === 'approved') ? (editingPo?.approvedBy || currentUserName) : (editingPo?.approvedBy || null),
        approvedAt: (finalStatus === 'approved') ? (editingPo?.approvedAt || new Date().toISOString()) : (editingPo?.approvedAt || null),
      };

      if (isNew) {
        poPayload.createdAt = serverTimestamp();
      }

      await setDoc(doc(db, 'purchase_orders', poId), poPayload, { merge: true });
      setShowModal(false);
      setSpecDecisionModal(null);
    } catch (error) {
      console.error('Error saving PO:', error);
      alert(isAr ? 'حدث خطأ أثناء حفظ أمر الشراء.' : 'Error saving Purchase Order.');
    } finally {
      setIsSavingPo(false);
    }
  };

  // General Admin Decision on Spec Modifications (Live Item Master Updates)
  const handleSpecDecision = async (decisionType) => {
    if (!specDecisionModal) return;
    const { lineIndex, targetStatus, line } = specDecisionModal;
    const updatedLines = [...poLines];
    const baseItem = itemsMaster.find((i) => i.code === line.itemId);

    try {
      if (decisionType === 'overwrite_master' && baseItem) {
        if (line.variantCode && Array.isArray(baseItem.variations) && baseItem.variations.length > 0) {
          const updatedVariations = baseItem.variations.map((v) => {
            if (v.variantCode === line.variantCode) {
              return {
                ...v,
                specs: [{ label: isAr ? 'المواصفات المعتمدة' : 'Approved Specs', value: line.specs }],
                mergedSpecs: line.specs,
              };
            }
            return v;
          });

          await setDoc(
            doc(db, 'items', baseItem.code),
            {
              variations: updatedVariations,
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );
        } else {
          await setDoc(
            doc(db, 'items', baseItem.code),
            {
              masterSpecs: [{ label: isAr ? 'المواصفات الرئيسية' : 'Master Specs', value: line.specs }],
              mergedSpecs: line.specs,
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );
        }
      } else if (decisionType === 'create_variation' && baseItem) {
        const existingVariants = Array.isArray(baseItem.variations) ? baseItem.variations : [];
        const nextSuffix = String.fromCharCode(65 + existingVariants.length);
        const newVariantCode = `${baseItem.code}-${nextSuffix}`;

        const newVariantObj = {
          suffix: nextSuffix,
          variantCode: newVariantCode,
          supplierId: selectedSupplierId || '',
          supplierName: selectedSupplier?.name || '',
          packagingRatio: 100,
          smallUnit: line.smallUnit || baseItem.smallUnit || '',
          largeUnitName: baseItem.largeUnitName || '',
          specs: [{ label: isAr ? 'مواصفة مخصصة' : 'Custom Spec', value: line.specs }],
          mergedSpecs: line.specs,
          stock: 0,
          isActive: true,
        };

        await setDoc(
          doc(db, 'items', baseItem.code),
          {
            variations: [...existingVariants, newVariantObj],
            variationsCount: existingVariants.length + 1,
            status: 'active',
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );

        updatedLines[lineIndex].code = newVariantCode;
        updatedLines[lineIndex].variantCode = newVariantCode;
      }

      setPoLines(updatedLines);
      setSpecDecisionModal(null);
      await handleSavePo(targetStatus, updatedLines);
    } catch (err) {
      console.error('Error applying spec decision:', err);
      alert(isAr ? 'حدث خطأ أثناء تطبيق تعديل المواصفات.' : 'Error applying spec override.');
    }
  };

  // Soft Deletion
  const handleCancelPo = async (po) => {
    if (!canCancelPo(po)) {
      alert(isAr ? 'لا يمكن إلغاء أمر الشراء في حالته الحالية.' : 'Cannot cancel this PO.');
      return;
    }
    const confirmMsg = isAr 
      ? `هل أنت متأكد من إلغاء أمر الشراء (${po.id})؟ سيتم تغيير حالته إلى "ملغي" ولن يتم توريده.` 
      : `Are you sure you want to cancel PO (${po.id})?`;

    if (window.confirm(confirmMsg)) {
      setIsSavingPo(true);
      try {
        const currentAudit = po.auditTrail || [];
        const cancelEntry = {
          version: po.version || '1.0',
          action: 'cancelled',
          status: 'cancelled',
          performedBy: currentUserName,
          timestamp: new Date().toISOString(),
          noteAr: 'تم إلغاء أمر الشراء (Soft Cancel)',
          noteEn: 'PO Cancelled (Soft Cancel)',
        };

        await setDoc(
          doc(db, 'purchase_orders', po.id),
          {
            status: 'cancelled',
            cancelledBy: currentUserName,
            cancelledAt: new Date().toISOString(),
            auditTrail: [...currentAudit, cancelEntry],
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      } catch (error) {
        console.error('Error cancelling PO:', error);
      } finally {
        setIsSavingPo(false);
      }
    }
  };

  // Hard Deletion
  const handleHardDeletePo = async (poId) => {
    if (!isGeneralAdmin) {
      alert(isAr ? 'الحذف النهائي متاح فقط للمسؤول العام (General Admin).' : 'Permanent deletion requires General Admin authority.');
      return;
    }

    const confirmMsg = isAr 
      ? `⚠️ تحذير: هل أنت متأكد من الحذف النهائي لأمر الشراء (${poId}) من قاعدة البيانات السحابية؟ لا يمكن التراجع عن هذا الإجراء.` 
      : `⚠️ Warning: Permanently delete PO (${poId}) from the cloud database?`;

    if (window.confirm(confirmMsg)) {
      try {
        await deleteDoc(doc(db, 'purchase_orders', poId));
      } catch (error) {
        console.error('Error deleting PO:', error);
      }
    }
  };

  // Trigger Print
  const handleTriggerPrint = async (po) => {
    const printTimestamp = new Date().toISOString();
    try {
      await setDoc(
        doc(db, 'purchase_orders', po.id),
        {
          lastPrintedAt: printTimestamp,
          lastPrintedBy: currentUserName,
          lastPrintedVersion: po.version || '1.0',
          printCount: (po.printCount || 0) + 1,
        },
        { merge: true }
      );
    } catch (e) {
      console.error('Error updating print timestamp:', e);
    }
    window.print();
  };

  // Status Badge Helper
  const renderStatusBadge = (po) => {
    const status = po.status;

    switch (status) {
      case 'draft':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-300">
            <Clock className="h-3 w-3" />
            {isAr ? 'مسودة' : 'Draft'}
          </span>
        );
      case 'pending':
        return (
          <button
            onClick={() => handleOpenApprovalReview(po)}
            className="relative inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-xs font-bold bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 shadow-xs cursor-pointer transition"
            title={isAr ? 'انقر لمعاينة ومراجعة أمر الشراء للاعتماد' : 'Click to review & inspect for approval'}
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
            </span>
            <span>{isAr ? 'معلق للاعتماد' : 'Pending Approval'}</span>
          </button>
        );
      case 'pending_adjustments':
        return (
          <button
            onClick={() => handleOpenAdjustmentRoute(po)}
            className="relative inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-xs font-bold bg-rose-50 hover:bg-rose-100 text-rose-900 border border-rose-300 shadow-xs cursor-pointer transition"
            title={isAr ? 'انقر لعرض ملاحظات الإدارة وتطبيق التعديل (+0.1)' : 'Click to view required adjustments (+0.1)'}
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
            </span>
            <span>{isAr ? 'مطلوب تعديلات' : 'Adjustments Required'}</span>
          </button>
        );
      case 'approved':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-300">
            <CheckCircle2 className="h-3 w-3 text-emerald-600" />
            {isAr ? 'معتمد للتوريد' : 'Approved'}
          </span>
        );
      case 'partially_delivered':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-800 border border-blue-300">
            <Truck className="h-3 w-3 text-blue-600" />
            {isAr ? 'مستلم جزئياً' : 'Partially Delivered'}
          </span>
        );
      case 'delivered':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-50 text-purple-800 border border-purple-300">
            <CheckCircle2 className="h-3 w-3 text-purple-600" />
            {isAr ? 'تم التوريد بالكامل' : 'Delivered'}
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-50 text-red-700 border border-red-200">
            <Ban className="h-3 w-3 text-red-500" />
            {isAr ? 'ملغي' : 'Cancelled'}
          </span>
        );
      default:
        return null;
    }
  };

  const filteredOrders = orders.filter((po) => {
    const matchSearch =
      po.id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      po.supplierName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      po.lines?.some((l) => l.nameAr?.includes(searchTerm) || l.code?.toLowerCase().includes(searchTerm.toLowerCase()));

    if (statusFilter === 'all') return matchSearch;
    return matchSearch && po.status === statusFilter;
  });

  const isReadOnly = modalMode === 'review_readonly';

  return (
    <div>
      {/* Full-Screen Loading Feedback for PO operations */}
      {isSavingPo && (
        <PeacockLoader
          fullScreen
          size="xl"
          text={isAr ? 'جاري معالجة وحفظ أمر الشراء سحابياً...' : 'Processing and Saving Purchase Order...'}
        />
      )}

      {/* Dynamic Scoped Print CSS Styles for Ink-Friendly Printout */}
      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          @page {
            size: A4 portrait;
            margin: 12mm 15mm;
          }
          body * {
            visibility: hidden !important;
          }
          #printable-po-document, #printable-po-document * {
            visibility: visible !important;
          }
          #printable-po-document {
            position: fixed !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
            box-shadow: none !important;
            border: none !important;
            z-index: 9999999 !important;
          }
          .no-print-area {
            display: none !important;
          }
        }
      `}} />

      {/* Top Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div className="flex flex-1 items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400 h-4 w-4" />
            <input
              type="text"
              placeholder={isAr ? 'بحث برقم أمر الشراء، المورد، أو الخامة...' : 'Search PO ID, supplier, or material...'}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full ps-10 pe-4 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="p-2 border border-slate-300 rounded-lg text-xs bg-white text-slate-700 font-medium"
          >
            <option value="all">{isAr ? 'جميع الحالات' : 'All Statuses'}</option>
            <option value="draft">{isAr ? 'مسودة' : 'Draft'}</option>
            <option value="pending">{isAr ? 'معلق للاعتماد' : 'Pending Approval'}</option>
            <option value="pending_adjustments">{isAr ? 'مطلوب تعديلات' : 'Adjustments Required'}</option>
            <option value="approved">{isAr ? 'معتمد للتوريد' : 'Approved'}</option>
            <option value="partially_delivered">{isAr ? 'مستلم جزئياً' : 'Partially Delivered'}</option>
            <option value="delivered">{isAr ? 'تم التوريد' : 'Delivered'}</option>
            <option value="cancelled">{isAr ? 'ملغي' : 'Cancelled'}</option>
          </select>
        </div>

        <button
          onClick={handleOpenCreate}
          className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-bold transition cursor-pointer shadow-xs"
        >
          <Plus className="h-4 w-4" />
          <span>{isAr ? 'إنشاء أمر شراء جديد (PO)' : 'Create Purchase Order'}</span>
        </button>
      </div>

      {/* Orders Table */}
      <div className="overflow-x-auto border border-slate-200 rounded-xl shadow-xs bg-white">
        <table className="w-full text-start border-collapse text-sm">
          <thead>
            <tr className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200 text-xs">
              <th className="p-3 text-start">{isAr ? 'رقم أمر الشراء والإصدار' : 'PO ID & Version'}</th>
              <th className="p-3 text-start">{isAr ? 'المورد المعتمد' : 'Supplier'}</th>
              <th className="p-3 text-start">{isAr ? 'أصناف الخامات المطلوبة' : 'Order Lines (SKU & Qty)'}</th>
              <th className="p-3 text-start">{isAr ? 'تاريخ التوريد المستهدف' : 'Target Delivery'}</th>
              <th className="p-3 text-start">{isAr ? 'القيمة الإجمالية' : 'Total Net Payable'}</th>
              <th className="p-3 text-start">{isAr ? 'الحالة والطباعة' : 'Status & Print'}</th>
              <th className="p-3 text-center">{isAr ? 'إجراءات' : 'Actions'}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={7} className="p-12 text-center">
                  <PeacockLoader size="lg" text={isAr ? 'جاري تحميل أوامر الشراء...' : 'Loading Purchase Orders...'} />
                </td>
              </tr>
            ) : filteredOrders.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-slate-400 text-sm">
                  {isAr ? 'لا توجد أوامر شراء مطابقة للبحث.' : 'No purchase orders found.'}
                </td>
              </tr>
            ) : (
              filteredOrders.map((po) => {
                const isPriced = po.financials?.hasPricing;
                const isApproved = po.status === 'approved' || po.status === 'partially_delivered' || po.status === 'delivered';
                const canEdit = canEditPo(po);
                const canCancel = canCancelPo(po);

                return (
                  <tr key={po.id} className={`transition ${po.status === 'cancelled' ? 'bg-slate-50/60 opacity-75' : 'hover:bg-slate-50/70'}`}>
                    {/* PO ID & Version */}
                    <td className="p-3 align-top">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-xs font-bold text-slate-800 bg-slate-100 border border-slate-300 px-2.5 py-0.5 rounded">
                          {po.id}
                        </span>
                        <span className="text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.2 rounded font-mono">
                          {formatVersionTag(po.version)}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        <span>{po.createdBy || 'User'}</span>
                      </div>
                    </td>

                    {/* Supplier */}
                    <td className="p-3 align-top">
                      <div className="font-bold text-slate-900 flex items-center gap-1.5">
                        <Building2 className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        <span>{po.supplierName}</span>
                      </div>
                      <div className="text-xs text-slate-400 font-mono mt-0.5">{po.supplierId}</div>
                    </td>

                    {/* Order Lines */}
                    <td className="p-3 align-top text-xs space-y-1">
                      {po.lines?.map((line, idx) => (
                        <div key={idx} className="flex items-center gap-1.5 text-slate-700">
                          <span className="font-mono text-[10px] bg-slate-100 border border-slate-200 px-1 rounded font-semibold">
                            {line.code}
                          </span>
                          <span className="font-medium truncate max-w-[140px]" title={line.nameAr}>
                            {line.nameAr}
                          </span>
                          <span className="font-bold text-slate-900 font-mono">
                            {Number(line.qty).toLocaleString()} {line.smallUnit}
                          </span>
                        </div>
                      ))}
                    </td>

                    {/* Delivery Date */}
                    <td className="p-3 align-top text-xs">
                      <div className="flex items-center gap-1.5 text-slate-800 font-semibold">
                        <Calendar className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                        <span>{po.deliveryDate}</span>
                      </div>
                    </td>

                    {/* Net Financials with Sensitive Masking */}
                    <td className="p-3 align-top">
                      {!canViewTotals || !canViewPrices ? (
                        <span className="text-xs text-slate-400 font-mono italic">
                          {isAr ? 'محجوب (صلاحية مقيدة)' : 'Hidden (Restricted)'}
                        </span>
                      ) : isPriced ? (
                        <div>
                          <span className="font-mono font-bold text-slate-900 text-sm">
                            {po.financials.netPayable?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{' '}
                            <span className="text-xs font-semibold text-slate-600">{po.financials.currency || 'EGP'}</span>
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400 font-mono italic">
                          {isAr ? 'غير مسعر (كميات فقط)' : 'Unpriced (Quantities Only)'}
                        </span>
                      )}
                    </td>

                    {/* Status & Printed Chip */}
                    <td className="p-3 align-top space-y-1.5">
                      <div>{renderStatusBadge(po)}</div>
                      {po.lastPrintedAt && (
                        <div className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md" title={`Printed on: ${new Date(po.lastPrintedAt).toLocaleString()}`}>
                          <Printer className="h-2.5 w-2.5" />
                          <span>{isAr ? `طُبع ${formatVersionTag(po.lastPrintedVersion || po.version)}` : `Printed ${formatVersionTag(po.lastPrintedVersion || po.version)}`}</span>
                        </div>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="p-3 align-top text-center">
                      <div className="flex items-center justify-center gap-1">
                        {/* Inspection / Approval Review Icon */}
                        {po.status === 'pending' && (
                          <button
                            onClick={() => handleOpenApprovalReview(po)}
                            className="p-1.5 text-amber-600 hover:text-amber-800 hover:bg-amber-50 rounded-lg transition cursor-pointer"
                            title={isAr ? 'معاينة ومراجعة أمر الشراء للاعتماد' : 'Review & Approve PO'}
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                        )}

                        {/* Standard Edit Button */}
                        {canEdit ? (
                          <button
                            onClick={() => handleOpenStandardEdit(po)}
                            className="p-1.5 text-slate-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition cursor-pointer"
                            title={isAr ? 'تعديل شامل لأمر الشراء (+1.0)' : 'Standard Full Edit (+1.0)'}
                          >
                            <Edit3 className="h-4 w-4" />
                          </button>
                        ) : (
                          <button
                            disabled
                            className="p-1.5 text-slate-300 cursor-not-allowed"
                            title={isAr ? 'التعديل متاح للمسؤول العام أو معتمد الأمر فقط' : 'Edit restricted'}
                          >
                            <Lock className="h-4 w-4" />
                          </button>
                        )}

                        {/* Audit Trail Button */}
                        <button
                          onClick={() => setAuditPoData(po)}
                          className="p-1.5 text-slate-500 hover:text-purple-700 hover:bg-purple-50 rounded-lg transition cursor-pointer"
                          title={isAr ? 'سجل التعديلات والاعتمادات (Audit Trail)' : 'View Audit Trail'}
                        >
                          <History className="h-4 w-4" />
                        </button>

                        {/* Print Button */}
                        <button
                          disabled={!isApproved || po.status === 'cancelled'}
                          onClick={() => {
                            setPrintPoData(po);
                            setPrintLang('ar');
                          }}
                          className={`p-1.5 rounded-lg transition cursor-pointer ${
                            isApproved && po.status !== 'cancelled'
                              ? 'text-slate-600 hover:text-emerald-700 hover:bg-emerald-50'
                              : 'text-slate-300 cursor-not-allowed'
                          }`}
                          title={isApproved ? (isAr ? 'معاينة وطباعة أمر الشراء' : 'Print PO') : (isAr ? 'الطباعة متاحة بعد الاعتماد فقط' : 'Print locked until approval')}
                        >
                          <Printer className="h-4 w-4" />
                        </button>

                        {/* Soft Deletion */}
                        {canCancel && (
                          <button
                            onClick={() => handleCancelPo(po)}
                            className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition cursor-pointer"
                            title={isAr ? 'إلغاء أمر الشراء (Soft Delete)' : 'Cancel PO'}
                          >
                            <Ban className="h-4 w-4" />
                          </button>
                        )}

                        {/* Hard Deletion */}
                        {isGeneralAdmin && (
                          <button
                            onClick={() => handleHardDeletePo(po.id)}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition cursor-pointer"
                            title={isAr ? 'حذف نهائي من قاعدة البيانات (General Admin)' : 'Permanent Delete'}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* PO Creation / Edit / Inspection Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-4xl w-full p-6 shadow-xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            {/* Sticky Header */}
            <div className="sticky -top-6 -mt-6 pt-6 bg-white z-30 flex justify-between items-center pb-3 mb-4 border-b border-slate-100">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  {modalMode === 'create' && (isAr ? 'إنشاء أمر شراء معتمد (Purchase Order)' : 'Create Master Purchase Order')}
                  {modalMode === 'review_readonly' && (isAr ? `معاينة ومراجعة أمر الشراء (${editingPo?.id})` : `Review & Inspect PO (${editingPo?.id})`)}
                  {modalMode === 'adjust_minor' && (isAr ? `تطبيق التعديلات المطلوبة لأمر الشراء (${editingPo?.id})` : `Apply Requested Adjustments (${editingPo?.id})`)}
                  {modalMode === 'edit_major' && (isAr ? `تعديل أمر الشراء (${editingPo?.id})` : `Edit Purchase Order (${editingPo?.id})`)}
                </h3>
                <p className="text-xs text-slate-500">
                  {isReadOnly 
                    ? (isAr ? 'وضع المعاينة للقراءة فقط لضمان سلامة البيانات قبل الاعتماد' : 'Read-only inspection mode prior to approval') 
                    : (isAr ? 'تخصيص بنود الخامات، الكميات، الشروط الضريبية والمالية' : 'Specify supplier, multi-material lines, taxes, and schedule')}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold text-slate-700 bg-slate-100 border border-slate-300 px-3 py-1 rounded-md">
                  {editingPo 
                    ? `${editingPo.id} (${formatVersionTag(
                        modalMode === 'adjust_minor' 
                          ? getNextMinorVersion(editingPo.version) 
                          : modalMode === 'edit_major' 
                          ? getNextMajorVersion(editingPo.version) 
                          : editingPo.version
                      )})` 
                    : generatePoId()}
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

            {/* Management Adjustment Notice Banner */}
            {modalMode === 'adjust_minor' && (
              <div className="p-3.5 mb-4 bg-rose-50 border border-rose-200 rounded-xl space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-1 text-xs font-bold text-rose-950">
                  <div className="flex items-center gap-1.5">
                    <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
                    <span>{isAr ? 'ملاحظات وتوجيهات الإدارة للتعديل المطلوب:' : 'Management Requested Adjustments:'}</span>
                  </div>
                  <span className="text-[11px] font-semibold text-rose-800 bg-rose-100 px-2 py-0.5 rounded-md border border-rose-200">
                    {isAr
                      ? `بواسطة: ${editingPo?.adjustmentRequestedBy || editingPo?.auditTrail?.filter(a => a.action === 'adjustments_requested').slice(-1)[0]?.performedBy || 'مدير المشتريات'}`
                      : `By: ${editingPo?.adjustmentRequestedBy || editingPo?.auditTrail?.filter(a => a.action === 'adjustments_requested').slice(-1)[0]?.performedBy || 'Purchasing Manager'}`}
                  </span>
                </div>
                {editingPo?.latestAdjustmentComment && (
                  <p className="text-xs text-rose-900 ps-5 font-medium whitespace-pre-line bg-white/80 p-2.5 rounded-lg border border-rose-200 shadow-2xs">
                    {editingPo.latestAdjustmentComment}
                  </p>
                )}
                <div className="text-[11px] text-rose-700 ps-5 font-medium flex items-center justify-between">
                  <span>
                    {isAr 
                      ? '💡 يجب تطبيق تعديل واحد على الأقل (كمية / سعر / تاريخ / بنود) لتفعيل زر إعادة الإرسال (+0.1).' 
                      : '💡 Apply at least one edit (qty, price, date, lines) to enable resubmission (+0.1).'}
                  </span>
                  {!hasFormChanges && (
                    <span className="text-[10px] text-rose-700 font-bold bg-rose-100 px-1.5 py-0.5 rounded">
                      {isAr ? 'في انتظار تعديلك' : 'Pending your edits'}
                    </span>
                  )}
                </div>
              </div>
            )}

            <div className="space-y-5">
              {/* Section 1: Header Parameters */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {isAr ? 'المورد المعتمد *' : 'Approved Supplier *'}
                  </label>
                  <SearchableSelect
                      disabled={isReadOnly}
                      value={selectedSupplierId}
                      onChange={handleSupplierChange}
                      options={suppliersMaster.map((s) => ({ value: s.id, label: s.name, sublabel: s.id }))}
                      placeholder={isAr ? '-- اختر المورد المعتمد --' : '-- Select Supplier --'}
                      isAr={isAr}
                      required
                    />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {isAr ? 'تاريخ التوريد المستهدف *' : 'Target Delivery Date *'}
                  </label>
                  <input
                    type="date"
                    required
                    disabled={isReadOnly}
                    value={deliveryDate}
                    onChange={(e) => setDeliveryDate(e.target.value)}
                    className="w-full p-2 border border-slate-300 rounded-lg text-xs bg-white font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none disabled:bg-slate-100 disabled:text-slate-700"
                  />
                </div>

                {/* VAT Sliding Toggle */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {isAr ? 'معاملة ضريبية رسمية (ض.ق.م)' : 'Tax Invoice (VAT Registered)'}
                  </label>
                  <div className="flex items-center gap-3 p-1.5 bg-white border border-slate-300 rounded-lg">
                    <button
                      type="button"
                      disabled={isReadOnly}
                      onClick={() => !isReadOnly && setIsTaxOfficial(!isTaxOfficial)}
                      className={`relative inline-flex h-5 w-10 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        isTaxOfficial ? 'bg-emerald-600' : 'bg-slate-300'
                      } ${isReadOnly ? 'cursor-not-allowed opacity-80' : 'cursor-pointer'}`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                          isTaxOfficial ? (isAr ? '-translate-x-5' : 'translate-x-5') : 'translate-x-0'
                        }`}
                      />
                    </button>
                    <span className="text-xs font-semibold text-slate-700">
                      {isTaxOfficial ? (isAr ? 'فاتورة رسمية (14%)' : 'Official VAT (14%)') : (isAr ? 'بدون ضريبة' : 'No VAT')}
                    </span>
                  </div>
                </div>
              </div>

              {/* Payment Terms Toggle & Box */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <label className={`flex items-center gap-2 text-xs font-bold text-slate-800 ${isReadOnly ? 'cursor-default' : 'cursor-pointer'}`}>
                    <input
                      type="checkbox"
                      disabled={isReadOnly}
                      checked={showPaymentTerms}
                      onChange={(e) => setShowPaymentTerms(e.target.checked)}
                      className="h-4 w-4 rounded text-emerald-600 accent-emerald-600 cursor-pointer disabled:cursor-not-allowed"
                    />
                    <span>{isAr ? 'إدراج شروط السداد والائتمان في أمر الشراء' : 'Include Payment & Credit Terms in PO'}</span>
                  </label>
                  <CreditCard className="h-4 w-4 text-emerald-600" />
                </div>

                {showPaymentTerms && selectedSupplier && (
                  <div className="p-2.5 bg-white border border-emerald-200 rounded-lg text-xs text-slate-700">
                    <span className="font-semibold text-emerald-800 block mb-0.5">
                      {isAr ? 'شروط السداد المعتمدة للمورد:' : 'Approved Supplier Payment Terms:'}
                    </span>
                    <p className="font-medium text-slate-800">
                      {formatPaymentTerms(selectedSupplier.paymentTerms, isAr ? 'ar' : 'en')}
                    </p>
                  </div>
                )}
              </div>

              {/* Section 2: Multi-Item Order Lines */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <h4 className="text-xs font-bold text-emerald-800 uppercase tracking-wider flex items-center gap-1.5">
                    <Layers className="h-4 w-4 text-emerald-600" />
                    <span>{isAr ? 'بنود أمر الشراء والكميات والمواصفات' : 'Order Line Items, Quantities & Specs'}</span>
                  </h4>
                  {!isReadOnly && (
                    <button
                      type="button"
                      onClick={handleAddLine}
                      className="flex items-center gap-1 text-xs text-emerald-700 hover:text-emerald-800 font-semibold cursor-pointer"
                    >
                      <PlusCircle className="h-3.5 w-3.5" />
                      <span>{isAr ? 'إضافة بند آخر' : 'Add Item Line'}</span>
                    </button>
                  )}
                </div>

                <div className="space-y-3">
                  {!selectedSupplierId ? (
                    <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-center gap-2 font-medium">
                      <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
                      <span>
                        {isAr
                          ? 'يرجى اختيار المورد أولاً ليتم عرض الخامات والتنوعات المرتبطة به.'
                          : 'Please select a supplier first to load linked materials and variations.'}
                      </span>
                    </div>
                  ) : availableItemsForSupplier.length === 0 ? (
                    <div className="p-4 bg-slate-100 border border-slate-200 rounded-xl text-xs text-slate-600 flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 text-slate-400 shrink-0" />
                      <span>
                        {isAr
                          ? 'لا توجد خامات مسجلة مرتبطة بهذا المورد في سجل الخامات.'
                          : 'No materials linked to this supplier in Item Master.'}
                      </span>
                    </div>
                  ) : (
                    poLines.map((line, index) => {
                      const selectedItem = itemsMaster.find((i) => i.code === line.itemId);
                      const supplierVariants = selectedItem
                        ? (selectedItem.variations || []).filter((v) => v.supplierId === selectedSupplierId)
                        : [];

                      return (
                        <div key={index} className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-3 relative shadow-2xs">
                          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center text-xs">
                            {/* Material Item Select (Filtered by Selected Supplier) */}
                            <div className="sm:col-span-3">
                              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                                {isAr ? 'الخامة المطلوبة *' : 'Material Item *'}
                              </label>
                              <SearchableSelect
                              disabled={isReadOnly || !selectedSupplierId}
                              value={line.itemId}
                              onChange={(val) => handleItemSelect(index, val)}
                              options={availableItemsForSupplier.map((item) => ({
                                value: item.code,
                                label: item.nameAr,
                                sublabel: item.code,
                              }))}
                              placeholder={isAr ? '-- اختر الخامة --' : '-- Select Material --'}
                              isAr={isAr}
                              required
                            />
                            </div>

                            {/* Optional Variation Selector for Selected Supplier */}
                            <div className="sm:col-span-3">
                              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                                {isAr ? 'تنوع الخامة (اختياري)' : 'Variation (Optional)'}
                              </label>
                              <select
                                disabled={isReadOnly || !line.itemId || supplierVariants.length === 0}
                                value={line.variantCode || ''}
                                onChange={(e) => handleVariantSelect(index, e.target.value)}
                                className="w-full p-2 border border-slate-300 rounded-lg bg-white font-medium disabled:bg-slate-100 disabled:text-slate-400 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                              >
                                <option value="">
                                  {isAr ? '-- عام (المواصفات الأساسية للخامة) --' : '-- Generic (Master Specs) --'}
                                </option>
                                {supplierVariants.map((v) => (
                                  <option key={v.variantCode} value={v.variantCode}>
                                    [{v.variantCode}] {isAr ? `تنوع (${v.suffix})` : `Var (${v.suffix})`} • {isAr ? 'شدة:' : 'Pack:'} {v.packagingRatio}
                                  </option>
                                ))}
                              </select>
                            </div>

                            {/* Quantity (Step 1000) */}
                            <div className="sm:col-span-2">
                              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                                {isAr ? `الكمية (${line.smallUnit || 'الوحدة'}) *` : `Qty (${line.smallUnit || 'Unit'}) *`}
                              </label>
                              <input
                                type="number"
                                step="1000"
                                min="1"
                                disabled={isReadOnly}
                                value={line.qty}
                                onChange={(e) => handleLineChange(index, 'qty', e.target.value)}
                                className="w-full p-2 border border-slate-300 rounded-lg bg-white font-mono font-bold text-center disabled:bg-slate-100 disabled:text-slate-800"
                              />
                            </div>

                            {/* Price & Currency */}
                            <div className="sm:col-span-3">
                              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                                {isAr ? 'سعر الوحدة والعملة' : 'Unit Price & Currency'}
                              </label>
                              <div className="flex items-center gap-1">
                                <input
                                  type="number"
                                  step="0.01"
                                  disabled={isReadOnly}
                                  placeholder="0.00"
                                  value={line.unitPrice}
                                  onChange={(e) => handleLineChange(index, 'unitPrice', e.target.value)}
                                  className="w-full p-2 border border-slate-300 rounded-lg bg-white font-mono text-center disabled:bg-slate-100 disabled:text-slate-800"
                                />
                                <select
                                  disabled={isReadOnly}
                                  value={line.currency || 'EGP'}
                                  onChange={(e) => handleLineChange(index, 'currency', e.target.value)}
                                  className="p-2 border border-slate-300 rounded-lg bg-white font-semibold text-xs text-slate-800 disabled:bg-slate-100 disabled:text-slate-800"
                                >
                                  <option value="EGP">EGP</option>
                                  <option value="USD">USD</option>
                                  <option value="EUR">EUR</option>
                                </select>
                              </div>
                            </div>

                            {/* Remove Line Button */}
                            {!isReadOnly && (
                              <div className="sm:col-span-1 text-center pt-4">
                                {poLines.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveLine(index)}
                                    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition cursor-pointer"
                                    title={isAr ? 'حذف البند' : 'Remove Line'}
                                  >
                                    <XCircle className="h-4 w-4" />
                                  </button>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Technical Specifications Card */}
                          <div className="p-2.5 bg-white border border-slate-200 rounded-lg text-xs">
                            <div className="flex justify-between items-center mb-1">
                              <span className="font-semibold text-slate-700 flex items-center gap-1">
                                <SlidersHorizontal className="h-3 w-3 text-emerald-600" />
                                <span>{isAr ? 'المواصفات الفنية المعتمدة للمصنع:' : 'Technical Specifications:'}</span>
                              </span>
                              {!isReadOnly && isGeneralAdmin && (
                                <span className="text-[10px] text-amber-700 font-bold bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200">
                                  {isAr ? 'صلاحية تعديل المواصفات (General Admin)' : 'Editable by General Admin'}
                                </span>
                              )}
                            </div>

                            {!isReadOnly && isGeneralAdmin ? (
                              <input
                                type="text"
                                value={line.specs}
                                onChange={(e) => handleLineChange(index, 'specs', e.target.value)}
                                placeholder={isAr ? 'أدخل المواصفات الفنية...' : 'Enter technical specifications...'}
                                className="w-full p-2 border border-amber-300 rounded bg-amber-50/30 text-xs font-medium text-slate-800"
                              />
                            ) : (
                              <p className="text-slate-600 font-medium whitespace-pre-line">
                                {line.specs || <span className="text-slate-400 italic">{isAr ? 'لا توجد مواصفات مدخلة' : 'No specifications entered'}</span>}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Section 3: Financial Summary Box */}
              {computedTotals.hasPricing && (
                <div className="p-3.5 bg-emerald-50/60 border border-emerald-200 rounded-xl space-y-2 text-xs">
                  <div className="font-bold text-emerald-950 flex items-center gap-1.5">
                    <Receipt className="h-4 w-4 text-emerald-700" />
                    <span>{isAr ? 'الملخص المالي والضريبي لأمر الشراء' : 'Financial & Tax Breakdown'}</span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                    <div>
                      <span className="text-slate-500 block">{isAr ? 'المجموع قبل الضريبة:' : 'Subtotal:'}</span>
                      <span className="font-mono font-bold text-slate-800 text-sm">
                        {computedTotals.subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })} {computedTotals.currency}
                      </span>
                    </div>

                    <div>
                      <span className="text-slate-500 block">{isAr ? 'ضريبة القيمة المضافة:' : 'Total VAT:'}</span>
                      <span className="font-mono font-bold text-slate-800 text-sm">
                        {computedTotals.totalVat.toLocaleString(undefined, { minimumFractionDigits: 2 })} {computedTotals.currency}
                      </span>
                    </div>

                    <div>
                      <span className="text-slate-500 block">{isAr ? 'ضريبة الخصم والإضافة (WHT):' : 'Total WHT:'}</span>
                      <span className="font-mono font-bold text-slate-800 text-sm">
                        - {computedTotals.totalWht.toLocaleString(undefined, { minimumFractionDigits: 2 })} {computedTotals.currency}
                      </span>
                    </div>

                    <div>
                      <span className="text-emerald-900 font-bold block">{isAr ? 'صافي المبلغ المستحق:' : 'Net Payable:'}</span>
                      <span className="font-mono font-bold text-emerald-800 text-base">
                        {computedTotals.netPayable.toLocaleString(undefined, { minimumFractionDigits: 2 })} {computedTotals.currency}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Section 4: Notes */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {isAr ? 'ملاحظات وشروط التوريد الفنية' : 'Technical Delivery Notes & Remarks'}
                </label>
                <textarea
                  rows={2}
                  disabled={isReadOnly}
                  placeholder={isAr ? 'اكتب أي ملاحظات موجهة للمورد أو مسؤولي الاستلام...' : 'Enter any specific delivery remarks...'}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full p-2.5 border border-slate-300 rounded-lg text-xs bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none disabled:bg-slate-100 disabled:text-slate-700"
                />
              </div>

              {/* In-Modal Review Action: Request Adjustments Comment Input */}
              {isRequestingAdjustments && (
                <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl space-y-2">
                  <label className="block text-xs font-bold text-rose-900">
                    {isAr ? 'ملاحظات التعديل المطلوبة من منشئ أمر الشراء *' : 'Specify Required Adjustments for Creator *'}
                  </label>
                  <textarea
                    rows={2}
                    required
                    placeholder={isAr ? 'اكتب بالتفصيل التعديلات المطلوبة (مثال: تقليل الكمية إلى 8000 والتأكد من شروط السداد)...' : 'Describe the required changes...'}
                    value={adjustmentComment}
                    onChange={(e) => setAdjustmentComment(e.target.value)}
                    className="w-full p-2 border border-rose-300 rounded-lg text-xs bg-white focus:ring-2 focus:ring-rose-500 focus:outline-none"
                  />
                </div>
              )}

              {/* Modal Actions Bar */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-sm text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  {isAr ? 'إغلاق' : 'Close'}
                </button>

                <div className="flex items-center gap-2">
                  {modalMode === 'review_readonly' && isPurchasingAdmin ? (
                    <>
                      {!isRequestingAdjustments ? (
                        <>
                          <button
                            type="button"
                            onClick={() => setIsRequestingAdjustments(true)}
                            className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-sm font-bold cursor-pointer shadow-xs"
                          >
                            {isAr ? 'طلب تعديلات' : 'Request Adjustments'}
                          </button>

                          <button
                            type="button"
                            onClick={() => handleSavePo('approved')}
                            className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-bold cursor-pointer shadow-xs flex items-center gap-1.5"
                          >
                            <CheckCircle2 className="h-4 w-4" />
                            <span>{isAr ? 'اعتماد أمر الشراء للتوريد' : 'Approve PO'}</span>
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => setIsRequestingAdjustments(false)}
                            className="px-3 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-600"
                          >
                            {isAr ? 'تراجع' : 'Back'}
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              if (!adjustmentComment.trim()) {
                                alert(isAr ? 'يرجى كتابة ملاحظات التعديل المطلوبة.' : 'Please enter adjustment notes.');
                                return;
                              }
                              handleSavePo('pending_adjustments');
                            }}
                            className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-sm font-bold cursor-pointer"
                          >
                            {isAr ? 'إرسال طلب التعديل' : 'Send Adjustment Request'}
                          </button>
                        </>
                      )}
                    </>
                  ) : modalMode === 'adjust_minor' ? (
                    <button
                      type="button"
                      disabled={!hasFormChanges}
                      onClick={() => handleSavePo('pending')}
                      className={`px-5 py-2 rounded-lg text-sm font-bold shadow-xs flex items-center gap-1.5 transition ${
                        hasFormChanges
                          ? 'bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer'
                          : 'bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-300'
                      }`}
                      title={!hasFormChanges ? (isAr ? 'يرجى تطبيق تعديل واحد على الأقل قبل إعادة الإرسال' : 'Make at least one edit before resubmitting') : ''}
                    >
                      <Sparkles className="h-4 w-4" />
                      <span>{isAr ? `تطبيق التعديلات وإعادة الإرسال (${formatVersionTag(getNextMinorVersion(editingPo?.version))})` : `Resubmit Adjustments (${formatVersionTag(getNextMinorVersion(editingPo?.version))})`}</span>
                    </button>
                  ) : modalMode === 'edit_major' ? (
                    <button
                      type="button"
                      onClick={() => handleSavePo('keep')}
                      className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold cursor-pointer shadow-xs"
                    >
                      {isAr ? `حفظ التعديلات (${formatVersionTag(getNextMajorVersion(editingPo?.version))})` : `Save Changes (${formatVersionTag(getNextMajorVersion(editingPo?.version))})`}
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => handleSavePo('draft')}
                        className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-semibold cursor-pointer"
                      >
                        {isAr ? 'حفظ كمسودة' : 'Save as Draft'}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleSavePo('pending')}
                        className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-semibold cursor-pointer"
                      >
                        {isAr ? 'إرسال للاعتماد' : 'Submit for Approval'}
                      </button>

                      {isPurchasingAdmin && (
                        <button
                          type="button"
                          onClick={() => handleSavePo('approved')}
                          className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-bold cursor-pointer shadow-xs"
                        >
                          {isAr ? 'اعتماد مباشر للتوريد' : 'Direct Approve'}
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* General Admin Specs Decision Confirmation Dialog (High Z-Index Overlay) */}
      {specDecisionModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-[80] animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border-2 border-amber-300 space-y-4">
            <div className="flex items-center gap-2.5 text-amber-950 border-b border-amber-100 pb-3">
              <div className="p-2 bg-amber-100 rounded-xl text-amber-700">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold">
                  {isAr ? 'تأكيد نطاق تعديل المواصفات الفنية' : 'Confirm Technical Specs Scope'}
                </h3>
                <span className="text-[11px] text-amber-700 font-semibold">
                  {isAr ? 'صلاحية المسؤول العام (General Admin)' : 'General Admin Authority Action'}
                </span>
              </div>
            </div>

            <p className="text-xs text-slate-700 leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-200">
              {isAr
                ? `لقد قمت بتعديل المواصفات الفنية للخامة (${specDecisionModal.line.nameAr || specDecisionModal.line.code}). يرجى تحديد أثر هذا التعديل:`
                : `You modified technical specs for (${specDecisionModal.line.nameAr || specDecisionModal.line.code}). Please select the scope of this change:`}
            </p>

            <div className="space-y-2.5 text-xs">
              <button
                type="button"
                onClick={() => handleSpecDecision('this_po_only')}
                className="w-full p-3.5 text-start bg-slate-50 hover:bg-slate-100 border border-slate-300 rounded-xl transition cursor-pointer group"
              >
                <div className="font-bold text-slate-900 group-hover:text-emerald-700">
                  {isAr ? '١- لهذا الأمر فقط (This PO Only)' : '1. For this PO only'}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  {isAr ? 'تطبيق المواصفات على أمر الشراء الحالي فقط دون المساس بسجل الخامة الرئيسي.' : 'Apply override only to this PO without altering Item Master.'}
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleSpecDecision('overwrite_master')}
                className="w-full p-3.5 text-start bg-blue-50/70 hover:bg-blue-100/80 border border-blue-300 rounded-xl transition cursor-pointer group"
              >
                <div className="font-bold text-blue-950 group-hover:text-blue-800">
                  {isAr ? '٢- تحديث ومطابقة سجل الخامة الرئيسي (Overwrite Master)' : '2. Overwrite Master Specs'}
                </div>
                <div className="text-[11px] text-blue-800 mt-0.5">
                  {isAr ? 'تحديث المواصفات الفنية في قاعدة البيانات الرئيسية ليتم اعتمادها لجميع الأوامر المستقبلية.' : 'Update Item Master catalog so all future POs inherit these new specs.'}
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleSpecDecision('create_variation')}
                className="w-full p-3.5 text-start bg-emerald-50/70 hover:bg-emerald-100/80 border border-emerald-300 rounded-xl transition cursor-pointer group"
              >
                <div className="font-bold text-emerald-950 group-hover:text-emerald-800">
                  {isAr ? '٣- إنشاء تنوع جديد للخامة وربطه بالمورد (New Variation)' : '3. Create New Material Variation'}
                </div>
                <div className="text-[11px] text-emerald-800 mt-0.5">
                  {isAr ? 'توليد كود تنوع فرعي جديد تلقائياً في سجل الخامات بالمواصفات الجديدة وربطه بهذا المورد.' : 'Auto-generate a new SKU suffix in Item Master linked to this supplier.'}
                </div>
              </button>
            </div>

            <div className="pt-2 text-end border-t border-slate-100">
              <button
                type="button"
                onClick={() => setSpecDecisionModal(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                {isAr ? 'إلغاء التراجع' : 'Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Localized Audit Trail & History Modal */}
      {auditPoData && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex justify-between items-center pb-3 mb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <History className="h-5 w-5 text-purple-600" />
                <h3 className="text-base font-bold text-slate-900">
                  {isAr ? `سجل التعديلات والاعتمادات (${auditPoData.id})` : `Audit Trail History (${auditPoData.id})`}
                </h3>
              </div>
              <button onClick={() => setAuditPoData(null)} className="p-1 text-slate-400 hover:text-slate-700">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 max-h-96 overflow-y-auto pe-1 text-xs">
              {auditPoData.auditTrail?.map((entry, idx) => (
                <div key={idx} className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-slate-800 font-mono">
                      {formatVersionTag(entry.version || entry.revision)}
                    </span>
                    <span className="text-[11px] text-slate-400 font-mono">
                      {new Date(entry.timestamp).toLocaleString(isAr ? 'ar-EG' : 'en-US')}
                    </span>
                  </div>
                  <div className="text-slate-600">
                    <span className="font-semibold text-slate-700">{entry.performedBy}</span>:{' '}
                    <span>{isAr ? (entry.noteAr || entry.note) : (entry.noteEn || entry.note)}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-4 border-t border-slate-100 text-end">
              <button
                onClick={() => setAuditPoData(null)}
                className="px-4 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold"
              >
                {isAr ? 'إغلاق' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ink-Friendly Clean Printable PO Modal */}
      {printPoData && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-3xl w-full p-8 shadow-2xl border border-slate-200 max-h-[95vh] overflow-y-auto">
            {/* Print Controls */}
            <div className="flex justify-between items-center pb-4 mb-6 border-b border-slate-200 no-print-area">
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                  <Printer className="h-4 w-4 text-emerald-600" />
                  <span>{isAr ? 'معاينة أمر الشراء للطباعة' : 'Purchase Order Print Preview'}</span>
                </span>

                <button
                  onClick={() => setPrintLang(printLang === 'ar' ? 'en' : 'ar')}
                  className="flex items-center gap-1.5 px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition cursor-pointer border border-slate-200"
                >
                  <Globe className="h-3.5 w-3.5 text-emerald-600" />
                  <span>{printLang === 'ar' ? 'English Version' : 'النسخة العربية'}</span>
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleTriggerPrint(printPoData)}
                  className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold cursor-pointer shadow-xs"
                >
                  <Printer className="h-3.5 w-3.5" />
                  <span>{printLang === 'ar' ? 'طباعة / حفظ PDF' : 'Print / Save PDF'}</span>
                </button>
                <button
                  onClick={() => setPrintPoData(null)}
                  className="p-2 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Document Body */}
            <div id="printable-po-document" dir={printLang === 'ar' ? 'rtl' : 'ltr'} className="space-y-5 text-slate-900 bg-white p-6 md:p-8">
              {/* Document Letterhead */}
              <div className="flex justify-between items-start border-b-2 border-slate-900 pb-3">
                <div className="flex items-center gap-4">
                  <img
                    src="/logo.svg"
                    alt="Al Tawoos Logo"
                    className="h-14 w-auto max-w-[180px] object-contain"
                  />
                  <div>
                    <h1 className="text-base font-extrabold tracking-wide text-slate-900 leading-tight">
                      {printLang === 'ar' ? 'شركة الطاووس لتعبئة و تجارة المواد الغذائية' : 'Al Tawoos for packing and trading food goods'}
                    </h1>
                    <p className="text-[11px] text-slate-600 mt-0.5">
                      {printLang === 'ar' ? 'المنطقة الصناعية، السادس من أكتوبر، الجيزة، مصر' : '6th of October Industrial Zone, Giza, Egypt'}
                    </p>
                  </div>
                </div>
                <div className="text-end">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-600 block">
                    {printLang === 'ar' ? 'أمر شراء معتمد' : 'OFFICIAL PURCHASE ORDER'}
                  </span>
                  <span className="text-base font-mono font-extrabold text-slate-900">{printPoData.id}</span>
                  <span className="text-[10px] font-bold text-slate-700 block font-mono">
                    {printLang === 'ar' ? `(الإصدار ${formatVersionTag(printPoData.version)})` : `(Revision ${formatVersionTag(printPoData.version)})`}
                  </span>
                  <span className="block text-[11px] text-slate-600 mt-0.5">
                    {printLang === 'ar' ? 'تاريخ الإصدار:' : 'Issue Date:'} {new Date().toLocaleDateString(printLang === 'ar' ? 'ar-EG' : 'en-US')}
                  </span>
                </div>
              </div>

              {/* Vendor & Delivery Metadata */}
              <div className="grid grid-cols-2 gap-4 p-3 bg-white rounded-lg border border-slate-300 text-xs">
                <div>
                  <span className="text-slate-500 font-semibold block mb-0.5">
                    {printLang === 'ar' ? 'بيانات المورد (Vendor):' : 'Vendor Information:'}
                  </span>
                  <span className="font-bold text-slate-900 text-sm block">{printPoData.supplierName}</span>
                  <span className="text-slate-700 block mt-0.5">
                    {printLang === 'ar' ? 'البطاقة الضريبية:' : 'Tax Card:'} {printPoData.supplierTaxNumber || '—'}
                  </span>
                  <span className="text-slate-700 block">
                    {printLang === 'ar' ? 'العنوان:' : 'Address:'} {printPoData.supplierAddress || '—'}
                  </span>
                </div>
                <div className="text-end space-y-1">
                  <div>
                    <span className="text-slate-500 font-semibold me-2">
                      {printLang === 'ar' ? 'تاريخ التوريد المستهدف:' : 'Target Delivery Date:'}
                    </span>
                    <span className="font-bold font-mono text-slate-900">{printPoData.deliveryDate}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 font-semibold me-2">
                      {printLang === 'ar' ? 'حالة الاعتماد:' : 'Status:'}
                    </span>
                    <span className="font-bold font-mono text-slate-900">APPROVED</span>
                  </div>
                </div>
              </div>

              {/* Ordered Items Table */}
              <table className="w-full border-collapse text-xs border border-slate-300">
                <thead>
                  <tr className="bg-slate-100 text-slate-900 font-bold border-b border-slate-300">
                    <th className="p-2.5 text-start border-e border-slate-300">{printLang === 'ar' ? 'م' : 'No.'}</th>
                    <th className="p-2.5 text-start border-e border-slate-300">{printLang === 'ar' ? 'الكود' : 'Code'}</th>
                    <th className="p-2.5 text-start border-e border-slate-300">{printLang === 'ar' ? 'اسم الخامة والمواصفات' : 'Material Description & Specs'}</th>
                    <th className="p-2.5 text-center border-e border-slate-300">{printLang === 'ar' ? 'الكمية المطلوبة' : 'Ordered Qty'}</th>
                    <th className="p-2.5 text-center border-e border-slate-300">{printLang === 'ar' ? 'الوحدة' : 'Unit'}</th>
                    {printPoData.financials?.hasPricing && (
                      <>
                        <th className="p-2.5 text-end border-e border-slate-300">{printLang === 'ar' ? 'سعر الوحدة' : 'Unit Price'}</th>
                        <th className="p-2.5 text-end">{printLang === 'ar' ? 'الإجمالي' : 'Total'}</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {printPoData.lines?.map((line, idx) => (
                    <tr key={idx}>
                      <td className="p-2.5 text-slate-600 font-mono border-e border-slate-200">{idx + 1}</td>
                      <td className="p-2.5 font-mono font-semibold text-slate-900 border-e border-slate-200">{line.code}</td>
                      <td className="p-2.5 border-e border-slate-200">
                        <div className="font-bold text-slate-900">{printLang === 'ar' ? line.nameAr : (line.nameEn || line.nameAr)}</div>
                        {line.specs && <div className="text-[11px] text-slate-600 mt-0.5">{line.specs}</div>}
                      </td>
                      <td className="p-2.5 text-center font-mono font-bold text-slate-900 text-sm border-e border-slate-200">
                        {Number(line.qty).toLocaleString()}
                      </td>
                      <td className="p-2.5 text-center text-slate-700 border-e border-slate-200">{line.smallUnit}</td>
                      {printPoData.financials?.hasPricing && (
                        <>
                          <td className="p-2.5 text-end font-mono border-e border-slate-200">
                            {Number(line.unitPrice).toFixed(2)} {line.currency || printPoData.financials.currency || 'EGP'}
                          </td>
                          <td className="p-2.5 text-end font-mono font-bold text-slate-900">
                            {(Number(line.qty) * Number(line.unitPrice)).toFixed(2)} {line.currency || printPoData.financials.currency || 'EGP'}
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Financial Breakdown */}
              {printPoData.financials?.hasPricing && (
                <div className="flex justify-end">
                  <div className="w-72 space-y-1.5 p-3 bg-white rounded-lg border border-slate-300 text-xs">
                    <div className="flex justify-between text-slate-700">
                      <span>{printLang === 'ar' ? 'إجمالي القيمة:' : 'Subtotal:'}</span>
                      <span className="font-mono font-bold">{printPoData.financials.subtotal.toFixed(2)} {printPoData.financials.currency || 'EGP'}</span>
                    </div>
                    {printPoData.isTaxOfficial && (
                      <div className="flex justify-between text-slate-700">
                        <span>{printLang === 'ar' ? 'ض.ق.م (14%):' : 'VAT (14%):'}</span>
                        <span className="font-mono font-bold">{printPoData.financials.totalVat.toFixed(2)} {printPoData.financials.currency || 'EGP'}</span>
                      </div>
                    )}
                    {printPoData.financials.totalWht > 0 && (
                      <div className="flex justify-between text-slate-700">
                        <span>{printLang === 'ar' ? 'خصم أ.ت.ص (WHT):' : 'WHT Deduction:'}</span>
                        <span className="font-mono font-bold">- {printPoData.financials.totalWht.toFixed(2)} {printPoData.financials.currency || 'EGP'}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-slate-900 font-extrabold border-t border-slate-300 pt-1.5 text-sm">
                      <span>{printLang === 'ar' ? 'صافي المستحق:' : 'Net Payable:'}</span>
                      <span className="font-mono">{printPoData.financials.netPayable.toFixed(2)} {printPoData.financials.currency || 'EGP'}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Payment & Credit Terms */}
              {printPoData.showPaymentTerms !== false && (
                <div className="p-3 bg-white rounded-lg border border-slate-300 text-xs">
                  <span className="font-bold text-slate-900 block mb-0.5">
                    {printLang === 'ar' ? 'شروط السداد والائتمان:' : 'Payment & Credit Terms:'}
                  </span>
                  <p className="text-slate-800">
                    {printLang === 'ar' 
                      ? (printPoData.paymentTermsFormattedAr || 'سداد نقدي عند الاستلام') 
                      : (printPoData.paymentTermsFormattedEn || 'Cash upon delivery')}
                  </p>
                </div>
              )}

              {/* Delivery Notes */}
              {printPoData.notes && (
                <div className="p-3 bg-white rounded-lg border border-slate-300 text-xs">
                  <span className="font-bold text-slate-900 block mb-0.5">
                    {printLang === 'ar' ? 'ملاحظات وشروط التوريد:' : 'Delivery Remarks & Notes:'}
                  </span>
                  <p className="text-slate-800 whitespace-pre-line">{printPoData.notes}</p>
                </div>
              )}

              {/* Signatures */}
              <div className="grid grid-cols-2 gap-8 pt-6 border-t border-slate-300 text-xs text-center">
                <div>
                  <span className="text-slate-500 block mb-1">
                    {printLang === 'ar' ? 'إعداد مسؤول المشتريات' : 'Prepared By'}
                  </span>
                  <span className="font-bold text-slate-900 block text-sm">{printPoData.createdBy || 'مسؤول المشتريات'}</span>
                </div>
                <div>
                  <span className="text-slate-500 block mb-1">
                    {printLang === 'ar' ? 'اعتماد مدير المشتريات / الإدارة' : 'Approved By (Purchasing / Management)'}
                  </span>
                  <span className="font-bold text-slate-900 block text-sm">{printPoData.approvedBy || 'قيد الاعتماد'}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}