import * as XLSX from 'xlsx';

// Lightweight Client-Side Image Compression Helper (<80KB Web-Ready Payloads)
export const compressImage = (file, maxWidth = 800, maxHeight = 800, quality = 0.75) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const elem = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        elem.width = width;
        elem.height = height;
        const ctx = elem.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(elem.toDataURL('image/jpeg', quality));
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
};

// Time calculation helpers
export const timeToMins = (t) => {
  if (!t) return 0;
  const p = String(t).split(':');
  return (parseInt(p[0], 10) || 0) * 60 + (parseInt(p[1], 10) || 0);
};

export const minsToTime = (mins) => {
  const normalized = (mins + 1440) % 1440;
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

export const formatDuration = (mins, isAr = true) => {
  if (!mins || isNaN(mins)) return isAr ? '0 د' : '0m';
  const total = Math.round(mins);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h > 0 && m > 0) return isAr ? `${h} س و ${m} د` : `${h}h ${m}m`;
  if (h > 0) return isAr ? `${h} س` : `${h}h`;
  return isAr ? `${m} د` : `${m}m`;
};

export const calculateDuration = (startStr, endStr) => {
  if (!startStr || !endStr) return 0;
  const s = timeToMins(startStr);
  let e = timeToMins(endStr);
  if (e < s) e += 1440;
  return e - s;
};


export function exportShiftAnalyticsToExcel({
  analyticsDate,
  analyticsShiftKpis,
  analyticsOrdersSummary,
  analyticsFilteredOrders,
  analyticsPallets,
  getOrderCrewCount,
  isAr,
  toast,
}) {
    try {
      const summaryData = [
        {
          [isAr ? 'تاريخ الوردية' : 'Shift Date']: analyticsDate,
          [isAr ? 'بداية الوردية' : 'Shift Start']: analyticsShiftKpis.shiftStartDisplay,
          [isAr ? 'نهاية الوردية' : 'Shift End']: analyticsShiftKpis.shiftEndDisplay,
          [isAr ? 'صافي وقت الإنتاج (دقيقة)' : 'Prod Mins']: analyticsShiftKpis.totalProdMins,
          [isAr ? 'وقت الراحة (دقيقة)' : 'Break Mins']: analyticsShiftKpis.totalBreakMins,
          [isAr ? 'الوقت المهدر (دقيقة)' : 'Waste Mins']: analyticsShiftKpis.totalWasteMins,
          [isAr ? 'الوقت الإضافي (دقيقة)' : 'Overtime Mins']: analyticsShiftKpis.overtimeMins,
          [isAr ? 'كفاءة الوقت (OEE %)' : 'Efficiency %']: `${analyticsShiftKpis.timeEfficiencyPct}%`,
          [isAr ? 'إجمالي الكراتين التامة' : 'Total Cartons']: analyticsOrdersSummary.totalCartons,
          [isAr ? 'إجمالي الباليتات المنجزة' : 'Total Pallets']: analyticsOrdersSummary.totalPallets,
        }
      ];

      const ordersData = analyticsFilteredOrders.map((ord) => ({
        [isAr ? 'رقم الأمر' : 'Order #']: ord.orderNumber,
        [isAr ? 'اسم المنتج' : 'Product']: ord.productNameAr,
        [isAr ? 'خيار التعبئة' : 'Packaging Option']: ord.packagingOptionNameAr || '—',
        [isAr ? 'خط الإنتاج' : 'Line']: ord.productionLine || '—',
        [isAr ? 'الأولوية' : 'Priority']: ord.priority || '—',
        [isAr ? 'الحالة' : 'Status']: ord.status,
        [isAr ? 'المخطط بالكرتونة' : 'Planned Cartons']: ord.plannedQtyLarge,
        [isAr ? 'المنجز بالكرتونة' : 'Finished Cartons']: ord.finishedQtyLarge || 0,
        [isAr ? 'المخطط بالعبوة' : 'Planned Units']: ord.plannedQtySmall,
        [isAr ? 'المنجز بالعبوة' : 'Finished Units']: ord.finishedQtySmall || 0,
        [isAr ? 'عدد العمالة' : 'Crew Count']: getOrderCrewCount(ord),
        [isAr ? 'تاريخ الخطة' : 'Plan Date']: ord.planDate,
      }));

      const palletsData = analyticsPallets.map((p, idx) => ({
        [isAr ? 'تسلسل' : '#']: idx + 1,
        [isAr ? 'رقم الباليت' : 'Pallet #']: `P${p.palletNumber || idx + 1}`,
        [isAr ? 'معرف الباليت' : 'Pallet ID']: p.palletId || '—',
        [isAr ? 'أمر التشغيل' : 'Order #']: p.orderNumber,
        [isAr ? 'اسم المنتج' : 'Product']: p.productNameAr,
        [isAr ? 'الكمية (كرتونة)' : 'Cartons']: p.qtyLarge,
        [isAr ? 'الكمية (عبوة)' : 'Units']: p.qtySmall,
        [isAr ? 'ماكينة التغليف' : 'Wrapping']: p.wrappingMachine === 'wrapping_2' ? 'ماكينة 2' : p.wrappingMachine === 'no_shrink' ? 'بدون شرنك' : 'ماكينة 1',
        [isAr ? 'وقت الإنجاز' : 'Completion Time']: p.time || '—',
        [isAr ? 'حالة الطباعة' : 'Printed']: (p.isPrinted || Number(p.printCount) > 0) ? (isAr ? 'نعم' : 'Yes') : (isAr ? 'لا' : 'No'),
        [isAr ? 'عدد مرات الطباعة' : 'Print Count']: p.printCount || 0,
      }));

      const gapsData = (analyticsShiftKpis.wasteGaps || []).map((g, idx) => ({
        [isAr ? 'تسلسل' : '#']: idx + 1,
        [isAr ? 'وقت البدء' : 'Start Time']: g.startTime,
        [isAr ? 'وقت الانتهاء' : 'End Time']: g.endTime,
        [isAr ? 'المدة (دقيقة)' : 'Duration (mins)']: g.durationMins,
        [isAr ? 'النوع' : 'Type']: isAr ? 'وقت مهدر / توقف' : 'Waste / Downtime',
      }));

      const wb = XLSX.utils.book_new();
      const wsSummary = XLSX.utils.json_to_sheet(summaryData);
      const wsOrders = XLSX.utils.json_to_sheet(ordersData.length > 0 ? ordersData : [{ [isAr ? 'ملاحظة' : 'Note']: isAr ? 'لا توجد أوامر' : 'No orders' }]);
      const wsPallets = XLSX.utils.json_to_sheet(palletsData.length > 0 ? palletsData : [{ [isAr ? 'ملاحظة' : 'Note']: isAr ? 'لا توجد باليتات' : 'No pallets' }]);
      const wsGaps = XLSX.utils.json_to_sheet(gapsData.length > 0 ? gapsData : [{ [isAr ? 'ملاحظة' : 'Note']: isAr ? 'لا يوجد وقت مهدر' : 'No gaps' }]);

      XLSX.utils.book_append_sheet(wb, wsSummary, isAr ? 'ملخص الوردية' : 'Summary');
      XLSX.utils.book_append_sheet(wb, wsOrders, isAr ? 'أوامر التشغيل' : 'Orders');
      XLSX.utils.book_append_sheet(wb, wsPallets, isAr ? 'الباليتات' : 'Pallets');
      XLSX.utils.book_append_sheet(wb, wsGaps, isAr ? 'فترات التوقف' : 'Downtime');

      XLSX.writeFile(wb, `Shift_Report_${analyticsDate}.xlsx`);
      toast.success(isAr ? 'تم تصدير تقرير الوردية بنجاح إلى ملف إكسل.' : 'Shift report exported to Excel successfully.');
    } catch (err) {
      console.error('Error exporting shift report to Excel:', err);
      toast.error(isAr ? 'فشل تصدير ملف الإكسل.' : 'Failed to export Excel report.');
    }

}
