import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

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

const collectionsToCheck = [
  'items',
  'finished_products',
  'warehouses',
  'bom_recipes',
  'intermediate_recipes',
  'liquid_tanks',
  'work_orders',
  'daily_production_plans',
  'goods_receipts',
  'stock_transfers',
  'production_transformations',
  'stock_counts',
  'stock_ledger',
  'spare_parts_issues'
];

async function inspect() {
  console.log('--- Inspecting Firestore Collections ---');
  for (const colName of collectionsToCheck) {
    try {
      const snap = await getDocs(collection(db, colName));
      console.log(`Collection [${colName}]: ${snap.docs.length} documents`);
    } catch (e) {
      console.error(`Error checking [${colName}]:`, e.message);
    }
  }

  console.log('\n--- Warehouses ---');
  const whSnap = await getDocs(collection(db, 'warehouses'));
  whSnap.forEach(d => {
    const data = d.data();
    console.log(`WH: id=${d.id}, code=${data.code}, nameAr=${data.nameAr}`);
  });

  console.log('\n--- Items Summary ---');
  const itemSnap = await getDocs(collection(db, 'items'));
  itemSnap.forEach(d => {
    const data = d.data();
    console.log(`Item: ${d.id} (${data.nameAr}), variations=${(data.variations || []).length}, category=${data.categoryId}`);
  });

  console.log('\n--- Intermediate Recipes ---');
  const irSnap = await getDocs(collection(db, 'intermediate_recipes'));
  irSnap.forEach(d => {
    const data = d.data();
    console.log(`Intermediate Recipe: ${d.id} (${data.nameAr || data.name})`);
  });

  console.log('\n--- Liquid Tanks ---');
  const tankSnap = await getDocs(collection(db, 'liquid_tanks'));
  tankSnap.forEach(d => {
    const data = d.data();
    console.log(`Tank: ${d.id} (${data.nameAr || data.tankNumber}), capacity=${data.capacity}, currentVolume=${data.currentVolume}`);
  });

  process.exit(0);
}

inspect().catch(err => {
  console.error('Inspect failed:', err);
  process.exit(1);
});
