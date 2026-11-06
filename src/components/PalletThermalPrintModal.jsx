/**
 * Al-Tawoos ERP - Shared Pallet Thermal Label Print Modal & Portal
 * 
 * Reusable component for printing physical direct thermal pallet labels (50x38mm, 38x50mm, etc.)
 * Used across:
 * 1. WorkOrdersMaster (Production Floor)
 * 2. FinishedGoodsInward (Warehouse Custody & Inward Ledger Copies)
 */
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Printer,
  QrCode,
  X,
  RotateCcw,
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Sliders,
  Save,
  CheckCircle2,
} from 'lucide-react';
import { useNotification } from '../context/NotificationContext';
import { db } from '../firebase';
import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { generateQRCodeDataURL } from '../utils/qrCodeGenerator';
import {
  getStoredPalletThermalConfig,
  saveStoredPalletThermalConfig,
  PALLET_THERMAL_PRESETS,
} from '../utils/thermalLabelGenerator';

/**
 * Pallet Shrink Machine Resolver
 * Ensures factory default (م ١) is used when unspecified, or correct machine mapping
 */
export const resolvePalletShrinkMachine = (pallet, order) => {
  let val = pallet?.wrappingMachine || pallet?.shrinkMachine;
  if (!val && order && Array.isArray(order.pallets)) {
    const pId = pallet?.palletId || pallet?.id;
    const match = order.pallets.find((op) => (op.palletId || op.id) === pId || op.palletNumber === pallet?.palletNumber);
    if (match) {
      val = match.wrappingMachine || match.shrinkMachine;
    }
  }
  if (!val && order?.wrappingMachine) {
    val = order.wrappingMachine;
  }
  const s = String(val || '').trim().toLowerCase();
  if (s === 'no_shrink' || s === 'none' || s === 'بدون' || s === 'بدون شرنك' || s === 'حر') {
    return '-';
  }
  if (s === 'wrapping_2' || s === '2' || s === 'م2' || s === 'م ٢' || s === 'machine_2') {
    return 'م ٢';
  }
  if (s === 'wrapping_1' || s === '1' || s === 'م1' || s === 'م ١' || s === 'machine_1') {
    return 'م ١';
  }
  return 'م ١';
};

/**
 * Pallet Packaging Option Resolver
 * Determines if product has multiple packaging options and extracts clean display name
 */
export const resolvePalletPackagingOptionInfo = (pallet, order, finishedProducts = []) => {
  const prodId = order?.finishedProductId || pallet?.finishedProductId;
  const prodCode = order?.productCode || pallet?.productCode;
  const prod = Array.isArray(finishedProducts)
    ? finishedProducts.find((fp) => fp.id === prodId || fp.code === prodCode || fp.id === prodCode)
    : null;
  const hasMultiplePackaging = Array.isArray(prod?.packagingOptions) && prod.packagingOptions.length > 1;
  const suffix = pallet?.packagingOptionSuffix || order?.packagingOptionSuffix || 'A';
  const opt = (prod?.packagingOptions || []).find((o) => o.suffix === suffix || o.code === suffix);
  const rawName = opt?.nameAr || pallet?.packagingOptionNameAr || order?.packagingOptionNameAr || suffix;

  let displayName = String(rawName || '')
    .replace(/^خيار\s*[:\-_]?\s*/i, '')
    .replace(/^option\s*[:\-_]?\s*/i, '')
    .trim();
  if (!displayName) displayName = suffix;

  return {
    hasMultiplePackaging,
    suffix,
    displayName,
  };
};

/**
 * Pallet Digital Passport URL Generator
 */
export const buildPalletPassportUrl = (palletId) => {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const pathname = typeof window !== 'undefined' ? window.location.pathname : '/';
  return `${origin}${pathname}#fg_inward?palletId=${encodeURIComponent(palletId)}`;
};

/**
 * Core Database Sync: Marks pallets as printed in both staged_floor_pallets and production_work_orders.
 * Uses setDoc with merge: true to avoid any NOT_FOUND exceptions.
 */
export const markPalletsAsPrintedInDb = async (items, { currentUserId, currentUserName }) => {
  if (!items || items.length === 0) return { success: false, count: 0 };
  const now = new Date().toISOString();
  let updatedCount = 0;

  for (const item of items) {
    const { order, pallet, pIdx } = item;
    const palletId =
      item.palletId ||
      pallet?.palletId ||
      pallet?.id ||
      (order?.orderNumber
        ? `PAL-${order.orderNumber}-P${String(pallet?.palletNumber || 1).padStart(2, '0')}`
        : `PAL-${pallet?.palletNumber || 1}`);

    const currentCount = Number(pallet?.printCount) || 0;
    const newCount = currentCount + 1;

    // 1. Update primary staged_floor_pallets document safely (merge: true never throws if document is new)
    if (palletId) {
      try {
        const stagedRef = doc(db, 'staged_floor_pallets', palletId);
        await setDoc(
          stagedRef,
          {
            id: palletId,
            palletId,
            isPrinted: true,
            printCount: newCount,
            lastPrintedAt: now,
            lastPrintedBy: { id: currentUserId || 'system', name: currentUserName || 'System' },
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
        updatedCount += 1;
      } catch (err) {
        console.warn(`[markPalletsAsPrintedInDb] Could not update staged_floor_pallets/${palletId}:`, err);
      }

      // Also update secondary ID if pallet object had a differing document id
      if (pallet?.id && pallet.id !== palletId) {
        try {
          await setDoc(
            doc(db, 'staged_floor_pallets', pallet.id),
            {
              isPrinted: true,
              printCount: newCount,
              lastPrintedAt: now,
              lastPrintedBy: { id: currentUserId || 'system', name: currentUserName || 'System' },
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );
        } catch (_) {}
      }
    }

    // 2. Update work_orders and production_work_orders if order or workOrderId exists
    const targetOrderId = order?.id || pallet?.orderId || pallet?.workOrderId;
    if (targetOrderId) {
      for (const col of ['work_orders', 'production_work_orders']) {
        try {
          const orderRef = doc(db, col, targetOrderId);
          const orderSnap = await getDoc(orderRef);
          if (orderSnap.exists()) {
            const ordData = orderSnap.data();
            if (Array.isArray(ordData.pallets)) {
              const updatedPallets = ordData.pallets.map((pl, idx) => {
                const isMatch =
                  (pl.palletId && (pl.palletId === palletId || pl.palletId === pallet?.palletId)) ||
                  (pIdx !== undefined && idx === pIdx) ||
                  (pallet?.palletNumber !== undefined && Number(pl.palletNumber) === Number(pallet.palletNumber));
                if (isMatch) {
                  return {
                    ...pl,
                    isPrinted: true,
                    printCount: newCount,
                    lastPrintedAt: now,
                    lastPrintedBy: { id: currentUserId || 'system', name: currentUserName || 'System' },
                  };
                }
                return pl;
              });
              await updateDoc(orderRef, { pallets: updatedPallets, updatedAt: serverTimestamp() });
            }
          }
        } catch (orderErr) {
          console.warn(`[markPalletsAsPrintedInDb] Could not update ${col}/${targetOrderId} pallets:`, orderErr);
        }
      }
    }

    // 3. Update stock_transfers if transfer exists
    const targetTransferId = item.transferId || pallet?.transferId;
    if (targetTransferId) {
      try {
        const trnRef = doc(db, 'stock_transfers', targetTransferId);
        const trnSnap = await getDoc(trnRef);
        if (trnSnap.exists()) {
          const trnData = trnSnap.data();
          let modified = false;
          const updatedLines = (trnData.lines || []).map((l) => {
            if (l.palletId === palletId) {
              modified = true;
              return { ...l, isPrinted: true, printCount: newCount, lastPrintedAt: now };
            }
            return l;
          });
          const updatedPallets = (trnData.pallets || []).map((pl) => {
            if (pl.palletId === palletId || pl.id === palletId) {
              modified = true;
              return { ...pl, isPrinted: true, printCount: newCount, lastPrintedAt: now };
            }
            return pl;
          });
          if (modified) {
            await updateDoc(trnRef, {
              lines: updatedLines,
              pallets: updatedPallets,
              updatedAt: serverTimestamp(),
            });
          }
        }
      } catch (trnErr) {
        console.warn(`[markPalletsAsPrintedInDb] Could not update transfer/${targetTransferId}:`, trnErr);
      }
    }
  }

  return { success: true, count: updatedCount };
};

export default function PalletThermalPrintModal({
  isOpen,
  onClose,
  items = [],
  isAr = true,
  currentUserId = '',
  currentUserName = '',
  finishedProducts = [],
  onPrintSuccess = null,
}) {
  const notificationCtx = useNotification();
  const toast = notificationCtx?.toast || {
    success: (msg) => console.log(msg),
    error: (msg) => console.error(msg),
  };

  const [config, setConfig] = useState(getStoredPalletThermalConfig);
  const [activePreviewIndex, setActivePreviewIndex] = useState(0);
  const [isPrinting, setIsPrinting] = useState(false);
  const [qrCache, setQrCache] = useState({});

  // Ensure active preview index is within valid range
  const safeIdx = Math.max(0, Math.min(activePreviewIndex, items.length - 1));
  const currentItem = items[safeIdx] || null;

  // Pre-generate QR codes for all items with optimal thermal options
  useEffect(() => {
    if (!isOpen || !items || items.length === 0) return;
    items.forEach((item, idx) => {
      const pallet = item.pallet || {};
      const order = item.order || {};
      const palletId =
        item.palletId ||
        pallet.palletId ||
        pallet.id ||
        (order?.orderNumber
          ? `PAL-${order.orderNumber}-P${String(pallet.palletNumber || idx + 1).padStart(2, '0')}`
          : `PAL-${pallet.palletNumber || idx + 1}`);

      const passportUrl = item.passportUrl || buildPalletPassportUrl(palletId);
      if (!qrCache[palletId] && !item.qrDataUrl) {
        generateQRCodeDataURL(passportUrl, { width: 400, errorCorrectionLevel: 'L', margin: 1 }).then((url) => {
          if (url) {
            setQrCache((prev) => ({ ...prev, [palletId]: url }));
          }
        });
      }
    });
  }, [isOpen, items, qrCache]);

  if (!isOpen || !items || items.length === 0) return null;

  const handleApplyPreset = (presetId) => {
    const preset = PALLET_THERMAL_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setConfig((prev) => ({
      ...prev,
      widthMm: preset.widthMm,
      heightMm: preset.heightMm,
      orientation: preset.orientation,
      preset: preset.id,
      gapMm: preset.gapMm,
    }));
  };

  const handleToggleFlip180 = () => {
    setConfig((prev) => ({ ...prev, flip180: !prev.flip180 }));
  };

  const handleSaveDefault = () => {
    saveStoredPalletThermalConfig(config);
    toast.success(isAr ? 'تم حفظ إعدادات رول الباليت كافتراضي للمحطة بنجاح!' : 'Pallet thermal settings saved as default!');
  };

  // Immediate print execution: updates database FIRST, then triggers browser print
  const handleExecutePrint = async () => {
    if (isPrinting || items.length === 0) return;
    setIsPrinting(true);
    try {
      // 1. Immediately record print in Firestore
      await markPalletsAsPrintedInDb(items, { currentUserId, currentUserName });

      toast.success(
        items.length === 1
          ? isAr
            ? 'تم تأكيد طباعة الملصق وتسجيله بنجاح.'
            : 'Pallet label print recorded successfully.'
          : isAr
          ? `تم تأكيد طباعة (${items.length}) ملصقات بنجاح.`
          : `Printed (${items.length}) labels successfully.`
      );

      if (onPrintSuccess) {
        onPrintSuccess(items);
      }

      // 2. Launch browser print dialog
      setTimeout(() => {
        window.print();
        setIsPrinting(false);
      }, 50);
    } catch (err) {
      console.error('Error executing print:', err);
      toast.error(isAr ? 'حدث خطأ أثناء تسجيل الطباعة.' : 'Error recording print.');
      setIsPrinting(false);
    }
  };

  // Manual "Confirm Printed" button (allows marking pallet as printed without opening system print dialog)
  const handleManualConfirm = async () => {
    if (isPrinting || items.length === 0) return;
    setIsPrinting(true);
    try {
      await markPalletsAsPrintedInDb(items, { currentUserId, currentUserName });
      toast.success(isAr ? 'تم تأكيد طباعة الملصق يدوياً في النظام.' : 'Pallet marked as printed manually.');
      if (onPrintSuccess) {
        onPrintSuccess(items);
      }
      setIsPrinting(false);
      onClose();
    } catch (err) {
      console.error('Error manually confirming print:', err);
      toast.error(isAr ? 'فشل تأكيد الطباعة.' : 'Failed to confirm print.');
      setIsPrinting(false);
    }
  };

  const isPortrait = config.orientation === 'portrait' || Number(config.widthMm) < Number(config.heightMm);

  // Active preview item resolved details
  const previewPallet = currentItem?.pallet || {};
  const previewOrder = currentItem?.order || {};
  const previewPalletId =
    currentItem?.palletId ||
    previewPallet.palletId ||
    previewPallet.id ||
    (previewOrder?.orderNumber
      ? `PAL-${previewOrder.orderNumber}-P${String(previewPallet.palletNumber || 1).padStart(2, '0')}`
      : `PAL-${previewPallet.palletNumber || 1}`);

  const previewQr = currentItem?.qrDataUrl || qrCache[previewPalletId] || '';
  const previewDate = previewPallet.productionDate || previewOrder?.planDate || new Date().toISOString().split('T')[0];
  const shortDate = String(previewDate).slice(0, 10).replace(/-/g, '/');
  const shrinkChipText = resolvePalletShrinkMachine(previewPallet, previewOrder);
  const packagingInfo = resolvePalletPackagingOptionInfo(previewPallet, previewOrder, finishedProducts);
  const isReprint = Number(previewPallet.printCount || 0) > 0 || Boolean(previewPallet.isPrinted);
  const nextCopyNumber = Math.max(2, Number(previewPallet.printCount || 0) + 1);
  const copyBadgeText = isReprint
    ? isAr
      ? `نسخة ${nextCopyNumber}`
      : `Copy ${nextCopyNumber}`
    : isAr
    ? 'أصل'
    : 'Original';

  const rawWo = previewOrder?.orderNumber || previewPallet.orderNumber || '';
  const currentWoDisplay = rawWo ? (rawWo.startsWith('WO#') || rawWo.startsWith('WO-') ? rawWo : `WO#${rawWo}`) : '';

  return (
    <>
      {/* 1. INTERACTIVE PREVIEW & CONFIG MODAL */}
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 z-50 overflow-y-auto animate-in fade-in duration-150">
        <div className="bg-white rounded-3xl max-w-2xl w-full p-4 sm:p-6 shadow-2xl border border-slate-200 space-y-4 my-auto max-h-[92vh] flex flex-col justify-between overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-indigo-50 text-indigo-700 rounded-xl">
                <Printer className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-base text-slate-900 flex items-center gap-2">
                  <span>{isAr ? 'طباعة استيكر الباليتة (رول حراري)' : 'Pallet Thermal Label Print'}</span>
                  {items.length > 1 && (
                    <span className="px-2 py-0.5 bg-indigo-100 text-indigo-900 rounded-full font-mono text-xs font-black">
                      {items.length} {isAr ? 'ملصقات' : 'labels'}
                    </span>
                  )}
                </h3>
                <p className="text-xs text-slate-400">
                  {isAr
                    ? 'رول حراري مباشر • معاينة فعلية • غير مضغوط وواضح الخطوط'
                    : 'Direct thermal roll • Real-scale preview • Spacious & crisp layout'}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Preset Buttons & Quick Toolbar */}
          <div className="space-y-2 shrink-0">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-xs font-bold text-slate-600 flex items-center gap-1">
                <Sliders className="h-3.5 w-3.5 text-indigo-600" />
                <span>{isAr ? 'مقاس رول الطابعة الحرارية:' : 'Thermal Roll Size:'}</span>
              </span>

              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={handleToggleFlip180}
                  className={`px-2.5 py-1 text-xs font-bold rounded-lg border transition flex items-center gap-1 cursor-pointer ${
                    config.flip180
                      ? 'bg-amber-100 text-amber-900 border-amber-300'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                  title={isAr ? 'قلب الاستيكر 180 درجة لعكس اتجاه التغذية' : 'Flip label 180° for upside-down feed'}
                >
                  <RotateCcw className={`h-3 w-3 ${config.flip180 ? 'rotate-180 text-amber-700' : ''}`} />
                  <span>{config.flip180 ? (isAr ? 'مقلوب 180°' : 'Flipped 180°') : isAr ? 'قلب 180°' : 'Flip 180°'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleSaveDefault}
                  className="px-2.5 py-1 text-xs font-bold bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-lg border border-slate-200 transition flex items-center gap-1 cursor-pointer"
                  title={isAr ? 'حفظ هذا المقاس كافتراضي للمحطة' : 'Save this setup as workstation default'}
                >
                  <Save className="h-3 w-3 text-slate-500" />
                  <span>{isAr ? 'حفظ كافتراضي' : 'Save Default'}</span>
                </button>
              </div>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              {PALLET_THERMAL_PRESETS.map((preset) => {
                const isActive = config.preset === preset.id || (config.widthMm === preset.widthMm && config.heightMm === preset.heightMm);
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleApplyPreset(preset.id)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer border ${
                      isActive
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {isAr ? preset.nameAr.split('(')[0] : preset.nameEn.split('(')[0]} ({preset.widthMm}×{preset.heightMm}mm)
                  </button>
                );
              })}
            </div>
          </div>

          {/* Carousel Navigation for Batch Pallet Printing */}
          {items.length > 1 && (
            <div className="flex items-center justify-between px-3 py-1.5 bg-slate-50 rounded-xl border border-slate-200 shrink-0 text-xs">
              <span className="font-bold text-slate-600">
                {isAr ? `معاينة الباليتة (${safeIdx + 1} من ${items.length})` : `Viewing Pallet (${safeIdx + 1} of ${items.length})`}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={safeIdx === 0}
                  onClick={() => setActivePreviewIndex((prev) => Math.max(0, prev - 1))}
                  className="p-1 rounded-lg bg-white border border-slate-200 text-slate-700 disabled:opacity-40 hover:bg-slate-100 transition cursor-pointer"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
                <span className="font-mono font-bold text-indigo-700 text-xs px-1">
                  #{safeIdx + 1}
                </span>
                <button
                  type="button"
                  disabled={safeIdx === items.length - 1}
                  onClick={() => setActivePreviewIndex((prev) => Math.min(items.length - 1, prev + 1))}
                  className="p-1 rounded-lg bg-white border border-slate-200 text-slate-700 disabled:opacity-40 hover:bg-slate-100 transition cursor-pointer"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* Thermal Label Physical Card Preview (Spacious, Less-Bold, Un-condensed 4-row layout) */}
          <div className="p-4 bg-slate-100 rounded-2xl border border-slate-200 flex items-center justify-center overflow-hidden shrink-0">
            <div
              style={{
                width: isPortrait ? `${Math.min(300, config.widthMm * 6.5)}px` : `${Math.min(380, config.widthMm * 7)}px`,
                height: isPortrait ? `${Math.max(340, config.heightMm * 6.8)}px` : `${Math.max(210, config.heightMm * 5.8)}px`,
                maxWidth: '100%',
                transform: config.flip180 ? 'rotate(180deg)' : undefined,
                transformOrigin: 'center center',
                transition: 'transform 0.2s ease',
              }}
              className={`bg-white border border-slate-300 rounded-lg p-2.5 shadow-sm font-sans text-slate-900 flex ${
                isPortrait ? 'flex-col justify-between items-stretch' : 'flex-row justify-between items-stretch'
              } select-none overflow-hidden`}
              dir="ltr"
            >
              {isPortrait ? (
                /* PORTRAIT ORIENTATION CARD PREVIEW */
                <>
                  {/* Top Half: Information Stack (RTL) */}
                  <div className="flex flex-col justify-between text-right py-0.5 overflow-hidden gap-1.5" dir="rtl">
                    {/* Row 1: Machine Number & Copy Badge */}
                    <div className="flex items-center justify-between gap-1.5 border-b border-slate-200 pb-1">
                      <span className="w-5 h-5 rounded-full border border-slate-400 inline-flex items-center justify-center font-medium text-[10px] text-slate-800 leading-none shrink-0">
                        {shrinkChipText}
                      </span>
                      <span className="text-[9px] font-medium border border-slate-400 px-1.5 py-0.5 rounded-sm font-mono text-slate-700 leading-none">
                        {copyBadgeText}
                      </span>
                    </div>

                    {/* Row 2: Product Name */}
                    <div className="py-0.5">
                      <div className="text-xs sm:text-[13px] font-medium leading-snug text-slate-900 line-clamp-2" title={previewOrder?.productNameAr || previewPallet.productNameAr || previewPallet.productName || previewOrder?.productName}>
                        {previewOrder?.productNameAr || previewPallet.productNameAr || previewPallet.productName || previewOrder?.productName || '—'}
                      </div>
                      {packagingInfo.hasMultiplePackaging && (
                        <div className="text-[10px] font-normal text-slate-600 mt-0.5 leading-none">
                          {packagingInfo.displayName}
                        </div>
                      )}
                    </div>

                    {/* Row 3: Quantity */}
                    <div className="border-t border-dashed border-slate-200 pt-1 text-center">
                      <span className="text-base sm:text-lg font-semibold font-mono text-slate-900 tracking-tight">
                        {previewPallet.qtyLarge !== undefined ? previewPallet.qtyLarge : (previewPallet.quantityCartons !== undefined ? previewPallet.quantityCartons : (previewPallet.quantity || 0))} {previewOrder?.outputLargeUnit || previewPallet.outputLargeUnit || (isAr ? 'كرتونة' : 'Cartons')}
                      </span>
                    </div>

                    {/* Row 4: Combined Pallet Number & Date Footer */}
                    <div className="flex items-center justify-between border-t border-slate-200 pt-1 mt-0.5 font-mono">
                      <span className="text-xs font-semibold text-slate-800">
                        P#{previewPallet.palletNumber || safeIdx + 1}
                      </span>
                      <span className="text-[10px] font-normal text-slate-500">
                        {shortDate}
                      </span>
                    </div>
                  </div>

                  {/* Bottom Half: Centered QR Code & WO# */}
                  <div className="flex flex-col items-center justify-center p-1.5 bg-slate-50/90 rounded-md border border-slate-200 shrink-0 mt-1">
                    {previewQr ? (
                      <img
                        src={previewQr}
                        alt="Pallet QR"
                        className="w-[105px] h-[105px] max-w-full max-h-[105px] object-contain"
                      />
                    ) : (
                      <div className="w-[100px] h-[100px] flex flex-col items-center justify-center text-slate-400 gap-1">
                        <QrCode className="w-8 h-8 animate-pulse text-indigo-500" />
                        <span className="text-[10px] font-bold">{isAr ? 'جاري إنشاء QR...' : 'Generating QR...'}</span>
                      </div>
                    )}
                    <span className="text-[9px] font-mono font-medium text-slate-600 tracking-tight text-center mt-1 truncate max-w-full">
                      {currentWoDisplay}
                    </span>
                  </div>
                </>
              ) : (
                /* LANDSCAPE ORIENTATION CARD PREVIEW (Default 50x38mm) */
                <>
                  {/* Left Half: QR Code + Pallet ID */}
                  <div className="w-[46%] flex flex-col items-center justify-center p-1.5 bg-slate-50/90 rounded-md border border-slate-200 shrink-0">
                    {previewQr ? (
                      <img
                        src={previewQr}
                        alt="Pallet QR"
                        className="w-[115px] h-[115px] max-w-full max-h-[115px] object-contain"
                      />
                    ) : (
                      <div className="w-[110px] h-[110px] flex flex-col items-center justify-center text-slate-400 gap-1">
                        <QrCode className="w-8 h-8 animate-pulse text-indigo-500" />
                        <span className="text-[10px] font-bold">{isAr ? 'جاري إنشاء QR...' : 'Generating QR...'}</span>
                      </div>
                    )}
                    <span className="text-[9px] font-mono font-medium text-slate-600 tracking-tight text-center mt-1 truncate max-w-full">
                      {currentWoDisplay}
                    </span>
                  </div>

                  {/* Right Half: Information Stack (RTL) */}
                  <div className="flex-1 flex flex-col justify-between text-right ps-3 py-0.5 overflow-hidden" dir="rtl">
                    {/* Row 1: Machine Number & Copy Chip */}
                    <div className="flex items-center justify-between gap-1.5 border-b border-slate-200 pb-1">
                      <span
                        className="w-5 h-5 rounded-full border border-slate-400 inline-flex items-center justify-center font-medium text-[10px] text-slate-800 leading-none shrink-0"
                        title={isAr ? 'ماكينة التغليف والشرنك' : 'Shrink Wrapping Machine'}
                      >
                        {shrinkChipText}
                      </span>
                      <span className="text-[9px] font-medium border border-slate-400 px-1.5 py-0.5 rounded-sm font-mono text-slate-700 leading-none">
                        {copyBadgeText}
                      </span>
                    </div>

                    {/* Row 2: Prominent Arabic Product Name */}
                    <div className="my-auto py-0.5">
                      <div className="text-xs sm:text-[13px] font-medium leading-snug text-slate-900 line-clamp-2" title={previewOrder?.productNameAr || previewPallet.productNameAr || previewPallet.productName || previewOrder?.productName}>
                        {previewOrder?.productNameAr || previewPallet.productNameAr || previewPallet.productName || previewOrder?.productName || '—'}
                      </div>

                      {/* Packaging Option */}
                      {packagingInfo.hasMultiplePackaging && (
                        <div className="text-[10px] font-normal text-slate-600 mt-0.5 leading-none">
                          {packagingInfo.displayName}
                        </div>
                      )}
                    </div>

                    {/* Row 3: Quantity in Large Units */}
                    <div className="border-t border-dashed border-slate-200 pt-1 mt-0.5 text-center">
                      <span className="text-base sm:text-lg font-semibold font-mono text-slate-900 tracking-tight">
                        {previewPallet.qtyLarge !== undefined ? previewPallet.qtyLarge : (previewPallet.quantityCartons !== undefined ? previewPallet.quantityCartons : (previewPallet.quantity || 0))} {previewOrder?.outputLargeUnit || previewPallet.outputLargeUnit || (isAr ? 'كرتونة' : 'Cartons')}
                      </span>
                    </div>

                    {/* Row 4: Combined Pallet Number & Production Date Footer */}
                    <div className="flex items-center justify-between border-t border-slate-200 pt-1 mt-0.5 font-mono">
                      <span className="text-xs font-semibold text-slate-800">
                        P#{previewPallet.palletNumber || safeIdx + 1}
                      </span>
                      <span className="text-[10px] font-normal text-slate-500">
                        {shortDate}
                      </span>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Modal Bottom Actions */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-between shrink-0 bg-white gap-2 flex-wrap">
            <div className="text-xs text-slate-500 font-bold flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <span>
                {items.length === 1
                  ? isReprint
                    ? isAr
                      ? `طباعة نسخة إضافية (#${Number(previewPallet.printCount || 0) + 1})`
                      : `Print Additional Copy (#${Number(previewPallet.printCount || 0) + 1})`
                    : isAr
                    ? 'جاهز لطباعة ملصق الباليتة الأصلي'
                    : 'Ready to print original pallet label'
                  : isAr
                  ? `جاهز لطباعة (${items.length}) ملصقات متتابعة`
                  : `Ready to print (${items.length}) continuous labels`}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs transition cursor-pointer"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>

              <button
                type="button"
                onClick={handleManualConfirm}
                disabled={isPrinting}
                className="px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-xl font-bold text-xs transition flex items-center gap-1.5 cursor-pointer"
                title={isAr ? 'تأكيد طباعة الملصق وتحديث حالة الباليتة بدون فتح نافذة الطباعة' : 'Confirm printed in database without opening print window'}
              >
                <CheckCheck className="h-3.5 w-3.5 text-emerald-700" />
                <span>{isAr ? 'تأكيد الطباعة' : 'Confirm Printed'}</span>
              </button>

              <button
                type="button"
                onClick={handleExecutePrint}
                disabled={isPrinting || items.length === 0}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl font-extrabold text-xs shadow-md transition flex items-center gap-1.5 cursor-pointer"
              >
                <Printer className="h-4 w-4" />
                <span>
                  {isPrinting
                    ? isAr
                      ? 'جاري الإرسال...'
                      : 'Sending...'
                    : isAr
                    ? `طباعة الملصقات (${items.length})`
                    : `Print Labels (${items.length})`}
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 2. ISOLATED BROWSER PRINT PORTAL */}
      {createPortal(
        <div id="pallet-thermal-print-container">
          <style>{`
            @media screen {
              #pallet-thermal-print-container {
                display: none !important;
              }
            }
            @media print {
              html, body {
                margin: 0 !important;
                padding: 0 !important;
                background: #fff !important;
                width: 100% !important;
                height: auto !important;
                min-height: 0 !important;
              }
              #root,
              body > *:not(#pallet-thermal-print-container) {
                display: none !important;
              }
              #pallet-thermal-print-container {
                display: block !important;
                position: static !important;
                width: 100% !important;
                margin: 0 !important;
                padding: 0 !important;
                background: #fff !important;
                font-size: 0 !important;
                line-height: 0 !important;
              }
              #pallet-thermal-print-container * {
                visibility: visible !important;
              }
              @page {
                size: ${config.widthMm}mm ${config.heightMm}mm !important;
                margin: 0mm !important;
              }
              .pallet-thermal-page-sticker {
                width: ${config.widthMm}mm !important;
                height: calc(${config.heightMm}mm - 0.5mm) !important;
                max-height: calc(${config.heightMm}mm - 0.5mm) !important;
                margin: 0 !important;
                margin-bottom: 0 !important;
                page-break-after: avoid !important;
                break-after: avoid !important;
                page-break-before: avoid !important;
                break-before: avoid !important;
                page-break-inside: avoid !important;
                break-inside: avoid !important;
                box-sizing: border-box !important;
                padding: 1.5mm !important;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Cairo", "Tahoma", sans-serif !important;
                color: #000 !important;
                background: #fff !important;
                overflow: hidden !important;
                ${config.flip180 ? 'transform: rotate(180deg) !important; transform-origin: center center !important;' : ''}
              }
              .pallet-thermal-page-sticker:not(:last-child) {
                page-break-after: always !important;
                break-after: page !important;
              }
            }
          `}</style>

          {items.map((item, idx) => {
            const pallet = item.pallet || {};
            const order = item.order || {};
            const palletId =
              item.palletId ||
              pallet.palletId ||
              pallet.id ||
              (order?.orderNumber
                ? `PAL-${order.orderNumber}-P${String(pallet.palletNumber || idx + 1).padStart(2, '0')}`
                : `PAL-${pallet.palletNumber || idx + 1}`);

            const qrDataUrl = item.qrDataUrl || qrCache[palletId] || '';
            const pDate = pallet.productionDate || order?.planDate || new Date().toISOString().split('T')[0];
            const itemShortDate = String(pDate).slice(0, 10).replace(/-/g, '/');
            const itemShrinkChip = resolvePalletShrinkMachine(pallet, order);
            const itemPkgInfo = resolvePalletPackagingOptionInfo(pallet, order, finishedProducts);
            const itemIsReprint = Number(pallet.printCount || 0) > 0 || Boolean(pallet.isPrinted);
            const nextCopyNumber = Math.max(2, Number(pallet.printCount || 0) + 1);
            const itemCopyBadge = itemIsReprint
              ? isAr
                ? `نسخة ${nextCopyNumber}`
                : `Copy ${nextCopyNumber}`
              : isAr
              ? 'أصل'
              : 'Original';

            const itemRawWo = order?.orderNumber || pallet.orderNumber || '';
            const itemWoDisplay = itemRawWo
              ? itemRawWo.startsWith('WO#') || itemRawWo.startsWith('WO-')
                ? itemRawWo
                : `WO#${itemRawWo}`
              : '';

            return isPortrait ? (
              /* PORTRAIT ORIENTATION STICKER (e.g. 38mm x 50mm) */
              <div
                key={palletId || idx}
                className="pallet-thermal-page-sticker"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  direction: 'rtl',
                  textAlign: 'right',
                }}
              >
                {/* Top Half: Information Stack */}
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    overflow: 'hidden',
                    flex: 1,
                    paddingBottom: '0.8mm',
                  }}
                >
                  {/* Row 1: Machine Number & Copy Badge */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      borderBottom: '1px solid #777',
                      paddingBottom: '0.6mm',
                      marginBottom: '0.4mm',
                    }}
                  >
                    <span
                      style={{
                        width: '15px',
                        height: '15px',
                        minWidth: '15px',
                        minHeight: '15px',
                        borderRadius: '50%',
                        border: '1px solid #555',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '6.5pt',
                        fontWeight: '500',
                        lineHeight: 1,
                        textAlign: 'center',
                        color: '#222',
                        fontFamily: 'system-ui, -apple-system, sans-serif',
                      }}
                    >
                      {itemShrinkChip}
                    </span>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        padding: '0.5px 3px',
                        borderRadius: '2px',
                        border: '1px solid #666',
                        fontSize: '5.5pt',
                        fontWeight: '500',
                        lineHeight: 1,
                        color: '#333',
                        fontFamily: 'monospace',
                      }}
                    >
                      {itemCopyBadge}
                    </span>
                  </div>

                  {/* Row 2: Product Name & Packaging Option */}
                  <div style={{ margin: 'auto 0', overflow: 'hidden', padding: '0.4mm 0' }}>
                    <div
                      style={{
                        fontSize: '8pt',
                        fontWeight: '500',
                        lineHeight: 1.25,
                        letterSpacing: '0.15px',
                        wordBreak: 'break-word',
                        color: '#111',
                        maxHeight: '16px',
                        overflow: 'hidden',
                      }}
                    >
                      {order?.productNameAr || pallet.productNameAr || pallet.productName || order?.productName || '—'}
                    </div>
                    {itemPkgInfo.hasMultiplePackaging && (
                      <div
                        style={{
                          fontSize: '5.5pt',
                          fontWeight: '400',
                          color: '#444',
                          marginTop: '0.3mm',
                          lineHeight: 1,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {itemPkgInfo.displayName}
                      </div>
                    )}
                  </div>

                  {/* Row 3: Quantity */}
                  <div
                    style={{
                      borderTop: '1px dashed #777',
                      paddingTop: '0.6mm',
                      paddingBottom: '0.4mm',
                      textAlign: 'center',
                      lineHeight: 1,
                    }}
                  >
                    <span style={{ fontSize: '9.5pt', fontWeight: '600', fontFamily: 'monospace', color: '#111', letterSpacing: '-0.2px' }}>
                      {pallet.qtyLarge !== undefined ? pallet.qtyLarge : (pallet.quantityCartons !== undefined ? pallet.quantityCartons : (pallet.quantity || 0))} {order?.outputLargeUnit || pallet.outputLargeUnit || (isAr ? 'كرتونة' : 'Cartons')}
                    </span>
                  </div>

                  {/* Row 4: Combined Pallet Number & Production Date Footer */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      borderTop: '1px solid #777',
                      paddingTop: '0.5mm',
                      lineHeight: 1,
                    }}
                  >
                    <span
                      style={{
                        fontSize: '7pt',
                        fontFamily: 'monospace',
                        fontWeight: '600',
                        color: '#111',
                      }}
                    >
                      P#{pallet.palletNumber || idx + 1}
                    </span>
                    <span
                      style={{
                        fontSize: '5.5pt',
                        fontFamily: 'monospace',
                        fontWeight: '400',
                        color: '#555',
                        letterSpacing: '-0.2px',
                      }}
                    >
                      {itemShortDate}
                    </span>
                  </div>
                </div>

                {/* Bottom Half: Centered QR Code & WO# */}
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    direction: 'ltr',
                    borderTop: '1px solid #777',
                    paddingTop: '0.8mm',
                  }}
                >
                  {qrDataUrl ? (
                    <img
                      src={qrDataUrl}
                      alt="Pallet QR"
                      style={{
                        width: '20mm',
                        height: '20mm',
                        objectFit: 'contain',
                        display: 'block',
                      }}
                    />
                  ) : (
                    <div style={{ width: '20mm', height: '20mm', border: '1px dashed #777' }} />
                  )}
                  <div
                    style={{
                      fontSize: '5.5pt',
                      fontFamily: 'monospace',
                      fontWeight: '500',
                      color: '#333',
                      marginTop: '0.6mm',
                      textAlign: 'center',
                      letterSpacing: '-0.2px',
                      width: '32mm',
                      maxWidth: '32mm',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      lineHeight: 1,
                    }}
                  >
                    {itemWoDisplay}
                  </div>
                </div>
              </div>
            ) : (
              /* LANDSCAPE ORIENTATION STICKER (Default 50mm x 38mm) */
              <div
                key={palletId || idx}
                className="pallet-thermal-page-sticker"
                style={{
                  display: 'flex',
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'stretch',
                  direction: 'ltr',
                }}
              >
                {/* LEFT HALF: QR CODE (22x22 MM) + WORK ORDER NUMBER */}
                <div
                  style={{
                    width: '22mm',
                    minWidth: '22mm',
                    maxWidth: '22mm',
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    boxSizing: 'border-box',
                    borderRight: '1px solid #777',
                    paddingRight: '1mm',
                  }}
                >
                  {qrDataUrl ? (
                    <img
                      src={qrDataUrl}
                      alt="Pallet QR"
                      style={{
                        width: '20mm',
                        height: '20mm',
                        objectFit: 'contain',
                        display: 'block',
                      }}
                    />
                  ) : (
                    <div style={{ width: '20mm', height: '20mm', border: '1px dashed #777' }} />
                  )}
                  <div
                    style={{
                      fontSize: '5.5pt',
                      fontFamily: 'monospace',
                      fontWeight: '500',
                      color: '#333',
                      marginTop: '0.8mm',
                      textAlign: 'center',
                      letterSpacing: '-0.2px',
                      width: '21.5mm',
                      maxWidth: '21.5mm',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      lineHeight: 1,
                    }}
                  >
                    {itemWoDisplay}
                  </div>
                </div>

                {/* RIGHT HALF: INFORMATION STACK (RTL) */}
                <div
                  style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    direction: 'rtl',
                    textAlign: 'right',
                    paddingLeft: '1.5mm',
                    paddingRight: '0.5mm',
                    boxSizing: 'border-box',
                    overflow: 'hidden',
                    height: '100%',
                  }}
                >
                  {/* Row 1: Machine Number (Encircled) & Original/Copy Chip */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      borderBottom: '1px solid #777',
                      paddingBottom: '0.6mm',
                    }}
                  >
                    <span
                      style={{
                        width: '15px',
                        height: '15px',
                        minWidth: '15px',
                        minHeight: '15px',
                        borderRadius: '50%',
                        border: '1px solid #555',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '6.5pt',
                        fontWeight: '500',
                        lineHeight: 1,
                        textAlign: 'center',
                        color: '#222',
                        fontFamily: 'system-ui, -apple-system, sans-serif',
                      }}
                    >
                      {itemShrinkChip}
                    </span>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        padding: '0.5px 3px',
                        borderRadius: '2px',
                        border: '1px solid #666',
                        fontSize: '5.5pt',
                        fontWeight: '500',
                        lineHeight: 1,
                        color: '#333',
                        fontFamily: 'monospace',
                      }}
                    >
                      {itemCopyBadge}
                    </span>
                  </div>

                  {/* Row 2: Prominent Arabic Product Name & Packaging Option */}
                  <div
                    style={{
                      margin: 'auto 0',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'center',
                      overflow: 'hidden',
                      padding: '0.4mm 0',
                    }}
                  >
                    <div
                      style={{
                        fontSize: '8.5pt',
                        fontWeight: '500',
                        lineHeight: 1.25,
                        letterSpacing: '0.15px',
                        wordBreak: 'break-word',
                        color: '#111',
                        maxHeight: '18px',
                        overflow: 'hidden',
                      }}
                    >
                      {order?.productNameAr || pallet.productNameAr || pallet.productName || order?.productName || '—'}
                    </div>

                    {itemPkgInfo.hasMultiplePackaging && (
                      <div
                        style={{
                          fontSize: '5.5pt',
                          fontWeight: '400',
                          color: '#444',
                          marginTop: '0.4mm',
                          lineHeight: 1,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {itemPkgInfo.displayName}
                      </div>
                    )}
                  </div>

                  {/* Row 3: Quantity in Large Units */}
                  <div
                    style={{
                      borderTop: '1px dashed #777',
                      paddingTop: '0.6mm',
                      paddingBottom: '0.4mm',
                      textAlign: 'center',
                      lineHeight: 1,
                    }}
                  >
                    <span style={{ fontSize: '9.5pt', fontWeight: '600', fontFamily: 'monospace', color: '#111', letterSpacing: '-0.2px' }}>
                      {pallet.qtyLarge !== undefined ? pallet.qtyLarge : (pallet.quantityCartons !== undefined ? pallet.quantityCartons : (pallet.quantity || 0))} {order?.outputLargeUnit || pallet.outputLargeUnit || (isAr ? 'كرتونة' : 'Cartons')}
                    </span>
                  </div>

                  {/* Row 4: Combined Pallet Number & Production Date Footer */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      borderTop: '1px solid #777',
                      paddingTop: '0.6mm',
                      lineHeight: 1,
                    }}
                  >
                    <span
                      style={{
                        fontSize: '7pt',
                        fontFamily: 'monospace',
                        fontWeight: '600',
                        color: '#111',
                      }}
                    >
                      P#{pallet.palletNumber || idx + 1}
                    </span>
                    <span
                      style={{
                        fontSize: '5.5pt',
                        fontFamily: 'monospace',
                        fontWeight: '400',
                        color: '#555',
                        letterSpacing: '-0.2px',
                      }}
                    >
                      {itemShortDate}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>,
        document.body
      )}
    </>
  );
}
