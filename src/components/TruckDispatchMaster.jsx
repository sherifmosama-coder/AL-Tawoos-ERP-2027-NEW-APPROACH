import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  collection,
  doc,
  onSnapshot,
} from 'firebase/firestore';
import {
  Truck,
  PackageCheck,
  Boxes,
  CheckCircle2,
  AlertTriangle,
  Users,
  Search,
  Calendar,
  RotateCcw,
  Scale,
  X,
  FileCheck2,
  FileText,
  Eye,
  History,
  MoreVertical,
  Printer,
  Copy,
  Check,
  Edit3,
  Clock,
} from 'lucide-react';
import { db, functions } from '../firebase.js';
import { httpsCallable } from 'firebase/functions';
import PeacockLoader from './PeacockLoader.jsx';
import SalesOrderAuditModal from './SalesOrderAuditModal.jsx';
import { RowCommentButton } from './comments';
import { canAccessAction } from '../config/appArchitecture.js';
import { buildFgStockMatrix, formatDateStr, roundQty } from '../utils/fgStockEngine.js';
import {
  buildTripsCatalog,
  buildTripDispatchMatrix,
  getDocPrintStatus,
  detectPostDispatchPlanChanges,
} from '../utils/truckDispatchUtils.js';
import { highlightTargetRow } from '../utils/notificationEngine.js';
import {
  resolveUserReturnAuthority,
  resolveEligibleSalesOrderSettlers,
} from '../utils/returnRoleEngine.js';
import { generateQRCodeDataURL } from '../utils/qrCodeGenerator.js';
import {
  buildDispatchDocumentModel,
  renderDispatchDocumentHtml,
} from '../utils/dispatchDocumentBuilder.js';
import {
  buildReturnDocumentModel,
  renderReturnDocumentHtml,
} from '../utils/returnDocumentBuilder.js';
import {
  buildDispatchDocumentsRegistry,
  buildRegistryEntryPayload,
} from '../utils/dispatchDocumentRegistry.js';
import {
  DISPATCH_DOCUMENTS_COLLECTION,
  mintDispatchDocNumber,
  mintReturnDocNumber,
} from '../utils/dispatchDocumentFirestore.js';
import DispatchDocumentsHistoryModal from './DispatchDocumentsHistoryModal.jsx';
import { DEFAULT_PRICING_STRATEGIES } from '../utils/pricingEngine.js';
import { buildUnifiedPersonnelPool } from '../utils/personnelDirectory.js';
import { fmtCtn } from './truckDispatch/truckDispatchConstants.js';
import TruckDispatchModal from './truckDispatch/TruckDispatchModal.jsx';
import TruckReturnReceivingModal from './truckDispatch/TruckReturnReceivingModal.jsx';
import ClientProfileModal from './ClientProfileModal.jsx';

// =========================================================================
// MAIN TAB COMPONENT: TruckDispatchMaster
// =========================================================================
export default function TruckDispatchMaster({
  currentUser = {},
  permissions = null,
  departmentsList = [],
  departmentOverrides = {},
  userOverrides = {},
  usersList = [],
}) {
  const { i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  const isGeneralAdmin =
    currentUser?.isGeneralAdmin || currentUser?.role === 'general_admin' || currentUser?.role === 'admin';

  // RBAC Actions & Strict Return Separation-of-Duties Authority
  const canDispatchTruck = canAccessAction(permissions, 'truck_dispatch', 'canDispatchTruck', currentUser) || isGeneralAdmin;
  const canEditDispatchedTrip = canAccessAction(permissions, 'truck_dispatch', 'canEditDispatchedTrip', currentUser) || isGeneralAdmin;
  const returnAuthority = useMemo(
    () =>
      resolveUserReturnAuthority({
        currentUser,
        permissions,
        departments: departmentsList,
        departmentOverrides,
        userOverrides,
      }),
    [currentUser, permissions, departmentsList, departmentOverrides, userOverrides]
  );

  // Collections State
  const [orders, setOrders] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [products, setProducts] = useState([]);
  const [stagedPallets, setStagedPallets] = useState([]);
  const [stockTransfers, setStockTransfers] = useState([]);
  const [faultyReturns, setFaultyReturns] = useState([]);
  const [truckDispatches, setTruckDispatches] = useState([]);
  const [clients, setClients] = useState([]);
  const [segments, setSegments] = useState([]);
  const [productCategories, setProductCategories] = useState([]);
  const [priceLists, setPriceLists] = useState([]);
  const [strategies, setStrategies] = useState(DEFAULT_PRICING_STRATEGIES);
  const [stdRetailList, setStdRetailList] = useState([]);
  const orderLookupUnsubsRef = useRef([]);
  const [companyProfile, setCompanyProfile] = useState({});
  const [workerPool, setWorkerPool] = useState([]);
  const [employeesList, setEmployeesList] = useState([]);
  const [subscribedUsers, setSubscribedUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  const todayStr = useMemo(() => formatDateStr(new Date()), []);

  // Filters: Default focus is on Today's trips; most recent trips always on top
  const [dateFilter, setDateFilter] = useState('today'); // 'today' | 'all' | 'custom'
  const [customDate, setCustomDate] = useState(todayStr);
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'ready_to_load' | 'loaded' | 'return_needed' | 'pending'
  const [searchTerm, setSearchTerm] = useState('');

  // Modals, Menus & Toast
  const [activeDispatchTripId, setActiveDispatchTripId] = useState(null);
  const [activeDispatchMode, setActiveDispatchMode] = useState('edit'); // 'edit' | 'view'
  const [activeReturnTripId, setActiveReturnTripId] = useState(null);
  const [auditTripId, setAuditTripId] = useState(null);
  const [versionsModalTripId, setVersionsModalTripId] = useState(null);
  const [versionsModalTab, setVersionsModalTab] = useState('docs'); // 'docs' | 'history'
  const [registryDocs, setRegistryDocs] = useState([]);
  const [isDocsHistoryOpen, setIsDocsHistoryOpen] = useState(false);
  const [highlightHistoryDocNumber, setHighlightHistoryDocNumber] = useState('');
  const [scannedDocAlert, setScannedDocAlert] = useState(null); // { tripId, docVersion, docNumber, openLatestDoc }
  const [openMenuTripId, setOpenMenuTripId] = useState(null);
  const [clientProfileTarget, setClientProfileTarget] = useState(null);
  const [openQtyTooltipTripId, setOpenQtyTooltipTripId] = useState(null);
  const [copiedPlateTripId, setCopiedPlateTripId] = useState(null);
  const [toastMsg, setToastMsg] = useState(null);

  useEffect(() => {
    if (!openMenuTripId && !openQtyTooltipTripId) return undefined;
    const handleClosePopups = () => {
      setOpenMenuTripId(null);
      setOpenQtyTooltipTripId(null);
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') handleClosePopups();
    };
    window.addEventListener('click', handleClosePopups);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('click', handleClosePopups);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [openMenuTripId, openQtyTooltipTripId]);

  const handleCopyPlateNumber = async (trip) => {
    const plate = trip?.plateNumber;
    if (!plate) return;
    try {
      await navigator.clipboard.writeText(plate);
      setCopiedPlateTripId(trip.id);
      showToast(isAr ? `تم نسخ رقم اللوحة: ${plate}` : `Copied plate #: ${plate}`);
      setTimeout(() => {
        setCopiedPlateTripId((curr) => (curr === trip.id ? null : curr));
      }, 2000);
    } catch (_) {}
  };

  const openRenderedDispatchDoc = async (model, versionMeta = null, existingWin = null) => {
    const win = existingWin || window.open('', '_blank', 'width=1180,height=820');
    if (win && !existingWin) {
      win.document.write(
        `<!DOCTYPE html><html lang="ar" dir="rtl"><body style="font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;color:#334155;font-weight:700;">جاري تجهيز إذن الصرف ورموز QR...</body></html>`
      );
    }

    const qrTasks = [];
    const qrAssets = { systemTripQr: '', routeQr: '', latestVersionQr: '', clientQrs: {} };

    if (model.systemTripUrl) {
      qrTasks.push(
        generateQRCodeDataURL(model.systemTripUrl, {
          width: 140,
          margin: 1,
          errorCorrectionLevel: 'M',
        }).then((url) => {
          qrAssets.systemTripQr = url;
        })
      );
    }

    if (model.canShowRouteQr && model.proposedRoute?.googleMapsRouteUrl) {
      qrTasks.push(
        generateQRCodeDataURL(model.proposedRoute.googleMapsRouteUrl, {
          width: 150,
          margin: 1,
          errorCorrectionLevel: 'M',
        }).then((url) => {
          qrAssets.routeQr = url;
        })
      );
    }

    if (versionMeta?.isLegacy && versionMeta?.newVersionReleased && versionMeta?.latestVersionUrl) {
      qrTasks.push(
        generateQRCodeDataURL(versionMeta.latestVersionUrl, {
          width: 140,
          margin: 1,
          errorCorrectionLevel: 'M',
        }).then((url) => {
          qrAssets.latestVersionQr = url;
        })
      );
    }

    (model.clientStops || []).forEach((stop) => {
      if (!stop.hasAccurateLocation) return;
      const targetUrl = stop.locationInfo?.url || stop.url;
      if (!targetUrl) return;
      qrTasks.push(
        generateQRCodeDataURL(targetUrl, {
          width: 130,
          margin: 1,
          errorCorrectionLevel: 'M',
        }).then((url) => {
          qrAssets.clientQrs[stop.key] = url;
        })
      );
    });

    await Promise.all(qrTasks);

    const html = renderDispatchDocumentHtml(model, qrAssets, versionMeta);
    if (win) {
      win.document.open();
      win.document.write(html);
      win.document.close();
    }
  };

  // Reconstructs a full Dispatch Document model from an archived dispatch snapshot (for pre-versioning printed trips)
  const reconstructSnapshotModelFromDispatch = (trip, sourceSnap, versionNumber = 1) => {
    const snap = sourceSnap || trip?.dispatchDoc || {};
    const snapOrderIds = Array.isArray(snap.orderIds) && snap.orderIds.length > 0 ? snap.orderIds : null;
    const snapRowsById = {};
    (Array.isArray(snap.clientRowsSnapshot) ? snap.clientRowsSnapshot : []).forEach((r) => {
      if (r?.orderId) snapRowsById[r.orderId] = r;
    });

    const sourceOrders = snapOrderIds
      ? snapOrderIds
          .map((oid) => orders.find((o) => o.id === oid) || trip.orders.find((o) => o.id === oid))
          .filter(Boolean)
      : trip.orders || [];

    const reconstructedOrders = sourceOrders.map((ord) => {
      const savedRow = snapRowsById[ord.id];
      if (!savedRow?.quantitiesByCol) return ord;
      const lines = Object.entries(savedRow.quantitiesByCol)
        .filter(([, q]) => Number(q) > 0)
        .map(([colKey, q]) => {
          const [productCode, optionSuffix] = String(colKey).split('::');
          return { productCode, optionSuffix, qty: Number(q), bonus: 0 };
        });
      return lines.length > 0 ? { ...ord, lines } : ord;
    });

    const appOriginUrl =
      typeof window !== 'undefined'
        ? `${window.location.origin}${window.location.pathname}`
        : '';

    const syntheticTrip = {
      ...trip,
      vehicleDisplayName: snap.vehicleName || trip.vehicleDisplayName,
      plateNumber: snap.plateNumber || trip.plateNumber,
      primaryDriverName: snap.driverName || trip.primaryDriverName,
      primaryRepName: snap.deliveryRepName || trip.primaryRepName,
      orders: reconstructedOrders.length > 0 ? reconstructedOrders : trip.orders,
      dispatchDoc: {
        ...(trip.dispatchDoc || {}),
        columns: Array.isArray(snap.columns) ? snap.columns : trip.dispatchDoc?.columns || [],
        loadingWorkers: Array.isArray(snap.loadingWorkers) ? snap.loadingWorkers : trip.dispatchDoc?.loadingWorkers || [],
        offloadingWorkers: Array.isArray(snap.offloadingWorkers) ? snap.offloadingWorkers : trip.dispatchDoc?.offloadingWorkers || [],
        dispatchNotes: snap.dispatchNotes !== undefined ? snap.dispatchNotes : (trip.dispatchDoc?.dispatchNotes || ''),
      },
    };

    const built = buildDispatchDocumentModel({
      trip: syntheticTrip,
      finishedProducts: products,
      clients,
      companyProfile,
      appOriginUrl,
      versionNumber,
    });

    if (snap.printedAt || trip?.dispatchDoc?.dispatchPrintedAt) {
      const pAt = snap.printedAt || trip.dispatchDoc.dispatchPrintedAt;
      built.printedAtDisplay = new Date(pAt).toLocaleString('ar-EG', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    }
    return built;
  };

  // Returns stored dispatchDocVersions, or synthesizes v1 if the trip was printed before versioning existed
  const getEffectiveDocVersions = (trip) => {
    const dDoc = trip?.dispatchDoc || {};
    const stored = Array.isArray(dDoc.dispatchDocVersions) ? dDoc.dispatchDocVersions : [];
    if (stored.length > 0) return stored;
    if (!dDoc.dispatchPrintedAt) return [];

    const hasDrift = Boolean(trip?.planDrift?.hasPlanDrift);
    const hasPriorHistory = Array.isArray(dDoc.dispatchHistory) && dDoc.dispatchHistory.length > 0;
    const rawPrintState = getDocPrintStatus(
      dDoc.dispatchPrintedAt,
      dDoc.dispatchContentUpdatedAt || dDoc.updatedAt || dDoc.dispatchedAt
    );
    const isSuperseded = hasDrift || hasPriorHistory || rawPrintState === 'printed_stale';

    return [
      {
        versionId: `LEGACY-SYNTH-V1-${trip.id}`,
        versionNumber: 1,
        printedAt: dDoc.dispatchPrintedAt,
        printedBy: dDoc.dispatchPrintedBy || dDoc.dispatchedByName || '',
        status: isSuperseded ? 'superseded' : 'current',
        supersededReasonAr:
          (hasPriorHistory ? dDoc.dispatchHistory[0]?.reasonAr : '') ||
          (hasDrift ? trip.planDrift.summaryAr : '') ||
          (rawPrintState === 'printed_stale' ? 'تم تعديل بيان الصرف بعد الطباعة' : ''),
        isSynthesizedFromLegacyPrint: true,
        sourceSnapshot: hasPriorHistory ? dDoc.dispatchHistory[0] : dDoc,
      },
    ];
  };

  const handleOpenSavedDocVersion = async (trip, verEntry) => {
    if (!trip || !verEntry) return;
    const win = window.open('', '_blank', 'width=1180,height=820');
    if (win) {
      win.document.write(
        `<!DOCTYPE html><html lang="ar" dir="rtl"><body style="font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;color:#334155;font-weight:700;">جاري فتح النسخة المحفوظة...</body></html>`
      );
    }

    try {
      const versions = getEffectiveDocVersions(trip);
      const currentVer = versions.find((v) => v.status === 'current') || null;
      const hasDrift = Boolean(trip.planDrift?.hasPlanDrift);

      const snapshotModel =
        verEntry.modelSnapshot ||
        reconstructSnapshotModelFromDispatch(trip, verEntry.sourceSnapshot, verEntry.versionNumber || 1);

      // A version is Legacy if explicitly superseded OR if it is older than current OR if live plan drifted after it was printed
      const isLegacy =
        verEntry.status === 'superseded' ||
        (currentVer && Number(currentVer.versionNumber) > Number(verEntry.versionNumber)) ||
        hasDrift;

      // New version is released ONLY if there is a newer 'current' version AND the trip has no unresolved drift
      const newVersionReleased = Boolean(
        currentVer &&
          Number(currentVer.versionNumber) > Number(verEntry.versionNumber) &&
          !hasDrift
      );

      const appOriginUrl =
        typeof window !== 'undefined'
          ? `${window.location.origin}${window.location.pathname}`
          : '';
      const latestVersionUrl = newVersionReleased
        ? `${appOriginUrl}#truck_dispatch?module=sales&tripId=${encodeURIComponent(trip.id)}&openLatestDoc=1`
        : `${appOriginUrl}#truck_dispatch?module=sales&tripId=${encodeURIComponent(trip.id)}`;

      const latestPrintedDisplay = currentVer?.printedAt
        ? new Date(currentVer.printedAt).toLocaleString('ar-EG', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          })
        : '';

      await openRenderedDispatchDoc(
        snapshotModel,
        {
          docNumber: verEntry.docNumber || snapshotModel?.docNumber || '',
          versionNumber: verEntry.versionNumber,
          isLegacy,
          supersededReasonAr:
            verEntry.supersededReasonAr ||
            (hasDrift ? trip.planDrift.summaryAr : ''),
          newVersionReleased,
          latestVersionNumber: currentVer?.versionNumber || null,
          latestDocNumber: currentVer?.docNumber || '',
          latestVersionPrintedAt: latestPrintedDisplay,
          latestVersionUrl,
        },
        win
      );
    } catch (err) {
      console.error('Failed opening saved dispatch version:', err);
      if (win) win.close();
      showToast(isAr ? 'تعذر فتح النسخة المحفوظة' : 'Failed opening archived version', 'error');
    }
  };

  // Opens Preview/Print for ANY Dispatch Document in the global registry — even if its trip/orders/truck are now unlinked or cancelled!
  const handleOpenRegistryDocument = async (entry) => {
    if (!entry) return;
    const win = window.open('', '_blank', 'width=1180,height=820');
    if (win) {
      win.document.write(
        `<!DOCTYPE html><html lang="ar" dir="rtl"><body style="font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;color:#334155;font-weight:700;">جاري فتح المستند المحفوظ (${entry.docNumber || ''})...</body></html>`
      );
    }

    try {
      const liveTrip = entry.tripId ? allTrips.find((t) => t.id === entry.tripId) || null : null;
      let snapshotModel = entry.modelSnapshot || null;

      if (!snapshotModel) {
        // Fallback reconstruction for pre-numbering legacy records that lacked modelSnapshot
        const fallbackTrip = liveTrip || {
          id: entry.tripId || entry.id,
          loadingDate: entry.loadingDate || '—',
          loadingOrderNumber: entry.loadingOrderNumber || '—',
          vehicleDisplayName: entry.vehicleName || '—',
          plateNumber: entry.plateNumber || '',
          primaryDriverName: entry.driverName || '—',
          primaryRepName: entry.deliveryRepName || '',
          orders: [],
          dispatchDoc: entry.sourceSnapshot || {},
        };
        snapshotModel = reconstructSnapshotModelFromDispatch(
          fallbackTrip,
          entry.sourceSnapshot || liveTrip?.dispatchDoc || {},
          entry.versionNumber || 1
        );
      }

      const isLegacy = entry.status !== 'valid';
      const newVersionReleased = Boolean(isLegacy && entry.latestValidDocNumber);

      const appOriginUrl =
        typeof window !== 'undefined'
          ? `${window.location.origin}${window.location.pathname}`
          : '';
      const latestVersionUrl = newVersionReleased && entry.tripId
        ? `${appOriginUrl}#truck_dispatch?module=sales&tripId=${encodeURIComponent(entry.tripId)}&openLatestDoc=1`
        : '';

      const latestPrintedDisplay = entry.latestValidPrintedAt
        ? new Date(entry.latestValidPrintedAt).toLocaleString('ar-EG', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          })
        : '';

      const headlineByCode = {
        trip_reversed_pending: 'الرحلة أعيدت لمعلق',
        trip_cancelled_or_unlinked: 'إلغاء الطلبات وفك الرحلة',
        trip_unlinked: 'الرحلة غير مرتبطة',
        order_cancelled: 'إلغاء طلب بالرحلة',
        plan_drift: 'تعديل خطة الرحلة',
        dispatch_edited: 'تعديل بيان الصرف',
        superseded: 'استُبدل بإصدار أحدث',
      };

      await openRenderedDispatchDoc(
        snapshotModel,
        {
          docNumber: entry.docNumber || snapshotModel?.docNumber || '',
          versionNumber: entry.versionNumber || snapshotModel?.versionNumber || 1,
          isLegacy,
          legacyHeadlineAr: entry.reasonAr ? '' : (headlineByCode[entry.reasonCode] || ''),
          supersededReasonAr: entry.reasonAr || '',
          newVersionReleased,
          latestVersionNumber: entry.latestValidVersionNumber || null,
          latestDocNumber: entry.latestValidDocNumber || '',
          latestVersionPrintedAt: latestPrintedDisplay,
          latestVersionUrl,
        },
        win
      );
    } catch (err) {
      console.error('Failed opening registry dispatch document:', err);
      if (win) win.close();
      showToast(isAr ? 'تعذر فتح المستند المحفوظ' : 'Failed opening archived document', 'error');
    }
  };

  const handlePrintPlaceholderDoc = async (trip, kind) => {
    if (!trip) return;
    const isDisp = kind === 'dispatch';

    // Open print window synchronously on click to avoid popup blockers
    const win = window.open('', '_blank', isDisp ? 'width=1180,height=820' : 'width=820,height=640');

    if (isDisp) {
      if (win) {
        win.document.write(
          `<!DOCTYPE html><html lang="ar" dir="rtl"><body style="font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;color:#334155;font-weight:700;">جاري تجهيز إذن الصرف ورموز QR...</body></html>`
        );
      }

      try {
        const dDoc = trip.dispatchDoc || {};
        const storedVersions = Array.isArray(dDoc.dispatchDocVersions) ? dDoc.dispatchDocVersions : [];
        // If this trip was printed before dispatchDocVersions existed, preserve that prior print as Legacy v1 first!
        const prevVersions =
          storedVersions.length > 0
            ? storedVersions
            : dDoc.dispatchPrintedAt
            ? [
                {
                  versionId: `DOC-V1-BACKFILL-${Date.now()}`,
                  versionNumber: 1,
                  printedAt: dDoc.dispatchPrintedAt,
                  printedBy: dDoc.dispatchPrintedBy || dDoc.dispatchedByName || '',
                  status: 'superseded',
                  supersededReasonAr:
                    (Array.isArray(dDoc.dispatchHistory) && dDoc.dispatchHistory[0]?.reasonAr) ||
                    (trip.planDrift?.hasPlanDrift ? trip.planDrift.summaryAr : 'تم تعديل بيان الصرف بعد الطباعة'),
                  modelSnapshot: JSON.parse(
                    JSON.stringify(
                      reconstructSnapshotModelFromDispatch(
                        trip,
                        Array.isArray(dDoc.dispatchHistory) && dDoc.dispatchHistory.length > 0
                          ? dDoc.dispatchHistory[0]
                          : dDoc,
                        1
                      )
                    )
                  ),
                },
              ]
            : [];
        const existingCurrent = prevVersions.find((v) => v.status === 'current') || null;
        const dispPrintState = trip.planDrift?.hasPlanDrift
          ? (dDoc.dispatchPrintedAt ? 'printed_stale' : 'not_printed')
          : getDocPrintStatus(
              dDoc.dispatchPrintedAt,
              dDoc.dispatchContentUpdatedAt || dDoc.updatedAt || dDoc.dispatchedAt
            );

        // Reuse current version & docNumber only if already printed & still 100% up-to-date; otherwise mint next unique docNumber
        const shouldMintNewVersion =
          !existingCurrent ||
          dispPrintState !== 'printed_current' ||
          !existingCurrent.docNumber;
        const maxVerNum = prevVersions.reduce((m, v) => Math.max(m, Number(v.versionNumber || 0)), 0);
        const nextVersionNumber = shouldMintNewVersion ? maxVerNum + 1 : existingCurrent.versionNumber;

        let assignedDocNumber = existingCurrent?.docNumber || '';
        let assignedDocSeq = Number(existingCurrent?.docSeq || 0);
        if (shouldMintNewVersion) {
          const minted = await mintDispatchDocNumber(db);
          assignedDocNumber = minted.docNumber;
          assignedDocSeq = minted.docSeq;
        }

        const appOriginUrl =
          typeof window !== 'undefined'
            ? `${window.location.origin}${window.location.pathname}`
            : '';

        const model = buildDispatchDocumentModel({
          trip,
          finishedProducts: products,
          clients,
          companyProfile,
          appOriginUrl,
          versionNumber: nextVersionNumber,
          docNumber: assignedDocNumber,
        });

        await openRenderedDispatchDoc(
          model,
          { docNumber: assignedDocNumber, versionNumber: nextVersionNumber, isLegacy: false },
          win
        );

        const nowIso = new Date().toISOString();
        const actorId = currentUser?.id || currentUser?.uid || 'system';
        const actorName = isAr
          ? (currentUser?.nameAr || currentUser?.name || currentUser?.id || 'system')
          : (currentUser?.name || currentUser?.nameAr || currentUser?.id || 'system');

        const printPayload = {
          dispatchPrintedAt: nowIso,
          dispatchPrintedBy: actorName,
          latestDispatchDocVersion: nextVersionNumber,
          latestDispatchDocNumber: assignedDocNumber,
        };

        if (shouldMintNewVersion) {
          const sanitizedSnapshot = JSON.parse(JSON.stringify(model));
          const updatedVersions = [
            ...prevVersions.map((v) =>
              v.status === 'current'
                ? {
                    ...v,
                    status: 'superseded',
                    supersededAt: v.supersededAt || nowIso,
                    supersededByVersion: nextVersionNumber,
                    supersededByDocNumber: assignedDocNumber,
                  }
                : v
            ),
            {
              versionId: `DOC-V${nextVersionNumber}-${Date.now()}`,
              docNumber: assignedDocNumber,
              docSeq: assignedDocSeq,
              versionNumber: nextVersionNumber,
              printedAt: nowIso,
              printedBy: actorName,
              status: 'current',
              modelSnapshot: sanitizedSnapshot,
            },
          ];
          printPayload.dispatchDocVersions = updatedVersions;

          // Persist immutable record to top-level `dispatch_documents/{docNumber}` & supersede any prior docs for this trip
          const registryEntry = buildRegistryEntryPayload({
            docNumber: assignedDocNumber,
            docSeq: assignedDocSeq,
            trip,
            model: sanitizedSnapshot,
            versionNumber: nextVersionNumber,
            printedAt: nowIso,
            printedBy: actorName,
            printedById: actorId,
          });
          const commitPrintFn = httpsCallable(functions, 'salesCommitPrintedDocument');
          await commitPrintFn({
            tripId: trip.id,
            kind: 'dispatch',
            printPayload,
            registryEntry,
            currentUser: currentUser ? { id: currentUser.id, name: currentUser.name, nameAr: currentUser.nameAr } : null,
          });
        } else {
          const commitPrintFn = httpsCallable(functions, 'salesCommitPrintedDocument');
          await commitPrintFn({
            tripId: trip.id,
            kind: 'dispatch',
            printPayload,
            currentUser: currentUser ? { id: currentUser.id, name: currentUser.name, nameAr: currentUser.nameAr } : null,
          });
        }
      } catch (err) {
        console.error('Failed building dispatch document:', err);
        if (win) win.close();
        showToast(isAr ? 'تعذر تجهيز مستند الصرف للطباعة' : 'Failed preparing dispatch document', 'error');
      }
      return;
    }

    const retWin = win || window.open('', '_blank', 'width=1180,height=820');
    if (retWin && win === null) {
      retWin.document.write(
        `<!DOCTYPE html><html lang="ar" dir="rtl"><body style="font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;color:#334155;font-weight:700;">جاري تجهيز إذن استلام المرتجع...</body></html>`
      );
    }

    try {
      const dDoc = trip.dispatchDoc || {};
      const retPrintState = getDocPrintStatus(
        dDoc?.returnPrintedAt,
        dDoc?.returnContentUpdatedAt || dDoc?.whReturnConfirmedAt || dDoc?.accountantReturnSubmittedAt
      );

      let assignedRetNumber = dDoc?.latestReturnDocNumber || '';
      let assignedRetSeq = Number(dDoc?.returnDocSeq || 0);
      if (!assignedRetNumber || retPrintState !== 'printed_current') {
        const mintedRet = await mintReturnDocNumber(db);
        assignedRetNumber = mintedRet.returnDocNumber;
        assignedRetSeq = mintedRet.returnDocSeq;
      }

      const appOriginUrl =
        typeof window !== 'undefined'
          ? `${window.location.origin}${window.location.pathname}`
          : '';

      const retModel = buildReturnDocumentModel({
        trip,
        finishedProducts: products,
        companyProfile,
        appOriginUrl,
        returnDocNumber: assignedRetNumber,
      });

      let systemTripQr = '';
      try {
        systemTripQr = await generateQRCodeDataURL(retModel.systemTripUrl, {
          width: 140,
          margin: 1,
          errorCorrectionLevel: 'M',
        });
      } catch (_) {}

      const html = renderReturnDocumentHtml(retModel, { systemTripQr });
      if (retWin) {
        retWin.document.open();
        retWin.document.write(html);
        retWin.document.close();
      }

      const nowIso = new Date().toISOString();
      const actorName = isAr
        ? (currentUser?.nameAr || currentUser?.name || currentUser?.id || 'system')
        : (currentUser?.name || currentUser?.nameAr || currentUser?.id || 'system');
      const commitPrintFn = httpsCallable(functions, 'salesCommitPrintedDocument');
      await commitPrintFn({
        tripId: trip.id,
        kind: 'return',
        printPayload: {
          returnPrintedAt: nowIso,
          returnPrintedBy: actorName,
          latestReturnDocNumber: assignedRetNumber,
          returnDocSeq: assignedRetSeq,
        },
        currentUser: currentUser ? { id: currentUser.id, name: currentUser.name, nameAr: currentUser.nameAr } : null,
      });
    } catch (err) {
      console.error('Failed building return document:', err);
      if (retWin) retWin.close();
      showToast(isAr ? 'تعذر تجهيز إذن استلام المرتجع للطباعة' : 'Failed preparing return document', 'error');
    }
  };

  const showToast = (message, type = 'success') => {
    setToastMsg({ message, type });
    setTimeout(() => setToastMsg(null), 4200);
  };

  // Subscribe to Firestore Streams
  useEffect(() => {
    let loaded = { orders: false, dispatches: false };
    const checkDone = () => {
      if (loaded.orders && loaded.dispatches) setLoading(false);
    };

    const unsubOrders = onSnapshot(collection(db, 'sales_orders'), (snap) => {
      setOrders(snap.docs.map((d) => ({ ...d.data(), id: d.id })).filter((d) => !d.isDeleted));
      loaded.orders = true;
      checkDone();
    });

    const unsubDispatches = onSnapshot(collection(db, 'truck_dispatches'), (snap) => {
      setTruckDispatches(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
      loaded.dispatches = true;
      checkDone();
    });

    const unsubVehicles = onSnapshot(collection(db, 'vehicles'), (snap) => {
      setVehicles(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
    });

    const unsubProducts = onSnapshot(collection(db, 'finished_products'), (snap) => {
      setProducts(snap.docs.map((d) => ({ ...d.data(), id: d.id, code: d.data().code || d.id })));
    });

    const unsubPallets = onSnapshot(collection(db, 'staged_floor_pallets'), (snap) => {
      setStagedPallets(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
    });

    const unsubTransfers = onSnapshot(collection(db, 'stock_transfers'), (snap) => {
      setStockTransfers(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
    });

    const unsubFaulty = onSnapshot(collection(db, 'faulty_fg_returns'), (snap) => {
      setFaultyReturns(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
    });

    const unsubClients = onSnapshot(collection(db, 'clients'), (snap) => {
      setClients(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
    });

    const unsubCompany = onSnapshot(doc(db, 'system_config', 'company_profile'), (snap) => {
      if (snap.exists()) setCompanyProfile(snap.data() || {});
    });

    const unsubRegistryDocs = onSnapshot(collection(db, DISPATCH_DOCUMENTS_COLLECTION), (snap) => {
      setRegistryDocs(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
    });

    return () => {
      unsubOrders();
      unsubDispatches();
      unsubVehicles();
      unsubProducts();
      unsubPallets();
      unsubTransfers();
      unsubFaulty();
      unsubClients();
      unsubCompany();
      unsubRegistryDocs();
      orderLookupUnsubsRef.current.forEach((u) => {
        try { u(); } catch (_) {}
      });
      orderLookupUnsubsRef.current = [];
    };
  }, []);

  // Lazy-load pricing & segment lookups only when Return Receiving opens inline Sales Order editing
  useEffect(() => {
    if (!activeReturnTripId || orderLookupUnsubsRef.current.length > 0) return;
    const unsubSeg = onSnapshot(collection(db, 'client_segments'), (snap) => {
      setSegments(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    const unsubCat = onSnapshot(collection(db, 'finished_product_categories'), (snap) => {
      if (!snap.empty) {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        list.sort((a, b) => (Number(a.sortOrder) || 99) - (Number(b.sortOrder) || 99));
        setProductCategories(list);
      }
    });
    const unsubPl = onSnapshot(collection(db, 'price_lists'), (snap) => {
      setPriceLists(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    const unsubStrat = onSnapshot(collection(db, 'pricing_strategies'), (snap) => {
      if (!snap.empty) setStrategies(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    const unsubStdRetail = onSnapshot(doc(db, 'system_config', 'retail_standard_load_list'), (snap) => {
      if (snap.exists()) setStdRetailList(Array.isArray(snap.data()?.items) ? snap.data().items : []);
    });
    orderLookupUnsubsRef.current = [unsubSeg, unsubCat, unsubPl, unsubStrat, unsubStdRetail];
  }, [activeReturnTripId]);

  // System-Only QR & Cross-Tab Deep-Link Listener: expand filters, highlight exact trip card, open Return Modal or warn if Legacy
  useEffect(() => {
    const focusTripCard = (tripId, docVersion = '', openLatestDoc = '', docNumber = '', openReturn = '') => {
      if (!tripId && !docNumber) return;
      setDateFilter('all');
      setStatusFilter('all');
      setSearchTerm('');
      if (docVersion || openLatestDoc || docNumber || openReturn) {
        setScannedDocAlert({
          tripId: tripId || '',
          docVersion: Number(docVersion) || null,
          docNumber: docNumber || '',
          openLatestDoc: openLatestDoc === '1' || openLatestDoc === 'true',
          openReturn: openReturn === '1' || openReturn === 'true',
        });
      }
      if (tripId) {
        setTimeout(() => {
          highlightTargetRow(tripId);
        }, 350);
      }
    };

    const handleFocusEvent = (e) => {
      const tripId = e?.detail?.tripId || e?.detail?.recordId;
      const docNum = e?.detail?.docNumber || '';
      const openRet = e?.detail?.openReturn || '';
      if (tripId || docNum) {
        focusTripCard(tripId, e?.detail?.docVersion, e?.detail?.openLatestDoc, docNum, openRet);
      }
    };

    // Also inspect initial URL hash on mount (e.g. scanned QR opened in fresh browser tab)
    try {
      const rawHash = window.location.hash || '';
      const [, hQuery] = rawHash.replace(/^#/, '').split('?');
      if (hQuery) {
        const params = new URLSearchParams(hQuery);
        const initialTripId = params.get('tripId') || params.get('recordId');
        const initialDocNum = params.get('docNumber') || '';
        const initialOpenRet = params.get('openReturn') || '';
        if (initialTripId || initialDocNum) {
          focusTripCard(
            initialTripId,
            params.get('docVersion') || '',
            params.get('openLatestDoc') || '',
            initialDocNum,
            initialOpenRet
          );
        }
      }
    } catch (_) {}

    window.addEventListener('app_focus_trip_dispatch', handleFocusEvent);
    return () => window.removeEventListener('app_focus_trip_dispatch', handleFocusEvent);
  }, []);

  // Unified Staff & Workers Pool (`employees` SSOT + any unlinked `users`)
  useEffect(() => {
    let users = [];
    let emps = [];

    const rebuildPool = () => {
      setWorkerPool(
        buildUnifiedPersonnelPool({
          employees: emps,
          users,
          isAr,
        })
      );
    };

    const u1 = onSnapshot(collection(db, 'employees'), (s) => {
      emps = s.docs.map((d) => ({ id: d.id, ...d.data() }));
      setEmployeesList(emps);
      rebuildPool();
    });
    const u2 = onSnapshot(collection(db, 'users'), (s) => {
      users = s.docs.map((d) => ({ id: d.id, ...d.data() }));
      setSubscribedUsers(users);
      rebuildPool();
    });
    return () => {
      u1();
      u2();
    };
  }, [isAr]);

  const effectiveUsersList = usersList.length > 0 ? usersList : subscribedUsers;
  const eligibleOrderSettlers = useMemo(
    () =>
      resolveEligibleSalesOrderSettlers({
        users: effectiveUsersList,
        employees: employeesList,
        departments: departmentsList,
        departmentOverrides,
        userOverrides,
        excludeActorId: currentUser?.id || null,
      }),
    [effectiveUsersList, employeesList, departmentsList, departmentOverrides, userOverrides, currentUser?.id]
  );

  // Live SSOT FG Stock Matrix (to display live shelf balance hints inside Dispatch Modal)
  const stockMatrixSkuMap = useMemo(() => {
    const { skuMap } = buildFgStockMatrix({
      finishedProducts: products,
      stagedPallets,
      stockTransfers,
      faultyReturns,
      salesOrders: orders,
      truckDispatches,
    });
    return skuMap;
  }, [products, stagedPallets, stockTransfers, faultyReturns, orders, truckDispatches]);

  // All Catalog Trips sorted Most Recent First + Live Post-Dispatch Plan Drift Detection
  const allTrips = useMemo(() => {
    const rawTrips = buildTripsCatalog({
      orders,
      vehicles,
      truckDispatches,
      todayStr,
    });
    return rawTrips.map((trip) => ({
      ...trip,
      planDrift: detectPostDispatchPlanChanges({ trip, finishedProducts: products }),
    }));
  }, [orders, vehicles, truckDispatches, todayStr, products]);

  // Full Dispatch Documents Registry (canonical `dispatch_documents` + pre-numbering legacy archive, with live Valid/Legacy evaluation)
  const dispatchDocumentsRegistry = useMemo(() => {
    return buildDispatchDocumentsRegistry({
      registryDocs,
      truckDispatches,
      allTrips,
      orders,
    });
  }, [registryDocs, truckDispatches, allTrips, orders]);

  // Auto-open latest document / Return Modal if arrived via deep link,
  // or open the History Modal if scanning a QR whose trip is no longer linked to active trips
  useEffect(() => {
    if (!scannedDocAlert) return;
    if (scannedDocAlert.openReturn && scannedDocAlert.tripId && !loading) {
      const targetTrip = allTrips.find((t) => t.id === scannedDocAlert.tripId);
      if (targetTrip) {
        if (targetTrip.needsReturnInspection) {
          setActiveReturnTripId(targetTrip.id);
        } else {
          setTimeout(() => highlightTargetRow(targetTrip.id), 250);
        }
        setScannedDocAlert(null);
        return;
      }
    }
    if (scannedDocAlert.openLatestDoc && scannedDocAlert.tripId) {
      const targetTrip = allTrips.find((t) => t.id === scannedDocAlert.tripId);
      if (targetTrip) {
        const versions = Array.isArray(targetTrip.dispatchDoc?.dispatchDocVersions)
          ? targetTrip.dispatchDoc.dispatchDocVersions
          : [];
        const currentVer = versions.find((v) => v.status === 'current');
        if (currentVer) {
          setScannedDocAlert(null);
          handleOpenSavedDocVersion(targetTrip, currentVer);
          return;
        }
      }
    }
    if (scannedDocAlert.docNumber && !loading) {
      const targetTrip = scannedDocAlert.tripId
        ? allTrips.find((t) => t.id === scannedDocAlert.tripId)
        : null;
      if (!targetTrip) {
        setHighlightHistoryDocNumber(scannedDocAlert.docNumber);
        setIsDocsHistoryOpen(true);
        setScannedDocAlert(null);
      }
    }
  }, [scannedDocAlert, allTrips, loading]);

  // URL Deep-Link Highlight Auto-Focus (switches to 'all' if highlighted trip isn't today)
  useEffect(() => {
    const hash = window.location.hash || '';
    const qIdx = hash.indexOf('?');
    if (qIdx === -1) return;
    const params = new URLSearchParams(hash.slice(qIdx + 1));
    const hId = params.get('highlight');
    if (hId) {
      const targetTrip = allTrips.find((t) => t.id === hId);
      if (targetTrip && targetTrip.loadingDate !== todayStr) {
        setDateFilter('all');
      }
    }
  }, [allTrips.length, todayStr]);

  const filteredTrips = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return allTrips.filter((t) => {
      if (dateFilter === 'today' && t.loadingDate !== todayStr) return false;
      if (dateFilter === 'custom' && customDate && t.loadingDate !== customDate) return false;

      if (statusFilter === 'ready_to_load' && t.tripStage !== 'ready_to_load') return false;
      if (
        statusFilter === 'loaded' &&
        !['loaded_pending_docs', 'dispatched', 'delivered', 'reconciled'].includes(t.tripStage)
      ) {
        return false;
      }
      if (statusFilter === 'delivered' && !t.allDelivered) return false;
      if (statusFilter === 'return_needed' && !t.hasPendingReturnAction) return false;
      if (statusFilter === 'discrepancy' && !t.returnDiscrepancy?.hasDiscrepancy) return false;
      if (statusFilter === 'pending' && t.tripStage !== 'pending') return false;

      if (q) {
        const vehMatch = (t.vehicleDisplayName || '').toLowerCase().includes(q);
        const drvMatch = (t.primaryDriverName || '').toLowerCase().includes(q);
        const tripNumMatch = `#${t.loadingOrderNumber}`.includes(q) || `lo-${t.loadingOrderNumber}`.includes(q);
        const orderMatch = t.orders.some(
          (o) =>
            (o.clientName || '').toLowerCase().includes(q) ||
            String(o.serial || o.id || '').toLowerCase().includes(q)
        );
        if (!vehMatch && !drvMatch && !tripNumMatch && !orderMatch) return false;
      }
      return true;
    });
  }, [allTrips, dateFilter, customDate, todayStr, statusFilter, searchTerm]);

  const activeDispatchTrip = useMemo(
    () => allTrips.find((t) => t.id === activeDispatchTripId) || null,
    [allTrips, activeDispatchTripId]
  );

  const activeReturnTrip = useMemo(
    () => allTrips.find((t) => t.id === activeReturnTripId) || null,
    [allTrips, activeReturnTripId]
  );

  const auditTrip = useMemo(
    () => allTrips.find((t) => t.id === auditTripId) || null,
    [allTrips, auditTripId]
  );

  const versionsModalTrip = useMemo(
    () => allTrips.find((t) => t.id === versionsModalTripId) || null,
    [allTrips, versionsModalTripId]
  );

  // KPI Counters scoped to visible date window ('today' by default)
  const kpiTripsPool = useMemo(() => {
    if (dateFilter === 'today') return allTrips.filter((t) => t.loadingDate === todayStr);
    if (dateFilter === 'custom' && customDate) return allTrips.filter((t) => t.loadingDate === customDate);
    return allTrips;
  }, [allTrips, dateFilter, customDate, todayStr]);

  const kpis = useMemo(() => {
    const totalTrips = kpiTripsPool.length;
    const readyToLoad = kpiTripsPool.filter((t) => t.tripStage === 'ready_to_load').length;
    const whLoaded = kpiTripsPool.filter((t) => t.isWarehouseConfirmed).length;
    const pendingReturns = allTrips.filter((t) => t.hasPendingReturnAction).length;
    const totalExtrasOut = roundQty(
      kpiTripsPool
        .filter((t) => t.returnHandshakeStatus !== 'reconciled')
        .reduce((s, t) => s + t.totalExtrasCartons, 0)
    );
    return { totalTrips, readyToLoad, whLoaded, pendingReturns, totalExtrasOut };
  }, [kpiTripsPool, allTrips]);

  if (loading) {
    return (
      <div className="min-h-[420px] flex items-center justify-center">
        <PeacockLoader size="lg" text={isAr ? 'جاري تحميل رحلات وأذون الشاحنات...' : 'Loading Truck Dispatches...'} />
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-[1600px] w-full mx-auto pb-16">
      {toastMsg && (
        <div
          className={`fixed top-16 end-4 z-50 flex items-center gap-2 px-4 py-2.5 rounded-2xl shadow-lg border text-xs font-bold animate-in fade-in ${
            toastMsg.type === 'warning'
              ? 'bg-amber-600 text-white border-amber-700'
              : 'bg-emerald-600 text-white border-emerald-700'
          }`}
        >
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{toastMsg.message}</span>
        </div>
      )}

      {/* KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="bg-white border border-slate-200 rounded-2xl p-3 shadow-2xs">
          <span className="text-[11px] font-bold text-slate-400 block">
            {dateFilter === 'today' ? (isAr ? 'رحلات اليوم' : "Today's Trips") : (isAr ? 'إجمالي الرحلات' : 'Total Trips')}
          </span>
          <span className="text-xl font-black font-mono text-slate-900">{kpis.totalTrips}</span>
        </div>

        <div className="bg-amber-50/70 border border-amber-200 rounded-2xl p-3 shadow-2xs">
          <span className="text-[11px] font-bold text-amber-800 block">
            {isAr ? 'جاهزة للتحميل (Preparing)' : 'Ready to Load (Preparing)'}
          </span>
          <span className="text-xl font-black font-mono text-amber-900">{kpis.readyToLoad}</span>
        </div>

        <div className="bg-emerald-50/70 border border-emerald-200 rounded-2xl p-3 shadow-2xs">
          <span className="text-[11px] font-bold text-emerald-800 block">
            {isAr ? 'معتمدة مخزنياً ✓' : 'WH Dispatched ✓'}
          </span>
          <span className="text-xl font-black font-mono text-emerald-900">{kpis.whLoaded}</span>
        </div>

        <div className="bg-teal-50/70 border border-teal-200 rounded-2xl p-3 shadow-2xs">
          <span className="text-[11px] font-bold text-teal-800 block">
            {isAr ? 'زيادات رحلات بالخارج' : 'Extras Out on Road'}
          </span>
          <span className="text-xl font-black font-mono text-teal-900">
            {fmtCtn(kpis.totalExtrasOut)} <span className="text-xs font-sans font-bold">{isAr ? 'كرتونة' : 'ctn'}</span>
          </span>
        </div>

        <div
          className={`rounded-2xl p-3 border shadow-2xs ${
            kpis.pendingReturns > 0 ? 'bg-rose-50/80 border-rose-200' : 'bg-white border-slate-200'
          }`}
        >
          <span className={`text-[11px] font-bold block ${kpis.pendingReturns > 0 ? 'text-rose-800' : 'text-slate-400'}`}>
            {isAr ? 'بانتظار تسوية / تأكيد مرتجع' : 'Pending Return Handshake'}
          </span>
          <span className={`text-xl font-black font-mono ${kpis.pendingReturns > 0 ? 'text-rose-800' : 'text-slate-900'}`}>
            {kpis.pendingReturns}
          </span>
        </div>
      </div>

      {/* Filters Toolbar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-3 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
        <div className="flex flex-wrap items-center gap-2">
          {/* Focus Date Switcher (Default: Today) */}
          <div className="inline-flex bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-extrabold">
            <button
              type="button"
              onClick={() => setDateFilter('today')}
              className={`px-3 py-1 rounded-lg transition cursor-pointer ${
                dateFilter === 'today' ? 'bg-slate-900 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {isAr ? `اليوم (${todayStr})` : `Today (${todayStr})`}
            </button>
            <button
              type="button"
              onClick={() => setDateFilter('all')}
              className={`px-3 py-1 rounded-lg transition cursor-pointer ${
                dateFilter === 'all' ? 'bg-slate-900 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {isAr ? 'الأحدث أولاً (الكل)' : 'Most Recent (All)'}
            </button>
            <button
              type="button"
              onClick={() => setDateFilter('custom')}
              className={`px-3 py-1 rounded-lg transition cursor-pointer ${
                dateFilter === 'custom' ? 'bg-slate-900 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {isAr ? 'تاريخ محدد' : 'Pick Date'}
            </button>
          </div>

          {dateFilter === 'custom' && (
            <input
              type="date"
              value={customDate}
              onChange={(e) => setCustomDate(e.target.value)}
              className="text-xs font-mono font-bold border border-slate-300 rounded-xl px-2.5 py-1.5 outline-none focus:border-teal-600"
            />
          )}

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-xs font-bold border border-slate-300 rounded-xl px-3 py-1.5 bg-white outline-none focus:border-teal-600"
          >
            <option value="all">{isAr ? 'كل حالات الرحلات' : 'All Trip Stages'}</option>
            <option value="ready_to_load">{isAr ? 'جاري التجهيز (جاهز للتحميل)' : 'Preparing (Ready to Load)'}</option>
            <option value="loaded">{isAr ? 'تم التحميل / جاري التوصيل' : 'Loaded / Out for Delivery'}</option>
            <option value="delivered">{isAr ? 'تم التسليم ✓' : 'Delivered ✓'}</option>
            <option value="return_needed">{isAr ? 'يتطلب تأكيد / مطابقة مرتجع' : 'Return Inspection Needed'}</option>
            <option value="discrepancy">{isAr ? 'فرق مرتجعات ⚠️' : 'Return Discrepancy ⚠️'}</option>
            <option value="pending">{isAr ? 'قيد الانتظار (Pending)' : 'Pending (Disabled)'}</option>
          </select>
        </div>

        {/* Search & Full Printed Documents History Trigger */}
        <div className="flex flex-wrap items-center gap-2 flex-1 justify-end min-w-[260px]">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={isAr ? 'بحث برقم الرحلة، الشاحنة، السائق أو العميل...' : 'Search Trip #, truck, driver or client...'}
              className="w-full ps-9 pe-3 py-1.5 text-xs font-bold border border-slate-300 rounded-xl bg-slate-50 focus:bg-white focus:border-teal-600 outline-none"
            />
          </div>

          <button
            type="button"
            onClick={() => {
              setHighlightHistoryDocNumber('');
              setIsDocsHistoryOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-extrabold transition cursor-pointer shadow-2xs shrink-0"
            title={
              isAr
                ? 'عرض السجل الكامل لمستندات الصرف المطبوعة (السارية والقديمة وغير المرتبطة)'
                : 'View full registry of printed dispatch documents (Valid, Legacy & Unlinked)'
            }
          >
            <FileText className="w-3.5 h-3.5 text-teal-300" />
            <span>{isAr ? 'سجل المستندات' : 'Docs History'}</span>
            <span className="px-1.5 py-0.5 rounded-md bg-white/15 font-mono text-[10.5px] font-black">
              {dispatchDocumentsRegistry.length}
            </span>
          </button>
        </div>
      </div>

      {/* Trips List (Sorted Most Recent First) */}
      {filteredTrips.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center space-y-2 shadow-2xs">
          <Truck className="w-10 h-10 text-slate-300 mx-auto" />
          <p className="text-sm font-black text-slate-700">
            {dateFilter === 'today'
              ? (isAr ? 'لا توجد رحلات مجدولة لهذا اليوم حتى الآن.' : 'No scheduled trips found for Today yet.')
              : (isAr ? 'لا توجد رحلات مطابقة لمعايير البحث.' : 'No trips match the active filters.')}
          </p>
          {dateFilter === 'today' && allTrips.length > 0 && (
            <button
              type="button"
              onClick={() => setDateFilter('all')}
              className="mt-2 px-4 py-1.5 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 transition cursor-pointer"
            >
              {isAr ? `عرض أحدث الرحلات (${allTrips.length})` : `Show Most Recent Trips (${allTrips.length})`}
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredTrips.map((trip) => {
            const isDisabledPending = !trip.isLoadingUnlocked;
            const dDoc = trip.dispatchDoc;
            const hasRetDisc = Boolean(trip.returnDiscrepancy?.hasDiscrepancy);

            return (
              <div
                key={trip.id}
                id={`row-${trip.id}`}
                data-highlight-id={trip.id}
                className={`rounded-3xl border p-4 transition-all shadow-2xs ${
                  hasRetDisc
                    ? 'bg-rose-50/55 border-rose-400 ring-2 ring-rose-300/60'
                    : isDisabledPending
                    ? 'bg-slate-100/80 border-slate-200 opacity-75'
                    : trip.allDelivered || trip.tripStage === 'reconciled'
                    ? 'bg-emerald-50/35 border-emerald-200'
                    : trip.allDispatchedOut
                    ? 'bg-sky-50/35 border-sky-200'
                    : trip.isWarehouseConfirmed
                    ? 'bg-teal-50/35 border-teal-300'
                    : 'bg-amber-50/45 border-amber-300'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  {/* Left Identity & Dual Gate Badges */}
                  <div className="space-y-1.5 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-baseline gap-1 px-2.5 py-1 rounded-xl bg-slate-900 text-white shadow-2xs">
                        <span className="text-[10px] font-normal text-slate-300 leading-none">
                          {isAr ? 'رحلة#' : 'Trip#'}
                        </span>
                        <span className="font-mono text-base font-black leading-none">
                          {trip.loadingOrderNumber}
                        </span>
                      </span>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-100 border border-slate-200 text-[11px] font-mono font-bold text-slate-700">
                        <Calendar className="w-3 h-3 text-slate-500" />
                        {trip.loadingDate}
                      </span>

                      {/* Synced Fulfillment Status Badge (SSOT across Sales Orders, Loading Plan & Truck Dispatch) */}
                      {isDisabledPending ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-slate-200 text-slate-600 text-[11px] font-extrabold">
                          <Clock className="w-3 h-3" />
                          {isAr ? 'قيد الانتظار (مغلق لحين التجهيز)' : 'Pending — Disabled'}
                        </span>
                      ) : trip.allPaid ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-indigo-100 text-indigo-900 border border-indigo-300 text-[11px] font-black">
                          <CheckCircle2 className="w-3 h-3" />
                          {isAr ? 'مدفوع ✓' : 'Paid ✓'}
                        </span>
                      ) : trip.allDelivered ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-emerald-100 text-emerald-900 border border-emerald-300 text-[11px] font-black">
                          <CheckCircle2 className="w-3 h-3" />
                          {isAr ? 'تم التسليم ✓' : 'Delivered ✓'}
                        </span>
                      ) : trip.allDispatchedOut ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-sky-100 text-sky-900 border border-sky-300 text-[11px] font-black">
                          <Truck className="w-3 h-3" />
                          {isAr ? 'جاري التوصيل' : 'Out for Delivery'}
                        </span>
                      ) : (
                        <>
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-amber-100 text-amber-900 border border-amber-300 text-[11px] font-black">
                            <Boxes className="w-3 h-3" />
                            {isAr ? 'جاري التجهيز' : 'Preparing'}
                          </span>
                          {trip.isWarehouseConfirmed && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-teal-100 text-teal-900 border border-teal-300 text-[10.5px] font-black">
                              <PackageCheck className="w-3 h-3" />
                              {isAr ? 'تم التحميل بالمخزن ✓' : 'WH Loaded ✓'}
                            </span>
                          )}
                        </>
                      )}

                      {/* Companion Return Handshake & Discrepancy Alert Chips */}
                      {trip.returnHandshakeStatus === 'reconciled' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-300 text-[10.5px] font-black">
                          <CheckCircle2 className="w-3 h-3" />
                          {isAr ? 'مرتجع مطابق ✓' : 'Return Reconciled ✓'}
                        </span>
                      )}
                      {hasRetDisc && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-rose-100 text-rose-900 border border-rose-400 text-[10.5px] font-black animate-pulse">
                          <AlertTriangle className="w-3 h-3 text-rose-600" />
                          {isAr
                            ? `⚠️ فرق مرتجع (${trip.returnDiscrepancy.netVariance > 0 ? '+' : ''}${trip.returnDiscrepancy.netVariance} كرتونة)`
                            : `⚠️ Return Variance (${trip.returnDiscrepancy.netVariance > 0 ? '+' : ''}${trip.returnDiscrepancy.netVariance} ctn)`}
                        </span>
                      )}
                      {trip.returnHandshakeStatus === 'pending_accounting_confirm' && !hasRetDisc && (
                        <span className="px-2 py-0.5 rounded-lg bg-indigo-100 text-indigo-900 border border-indigo-300 text-[10px] font-black animate-pulse">
                          {isAr ? 'تم استلام المخزن — بانتظار تأكيد المحاسبة' : 'WH Received — Pending Acct Align'}
                        </span>
                      )}
                      {trip.returnHandshakeStatus === 'pending_wh_confirm' && !hasRetDisc && (
                        <span className="px-2 py-0.5 rounded-lg bg-sky-100 text-sky-900 border border-sky-300 text-[10px] font-black animate-pulse">
                          {isAr ? 'بانتظار تأكيد استلام المخزن' : 'Pending WH Receipt Confirm'}
                        </span>
                      )}
                      {trip.returnDiscrepancy?.hasOpenSettlementTask && (
                        <span className="px-2 py-0.5 rounded-lg bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-black">
                          {isAr
                            ? `مهمة تسوية أوامر (${trip.returnDiscrepancy.openSettlementTasks.length})`
                            : `Order Task Open (${trip.returnDiscrepancy.openSettlementTasks.length})`}
                        </span>
                      )}
                      {dDoc?.stockReturnDate && (Boolean(dDoc?.whReturnConfirmedAt) || trip.returnHandshakeStatus === 'reconciled') && dDoc.stockReturnDate > todayStr && (
                        <span className="px-2 py-0.5 rounded-lg bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-mono font-bold">
                          {isAr ? `يُضاف للمخزن: ${dDoc.stockReturnDate}` : `Deferred to: ${dDoc.stockReturnDate}`}
                        </span>
                      )}
                    </div>

                    {/* Vehicle (Name/Model only + Hover Plate + Copy Plate Icon), Driver & Summary Cartons */}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 font-bold">
                      <span
                        className="inline-flex items-center gap-1.5 text-slate-900 font-extrabold"
                        title={
                          trip.plateNumber
                            ? `${trip.vehicleDisplayName} • ${isAr ? 'رقم اللوحة:' : 'Plate #:'} ${trip.plateNumber}`
                            : trip.vehicleDisplayName
                        }
                      >
                        <Truck className="w-3.5 h-3.5 text-teal-600 rtl:-scale-x-100" />
                        <span>{trip.vehicleDisplayName}</span>
                        {trip.plateNumber && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCopyPlateNumber(trip);
                            }}
                            title={isAr ? `نسخ رقم اللوحة (${trip.plateNumber})` : `Copy Plate # (${trip.plateNumber})`}
                            className={`p-1 rounded-lg border transition cursor-pointer ${
                              copiedPlateTripId === trip.id
                                ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                                : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-500 hover:text-slate-800'
                            }`}
                          >
                            {copiedPlateTripId === trip.id ? (
                              <Check className="w-3 h-3" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        )}
                      </span>
                      {trip.primaryDriverName && (
                        <span>{isAr ? 'السائق:' : 'Driver:'} <strong className="text-slate-800">{trip.primaryDriverName}</strong></span>
                      )}
                      <span>
                        {isAr ? 'الطلبات:' : 'Orders:'} <strong className="font-mono text-slate-900">{trip.orders.length}</strong>
                      </span>

                      {/* Clickable Quantity Chip (+ Extras) with Non-Intrusive Breakdown & Weight Indicator Popover */}
                      <div className="relative inline-block" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() =>
                            setOpenQtyTooltipTripId((curr) => (curr === trip.id ? null : trip.id))
                          }
                          title={
                            isAr
                              ? 'انقر لعرض تفاصيل كميات الأصناف والزيادات ومؤشر الحمولة'
                              : 'Click for product quantities, extras & truck weight indicator'
                          }
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl border font-mono text-xs font-black transition cursor-pointer shadow-2xs ${
                            openQtyTooltipTripId === trip.id
                              ? 'bg-slate-900 text-white border-slate-900'
                              : 'bg-amber-50 hover:bg-amber-100 text-slate-900 border-amber-200'
                          }`}
                        >
                          <Boxes className={`w-3.5 h-3.5 shrink-0 ${openQtyTooltipTripId === trip.id ? 'text-teal-300' : 'text-amber-600'}`} />
                          <span>{fmtCtn(trip.totalLockedCartons)}</span>
                          {trip.totalExtrasCartons > 0 && (
                            <span
                              className={`px-1.5 py-0.2 rounded-md text-[10px] font-black ${
                                openQtyTooltipTripId === trip.id
                                  ? 'bg-teal-500/25 text-teal-200'
                                  : 'bg-teal-100 text-teal-800 border border-teal-200'
                              }`}
                            >
                              +{fmtCtn(trip.totalExtrasCartons)} {isAr ? 'زيادات' : 'ext'}
                            </span>
                          )}
                          {trip.hasDeliverySettlementDiff && (
                            <span
                              className={`px-1.5 py-0.2 rounded-md text-[10px] font-black ${
                                openQtyTooltipTripId === trip.id
                                  ? 'bg-emerald-500/25 text-emerald-200'
                                  : 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                              }`}
                              title={
                                isAr
                                  ? 'إجمالي الكمية المُسلَّمة الفعلية بعد تسوية أوامر البيع (المُصرف من البوابة ثابت كما هو)'
                                  : 'Actual delivered cartons after post-dispatch order settlement (Gate dispatched unchanged)'
                              }
                            >
                              {isAr ? `مُسلَّم: ${fmtCtn(trip.totalDeliveredCartons)}` : `Deliv: ${fmtCtn(trip.totalDeliveredCartons)}`}
                            </span>
                          )}
                        </button>

                        {openQtyTooltipTripId === trip.id && (() => {
                          const { columns: summaryCols } = buildTripDispatchMatrix({
                            tripOrders: trip.orders,
                            finishedProducts: products,
                            existingDispatch: dDoc,
                          });
                          const extrasWeightKg = summaryCols.reduce(
                            (s, c) => s + Number(c.extraQty || 0) * Number(c.largeUnitWeightKg || 0),
                            0
                          );
                          const totalLoadKg = roundQty(Number(trip.totalWeightKg || 0) + extrasWeightKg);
                          const maxCapKg = Number(trip.vehicleObj?.maxCapacityKg || 0);
                          const totalTons = totalLoadKg / 1000;
                          const maxTons = maxCapKg / 1000;
                          const capPct = maxCapKg > 0 ? Math.min(100, Math.round((totalLoadKg / maxCapKg) * 100)) : 0;
                          const isOver = maxCapKg > 0 && totalLoadKg > maxCapKg;
                          const isHigh = !isOver && maxCapKg > 0 && capPct >= 85;

                          return (
                            <div className="absolute top-full mt-2 start-0 z-40 w-[330px] sm:w-[400px] bg-white rounded-2xl shadow-2xl border border-slate-200 p-3 text-start animate-in fade-in zoom-in-95 duration-150">
                              {/* Popover Header + Weight Indicator */}
                              <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100">
                                <div className="flex items-center gap-1.5 text-xs font-black text-slate-900">
                                  <Scale className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                                  <span>{isAr ? 'توزيع الكميات والوزن' : 'Product Qty & Weight'}</span>
                                </div>
                                <div
                                  className={`px-2 py-0.5 rounded-lg font-mono text-[11px] font-black border ${
                                    isOver
                                      ? 'bg-rose-50 text-rose-800 border-rose-200'
                                      : isHigh
                                      ? 'bg-amber-50 text-amber-800 border-amber-200'
                                      : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                  }`}
                                >
                                  {maxCapKg > 0
                                    ? `${totalTons.toFixed(2)} / ${maxTons.toFixed(2)} ${isAr ? 'طن' : 'Ton'}`
                                    : `${totalTons.toFixed(2)} ${isAr ? 'طن' : 'Ton'}`}
                                </div>
                              </div>

                              {maxCapKg > 0 && (
                                <div className="mt-2 h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                                  <div
                                    className={`h-full transition-all ${
                                      isOver ? 'bg-rose-500' : isHigh ? 'bg-amber-500' : 'bg-emerald-500'
                                    }`}
                                    style={{ width: `${capPct}%` }}
                                  />
                                </div>
                              )}

                              {/* Product Breakdown Table (No Client / Order columns) */}
                              <div className="mt-2.5 max-h-60 overflow-y-auto border border-slate-200 rounded-xl overflow-hidden">
                                <table className="w-full border-collapse text-[11px] text-start">
                                  <thead>
                                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                                      <th className="py-1.5 px-2 text-start">{isAr ? 'الصنف / التعبئة' : 'Product / Packing'}</th>
                                      <th className="py-1.5 px-1.5 text-center">{isAr ? 'الكمية' : 'Qty'}</th>
                                      <th className="py-1.5 px-1.5 text-center text-teal-700">{isAr ? 'زيادات' : 'Extras'}</th>
                                      <th className="py-1.5 px-2 text-center">{isAr ? 'الإجمالي' : 'Total'}</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100">
                                    {summaryCols.map((col) => {
                                      const colTot = roundQty(Number(col.lockedQty || 0) + Number(col.extraQty || 0));
                                      return (
                                        <tr key={col.colKey} className="hover:bg-slate-50/70">
                                          <td className="py-1.5 px-2">
                                            <div className="flex items-center gap-1.5 min-w-0">
                                              {col.imageFile && (
                                                <img
                                                  src={col.imageFile}
                                                  alt=""
                                                  className="w-5 h-5 rounded object-cover border border-slate-200 shrink-0"
                                                />
                                              )}
                                              <div className="min-w-0">
                                                <div className="font-extrabold text-slate-900 truncate max-w-[165px]">
                                                  {isAr ? col.shortNameAr : col.shortNameEn}
                                                </div>
                                                <div className="text-[9px] text-indigo-700 font-bold truncate">
                                                  {isAr ? col.optionNameAr : col.optionNameEn}
                                                  <span className="font-mono text-slate-400 ms-1">{col.optionCode}</span>
                                                </div>
                                              </div>
                                            </div>
                                          </td>
                                          <td className="py-1.5 px-1.5 text-center font-mono font-bold text-slate-800">
                                            {fmtCtn(col.lockedQty)}
                                          </td>
                                          <td className="py-1.5 px-1.5 text-center font-mono font-black text-teal-700">
                                            {Number(col.extraQty || 0) > 0 ? `+${fmtCtn(col.extraQty)}` : <span className="text-slate-300">—</span>}
                                          </td>
                                          <td className="py-1.5 px-2 text-center font-mono font-black text-slate-900">
                                            {fmtCtn(colTot)}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                  <tfoot>
                                    <tr className="bg-slate-900 text-white font-black">
                                      <td className="py-1.5 px-2 text-[10px]">{isAr ? 'الإجمالي' : 'Total'}</td>
                                      <td className="py-1.5 px-1.5 text-center font-mono">{fmtCtn(trip.totalLockedCartons)}</td>
                                      <td className="py-1.5 px-1.5 text-center font-mono text-teal-300">
                                        {trip.totalExtrasCartons > 0 ? `+${fmtCtn(trip.totalExtrasCartons)}` : '0'}
                                      </td>
                                      <td className="py-1.5 px-2 text-center font-mono text-emerald-300">
                                        {fmtCtn(trip.totalDispatchedCartons)}
                                      </td>
                                    </tr>
                                  </tfoot>
                                </table>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    </div>

                    {/* Clients & Crew Quick Chips */}
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      {(() => {
                        const distinctStops = new Set(
                          trip.orders.map((ord) => `${ord.clientId || ord.clientName}::${ord.branchId || ord.branchName || 'main'}`)
                        );
                        const isMultiClient = distinctStops.size > 1;
                        const sortedOrders = [...trip.orders].sort((a, b) => {
                          const sa = Number(a.deliverySequence) > 0 ? Number(a.deliverySequence) : Infinity;
                          const sb = Number(b.deliverySequence) > 0 ? Number(b.deliverySequence) : Infinity;
                          return sa - sb;
                        });
                        return sortedOrders.map((o) => {
                          const orderSerial = o.serial || String(o.id || '').replace(/^SO-/, '');
                          const seqNum = Number(o.deliverySequence) > 0 ? Math.floor(Number(o.deliverySequence)) : null;
                          return (
                            <div
                              key={o.id}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-50 border border-slate-200 text-[10px] font-bold text-slate-700"
                            >
                              {isMultiClient && seqNum && (
                                <span
                                  className="px-1 py-0.2 rounded bg-indigo-600 text-white font-mono text-[9px] font-black leading-tight"
                                  title={isAr ? `أولوية التسليم #${seqNum}` : `Delivery Priority #${seqNum}`}
                                >
                                  #{seqNum}
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={() => {
                                  const hashUrl = `#sales_orders?module=sales&focusOrder=${encodeURIComponent(orderSerial)}&orderId=${encodeURIComponent(o.id)}`;
                                  window.location.hash = hashUrl;
                                  window.dispatchEvent(
                                    new CustomEvent('app-navigate', {
                                      detail: { tab: 'sales_orders', module: 'sales', orderId: o.id, focusOrder: orderSerial },
                                    })
                                  );
                                }}
                                title={isAr ? `عرض الأمر #${orderSerial} في تبويب أوامر البيع` : `Open order #${orderSerial} in Sales Orders`}
                                className="font-mono text-slate-500 hover:text-indigo-700 hover:underline transition cursor-pointer"
                              >
                                #{orderSerial}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  if (o.clientId) {
                                    setClientProfileTarget({
                                      clientId: o.clientId,
                                      branchId: o.branchId || '',
                                      branchName: o.branchName || '',
                                    });
                                  }
                                }}
                                title={isAr ? 'انقر لعرض ملف العميل وسجل الطلبات' : 'Click to view Client Profile'}
                                className="hover:text-indigo-700 hover:underline transition cursor-pointer"
                              >
                                {o.clientName || '—'}
                              </button>
                            </div>
                          );
                        });
                      })()}
                      {(dDoc?.loadingWorkers?.length > 0 || dDoc?.offloadingWorkers?.length > 0) && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-indigo-50 border border-indigo-200 text-[10px] font-bold text-indigo-800">
                          <Users className="w-3 h-3" />
                          {isAr
                            ? `تحميل: ${dDoc.loadingWorkers?.length || 0} | تفريغ: ${dDoc.offloadingWorkers?.length || 0}`
                            : `Loaders: ${dDoc.loadingWorkers?.length || 0} | Offloaders: ${dDoc.offloadingWorkers?.length || 0}`}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Right Action Buttons */}
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <RowCommentButton
                      tab="truck_dispatch"
                      recordId={trip.id}
                      recordTitle={`${isAr ? 'رحلة' : 'Trip'} #${trip.loadingOrderNumber} (${trip.loadingDate})`}
                      currentUser={currentUser}
                    />

                    {/* Smart Print Dispatch Document Button + Direct Legacy Docs Button */}
                    {trip.isWarehouseConfirmed && (() => {
                      const docVersions = getEffectiveDocVersions(trip);
                      const latestVerNum = Number(dDoc?.latestDispatchDocVersion || docVersions.length || 0);
                      const hasDrift = Boolean(trip.planDrift?.hasPlanDrift);
                      const rawPrintState = getDocPrintStatus(
                        dDoc?.dispatchPrintedAt,
                        dDoc?.dispatchContentUpdatedAt || dDoc?.updatedAt || dDoc?.dispatchedAt
                      );
                      const dispPrintState = hasDrift && dDoc?.dispatchPrintedAt ? 'printed_stale' : rawPrintState;
                      const legacyCount = docVersions.filter(
                        (v) => v.status === 'superseded' || hasDrift || (latestVerNum > 0 && Number(v.versionNumber) < latestVerNum)
                      ).length;
                      const cls =
                        dispPrintState === 'printed_stale'
                          ? 'bg-rose-50 hover:bg-rose-100 text-rose-900 border-rose-300 animate-pulse'
                          : dispPrintState === 'printed_current'
                          ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-300'
                          : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300';
                      const dispDocNum = dDoc?.latestDispatchDocNumber || '';
                      const verTag = dispDocNum
                        ? ` ${dispDocNum}`
                        : latestVerNum > 0
                        ? ` v${latestVerNum}`
                        : '';
                      const label =
                        dispPrintState === 'printed_stale'
                          ? (isAr ? `صرف: إعادة طباعة (v${latestVerNum + 1})` : `Dispatch: Reprint (v${latestVerNum + 1})`)
                          : dispPrintState === 'printed_current'
                          ? (isAr ? `صرف${verTag} ✓` : `Dispatch${verTag} ✓`)
                          : (isAr ? 'طباعة الصرف' : 'Print Dispatch');
                      const tip =
                        dispPrintState === 'printed_stale'
                          ? (isAr ? 'تم تعديل خطة الرحلة أو بيان الصرف بعد آخر طباعة — يرجى إعادة الطباعة' : 'Plan or dispatch edited after last print — reprint needed')
                          : dispPrintState === 'printed_current'
                          ? (isAr ? 'تمت طباعة أحدث نسخة من إذن الصرف' : 'Latest dispatch document already printed')
                          : (isAr ? 'لم تتم طباعة إذن الصرف بعد' : 'Dispatch document not printed yet');

                      return (
                        <>
                          <button
                            type="button"
                            onClick={() => handlePrintPlaceholderDoc(trip, 'dispatch')}
                            title={tip}
                            className={`px-2.5 py-2 rounded-xl border text-[11px] font-extrabold inline-flex items-center gap-1.5 transition cursor-pointer ${cls}`}
                          >
                            <Printer className="w-3.5 h-3.5 shrink-0" />
                            <span>{label}</span>
                          </button>
                          {legacyCount > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                setVersionsModalTab('docs');
                                setVersionsModalTripId(trip.id);
                              }}
                              title={isAr ? 'عرض وطباعة مستندات الصرف السابقة (القديمة قبل التعديل)' : 'View & print legacy (previously printed) dispatch documents'}
                              className="px-2.5 py-2 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 text-[11px] font-extrabold inline-flex items-center gap-1 transition cursor-pointer"
                            >
                              <FileCheck2 className="w-3.5 h-3.5 shrink-0" />
                              <span>{isAr ? `مستندات سابقة (${legacyCount})` : `Legacy Docs (${legacyCount})`}</span>
                            </button>
                          )}
                        </>
                      );
                    })()}

                    {/* Smart Print Return Document Button (includes RET-XXXXX & highlights Return Discrepancy) */}
                    {(Boolean(dDoc?.returnContentUpdatedAt || dDoc?.whReturnConfirmedAt || dDoc?.accountantReturnSubmittedAt) || trip.returnHandshakeStatus === 'reconciled') && (() => {
                      const retPrintState = getDocPrintStatus(
                        dDoc?.returnPrintedAt,
                        dDoc?.returnContentUpdatedAt || dDoc?.whReturnConfirmedAt || dDoc?.accountantReturnSubmittedAt
                      );
                      const retDocNum = dDoc?.latestReturnDocNumber || '';
                      const retTag = retDocNum ? ` ${retDocNum}` : '';
                      const cls = hasRetDisc
                        ? 'bg-rose-50 hover:bg-rose-100 text-rose-900 border-rose-400 animate-pulse'
                        : retPrintState === 'printed_stale'
                        ? 'bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-300 animate-pulse'
                        : retPrintState === 'printed_current'
                        ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-300'
                        : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300';
                      const label = hasRetDisc
                        ? (isAr ? `⚠️ مرتجع${retTag} (فرق)` : `⚠️ Return${retTag} (Var)`)
                        : retPrintState === 'printed_stale'
                        ? (isAr ? 'مرتجع: إعادة طباعة' : 'Return: Reprint')
                        : retPrintState === 'printed_current'
                        ? (isAr ? `مرتجع${retTag} ✓` : `Return${retTag} ✓`)
                        : (isAr ? 'طباعة المرتجع' : 'Print Return');
                      const tip = hasRetDisc
                        ? (isAr ? 'يوجد فرق بين المرتجع المتوقع والمستلم — انقر لطباعة/معاينة إذن المرتجع' : 'Return discrepancy detected — print Return Doc')
                        : retPrintState === 'printed_stale'
                        ? (isAr ? 'تم تعديل المرتجعات بعد آخر طباعة — يرجى إعادة الطباعة' : 'Return edited after last print — reprint needed')
                        : retPrintState === 'printed_current'
                        ? (isAr ? 'تمت طباعة أحدث نسخة من إذن المرتجع' : 'Latest return document already printed')
                        : (isAr ? 'لم تتم طباعة إذن المرتجع بعد' : 'Return document not printed yet');

                      return (
                        <button
                          type="button"
                          onClick={() => handlePrintPlaceholderDoc(trip, 'return')}
                          title={tip}
                          className={`px-2.5 py-2 rounded-xl border text-[11px] font-extrabold inline-flex items-center gap-1.5 transition cursor-pointer ${cls}`}
                        >
                          <Printer className="w-3.5 h-3.5 shrink-0" />
                          <span className="font-mono">{label}</span>
                        </button>
                      );
                    })()}

                    {/* Single Primary Stage Button: Pending -> Start Truck Dispatch -> Return / Receiving */}
                    {!trip.isWarehouseConfirmed ? (
                      <button
                        type="button"
                        disabled={isDisabledPending}
                        onClick={() => {
                          setActiveDispatchMode('edit');
                          setActiveDispatchTripId(trip.id);
                        }}
                        className={`px-3.5 py-2 rounded-xl text-xs font-black inline-flex items-center gap-1.5 transition cursor-pointer ${
                          isDisabledPending
                            ? 'bg-slate-200 text-slate-400 border border-slate-300 cursor-not-allowed'
                            : 'bg-teal-600 hover:bg-teal-700 text-white shadow-sm'
                        }`}
                        title={
                          isDisabledPending
                            ? (isAr ? 'معطل حتى تتحول حالة الطلبات إلى قيد التجهيز في خطة التحميل' : 'Disabled until orders move to Preparing in Loading Plan')
                            : (isAr ? 'فتح مصفوفة التحميل والعمالة والزيادات' : 'Open Dispatch Matrix, Extras & Labour')
                        }
                      >
                        <PackageCheck className="w-4 h-4" />
                        <span>
                          {isDisabledPending
                            ? (isAr ? 'بانتظار التجهيز' : 'Disabled (Pending)')
                            : (isAr ? 'بدء التحميل والصرف' : 'Start Truck Dispatch')}
                        </span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={!trip.needsReturnInspection}
                        onClick={() => setActiveReturnTripId(trip.id)}
                        title={
                          !trip.needsReturnInspection
                            ? (isAr ? 'متاح فور خروج الرحلة إلى قيد التسليم (Shipped)' : 'Unlocks once trip moves to Shipped / Out for Delivery')
                            : (isAr ? 'فتح نافذة استلام ومطابقة المرتجعات' : 'Open Return / Receiving Inspection')
                        }
                        className={`px-3.5 py-2 rounded-xl text-xs font-black inline-flex items-center gap-1.5 transition ${
                          !trip.needsReturnInspection
                            ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                            : hasRetDisc
                            ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-sm cursor-pointer animate-pulse'
                            : trip.returnHandshakeStatus === 'pending_accounting_confirm'
                            ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm cursor-pointer'
                            : trip.returnHandshakeStatus === 'pending_wh_confirm'
                            ? 'bg-sky-600 hover:bg-sky-700 text-white shadow-sm cursor-pointer'
                            : trip.returnHandshakeStatus === 'reconciled'
                            ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 cursor-pointer'
                            : 'bg-teal-600 hover:bg-teal-700 text-white shadow-sm cursor-pointer'
                        }`}
                      >
                        <RotateCcw className="w-4 h-4" />
                        <span>
                          {hasRetDisc
                            ? (isAr ? '⚠️ فرق مرتجع — تسوية' : '⚠️ Review Discrepancy')
                            : trip.returnHandshakeStatus === 'reconciled'
                            ? (isAr ? 'مرتجعات (مطابق ✓)' : 'Return / Receive ✓')
                            : trip.returnHandshakeStatus === 'pending_accounting_confirm'
                            ? (isAr ? 'مطابقة الحسابات ⏳' : 'Acct Alignment ⏳')
                            : (isAr ? 'استلام / مرتجع' : 'Return / Receive')}
                        </span>
                      </button>
                    )}

                    {/* 3-Vertical-Dots Secondary Actions Menu (View, Edit, Audit Trail) */}
                    {!isDisabledPending && (
                      <div className="relative" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => setOpenMenuTripId((curr) => (curr === trip.id ? null : trip.id))}
                          className={`p-2 rounded-xl border transition cursor-pointer ${
                            openMenuTripId === trip.id
                              ? 'bg-slate-900 text-white border-slate-900'
                              : 'bg-white hover:bg-slate-100 text-slate-600 border-slate-300'
                          }`}
                          title={isAr ? 'خيارات إضافية (عرض، تعديل، سجل المراجعة)' : 'More actions (View, Edit, Audit Trail)'}
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>

                        {openMenuTripId === trip.id && (
                          <div className="absolute end-0 mt-1.5 w-48 bg-white rounded-2xl shadow-xl border border-slate-200 py-1.5 z-30 text-start animate-in fade-in zoom-in-95 duration-100">
                            <button
                              type="button"
                              onClick={() => {
                                setOpenMenuTripId(null);
                                setActiveDispatchMode('view');
                                setActiveDispatchTripId(trip.id);
                              }}
                              className="w-full px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition cursor-pointer"
                            >
                              <Eye className="w-3.5 h-3.5 text-slate-500" />
                              <span>{isAr ? 'عرض بيان الصرف' : 'View Dispatch'}</span>
                            </button>

                            <button
                              type="button"
                              disabled={trip.isWarehouseConfirmed ? !canEditDispatchedTrip : !canDispatchTruck}
                              onClick={() => {
                                setOpenMenuTripId(null);
                                setActiveDispatchMode('edit');
                                setActiveDispatchTripId(trip.id);
                              }}
                              className="w-full px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-teal-50 hover:text-teal-800 disabled:text-slate-300 disabled:hover:bg-white flex items-center gap-2 transition cursor-pointer disabled:cursor-not-allowed"
                            >
                              <Edit3 className="w-3.5 h-3.5 text-teal-600" />
                              <span>{isAr ? 'تعديل بيان الصرف' : 'Edit Dispatch'}</span>
                            </button>

                            <div className="my-1 border-t border-slate-100" />

                            {(() => {
                              const effVers = getEffectiveDocVersions(trip);
                              const histLen = Array.isArray(dDoc?.dispatchHistory) ? dDoc.dispatchHistory.length : 0;
                              return (
                                <button
                                  type="button"
                                  disabled={effVers.length === 0 && histLen === 0}
                                  onClick={() => {
                                    setOpenMenuTripId(null);
                                    setVersionsModalTab('docs');
                                    setVersionsModalTripId(trip.id);
                                  }}
                                  className="w-full px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-amber-50 hover:text-amber-900 disabled:text-slate-300 disabled:hover:bg-white flex items-center justify-between gap-2 transition cursor-pointer disabled:cursor-not-allowed"
                                >
                                  <span className="inline-flex items-center gap-2">
                                    <FileCheck2 className="w-3.5 h-3.5 text-amber-600" />
                                    <span>{isAr ? 'إصدارات المستند والسجل' : 'Doc Versions & History'}</span>
                                  </span>
                                  <span className="px-1.5 py-0.2 rounded-md bg-amber-100 font-mono text-[10px] font-black text-amber-900">
                                    {effVers.length}
                                  </span>
                                </button>
                              );
                            })()}

                            <button
                              type="button"
                              disabled={!Array.isArray(dDoc?.auditTrail) || dDoc.auditTrail.length === 0}
                              onClick={() => {
                                setOpenMenuTripId(null);
                                setAuditTripId(trip.id);
                              }}
                              className="w-full px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-indigo-50 hover:text-indigo-800 disabled:text-slate-300 disabled:hover:bg-white flex items-center justify-between gap-2 transition cursor-pointer disabled:cursor-not-allowed"
                            >
                              <span className="inline-flex items-center gap-2">
                                <History className="w-3.5 h-3.5 text-indigo-600" />
                                <span>{isAr ? 'سجل المراجعة' : 'Audit Trail'}</span>
                              </span>
                              <span className="px-1.5 py-0.2 rounded-md bg-slate-100 font-mono text-[10px] font-black text-slate-700">
                                {dDoc?.auditTrail?.length || 0}
                              </span>
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Scanned Legacy Paper QR Warning Banner (if user scanned an older printed vN QR) */}
                {scannedDocAlert && scannedDocAlert.tripId === trip.id && scannedDocAlert.docVersion && (() => {
                  const latestVer = Number(dDoc?.latestDispatchDocVersion || dDoc?.dispatchDocVersions?.length || 0);
                  const isOlder = (latestVer > 0 && scannedDocAlert.docVersion < latestVer) || Boolean(trip.planDrift?.hasPlanDrift);
                  if (!isOlder) return null;
                  const currentVerObj = (dDoc?.dispatchDocVersions || []).find((v) => v.status === 'current');
                  const isNewReleased = Boolean(currentVerObj && currentVerObj.versionNumber > scannedDocAlert.docVersion && !trip.planDrift?.hasPlanDrift);
                  return (
                    <div className="mt-3 p-3 rounded-2xl bg-amber-50 border-2 border-amber-400 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-950">
                      <div className="flex items-center gap-2 font-black">
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>
                          {isAr
                            ? `تنبيه: المستند الممسوح (إصدار #${scannedDocAlert.docVersion}) هو نسخة قديمة قبل التعديل! ${isNewReleased ? `تم إصدار النسخة الأحدث (#${currentVerObj.versionNumber}).` : 'لم يتم إصدار المستند الجديد بعد.'}`
                            : `Warning: Scanned paper (v${scannedDocAlert.docVersion}) is a legacy superseded document! ${isNewReleased ? `Latest version v${currentVerObj.versionNumber} is available.` : 'New version not yet released.'}`}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {isNewReleased && (
                          <button
                            type="button"
                            onClick={() => handleOpenSavedDocVersion(trip, currentVerObj)}
                            className="px-3 py-1 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-black cursor-pointer"
                          >
                            {isAr ? `فتح المستند الجديد (v${currentVerObj.versionNumber})` : `Open Latest (v${currentVerObj.versionNumber})`}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setScannedDocAlert(null)}
                          className="p-1 rounded-lg hover:bg-amber-200/60 text-amber-900 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })()}

                {/* Prominent Post-Dispatch Loading Plan Change Alert Banner */}
                {trip.planDrift?.hasPlanDrift && (
                  <div className="mt-3 p-3 rounded-2xl bg-rose-50 border-2 border-rose-400 shadow-xs space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-xs font-black text-rose-900">
                        <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 animate-bounce" />
                        <span>
                          {isAr
                            ? 'تنبيه هام: تم تعديل خطة التحميل لهذه الرحلة بعد اعتماد الصرف!'
                            : 'ALERT: Loading Plan was modified after this trip was dispatched!'}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {(() => {
                          const effVers = getEffectiveDocVersions(trip);
                          if (effVers.length === 0) return null;
                          return (
                            <button
                              type="button"
                              onClick={() => {
                                setVersionsModalTab('docs');
                                setVersionsModalTripId(trip.id);
                              }}
                              className="px-2.5 py-1 rounded-xl bg-white hover:bg-rose-100 border border-rose-300 text-rose-900 text-[11px] font-extrabold inline-flex items-center gap-1 transition cursor-pointer"
                            >
                              <FileCheck2 className="w-3.5 h-3.5" />
                              <span>{isAr ? `عرض المستندات السابقة (${effVers.length})` : `View Legacy Docs (${effVers.length})`}</span>
                            </button>
                          );
                        })()}
                        <button
                          type="button"
                          disabled={!canEditDispatchedTrip}
                          onClick={() => {
                            setActiveDispatchMode('edit');
                            setActiveDispatchTripId(trip.id);
                          }}
                          className="px-3 py-1 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-[11px] font-black inline-flex items-center gap-1 shadow-xs transition cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>{isAr ? 'مراجعة التعديلات وتحديث الصرف' : 'Review Changes & Update Dispatch'}</span>
                        </button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {trip.planDrift.changes.map((ch, idx) => (
                        <span
                          key={idx}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white border border-rose-200 text-[10px] font-bold text-rose-950"
                        >
                          <span>{isAr ? ch.labelAr : ch.labelEn}:</span>
                          {ch.oldValue && ch.oldValue !== '—' && (
                            <>
                              <span className="line-through text-slate-400 font-mono">{ch.oldValue}</span>
                              <span>→</span>
                            </>
                          )}
                          <span className="font-mono font-black text-rose-700">{ch.newValue}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Dispatch Modal */}
      {activeDispatchTrip && (
        <TruckDispatchModal
          isOpen={Boolean(activeDispatchTrip)}
          onClose={() => setActiveDispatchTripId(null)}
          trip={activeDispatchTrip}
          finishedProducts={products}
          workerPool={workerPool}
          stockMatrixSkuMap={stockMatrixSkuMap}
          currentUser={currentUser}
          onOpenClientProfile={(target) => setClientProfileTarget(target)}
          canConfirmDispatch={
            activeDispatchMode === 'view'
              ? false
              : activeDispatchTrip.isWarehouseConfirmed
              ? canEditDispatchedTrip
              : canDispatchTruck
          }
          onSaved={() => {
            showToast(
              isAr
                ? `تم اعتماد بيان التحميل والصرف لرحلة #${activeDispatchTrip.loadingOrderNumber} بنجاح`
                : `Confirmed FG Dispatch Gate for Trip #${activeDispatchTrip.loadingOrderNumber}`
            );
          }}
          isAr={isAr}
        />
      )}

      {/* Return / Receiving Inspection Modal */}
      {activeReturnTrip && (
        <TruckReturnReceivingModal
          isOpen={Boolean(activeReturnTrip)}
          onClose={() => setActiveReturnTripId(null)}
          trip={activeReturnTrip}
          finishedProducts={products}
          allOrders={orders}
          clients={clients}
          vehicles={vehicles}
          segments={segments}
          productCategories={productCategories}
          priceLists={priceLists}
          strategies={strategies}
          stdRetailList={stdRetailList}
          currentUser={currentUser}
          returnAuthority={returnAuthority}
          eligibleOrderSettlers={eligibleOrderSettlers}
          todayStr={todayStr}
          onOpenClientProfile={(target) => setClientProfileTarget(target)}
          onSaved={(_payload, evalRes) => {
            showToast(
              evalRes.nextStatus === 'reconciled'
                ? (isAr ? 'تمت مطابقة وإقفال مرتجعات الرحلة بتأكيد القسمين ✓' : 'Trip returns reconciled & closed by both depts ✓')
                : evalRes.nextStatus === 'discrepancy_pending_accounting'
                ? (isAr ? 'توجد فروقات مرتجع — يرجى التسوية عبر أوامر البيع' : 'Return discrepancy logged — Sales Order settlement required')
                : evalRes.nextStatus === 'pending_accounting_confirm'
                ? (isAr ? 'تم استلام المخزن الفعلي وإخطار المحاسبة للمطابقة ✓' : 'Warehouse receipt locked — Accounting alignment requested ✓')
                : (isAr ? 'تم تسجيل المرتجع المتوقع وإخطار أمين المخزن' : 'Expected returns saved — Warehouse notified'),
              evalRes.nextStatus === 'discrepancy_pending_accounting' ? 'warning' : 'success'
            );
          }}
          isAr={isAr}
        />
      )}

      {/* Dispatch Audit Trail Modal */}
      {auditTrip && (
        <SalesOrderAuditModal
          isOpen={Boolean(auditTrip)}
          onClose={() => setAuditTripId(null)}
          order={{
            id: auditTrip.id,
            serial: `LO-${auditTrip.loadingOrderNumber} (${auditTrip.loadingDate})`,
            clientName: auditTrip.vehicleDisplayName,
            auditTrail: auditTrip.dispatchDoc?.auditTrail || [],
          }}
          isAr={isAr}
        />
      )}

      {/* Document Versions & Previous Dispatch History Modal */}
      {versionsModalTrip && (() => {
        const vDoc = versionsModalTrip.dispatchDoc || {};
        const docVersions = [...getEffectiveDocVersions(versionsModalTrip)].sort(
          (a, b) => Number(b.versionNumber || 0) - Number(a.versionNumber || 0)
        );
        const dispHistory = [...(Array.isArray(vDoc.dispatchHistory) ? vDoc.dispatchHistory : [])].sort(
          (a, b) => Number(b.revisionNumber || 0) - Number(a.revisionNumber || 0)
        );
        const currentVerObj = docVersions.find((v) => v.status === 'current') || null;
        const hasDrift = Boolean(versionsModalTrip.planDrift?.hasPlanDrift);

        return (
          <div
            className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
            onClick={() => setVersionsModalTripId(null)}
          >
            <div
              className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2.5">
                  <FileCheck2 className="w-5 h-5 text-amber-400" />
                  <div>
                    <h3 className="text-sm font-black">
                      {isAr
                        ? `إصدارات مستند الصرف وسجل التعديلات — رحلة #${versionsModalTrip.loadingOrderNumber}`
                        : `Dispatch Document Versions & History — Trip #${versionsModalTrip.loadingOrderNumber}`}
                    </h3>
                    <p className="text-[11px] text-slate-300">
                      {versionsModalTrip.loadingDate} • {versionsModalTrip.vehicleDisplayName}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setVersionsModalTripId(null)}
                  className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Tabs */}
              <div className="px-5 pt-3 bg-slate-50 border-b border-slate-200 flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setVersionsModalTab('docs')}
                  className={`px-3.5 py-2 rounded-t-xl text-xs font-black border-b-2 transition cursor-pointer ${
                    versionsModalTab === 'docs'
                      ? 'border-amber-600 text-amber-900 bg-white'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {isAr ? `مستندات الصرف المطبوعة (${docVersions.length})` : `Printed Dispatch Docs (${docVersions.length})`}
                </button>
                <button
                  type="button"
                  onClick={() => setVersionsModalTab('history')}
                  className={`px-3.5 py-2 rounded-t-xl text-xs font-black border-b-2 transition cursor-pointer ${
                    versionsModalTab === 'history'
                      ? 'border-indigo-600 text-indigo-900 bg-white'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {isAr ? `سجل بيانات الصرف السابقة (${dispHistory.length})` : `Previous Dispatch Snapshots (${dispHistory.length})`}
                </button>
              </div>

              <div className="p-4 overflow-y-auto flex-1 space-y-3">
                {versionsModalTab === 'docs' ? (
                  docVersions.length === 0 ? (
                    <div className="text-center py-8 text-xs font-bold text-slate-400">
                      {isAr ? 'لم يتم طباعة أي إصدار من إذن الصرف بعد.' : 'No dispatch document versions have been printed yet.'}
                    </div>
                  ) : (
                    docVersions.map((ver) => {
                      const isLegacyVer =
                        ver.status === 'superseded' ||
                        (currentVerObj && Number(currentVerObj.versionNumber) > Number(ver.versionNumber)) ||
                        hasDrift ||
                        versionsModalTrip.isLoadingUnlocked === false;
                      const isNewReleased = Boolean(
                        currentVerObj &&
                          Number(currentVerObj.versionNumber) > Number(ver.versionNumber) &&
                          !hasDrift &&
                          versionsModalTrip.isLoadingUnlocked !== false
                      );

                      return (
                        <div
                          key={ver.versionId || ver.versionNumber}
                          className={`p-3.5 rounded-2xl border flex flex-wrap items-center justify-between gap-3 ${
                            isLegacyVer
                              ? 'bg-rose-50/60 border-rose-200'
                              : 'bg-emerald-50/50 border-emerald-200'
                          }`}
                        >
                          <div className="space-y-1 min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              {ver.docNumber && (
                                <span dir="ltr" className="px-2 py-0.5 rounded-lg bg-slate-900 text-teal-300 font-mono text-xs font-black">
                                  {ver.docNumber}
                                </span>
                              )}
                              <span className="px-2 py-0.5 rounded-lg bg-slate-800 text-white font-mono text-xs font-black">
                                v{ver.versionNumber}
                              </span>
                              {isLegacyVer ? (
                                <span className="px-2 py-0.5 rounded-lg bg-rose-100 text-rose-900 border border-rose-300 text-[10px] font-black">
                                  {isAr ? 'مستند قديم (قبل التعديل) — Legacy' : 'Legacy Document (Superseded)'}
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-lg bg-emerald-100 text-emerald-900 border border-emerald-300 text-[10px] font-black">
                                  {isAr ? 'الإصدار الحالي المعتمد ✓' : 'Current Active Version ✓'}
                                </span>
                              )}
                              {isLegacyVer && (
                                <span
                                  className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border ${
                                    isNewReleased
                                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                      : 'bg-amber-50 text-amber-900 border-amber-300'
                                  }`}
                                >
                                  {isNewReleased
                                    ? (isAr ? `تم إصدار النسخة الأحدث (v${currentVerObj.versionNumber})` : `Superseded by v${currentVerObj.versionNumber}`)
                                    : (isAr ? 'لم يتم إصدار المستند الجديد بعد' : 'New document not released yet')}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-600 font-medium">
                              {isAr ? 'تاريخ الطباعة:' : 'Printed:'}{' '}
                              <span className="font-mono font-bold">
                                {ver.printedAt ? new Date(ver.printedAt).toLocaleString(isAr ? 'ar-EG' : 'en-GB') : '—'}
                              </span>
                              {ver.printedBy ? ` • ${ver.printedBy}` : ''}
                            </div>
                            {(ver.supersededReasonAr || (hasDrift && isLegacyVer)) && (
                              <div className="text-[11px] text-rose-800 font-bold">
                                {isAr ? 'التعديل:' : 'Change:'} {ver.supersededReasonAr || versionsModalTrip.planDrift?.summaryAr}
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleOpenSavedDocVersion(versionsModalTrip, ver)}
                              className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 border border-slate-300 text-slate-800 text-[11px] font-black inline-flex items-center gap-1.5 cursor-pointer"
                            >
                              <Printer className="w-3.5 h-3.5" />
                              <span>{isLegacyVer ? (isAr ? 'عرض النسخة القديمة' : 'View Legacy Doc') : (isAr ? 'عرض / طباعة' : 'View / Print')}</span>
                            </button>
                            {isLegacyVer && isNewReleased && currentVerObj && (
                              <button
                                type="button"
                                onClick={() => handleOpenSavedDocVersion(versionsModalTrip, currentVerObj)}
                                className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-black cursor-pointer"
                              >
                                {isAr ? `فتح الجديد (v${currentVerObj.versionNumber})` : `Open v${currentVerObj.versionNumber}`}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )
                ) : dispHistory.length === 0 ? (
                  <div className="text-center py-8 text-xs font-bold text-slate-400">
                    {isAr ? 'لا توجد تعديلات سابقة على بيانات الصرف لهذه الرحلة.' : 'No prior dispatch revisions recorded for this trip.'}
                  </div>
                ) : (
                  dispHistory.map((hist) => {
                    const totLocked = (hist.columns || []).reduce((s, c) => s + Number(c.lockedQty || 0), 0);
                    const totExtra = (hist.columns || []).reduce((s, c) => s + Number(c.extraQty || 0), 0);
                    return (
                      <div key={hist.revisionNumber} className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-1.5 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-black text-slate-900">
                            {isAr ? `النسخة السابقة #${hist.revisionNumber} (قبل التعديل)` : `Prior Snapshot #${hist.revisionNumber}`}
                          </span>
                          <span className="font-mono text-[10px] text-slate-500">
                            {hist.archivedAt ? new Date(hist.archivedAt).toLocaleString(isAr ? 'ar-EG' : 'en-GB') : '—'}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-700 font-bold flex flex-wrap gap-3">
                          <span>{isAr ? 'الشاحنة:' : 'Truck:'} {hist.vehicleName || '—'}</span>
                          <span>{isAr ? 'السائق:' : 'Driver:'} {hist.driverName || '—'}</span>
                          <span>{isAr ? 'الطلبات:' : 'Orders:'} {(hist.orderIds || []).length}</span>
                          <span>{isAr ? 'المقفل:' : 'Locked:'} {fmtCtn(totLocked)}</span>
                          <span>{isAr ? 'زيادات:' : 'Extras:'} +{fmtCtn(totExtra)}</span>
                        </div>
                        {hist.reasonAr && (
                          <div className="text-[11px] text-indigo-800 font-bold">
                            {isAr ? 'سبب التحديث:' : 'Update Reason:'} {isAr ? hist.reasonAr : (hist.reasonEn || hist.reasonAr)}
                          </div>
                        )}
                        {hist.dispatchNotes && (
                          <div className="text-[11px] text-slate-600">
                            {isAr ? 'ملاحظات الصرف السابقة:' : 'Prior Notes:'} {hist.dispatchNotes}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex justify-end shrink-0">
                <button
                  type="button"
                  onClick={() => setVersionsModalTripId(null)}
                  className="px-4 py-1.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold cursor-pointer"
                >
                  {isAr ? 'إغلاق' : 'Close'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Full Dispatch Documents Registry Modal (Date-only filter, Valid/Legacy, Intact Unique Numbering, Unlinked Trips Supported) */}
      <DispatchDocumentsHistoryModal
        isOpen={isDocsHistoryOpen}
        onClose={() => {
          setIsDocsHistoryOpen(false);
          setHighlightHistoryDocNumber('');
        }}
        documents={dispatchDocumentsRegistry}
        todayStr={todayStr}
        onPreviewOrPrint={handleOpenRegistryDocument}
        highlightDocNumber={highlightHistoryDocNumber}
        isAr={isAr}
      />

      {/* Standardized App-Wide Client & Branch Profile Modal */}
      <ClientProfileModal
        isOpen={Boolean(clientProfileTarget)}
        onClose={() => setClientProfileTarget(null)}
        clientId={clientProfileTarget?.clientId || ''}
        focusBranchId={clientProfileTarget?.branchId || ''}
        focusBranchName={clientProfileTarget?.branchName || ''}
        clients={clients}
        segments={segments}
        pricingStrategies={strategies}
        salesOrders={orders}
        zIndexClass="z-[80]"
        isAr={isAr}
      />
    </div>
  );
}
