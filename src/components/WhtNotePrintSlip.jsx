import React from 'react';
import { Printer, X, CheckCircle2, Scissors, ShieldCheck, Building2, FileText } from 'lucide-react';
import { tafqeetArabic } from '../utils/tafqeet';
import VatNumberDisplay from './VatNumberDisplay';
import { useCompanyProfile } from '../hooks/useCompanyProfile';

export default function WhtNotePrintSlip({
  isOpen,
  onClose,
  whtData,
  supplier,
  isAr = true,
  onToggleDelivered
}) {
  const { companyProfile } = useCompanyProfile();
  if (!isOpen || !whtData) return null;

  const companyName = isAr
    ? (companyProfile.tradeNameAr || companyProfile.legalName)
    : (companyProfile.tradeNameEn || companyProfile.legalName);

  const isReturn = whtData.docType === 'return';
  const absSubtotal = Math.abs(Number(whtData.subtotal) || 0);
  const absVat = Math.abs(Number(whtData.totalVat) || 0);
  const absWht = Math.abs(Number(whtData.totalWht) || 0);
  const absNet = Math.abs(Number(whtData.netPayable) || 0);
  const whtRate = Number(whtData.whtPercent) || 1;

  // Determine tax quarter from document date
  const docDateStr = whtData.invoiceDate || whtData.receiptDate || new Date().toISOString().slice(0, 10);
  const monthNum = parseInt(docDateStr.slice(5, 7), 10) || 1;
  const yearStr = docDateStr.slice(0, 4) || new Date().getFullYear();
  const quarterNum = Math.ceil(monthNum / 3);
  const quarterLabelAr =
    quarterNum === 1
      ? `الربع الأول (يناير - مارس) ${yearStr}`
      : quarterNum === 2
      ? `الربع الثاني (أبريل - يونيو) ${yearStr}`
      : quarterNum === 3
      ? `الربع الثالث (يوليو - سبتمبر) ${yearStr}`
      : `الربع الرابع (أكتوبر - ديسمبر) ${yearStr}`;

  const whtTafqeet = tafqeetArabic(absWht, 'EGP');

  const renderHalfCertificate = (halfType) => {
    const isOriginal = halfType === 'original';

    return (
      <div className="flex flex-col justify-between h-[136mm] px-5 py-3.5 border-2 border-slate-800 rounded-xl bg-white text-slate-900 relative overflow-hidden">
        {/* Top Header */}
        <div>
          <div className="flex items-start justify-between border-b-2 border-slate-800 pb-2.5 mb-2.5">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-emerald-800" />
                <span className="font-extrabold text-sm text-slate-900">
                  {companyName}
                </span>
              </div>
              <p className="text-[10px] text-slate-600 font-semibold flex items-center gap-2 flex-wrap">
                <span>الإدارة المالية - قسم الضرائب والالتزام الضريبي (نموذج ٤١ خصم وتحصيل)</span>
                {companyProfile.taxCardNumber && (
                  <>
                    <span>•</span>
                    <span>ب.ض جهة الخصم: <VatNumberDisplay value={companyProfile.taxCardNumber} /></span>
                  </>
                )}
              </p>
            </div>

            <div className="text-center">
              <h2 className="text-sm font-black text-slate-900 tracking-tight">
                {isReturn
                  ? 'إشعار تسوية خصم وتحصيل تحت حساب الضريبة (مرتجع)'
                  : 'إشعار خصم وتحصيل تحت حساب الضريبة'}
              </h2>
              <div
                className={`mt-1 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border ${
                  isOriginal
                    ? 'bg-emerald-50 text-emerald-900 border-emerald-700'
                    : 'bg-amber-50 text-amber-900 border-amber-700'
                }`}
              >
                {isOriginal
                  ? 'أصل الإشعار — يُختم ويُسلم للمورد (Original Copy for Supplier)'
                  : 'صورة الإشعار — تُوقع وتُختم من المورد باستلام الأصل وتُحفظ (Archive Copy)'}
              </div>
            </div>

            <div className="text-end font-mono text-[11px] space-y-0.5 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-300">
              <div>
                <span className="text-slate-500 font-sans text-[10px]">رقم الإشعار: </span>
                <span className="font-black text-slate-900">{whtData.serialNumber || 'WHT-PENDING'}</span>
              </div>
              <div>
                <span className="text-slate-500 font-sans text-[10px]">تاريخ الإصدار: </span>
                <span className="font-bold">{whtData.issueDate || new Date().toISOString().slice(0, 10)}</span>
              </div>
              <div className="font-sans text-[9px] text-slate-600 font-bold">{quarterLabelAr}</div>
            </div>
          </div>

          {/* Supplier Legal & Tax Info Grid */}
          <div className="grid grid-cols-12 gap-2 bg-slate-50/80 border border-slate-300 rounded-lg p-2 mb-2 text-[11px]">
            <div className="col-span-5">
              <span className="text-slate-500 text-[10px] block">اسم الممول / المورد بالبطاقة الضريبية:</span>
              <span className="font-extrabold text-slate-900 text-xs">
                {supplier?.taxpayerLegalName || supplier?.name || whtData.supplierName || '—'}
              </span>
              {supplier?.name && supplier?.taxpayerLegalName && supplier.name !== supplier.taxpayerLegalName && (
                <span className="text-[10px] text-slate-500 block">({supplier.name})</span>
              )}
            </div>
            <div className="col-span-3">
              <span className="text-slate-500 text-[10px] block">رقم التسجيل الضريبي (ب.ض):</span>
              <div className="font-mono font-bold text-slate-900 mt-0.5">
                {supplier?.taxCardNumber ? (
                  <VatNumberDisplay value={supplier.taxCardNumber} />
                ) : (
                  <span>—</span>
                )}
              </div>
            </div>
            <div className="col-span-2">
              <span className="text-slate-500 text-[10px] block">رقم الملف الضريبي:</span>
              <span className="font-mono font-bold text-slate-900">
                {supplier?.taxFileNumber || supplier?.commercialRegister || '—'}
              </span>
            </div>
            <div className="col-span-2">
              <span className="text-slate-500 text-[10px] block">مأمورية الضرائب المختصة:</span>
              <span className="font-bold text-slate-900">{supplier?.taxDistrict || '—'}</span>
            </div>
          </div>

          {/* Invoice & WHT Breakdown Table */}
          <table className="w-full border-collapse border border-slate-400 text-[11px] mb-2">
            <thead>
              <tr className="bg-slate-100 text-slate-800 font-bold">
                <th className="border border-slate-400 px-2 py-1 text-right">بيان المستند</th>
                <th className="border border-slate-400 px-2 py-1 text-center">رقم الفاتورة / الإشعار</th>
                <th className="border border-slate-400 px-2 py-1 text-center">تاريخ المستند</th>
                <th className="border border-slate-400 px-2 py-1 text-center">مرجع الاستلام</th>
                <th className="border border-slate-400 px-2 py-1 text-center">القيمة قبل الضريبة</th>
                <th className="border border-slate-400 px-2 py-1 text-center">ض. القيمة المضافة</th>
                <th className="border border-slate-400 px-2 py-1 text-center">نسبة الخصم</th>
                <th className="border border-slate-400 px-2 py-1 text-center bg-amber-50">قيمة خصم الضريبة (1%)</th>
                <th className="border border-slate-400 px-2 py-1 text-center">صافي المستحق</th>
              </tr>
            </thead>
            <tbody>
              <tr className="font-mono text-center">
                <td className="border border-slate-400 px-2 py-1.5 text-right font-sans font-bold">
                  {isReturn ? 'إشعار دائن (مرتجع)' : 'فاتورة ضريبية (توريد)'}
                </td>
                <td className="border border-slate-400 px-2 py-1.5 font-bold text-slate-900">
                  {whtData.invoiceNumber || '—'}
                </td>
                <td className="border border-slate-400 px-2 py-1.5">{docDateStr}</td>
                <td className="border border-slate-400 px-2 py-1.5 font-bold">{whtData.grnId}</td>
                <td className="border border-slate-400 px-2 py-1.5">
                  {absSubtotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td className="border border-slate-400 px-2 py-1.5">
                  {absVat.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td className="border border-slate-400 px-2 py-1.5 font-bold">{whtRate}%</td>
                <td className="border border-slate-400 px-2 py-1.5 font-black text-xs bg-amber-50/70 text-slate-900">
                  {absWht.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م
                </td>
                <td className="border border-slate-400 px-2 py-1.5 font-bold">
                  {absNet.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
              </tr>
            </tbody>
          </table>

          {/* Tafqeet Bar */}
          <div className="bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-[11px] flex items-center justify-between">
            <div>
              <span className="text-slate-500 font-semibold">قيمة الضريبة المخصومة بالحروف: </span>
              <span className="font-extrabold text-slate-900">{whtTafqeet}</span>
            </div>
            <div className="text-[10px] text-slate-600 font-semibold">
              طبقا لأحكام القانون رقم 91 لسنة 2005 وتعديلاته
            </div>
          </div>
        </div>

        {/* Bottom Signature & Stamp Section */}
        {isOriginal ? (
          <div className="grid grid-cols-3 gap-4 pt-2 border-t border-slate-300 text-[11px] text-center">
            <div>
              <p className="font-bold text-slate-700 mb-4">إعداد المحاسب الضريبي</p>
              <div className="border-b border-dashed border-slate-400 w-36 mx-auto" />
            </div>
            <div>
              <p className="font-bold text-slate-700 mb-4">اعتماد الإدارة المالية</p>
              <div className="border-b border-dashed border-slate-400 w-36 mx-auto" />
            </div>
            <div>
              <p className="font-bold text-slate-700 mb-1">خاتم الشركة الرسمي (يسلم للمورد)</p>
              <div className="h-10 w-28 mx-auto border border-dashed border-slate-400 rounded flex items-center justify-center text-[9px] text-slate-400">
                مكان الختم الحي
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-12 gap-3 pt-1.5 border-t border-slate-300 text-[10px]">
            <div className="col-span-4 text-center flex flex-col justify-between">
              <p className="font-bold text-slate-700">توقيع المحاسب / المسلم</p>
              <div className="border-b border-dashed border-slate-400 w-32 mx-auto mt-5" />
            </div>
            <div className="col-span-8 bg-amber-50/60 border border-amber-300 rounded-lg px-3 py-1.5 flex items-center justify-between">
              <div className="space-y-1">
                <p className="font-extrabold text-slate-900 text-[11px]">
                  إقرار استلام أصل إشعار الخصم والإضافة (يوقع ويختم من مندوب المورد):
                </p>
                <div className="flex items-center gap-4 text-[10px] text-slate-700">
                  <span>اسم المستلم: ...............................</span>
                  <span>الرقم القومي / الصفة: ..........................</span>
                  <span>التاريخ: .... / .... / 202</span>
                </div>
              </div>
              <div className="h-11 w-28 border border-dashed border-amber-500 rounded bg-white flex items-center justify-center text-[9px] text-amber-800 font-bold shrink-0">
                توقيع وختم المورد
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #wht-a4-print-container,
          #wht-a4-print-container * {
            visibility: visible !important;
          }
          #wht-a4-print-container {
            position: fixed !important;
            left: 0 !important;
            top: 0 !important;
            width: 210mm !important;
            height: 297mm !important;
            margin: 0 !important;
            padding: 6mm 8mm !important;
            background: white !important;
            box-shadow: none !important;
            z-index: 99999 !important;
          }
          @page {
            size: A4 portrait;
            margin: 0;
          }
        }
      `}</style>

      <div className="bg-slate-100 rounded-2xl shadow-2xl border border-slate-300 max-w-5xl w-full max-h-[95vh] flex flex-col overflow-hidden">
        {/* Top Action Bar (Hidden in Print) */}
        <div className="bg-slate-900 text-white px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <FileText className="h-5 w-5 text-emerald-400" />
            <div>
              <h3 className="font-bold text-sm">
                {isAr
                  ? `شهادة إشعار خصم وتحصيل تحت حساب الضريبة (1%) — ${whtData.serialNumber}`
                  : `1% WHT Certificate (A4 Dual-Half Slip) — ${whtData.serialNumber}`}
              </h3>
              <p className="text-[11px] text-slate-400">
                {isAr
                  ? 'مقسمة إلى نصفين متماثلين (أصل للمورد + صورة توقع بالاستلام وتحفظ بالأرشيف)'
                  : 'Split into 2 identical halves on a single A4 page with dashed cut line'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onToggleDelivered && (
              <button
                type="button"
                onClick={() => onToggleDelivered(whtData)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer border ${
                  whtData.isDeliveredToSupplier
                    ? 'bg-emerald-600 text-white border-emerald-500'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-600'
                }`}
              >
                <CheckCircle2 className="h-4 w-4" />
                <span>
                  {whtData.isDeliveredToSupplier
                    ? isAr
                      ? 'تم تسليم الأصل للمورد وتوقيع الصورة'
                      : 'Original Handed & Copy Signed'
                    : isAr
                    ? 'تأكيد تسليم الإشعار للمورد'
                    : 'Mark Handed to Supplier'}
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition cursor-pointer shadow-xs"
            >
              <Printer className="h-4 w-4" />
              <span>{isAr ? 'طباعة A4 (نصفين)' : 'Print A4 Dual-Half'}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Scrollable A4 Preview Area */}
        <div className="p-4 sm:p-6 overflow-y-auto flex justify-center bg-slate-200/80">
          <div
            id="wht-a4-print-container"
            dir="rtl"
            className="w-[210mm] min-h-[296mm] bg-white shadow-xl p-[6mm] flex flex-col justify-between box-border"
          >
            {/* FIRST HALF: ORIGINAL FOR SUPPLIER */}
            {renderHalfCertificate('original')}

            {/* MIDDLE DASHED CUT LINE */}
            <div className="relative my-1.5 flex items-center justify-center">
              <div className="w-full border-t-2 border-dashed border-slate-500" />
              <div className="absolute bg-white px-3 flex items-center gap-1.5 text-[10px] font-bold text-slate-600">
                <Scissors className="h-3.5 w-3.5 text-slate-700" />
                <span>
                  خط القص والفصل — النصف العلوي (الأصل) يُختم ويُسلم للمورد، والنصف السفلي يُوقع من المورد بالاستلام ويُحفظ
                </span>
              </div>
            </div>

            {/* SECOND HALF: ARCHIVE COPY SIGNED BY SUPPLIER */}
            {renderHalfCertificate('archive_copy')}
          </div>
        </div>
      </div>
    </div>
  );
}
