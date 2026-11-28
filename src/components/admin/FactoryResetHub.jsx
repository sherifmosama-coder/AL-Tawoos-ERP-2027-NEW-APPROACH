import React, { useState } from 'react';
import { db } from '../../firebase';
import {
  collection,
  doc,
  getDocs,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore';
import {
  AlertOctagon,
  Boxes,
  CheckCircle2,
  Database,
  GitBranch,
  Info,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import { APP_ARCHITECTURE, getMasterCollectionsRegistry } from '../../config/appArchitecture';
import OpeningStockSeederModal from '../OpeningStockSeederModal';
import PeacockLoader from '../PeacockLoader';
import { createRestorePoint } from '../../utils/systemRestoreEngine';
import {
  MASTER_COLLECTIONS_REGISTRY,
  OPERATIONAL_COLLECTIONS_REGISTRY,
  BACKUP_COLLECTIONS_REGISTRY,
  getCollectionDisplayName,
  PURGE_TARGETS_CATALOG,
} from '../../utils/adminCatalogs';

export default function FactoryResetHub({ isAr = true, currentUser = {}, warehousesList = [], allTabsList = [] }) {
  const [isPatchingLots, setIsPatchingLots] = useState(false);
  const [patchSummaryMsg, setPatchSummaryMsg] = useState('');

  const [selectedPurgeTargetKey, setSelectedPurgeTargetKey] = useState('operational_only');
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [confirmationPhrase, setConfirmationPhrase] = useState('');
  const [isPurging, setIsPurging] = useState(false);
  const [purgeSuccessMsg, setPurgeSuccessMsg] = useState('');
  const [isStockSeederOpen, setIsStockSeederOpen] = useState(false);

  // 1-CLICK LOT AUDIT & DIAGNOSTIC PATCHER
  // ==========================================
  const handleAuditAndPatchHistoricalLots = async () => {
    setIsPatchingLots(true);
    try {
      const snap = await getDocs(collection(db, 'goods_receipts'));
      let patchedCount = 0;
      const batch = writeBatch(db);

      snap.docs.forEach((docSnap) => {
        const grn = docSnap.data();
        const lines = grn.lines || [];
        let modified = false;

        const updatedLines = lines.map((l, lIdx) => {
          if (!l.lotNumber) {
            modified = true;
            patchedCount++;
            return {
              ...l,
              lotNumber: l.linkedGrnId ? `${l.linkedGrnId}-${String(lIdx + 1).padStart(2, '0')}` : `${grn.id}-${String(lIdx + 1).padStart(2, '0')}`,
            };
          }
          return l;
        });

        if (modified) {
          batch.set(docSnap.ref, { lines: updatedLines, updatedAt: serverTimestamp() }, { merge: true });
        }
      });

      if (patchedCount > 0) {
        await batch.commit();
        setPatchSummaryMsg(
          isAr
            ? `اكتمل الفحص: تم تدقيق ومطابقة (${snap.docs.length}) إذن، ومعالجة وتعيين أرقام اللوطات لـ (${patchedCount}) بند تاريخي بنجاح!`
            : `Audit complete: Scanned ${snap.docs.length} receipts, backfilled ${patchedCount} historical lot numbers successfully!`
        );
      } else {
        setPatchSummaryMsg(
          isAr
            ? `فحص سليم 100%: جميع أذون الاستلام وسجلات المخزن (${snap.docs.length}) تحتوي على أرقام لوطات مطابقة ومعتمدة.`
            : `100% verified: All ${snap.docs.length} inventory documents have valid structured lot numbers.`
        );
      }

      setTimeout(() => setPatchSummaryMsg(''), 5000);
    } catch (err) {
      console.error('Error auditing lots:', err);
      alert(isAr ? 'حدث خطأ أثناء تدقيق اللوطات.' : 'Error auditing historical lots.');
    } finally {
      setIsPatchingLots(false);
    }
  };

  // ==========================================
  // SUB-TAB 4: TARGETED FACTORY RESET & RELATIONAL CASCADE PURGE ENGINE
  // ==========================================
  const handleExecuteDynamicPurge = async () => {
    if (confirmationPhrase !== 'CONFIRM-RESET-ERP') {
      alert(isAr ? 'عبارة التأكيد غير صحيحة.' : 'Incorrect confirmation phrase.');
      return;
    }

    setIsPurging(true);

    // Best-effort automatic pre-purge safety checkpoint so accidental Factory Resets remain 1-click recoverable
    try {
      await createRestorePoint({
        kind: 'pre_purge',
        source: 'safety_guard',
        pinned: false,
        labelAr: `نقطة أمان قبل التصفير (${selectedPurgeTargetKey})`,
        labelEn: `Pre-Purge Safety Point (${selectedPurgeTargetKey})`,
        notes: `Auto safety capture before Factory Reset / Purge (${selectedPurgeTargetKey})`,
        actor: currentUser,
      });
    } catch (prePurgeErr) {
      console.warn('Pre-purge safety snapshot warning (proceeding with requested purge):', prePurgeErr?.message);
    }

    // Helper: Commit operations in chunks of 400 to respect Firestore 500-op batch limit
    const commitChunkedOperations = async (operations = []) => {
      if (!operations.length) return 0;
      const CHUNK_SIZE = 400;
      for (let i = 0; i < operations.length; i += CHUNK_SIZE) {
        const chunk = operations.slice(i, i + CHUNK_SIZE);
        const batch = writeBatch(db);
        chunk.forEach((opFn) => opFn(batch));
        await batch.commit();
      }
      return operations.length;
    };

    try {
      const masterCollectionsSet = new Set(getMasterCollectionsRegistry(APP_ARCHITECTURE));
      // Explicit safety guarantee for Chart of Accounts, System Config, Users & Floor Vessel Configs
      masterCollectionsSet.add('chart_of_accounts');
      masterCollectionsSet.add('system_config');
      masterCollectionsSet.add('users');
      masterCollectionsSet.add('floor_liquid_vessels');

      const collectionsToPurge = [];
      const cascadesByCollection = {}; // { [collName]: Array<(data, id) => boolean> }
      let shouldZeroStock = false;
      let shouldRecalcItemsStock = false;
      let shouldClearOpeningFieldsOnItems = false;
      let shouldZeroSafeAndBankBalances = false;
      let shouldRecalcSafesAndBanks = false;
      let shouldResetFloorVessels = false;
      let shouldResetPoReceivedQuantities = false;
      let shouldUnlinkGrnPoRefs = false;
      let shouldResetStagedPalletsToFloor = false;

      const targetCatalogEntry = PURGE_TARGETS_CATALOG.find((t) => t.key === selectedPurgeTargetKey);

      if (selectedPurgeTargetKey === 'all') {
        allTabsList.forEach((t) => {
          if (t.collection) {
            t.collection.split(',').map((s) => s.trim()).filter(Boolean).forEach((c) => collectionsToPurge.push(c));
          }
        });
        collectionsToPurge.push(
          ...BACKUP_COLLECTIONS_REGISTRY,
          ...OPERATIONAL_COLLECTIONS_REGISTRY
        );
        shouldZeroStock = true;
        shouldZeroSafeAndBankBalances = true;
        shouldResetFloorVessels = true;
      } else if (selectedPurgeTargetKey === 'operational_only') {
        // Operational wipe: strictly exclude all master collections & chart_of_accounts
        const safeOperational = OPERATIONAL_COLLECTIONS_REGISTRY.filter((coll) => !masterCollectionsSet.has(coll));
        collectionsToPurge.push(...safeOperational);
        shouldZeroStock = true;
        shouldZeroSafeAndBankBalances = true;
        shouldResetFloorVessels = true;
      } else if (targetCatalogEntry) {
        // Aligned Catalog Target (Operational Cascade or Master Table Reset)
        const rawPrimary = targetCatalogEntry.primaryCollections || [];
        if (targetCatalogEntry.category === 'operational') {
          rawPrimary
            .filter((coll) => !masterCollectionsSet.has(coll))
            .forEach((coll) => collectionsToPurge.push(coll));
        } else {
          rawPrimary.forEach((coll) => collectionsToPurge.push(coll));
        }

        // Group selective cross-collection predicates by collection
        (targetCatalogEntry.relatedCascades || []).forEach((cRule) => {
          if (!cRule.collection || typeof cRule.predicate !== 'function') return;
          // Never allow an operational cascade to delete a master collection
          if (targetCatalogEntry.category === 'operational' && masterCollectionsSet.has(cRule.collection)) return;
          if (!cascadesByCollection[cRule.collection]) {
            cascadesByCollection[cRule.collection] = [];
          }
          cascadesByCollection[cRule.collection].push(cRule.predicate);
        });

        const recalc = targetCatalogEntry.recalculate || {};
        if (recalc.recalcItemsStock) shouldRecalcItemsStock = true;
        if (recalc.clearOpeningFieldsOnItems) shouldClearOpeningFieldsOnItems = true;
        if (recalc.recalcSafesAndBanks) shouldRecalcSafesAndBanks = true;
        if (recalc.resetFloorVessels) shouldResetFloorVessels = true;
        if (recalc.resetPoReceivedQuantities) shouldResetPoReceivedQuantities = true;
        if (recalc.unlinkGrnPoRefs) shouldUnlinkGrnPoRefs = true;
        if (recalc.resetStagedPalletsToFloor) shouldResetStagedPalletsToFloor = true;
      } else {
        // Fallback for any legacy tab key
        const targetTab = allTabsList.find((t) => t.id === selectedPurgeTargetKey);
        if (targetTab?.collection) {
          targetTab.collection.split(',').map((s) => s.trim()).filter(Boolean).forEach((c) => collectionsToPurge.push(c));
        }
      }

      // 1. Purge Full Primary Collections (with Master Data & Chart of Accounts Immunity Lock for operational targets)
      let finalCollectionsToPurge = Array.from(new Set(collectionsToPurge));
      if (selectedPurgeTargetKey === 'operational_only' || targetCatalogEntry?.category === 'operational') {
        finalCollectionsToPurge = finalCollectionsToPurge.filter(
          (coll) => !masterCollectionsSet.has(coll) && coll !== 'chart_of_accounts' && coll !== 'system_config'
        );
      }

      let deletedPrimaryCount = 0;
      for (const collName of finalCollectionsToPurge) {
        const snap = await getDocs(collection(db, collName));
        if (!snap.empty) {
          const ops = snap.docs.map((d) => (batch) => batch.delete(d.ref));
          deletedPrimaryCount += await commitChunkedOperations(ops);
        }
      }

      // 2. Execute Selective Cross-Collection Cascade Deletions (Auto-Made Records in Related Tables)
      let deletedCascadeCount = 0;
      const primaryPurgedSet = new Set(finalCollectionsToPurge);
      for (const [collName, predicates] of Object.entries(cascadesByCollection)) {
        // Skip if the entire collection was already purged in step 1
        if (primaryPurgedSet.has(collName)) continue;
        // Immunity check for operational targets
        if (targetCatalogEntry?.category === 'operational' && masterCollectionsSet.has(collName)) continue;

        const snap = await getDocs(collection(db, collName));
        if (!snap.empty) {
          const matchingDocs = snap.docs.filter((docSnap) => {
            const data = docSnap.data() || {};
            return predicates.some((predFn) => {
              try {
                return Boolean(predFn(data, docSnap.id));
              } catch (_) {
                return false;
              }
            });
          });
          if (matchingDocs.length > 0) {
            const ops = matchingDocs.map((d) => (batch) => batch.delete(d.ref));
            deletedCascadeCount += await commitChunkedOperations(ops);
          }
        }
      }

      // 3. Cascade: Zero or Dynamically Recalculate Stock in Item Master (preserves 100% of item definitions & specs)
      if (shouldZeroStock) {
        const itemsSnap = await getDocs(collection(db, 'items'));
        if (!itemsSnap.empty) {
          const ops = itemsSnap.docs.map((itemDoc) => (batch) => {
            const data = itemDoc.data();
            const resetVariations = (data.variations || []).map((v) => ({
              ...v,
              stock: 0,
              openingQtySmall: 0,
              openingWarehouse: '',
              openingUnitCost: 0,
              openingBatchNo: '',
            }));
            batch.set(
              itemDoc.ref,
              { stock: 0, variations: resetVariations, updatedAt: serverTimestamp() },
              { merge: true }
            );
          });
          await commitChunkedOperations(ops);
        }
      } else if (shouldRecalcItemsStock) {
        // Dynamically recalculate items.stock from remaining stock_ledger records
        const [itemsSnap, ledgerSnap] = await Promise.all([
          getDocs(collection(db, 'items')),
          getDocs(collection(db, 'stock_ledger')),
        ]);
        if (!itemsSnap.empty) {
          const stockByVariant = {};
          const stockByItem = {};
          ledgerSnap.docs.forEach((lDoc) => {
            const l = lDoc.data() || {};
            if (l.status === 'cancelled' || l.isCancelled) return;
            const qty = Number(l.qty) || 0;
            const itemCode = String(l.itemId || '').trim();
            const varCode = String(l.variantCode || '').trim();
            if (varCode) stockByVariant[varCode] = (stockByVariant[varCode] || 0) + qty;
            if (itemCode) stockByItem[itemCode] = (stockByItem[itemCode] || 0) + qty;
          });

          const ops = itemsSnap.docs.map((itemDoc) => (batch) => {
            const data = itemDoc.data() || {};
            const itemCode = data.code || itemDoc.id;
            const variations = Array.isArray(data.variations) ? data.variations : [];
            let computedItemTotal = 0;
            const updatedVariations = variations.map((v) => {
              const vSuffix = v.suffix || 'A';
              const vCode = v.variantCode || `${itemCode}-${vSuffix}`;
              const vStock = Math.max(0, Number((stockByVariant[vCode] || 0).toFixed(4)));
              computedItemTotal += vStock;
              const nextVar = { ...v, stock: vStock };
              if (shouldClearOpeningFieldsOnItems) {
                nextVar.openingQtySmall = 0;
                nextVar.openingWarehouse = '';
                nextVar.openingUnitCost = 0;
                nextVar.openingBatchNo = '';
              }
              return nextVar;
            });
            const finalItemStock = variations.length > 0
              ? computedItemTotal
              : Math.max(0, Number((stockByItem[itemCode] || 0).toFixed(4)));
            batch.set(
              itemDoc.ref,
              { stock: finalItemStock, variations: updatedVariations, updatedAt: serverTimestamp() },
              { merge: true }
            );
          });
          await commitChunkedOperations(ops);
        }
      }

      // 4. Cascade: Zero or Dynamically Recalculate Cash Safes & Corporate Banks Balances (preserves 100% of safe/bank definitions)
      const zeroDenominations = { 200: 0, 100: 0, 50: 0, 20: 0, 10: 0, 5: 0, 1: 0, '0.5': 0 };
      if (shouldZeroSafeAndBankBalances) {
        const safesSnap = await getDocs(collection(db, 'cash_safes'));
        if (!safesSnap.empty) {
          const ops = safesSnap.docs.map((safeDoc) => (batch) => {
            const sData = safeDoc.data() || {};
            const existingBalances = sData.balances && typeof sData.balances === 'object' ? sData.balances : {};
            const resetBalances = {
              EGP: { currentBalance: 0, denominations: { ...zeroDenominations } },
            };
            Object.keys(existingBalances).forEach((currKey) => {
              resetBalances[currKey] = {
                ...(existingBalances[currKey] || {}),
                currentBalance: 0,
                denominations: { ...zeroDenominations },
              };
            });
            batch.set(
              safeDoc.ref,
              {
                currentBalance: 0,
                balance: 0,
                denominations: { ...zeroDenominations },
                balances: resetBalances,
                updatedAt: serverTimestamp(),
              },
              { merge: true }
            );
          });
          await commitChunkedOperations(ops);
        }

        const banksSnap = await getDocs(collection(db, 'corporate_banks'));
        if (!banksSnap.empty) {
          const ops = banksSnap.docs.map((bankDoc) => (batch) => {
            const bData = bankDoc.data() || {};
            const payload = {
              currentBalance: 0,
              balance: 0,
              updatedAt: serverTimestamp(),
            };
            if (bData.balances && typeof bData.balances === 'object') {
              const resetBankBalances = {};
              Object.keys(bData.balances).forEach((currKey) => {
                resetBankBalances[currKey] = {
                  ...(bData.balances[currKey] || {}),
                  currentBalance: 0,
                };
              });
              payload.balances = resetBankBalances;
            }
            batch.set(bankDoc.ref, payload, { merge: true });
          });
          await commitChunkedOperations(ops);
        }
      } else if (shouldRecalcSafesAndBanks) {
        const [safesSnap, banksSnap, txSnap] = await Promise.all([
          getDocs(collection(db, 'cash_safes')),
          getDocs(collection(db, 'corporate_banks')),
          getDocs(collection(db, 'cash_transactions')),
        ]);

        const safeBalances = {};
        const safeDenoms = {};
        const bankBalances = {};

        const ensureSafeDenoms = (sId) => {
          if (!safeDenoms[sId]) safeDenoms[sId] = { ...zeroDenominations };
          return safeDenoms[sId];
        };

        const addDenomMap = (sId, denomObj, multiplier = 1) => {
          if (!sId || !denomObj || typeof denomObj !== 'object') return;
          const map = ensureSafeDenoms(sId);
          Object.entries(denomObj).forEach(([k, v]) => {
            const count = Number(v) || 0;
            if (count !== 0) {
              map[k] = Math.max(0, (Number(map[k]) || 0) + count * multiplier);
            }
          });
        };

        txSnap.docs.forEach((tDoc) => {
          const tx = tDoc.data() || {};
          if (
            [
              'cancelled',
              'reversed',
              'rejected',
              'draft',
              'pending_approval',
              'pending_receiver_approval',
            ].includes(tx.status)
          ) {
            return;
          }
          const txType = String(tx.type || tx.voucherType || '').toLowerCase();
          const amt = Math.abs(Number(tx.amount || tx.totalAmount || 0));
          const sourceSafe = tx.safeId || tx.sourceSafeId || tx.vaultId;
          const targetSafe = tx.targetSafeId;
          const targetBank = tx.bankId || tx.bankAccountId;

          if (txType === 'safe_transfer') {
            if (sourceSafe && amt) {
              safeBalances[sourceSafe] = (safeBalances[sourceSafe] || 0) - amt;
              addDenomMap(sourceSafe, tx.denominationsOut || tx.denominations, -1);
            }
            if (targetSafe && amt) {
              safeBalances[targetSafe] = (safeBalances[targetSafe] || 0) + amt;
              addDenomMap(targetSafe, tx.denominationsIn || tx.denominationsOut || tx.denominations, 1);
            }
            return;
          }

          if (txType === 'change_exchange') {
            if (sourceSafe) {
              addDenomMap(sourceSafe, tx.denominationsIn, 1);
              addDenomMap(sourceSafe, tx.denominationsOut, -1);
            }
            return;
          }

          if (!amt && txType !== 'balance_adjustment') return;

          const dir = String(tx.direction || '').toLowerCase();
          const isInflow =
            dir === 'in' ||
            ['receipt', 'inflow', 'deposit', 'collection', 'custody_settle', 'advance_settle', 'opening_balance'].includes(txType);
          const signedAmt = isInflow ? amt : -amt;

          if (sourceSafe) {
            safeBalances[sourceSafe] = (safeBalances[sourceSafe] || 0) + signedAmt;
            if (tx.denominationsIn || tx.denominationsOut) {
              addDenomMap(sourceSafe, tx.denominationsIn, 1);
              addDenomMap(sourceSafe, tx.denominationsOut, -1);
            } else if (tx.denominations) {
              addDenomMap(sourceSafe, tx.denominations, isInflow ? 1 : -1);
            }
          }
          if (targetBank) {
            bankBalances[targetBank] = (bankBalances[targetBank] || 0) + signedAmt;
          }
        });

        if (!safesSnap.empty) {
          const ops = safesSnap.docs.map((safeDoc) => (batch) => {
            const sData = safeDoc.data() || {};
            const newBal = Number(((safeBalances[safeDoc.id] || 0) + (safeBalances[sData.code] || 0)).toFixed(2));
            const computedDenoms = newBal === 0
              ? { ...zeroDenominations }
              : (safeDenoms[safeDoc.id] || safeDenoms[sData.code] || sData.balances?.EGP?.denominations || { ...zeroDenominations });
            const existingBalances = sData.balances && typeof sData.balances === 'object' ? sData.balances : {};
            const updatedBalances = {
              ...existingBalances,
              EGP: {
                ...(existingBalances.EGP || {}),
                currentBalance: newBal,
                denominations: computedDenoms,
              },
            };
            const payload = {
              currentBalance: newBal,
              balance: newBal,
              denominations: computedDenoms,
              balances: updatedBalances,
              updatedAt: serverTimestamp(),
            };
            batch.set(safeDoc.ref, payload, { merge: true });
          });
          await commitChunkedOperations(ops);
        }

        if (!banksSnap.empty) {
          const ops = banksSnap.docs.map((bankDoc) => (batch) => {
            const bData = bankDoc.data() || {};
            const newBal = Number(((bankBalances[bankDoc.id] || 0) + (bankBalances[bData.code] || 0)).toFixed(2));
            const payload = {
              currentBalance: newBal,
              balance: newBal,
              updatedAt: serverTimestamp(),
            };
            if (bData.balances && typeof bData.balances === 'object') {
              payload.balances = {
                ...bData.balances,
                EGP: {
                  ...(bData.balances.EGP || {}),
                  currentBalance: newBal,
                },
              };
            }
            batch.set(bankDoc.ref, payload, { merge: true });
          });
          await commitChunkedOperations(ops);
        }
      }

      // 5. Cascade: Reset Transient Operational Volumes in Floor Liquid Vessels (preserves 100% of vessel master capacity setup)
      if (shouldResetFloorVessels) {
        const vesselsSnap = await getDocs(collection(db, 'floor_liquid_vessels'));
        if (!vesselsSnap.empty) {
          const ops = vesselsSnap.docs.map((vDoc) => (batch) => {
            batch.set(
              vDoc.ref,
              {
                currentVolume: 0,
                activeTanksCount: 0,
                activeTanks: [],
                historyTanks: [],
                cleanoutLogs: [],
                consumptionLogs: [],
                overrideLogs: [],
                updatedAt: serverTimestamp(),
              },
              { merge: true }
            );
          });
          await commitChunkedOperations(ops);
        }
      }

      // 6. Relational Cleanup: Reset received quantities on POs when GRNs are wiped
      if (shouldResetPoReceivedQuantities) {
        const poSnap = await getDocs(collection(db, 'purchase_orders'));
        if (!poSnap.empty) {
          const ops = poSnap.docs.map((poDoc) => (batch) => {
            const po = poDoc.data() || {};
            const resetLines = (po.lines || []).map((l) => ({
              ...l,
              receivedQty: 0,
              receivedSmallUnits: 0,
              receivedLargeUnits: 0,
            }));
            batch.set(
              poDoc.ref,
              {
                lines: resetLines,
                deliveryStatus: 'pending',
                receivedPercentage: 0,
                updatedAt: serverTimestamp(),
              },
              { merge: true }
            );
          });
          await commitChunkedOperations(ops);
        }
      }

      // 7. Relational Cleanup: Unlink deleted PO references on remaining GRNs when POs are wiped
      if (shouldUnlinkGrnPoRefs) {
        const grnSnap = await getDocs(collection(db, 'goods_receipts'));
        if (!grnSnap.empty) {
          const ops = grnSnap.docs
            .filter((gDoc) => Boolean(gDoc.data()?.poId || gDoc.data()?.poNumber))
            .map((gDoc) => (batch) => {
              batch.set(
                gDoc.ref,
                { poId: '', poNumber: '', updatedAt: serverTimestamp() },
                { merge: true }
              );
            });
          await commitChunkedOperations(ops);
        }
      }

      // 8. Relational Cleanup: Reset staged floor pallets status when FG Inward transfers are wiped
      if (shouldResetStagedPalletsToFloor) {
        const palletsSnap = await getDocs(collection(db, 'staged_floor_pallets'));
        if (!palletsSnap.empty) {
          const ops = palletsSnap.docs
            .filter((pDoc) => {
              const p = pDoc.data() || {};
              return p.status === 'transferred_to_fg' || p.stagingStatus === 'transferred_to_fg' || Boolean(p.transferId);
            })
            .map((pDoc) => (batch) => {
              batch.set(
                pDoc.ref,
                {
                  status: 'staged_on_floor',
                  stagingStatus: 'staged_on_floor',
                  transferId: null,
                  targetWarehouseId: null,
                  updatedAt: serverTimestamp(),
                },
                { merge: true }
              );
            });
          await commitChunkedOperations(ops);
        }
      }

      setPurgeSuccessMsg(
        selectedPurgeTargetKey === 'operational_only'
          ? (isAr
              ? `تم مسح وتصفير كافة الحركات التشغيلية والمحاسبية بنجاح (${deletedPrimaryCount} سجل) مع الحفاظ التام والكامل (100%) على دليل الحسابات وإعدادات التوجيه وكافة مجموعات البيانات الأساسية (${MASTER_COLLECTIONS_REGISTRY.length})!`
              : `Operational transactions successfully wiped (${deletedPrimaryCount} docs)! Chart of Accounts setup & all ${MASTER_COLLECTIONS_REGISTRY.length} Master Collections have been 100% preserved.`)
          : targetCatalogEntry
          ? (isAr
              ? `تم مسح (${targetCatalogEntry.labelAr}) بنجاح! [حُذف ${deletedPrimaryCount} سجل أساسي + ${deletedCascadeCount} سجل تلقائي مرتبط في الجداول الأخرى] وتمت إعادة معايرة الأرصدة المرتبطة.`
              : `Successfully purged (${targetCatalogEntry.labelEn})! [Deleted ${deletedPrimaryCount} primary records + ${deletedCascadeCount} auto-made linked records in related collections] and recalculated balances.`)
          : (isAr ? 'تم تصفير واستعادة ضبط المصنع بنجاح!' : 'Selected tables successfully purged to factory settings!')
      );
      setResetModalOpen(false);
      setConfirmationPhrase('');
      setTimeout(() => setPurgeSuccessMsg(''), 7000);
    } catch (err) {
      console.error('Error during purge:', err);
      alert(isAr ? 'حدث خطأ أثناء مسح البيانات.' : 'Error during purge.');
    } finally {
      setIsPurging(false);
    }
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      {isPurging && (
        <PeacockLoader
          fullScreen
          size="xl"
          text={isAr ? 'جاري استعادة ضبط المصنع وتصفير الجداول...' : 'Executing Factory Reset & Purging Tables...'}
        />
      )}
      {purgeSuccessMsg && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-900 rounded-xl text-xs font-bold flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="h-4 w-4 text-rose-600" />
          <span>{purgeSuccessMsg}</span>
        </div>
      )}
          {/* Quick Tool: Opening Stock Balances Seeder (Fast-Auto & Manual Matrix) */}
          <div className="p-5 bg-gradient-to-r from-emerald-50 via-teal-50 to-white border border-emerald-200 rounded-3xl shadow-sm space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3.5">
                <div className="p-3 bg-emerald-600 text-white rounded-2xl shadow-xs shrink-0">
                  <Boxes className="h-6 w-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-extrabold text-sm text-emerald-950">
                      {isAr ? 'أداة ضخ وتوليد الأرصدة الافتتاحية للمخزون' : 'Opening Stock Balances Seeder Tool'}
                    </h3>
                    <span className="text-[10px] font-mono font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full border border-emerald-300">
                      {isAr ? 'توليد سريع + مصفوفة يدوية' : 'Fast-Auto + Manual Matrix'}
                    </span>
                  </div>
                  <p className="text-xs text-emerald-800 mt-1 leading-relaxed max-w-2xl">
                    {isAr
                      ? 'أداة متقدمة لتسهيل مرحلة التطوير والتأسيس: إضافة وتوزيع أرصدة واقعية لكافة الخامات دفعة واحدة على المستودعات مع تسعيرها، أو تعديلها يدوياً عبر جدول مصفوفة تفاعلية، وتوثيق كافة العمليات في سجل الحركات الدفتري العام (Stock Ledger) كمرجع وحيد للرصيد.'
                      : 'Developer & onboarding utility: seed realistic stock balances across warehouses with prices in 1-click Fast-Auto mode or via interactive Manual Matrix, with SSOT audit logging in Stock Ledger.'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsStockSeederOpen(true)}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-xs font-bold shadow-xs transition flex items-center justify-center gap-2 cursor-pointer shrink-0"
              >
                <Sparkles className="h-4 w-4" />
                <span>{isAr ? 'فتح أداة ضخ الأرصدة الافتتاحية' : 'Launch Stock Seeder'}</span>
              </button>
            </div>
          </div>

          {/* 1-Click Diagnostic & Historical Lot Number Patcher */}
          <div className="p-5 bg-indigo-50/70 border border-indigo-200 rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-indigo-950">
                <ShieldCheck className="h-5 w-5 text-indigo-600 shrink-0" />
                <div>
                  <h3 className="text-sm font-bold">
                    {isAr ? 'أداة تدقيق ومطابقة أرقام التشغيلات واللوطات (Lot Integrity Audit)' : 'Lot Integrity & Historical Patcher'}
                  </h3>
                  <p className="text-xs text-slate-600 mt-0.5">
                    {isAr
                      ? 'فحص كافة أذون الاستلام التاريخية وتوليد أرقام اللوطات التلقائية لضمان عمل محرك FIFO بنسبة 100% بدون أي مساس بالكميات أو الأسعار.'
                      : 'Audit all historical receipts and backfill structured lot numbers to guarantee 100% FIFO compatibility.'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleAuditAndPatchHistoricalLots}
                disabled={isPatchingLots}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                {isPatchingLots ? <PeacockLoader size="xxs" inline variant="white" /> : <Tag className="h-4 w-4" />}
                <span>{isAr ? 'بدء فحص وتدقيق اللوطات' : 'Run Lot Audit Now'}</span>
              </button>
            </div>

            {patchSummaryMsg && (
              <div className="p-3 bg-white border border-indigo-200 text-indigo-900 rounded-xl text-xs font-bold flex items-center gap-2 animate-in fade-in">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>{patchSummaryMsg}</span>
              </div>
            )}
          </div>

          <div className="p-5 bg-rose-50/60 border border-rose-200 rounded-2xl space-y-2">
            <div className="flex items-center gap-2 text-rose-950">
              <AlertOctagon className="h-5 w-5 text-rose-600 shrink-0" />
              <h3 className="text-sm font-bold">
                {isAr ? 'منطقة العمليات الحساسة: تصفير الجداول واستعادة ضبط المصنع' : 'Danger Zone: Metadata-Driven Database Purge'}
              </h3>
            </div>
            <p className="text-xs text-rose-900 leading-relaxed">
              {isAr
                ? 'حدد النطاق المراد تصفيره من القائمة أدناه لمعاينة التأثير والمسح السحابي الآمن.'
                : 'Select the purge target from the dropdown to review cascade effects and execute cloud reset.'}
            </p>
          </div>

          <div className="p-5 bg-white border border-slate-200 rounded-2xl shadow-2xs space-y-4 max-w-3xl">
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1">
                {isAr ? 'اختر الجدول أو النطاق المراد مسحه وتصفيره (متوافق 100% مع هيكل البيانات الفعلي):' : 'Select Aligned Purge Target & Relational Cascade Scope:'}
              </label>
              <select
                value={selectedPurgeTargetKey}
                onChange={(e) => setSelectedPurgeTargetKey(e.target.value)}
                className="w-full p-2.5 border border-slate-300 rounded-xl text-xs bg-slate-50 font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-rose-500 focus:outline-none"
              >
                <optgroup label={isAr ? '🛡️ 1. المسح التشغيلي الشامل الموصى به (آمن 100% على البيانات الأساسية ودليل الحسابات)' : '🛡️ 1. Recommended Full Operational Wipe (100% Safe for Master Data & COA)'}>
                  <option value="operational_only">
                    ⚡ {isAr ? 'مسح وتصفير كافة الحركات التشغيلية والمحاسبية فقط — مع الحفاظ الكامل (100%) على البيانات الأساسية ودليل الحسابات (Wipe Operational Only)' : 'Wipe Operational Data Only (Keep Master Data & Chart of Accounts 100% Intact)'}
                  </option>
                </optgroup>

                <optgroup label={isAr ? '🔗 2. مسح جدول تشغيلي محدد + كافة السجلات التلقائية المرتبطة به في الجداول الأخرى (Smart Relational Cascade)' : '🔗 2. Targeted Operational Table + Auto-Made Linked Records in Other Collections'}>
                  {PURGE_TARGETS_CATALOG.filter((t) => t.category === 'operational').map((t) => (
                    <option key={t.key} value={t.key}>
                      🔹 {isAr ? t.labelAr : t.labelEn} [{t.collectionsLabel}]
                    </option>
                  ))}
                </optgroup>

                <optgroup label={isAr ? '🗂️ 3. مسح جدول بيانات أساسية محدد (Master Data Reset — يحذف التعريفات الأساسية)' : '🗂️ 3. Specific Master Data Table Reset (Deletes Master Definitions)'}>
                  {PURGE_TARGETS_CATALOG.filter((t) => t.category === 'master').map((t) => (
                    <option key={t.key} value={t.key}>
                      ⚠️ {isAr ? t.labelAr : t.labelEn} ({t.collectionsLabel})
                    </option>
                  ))}
                </optgroup>

                <optgroup label={isAr ? '🚨 4. خطر: استعادة ضبط المصنع الشامل (يحذف كافة الجداول الأساسية والتشغيلية)' : '🚨 4. Danger: Full Factory Reset (Deletes All Operational & Master Tables)'}>
                  <option value="all">
                    🚨 {isAr ? 'استعادة ضبط المصنع الشامل لكامل النظام بما فيه البيانات الأساسية (Full Master Reset)' : 'Master Full Factory Reset (All Tables Including Master Data)'}
                  </option>
                </optgroup>
              </select>
            </div>

            {/* Target Scope Explanation Box */}
            {(() => {
              const selectedCatalogItem = PURGE_TARGETS_CATALOG.find((t) => t.key === selectedPurgeTargetKey);
              return (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-3">
                  <div className="font-bold text-slate-900 flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5">
                      <Info className="h-4 w-4 text-amber-600 shrink-0" />
                      <span>{isAr ? 'بيان الأثر والتأثير التلقائي المترابط (Relational Cascade Breakdown):' : 'Relational Cascade Effect & Scope Breakdown:'}</span>
                    </div>
                    {(selectedPurgeTargetKey === 'operational_only' || selectedCatalogItem?.category === 'operational') && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-300 text-[10px] font-extrabold">
                        <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                        <span>{isAr ? 'محمي: لا يمس البيانات الأساسية أو دليل الحسابات' : 'Master Data & COA 100% Protected'}</span>
                      </span>
                    )}
                  </div>

                  <p className="text-slate-700 leading-relaxed font-medium">
                    {selectedPurgeTargetKey === 'operational_only'
                      ? (isAr
                          ? `سيتم مسح وتصفير كافة الحركات التشغيلية والمحاسبية (${OPERATIONAL_COLLECTIONS_REGISTRY.length} جدول تشغيلي: أوامر الشراء، أذون الاستلام والمرتجعات، التحويلات، أوامر التشغيل، تانكات السوائل، قيود اليومية، سندات الخزينة والبنوك، العهد والسلف، تسويات الاستحقاقات، وشهادات الخصم) وتصفير الأرصدة الدفترية العابرة للخامات والخزائن والبنوك وخزانات الصالة إلى (0)، دون المساس نهائياً بأي سجل من البيانات الأساسية أو إعدادات دليل الحسابات.`
                          : `Wipes all ${OPERATIONAL_COLLECTIONS_REGISTRY.length} operational/transactional collections (POs, GRNs/RTNs, Transfers, Work Orders, Liquid Tanks, Journal Entries, Cash Vouchers, Custodies, Dues Settlements, WHT Notes, etc.) and resets transient item stock, safe/bank balances, and floor vessel volumes to 0, while 100% preserving all Master Data and Chart of Accounts setups.`)
                      : selectedPurgeTargetKey === 'all'
                      ? (isAr ? 'تحذير شديد: سيتم مسح وتفريغ كافة الجداول التشغيلية والأساسية بالكامل وتصفير أرصدة الخامات والخزائن والبنوك إلى الصفر (0).' : 'CRITICAL WARNING: Purges all transactional and master collections and resets all balances to 0.')
                      : selectedCatalogItem
                      ? (isAr ? selectedCatalogItem.descAr : selectedCatalogItem.descEn)
                      : (isAr ? `سيتم تفريغ كافة سجلات (${selectedPurgeTargetKey}) السحابية.` : `Wipes records in (${selectedPurgeTargetKey}).`)}
                  </p>

                  {/* Detailed Breakdown for Selected Catalog Item */}
                  {selectedCatalogItem && (
                    <div className="space-y-2.5 pt-1">
                      {/* 1. Primary Collections */}
                      {selectedCatalogItem.primaryCollections?.length > 0 && (
                        <div className="p-2.5 bg-white border border-slate-200 rounded-xl space-y-1.5">
                          <div className="text-[11px] font-extrabold text-slate-800 flex items-center gap-1.5">
                            <Database className="h-3.5 w-3.5 text-rose-600 shrink-0" />
                            <span>{isAr ? 'الجداول الأساسية المستهدفة بالمسح المباشر:' : 'Primary Collections Wiped Directly:'}</span>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {selectedCatalogItem.primaryCollections.map((collKey) => (
                              <span
                                key={collKey}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-rose-50 border border-rose-200 text-[10px] font-bold text-rose-900"
                              >
                                <span>{getCollectionDisplayName(collKey, isAr)}</span>
                                <span className="font-mono text-[9px] text-rose-700">({collKey})</span>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* 2. Related Auto-Made Cascades in Other Collections */}
                      {selectedCatalogItem.relatedCascades?.length > 0 && (
                        <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-xl space-y-1.5">
                          <div className="text-[11px] font-extrabold text-amber-950 flex items-center gap-1.5">
                            <GitBranch className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                            <span>
                              {isAr
                                ? `السجلات التلقائية المرتبطة التي سيتم حذفها انتقائياً من الجداول الأخرى (${selectedCatalogItem.relatedCascades.length} مسارات ربط):`
                                : `Auto-Made Linked Records Selectively Purged from Other Collections (${selectedCatalogItem.relatedCascades.length} cascade rules):`}
                            </span>
                          </div>
                          <ul className="space-y-1 text-[11px] text-amber-900 font-medium list-disc list-inside">
                            {selectedCatalogItem.relatedCascades.map((cRule, idx) => (
                              <li key={`${cRule.collection}-${idx}`}>
                                <span className="font-bold">{isAr ? cRule.labelAr : cRule.labelEn}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* 3. Dynamic Balance Recalculation Summary */}
                      {selectedCatalogItem.recalculate && Object.values(selectedCatalogItem.recalculate).some(Boolean) && (
                        <div className="p-2.5 bg-indigo-50/80 border border-indigo-200 rounded-xl space-y-1">
                          <div className="text-[11px] font-extrabold text-indigo-950 flex items-center gap-1.5">
                            <RefreshCw className="h-3.5 w-3.5 text-indigo-600 shrink-0" />
                            <span>{isAr ? 'إعادة المعايرة التلقائية للأرصدة والارتباطات بعد المسح:' : 'Automatic Post-Purge Balance & State Recalibration:'}</span>
                          </div>
                          <div className="flex flex-wrap gap-1.5 pt-0.5">
                            {selectedCatalogItem.recalculate.recalcItemsStock && (
                              <span className="px-2 py-0.5 rounded-lg bg-white border border-indigo-200 text-[10px] font-bold text-indigo-900">
                                {isAr ? '📦 إعادة احتساب أرصدة الخامات (items.stock) من الحركات المتبقية في (stock_ledger)' : '📦 Recalculates items.stock from remaining stock_ledger entries'}
                              </span>
                            )}
                            {selectedCatalogItem.recalculate.recalcSafesAndBanks && (
                              <span className="px-2 py-0.5 rounded-lg bg-white border border-indigo-200 text-[10px] font-bold text-indigo-900">
                                {isAr ? '🏦 إعادة احتساب أرصدة وفئات الخزائن والبنوك من السندات المتبقية' : '🏦 Recalculates Safe & Bank balances from remaining vouchers'}
                              </span>
                            )}
                            {selectedCatalogItem.recalculate.resetFloorVessels && (
                              <span className="px-2 py-0.5 rounded-lg bg-white border border-indigo-200 text-[10px] font-bold text-indigo-900">
                                {isAr ? '🧪 تصفير الكميات العابرة بخزانات الصالة مع بقاء إعدادات السعة' : '🧪 Resets transient Floor Vessel volumes (keeps capacity config)'}
                              </span>
                            )}
                            {selectedCatalogItem.recalculate.resetPoReceivedQuantities && (
                              <span className="px-2 py-0.5 rounded-lg bg-white border border-indigo-200 text-[10px] font-bold text-indigo-900">
                                {isAr ? '📋 إعادة تعيين الكميات المستلمة بأوامر الشراء إلى (0 - قيد التوريد)' : '📋 Resets received quantities on Purchase Orders to 0'}
                              </span>
                            )}
                            {selectedCatalogItem.recalculate.unlinkGrnPoRefs && (
                              <span className="px-2 py-0.5 rounded-lg bg-white border border-indigo-200 text-[10px] font-bold text-indigo-900">
                                {isAr ? '🔗 فك ارتباط أذون الاستلام بأوامر الشراء المحذوفة' : '🔗 Unlinks deleted PO references on remaining GRNs'}
                              </span>
                            )}
                            {selectedCatalogItem.recalculate.resetStagedPalletsToFloor && (
                              <span className="px-2 py-0.5 rounded-lg bg-white border border-indigo-200 text-[10px] font-bold text-indigo-900">
                                {isAr ? '🏷️ إعادة حالة الباليتات إلى (مشدودة بصالة الإنتاج)' : '🏷️ Resets staged pallets back to floor status'}
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {selectedPurgeTargetKey === 'operational_only' && (
                    <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl space-y-1.5 mt-2">
                      <div className="font-black text-emerald-900 flex items-center gap-1.5 text-[11px]">
                        <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
                        <span>
                          {isAr
                            ? `حصانة مطلقة (100% محمي ولن يتم لمسه — ${MASTER_COLLECTIONS_REGISTRY.length} جدول أساسي ومحاسبي):`
                            : `100% Protected Master & Accounting Configurations (${MASTER_COLLECTIONS_REGISTRY.length} Collections Untouched):`}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5 pt-0.5">
                        {MASTER_COLLECTIONS_REGISTRY.map((collKey) => (
                          <span
                            key={collKey}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white border border-emerald-200 text-[10px] font-bold text-emerald-900 shadow-2xs"
                          >
                            <CheckCircle2 className="h-3 w-3 text-emerald-600 shrink-0" />
                            <span>{getCollectionDisplayName(collKey, isAr)}</span>
                            <span className="font-mono text-[9px] text-emerald-700">({collKey})</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            <button
              type="button"
              onClick={() => setResetModalOpen(true)}
              className="w-full py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-xs transition cursor-pointer flex items-center justify-center gap-1.5"
            >
              <Trash2 className="h-4 w-4" />
              <span>{isAr ? 'بدء إجراءات التصفير والمسح' : 'Proceed to Purge Confirmation'}</span>
            </button>
          </div>

      {/* Opening Stock Seeder Modal */}
      <OpeningStockSeederModal
        isOpen={isStockSeederOpen}
        onClose={() => setIsStockSeederOpen(false)}
        currentUser={currentUser}
        warehousesList={warehousesList}
      />


      {/* High-Security Confirmation Modal */}
      {resetModalOpen && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4 z-[90] animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border-2 border-rose-500 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 text-rose-900">
                <AlertOctagon className="h-6 w-6 text-rose-600 shrink-0" />
                <h3 className="text-base font-bold">
                  {isAr ? 'تأكيد أمني لمسح البيانات' : 'Security Confirmation Required'}
                </h3>
              </div>
              <button onClick={() => setResetModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-700">
                <X className="h-4 w-4" />
              </button>
            </div>

            {(() => {
              const targetEntry = PURGE_TARGETS_CATALOG.find((t) => t.key === selectedPurgeTargetKey);
              const labelText =
                selectedPurgeTargetKey === 'all'
                  ? isAr
                    ? 'كافة جداول النظام بالكامل (استعادة ضبط المصنع الشامل)'
                    : 'All ERP Tables (Full Factory Reset)'
                  : selectedPurgeTargetKey === 'operational_only'
                  ? isAr
                    ? 'كافة الحركات التشغيلية والمحاسبية فقط — مع الحفاظ الكامل (100%) على البيانات الأساسية ودليل الحسابات'
                    : 'All Operational Transactions Only — 100% Preserving Master Data & Chart of Accounts'
                  : targetEntry
                  ? `${isAr ? targetEntry.labelAr : targetEntry.labelEn} [${targetEntry.collectionsLabel}]`
                  : selectedPurgeTargetKey;
              return (
                <p className="text-xs text-slate-700 leading-relaxed">
                  {isAr
                    ? `أنت على وشك مسح (${labelText}) وكافة السجلات التلقائية المرتبطة به نهائياً من قاعدة البيانات السحابية. لا يمكن التراجع عن هذا الإجراء.`
                    : `You are about to permanently purge (${labelText}) and all its auto-generated linked records from Firestore cloud. This action cannot be undone.`}
                </p>
              );
            })()}

            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl space-y-1.5">
              <label className="block text-xs font-bold text-rose-950">
                {isAr ? 'اكتب عبارة التأكيد التالية للمتابعة:' : 'Type confirmation phrase:'}
              </label>
              <div className="font-mono text-xs font-extrabold text-rose-700 bg-white p-1.5 rounded border border-rose-300 text-center select-all">
                CONFIRM-RESET-ERP
              </div>
              <input
                type="text"
                placeholder="CONFIRM-RESET-ERP"
                value={confirmationPhrase}
                onChange={(e) => setConfirmationPhrase(e.target.value)}
                className="w-full p-2 border border-rose-300 rounded-lg text-xs bg-white text-center font-mono font-bold focus:ring-2 focus:ring-rose-500 focus:outline-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setResetModalOpen(false);
                  setConfirmationPhrase('');
                }}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>

              <button
                type="button"
                disabled={confirmationPhrase !== 'CONFIRM-RESET-ERP' || isPurging}
                onClick={handleExecuteDynamicPurge}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-xs flex items-center gap-1.5"
              >
                {isPurging ? <PeacockLoader size="xxs" inline variant="white" /> : <Trash2 className="h-3.5 w-3.5" />}
                <span>{isAr ? 'تأكيد المسح النهائي' : 'Confirm Permanent Purge'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
