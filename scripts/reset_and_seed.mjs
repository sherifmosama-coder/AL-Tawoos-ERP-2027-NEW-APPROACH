import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  getDocs,
  writeBatch,
  doc,
  serverTimestamp
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyC7jSWh02umV06YJif-INiwvwXMriEw55U",
  authDomain: "al-tawoos-erp.firebaseapp.com",
  projectId: "al-tawoos-erp",
  storageBucket: "al-tawoos-erp.firebasestorage.app",
  messagingSenderId: "590660260784",
  appId: "1:590660260784:web:157103d90b04c9940bfc75"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// 1. Transactional Collections to clear
const collectionsToClear = [
  'work_orders',
  'daily_production_plans',
  'goods_receipts',
  'stock_transfers',
  'production_transformations',
  'stock_counts',
  'stock_ledger',
  'spare_parts_issues',
  'liquid_tanks'
];

// Helper to batch delete all docs in a collection
async function clearCollection(colName) {
  const colRef = collection(db, colName);
  const snap = await getDocs(colRef);
  console.log(`[CLEAR] Collection '${colName}': Found ${snap.docs.length} documents to delete.`);

  if (snap.docs.length === 0) return;

  // Firestore batch limit is 500 writes
  let batch = writeBatch(db);
  let count = 0;
  let totalDeleted = 0;

  for (const docSnap of snap.docs) {
    batch.delete(docSnap.ref);
    count++;
    totalDeleted++;

    if (count >= 400) {
      await batch.commit();
      console.log(`  -> Committed deletion batch of ${count} docs from '${colName}'...`);
      batch = writeBatch(db);
      count = 0;
    }
  }

  if (count > 0) {
    await batch.commit();
    console.log(`  -> Committed final deletion batch of ${count} docs from '${colName}'.`);
  }

  console.log(`[CLEARED] '${colName}' completely cleared (${totalDeleted} total deleted).\n`);
}

// 2. Logic to determine healthy test opening quantities per item category / type
function getOpeningBalanceForItem(item, variation) {
  const cat = Number(item.categoryId || 1);
  const code = item.code || item.id;
  const vCode = variation.variantCode || `${code}-${variation.suffix}`;
  const flags = item.flags || [];

  // Default Unit Cost if none set
  let unitCost = Number(variation.openingUnitCost || 0);

  // Category 1: Preforms / Bottles / Jars / Gallons (Plastic)
  if (cat === 1) {
    if (!unitCost) unitCost = 0.85;
    // Gallons & Large containers
    if (code === 'F-111' || code === 'F-112' || code === 'F-115' || code === 'F-116') {
      return { qty: 5000, cost: unitCost || 4.5 };
    }
    // High-runner bottles (1L, 900ml, 500ml, Apple)
    return { qty: 100000, cost: unitCost };
  }

  // Category 2: Caps / Closures / Handles
  if (cat === 2) {
    if (!unitCost) unitCost = 0.28;
    if (code === 'F-207' || code === 'F-208') { // Gallon caps / handles
      return { qty: 10000, cost: unitCost || 0.75 };
    }
    return { qty: 120000, cost: unitCost };
  }

  // Category 3: Raw Liquids, Bulk Ingredients & Intermediate Liquids
  if (cat === 3) {
    // Intermediate Ready Blends (M)
    if (code === 'RMF-304') { // 5% Vinegar
      const isMainVar = variation.suffix === 'A' || variation.suffix === 'C';
      return { qty: isMainVar ? 30000 : 15000, cost: unitCost || 3.5 };
    }
    if (code === 'MF-301') { // Apple Vinegar
      return { qty: 15000, cost: unitCost || 5.0 };
    }
    if (code === 'MF-302') { // Blossom Water
      return { qty: 8000, cost: unitCost || 4.0 };
    }
    if (code === 'MF-303') { // Rose Water
      return { qty: 8000, cost: unitCost || 4.0 };
    }

    // Raw Ingredients (R)
    if (code === 'R-307') return { qty: 50000, cost: unitCost || 5.2 }; // Vinegar 11%
    if (code === 'R-311') return { qty: 25000, cost: unitCost || 48.0 }; // Vinegar 99%
    if (code === 'R-310') return { qty: 60000, cost: unitCost || 0.6 }; // Distilled Water
    if (code === 'R-312') return { qty: 150000, cost: unitCost || 0.05 }; // Drinking Water
    if (code === 'R-314') return { qty: 3000, cost: unitCost || 550.0 }; // Apple Concentrate
    if (code === 'R-309') return { qty: 2000, cost: unitCost || 95.0 }; // Rose Concentrate
    if (code === 'R-313') return { qty: 2000, cost: unitCost || 455.0 }; // Blossom Concentrate
    if (code === 'R-308') return { qty: 1500, cost: unitCost || 85.0 }; // Caramel Color
    if (code === 'R-305') return { qty: 1000, cost: unitCost || 95.0 }; // Sanitizer
    if (code === 'F-306') return { qty: 25000, cost: unitCost || 28.0 }; // Rice

    return { qty: 10000, cost: unitCost || 10.0 };
  }

  // Category 4: Labels & Stickers / Sleeves
  if (cat === 4) {
    if (!unitCost) unitCost = 0.18;
    return { qty: 100000, cost: unitCost };
  }

  // Category 5: Cartons, Trays, Boxes
  if (cat === 5) {
    if (!unitCost) unitCost = 5.50;
    return { qty: 8000, cost: unitCost };
  }

  // Category 6: Shrink Film / PE Rolls
  if (cat === 6) {
    if (!unitCost) unitCost = 75.0; // EGP per kg
    return { qty: 3000, cost: unitCost };
  }

  // Category 7: Pallet Corners & Protectors
  if (cat === 7) {
    if (!unitCost) unitCost = 6.0;
    return { qty: 5000, cost: unitCost };
  }

  // Category 8: Export labels, Liners, Consumables
  if (cat === 8) {
    if (!unitCost) unitCost = 1.20;
    return { qty: 5000, cost: unitCost };
  }

  // Category 9: Molds / Spare Parts
  if (cat === 9) {
    if (!unitCost) unitCost = 150.0;
    return { qty: 50, cost: unitCost };
  }

  // Fallback generic
  return { qty: 10000, cost: unitCost || 1.0 };
}

// 3. Main execution function
async function resetAndSeed() {
  console.log('================================================================');
  console.log('  TAWOOS ERP: DATABASE RESET & OPENING BALANCES SEEDING ENGINE');
  console.log('================================================================\n');

  // STEP 1: Clear all transactional collections
  console.log('STEP 1: Clearing all operational & transactional collections...');
  for (const col of collectionsToClear) {
    await clearCollection(col);
  }

  // STEP 2: Update items with clean, healthy Opening Balances in WH-01
  console.log('STEP 2: Seeding fresh opening balances on items in WH-01 (MAIN RAW WH)...');
  const itemsSnap = await getDocs(collection(db, 'items'));
  console.log(`Found ${itemsSnap.docs.length} items in master catalog.\n`);

  let batch = writeBatch(db);
  let batchCount = 0;
  let totalItemsUpdated = 0;
  let totalVariationsSeeded = 0;

  for (const itemDoc of itemsSnap.docs) {
    const itemData = itemDoc.data();
    const variations = itemData.variations || [];
    let itemTotalStock = 0;

    const updatedVariations = variations.map((v) => {
      const { qty, cost } = getOpeningBalanceForItem(itemData, v);
      itemTotalStock += qty;
      totalVariationsSeeded++;

      return {
        ...v,
        openingWarehouse: 'WH-01', // Strictly MAIN RAW WH
        openingQtySmall: qty,
        stock: qty,
        openingUnitCost: cost,
        openingBatchNo: `OB-20260901`,
        openingProdDate: '2026-09-01',
        openingExpDate: '2028-09-01',
        isActive: true,
      };
    });

    const itemRef = doc(db, 'items', itemDoc.id);
    batch.update(itemRef, {
      variations: updatedVariations,
      stock: itemTotalStock,
      updatedAt: serverTimestamp(),
    });

    batchCount++;
    totalItemsUpdated++;

    if (batchCount >= 400) {
      await batch.commit();
      console.log(`  -> Committed items update batch of ${batchCount} items...`);
      batch = writeBatch(db);
      batchCount = 0;
    }
  }

  if (batchCount > 0) {
    await batch.commit();
    console.log(`  -> Committed final items update batch of ${batchCount} items.`);
  }

  console.log(`\n[SUCCESS] Updated ${totalItemsUpdated} items with ${totalVariationsSeeded} variations seeded in WH-01.`);

  console.log('\n================================================================');
  console.log('  DATABASE RESET & SEEDING COMPLETED SUCCESSFULLY!');
  console.log('================================================================\n');
  process.exit(0);
}

resetAndSeed().catch((err) => {
  console.error('\n[FATAL ERROR] Reset and Seed failed:', err);
  process.exit(1);
});
