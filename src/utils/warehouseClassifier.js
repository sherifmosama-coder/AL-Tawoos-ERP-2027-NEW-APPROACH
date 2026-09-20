/**
 * Al-Tawoos ERP - Universal Warehouse Classifier Utility (Phase 1)
 * Single Source of Truth for Dynamic Warehouse Resolution
 */

// Helper to match warehouse by ID, code, or name
export const matchWarehouse = (val, target) => {
  if (!val || !target) return false;
  return (
    val === target.id ||
    val === target.code ||
    val === target.nameAr ||
    val === target.nameEn
  );
};

// Returns the warehouse dynamically designated as the production/factory floor
export const getFactoryFloorWarehouse = (warehouses = []) => {
  if (!Array.isArray(warehouses) || warehouses.length === 0) return null;
  return (
    warehouses.find(
      (w) =>
        w.operationalClassification === 'factory_floor' ||
        w.classification === 'factory_floor' ||
        w.isFactoryLinked === true
    ) || warehouses[0] || null
  );
};

// Returns all warehouses designated for raw material storage
export const getRawStorageWarehouses = (warehouses = []) => {
  if (!Array.isArray(warehouses)) return [];
  return warehouses.filter(
    (w) =>
      w.operationalClassification === 'raw_materials' ||
      w.classification === 'raw_materials' ||
      (!w.isFactoryLinked &&
        w.classification !== 'factory_floor' &&
        w.operationalClassification !== 'factory_floor' &&
        w.classification !== 'returns' &&
        w.classification !== 'scrap' &&
        w.classification !== 'quarantine')
  );
};

// Returns non-usable, quarantine, or scrap warehouses (excluded from usable stock)
export const getQuarantineWarehouses = (warehouses = []) => {
  if (!Array.isArray(warehouses)) return [];
  return warehouses.filter(
    (w) =>
      w.classification === 'returns' ||
      w.classification === 'scrap' ||
      w.classification === 'quarantine' ||
      w.operationalClassification === 'quarantine' ||
      w.operationalClassification === 'scrap'
  );
};

// Checks whether a warehouse holds usable active inventory
export const isUsableWarehouse = (wh) => {
  if (!wh) return false;
  return !(
    wh.classification === 'returns' ||
    wh.classification === 'scrap' ||
    wh.classification === 'quarantine' ||
    wh.operationalClassification === 'quarantine' ||
    wh.operationalClassification === 'scrap'
  );
};

// Formats warehouse name according to active locale
export const getWarehouseDisplayName = (whOrId, warehouses = [], isAr = true) => {
  if (!whOrId) return '';
  const whObj =
    typeof whOrId === 'object'
      ? whOrId
      : warehouses.find((w) => matchWarehouse(whOrId, w));
  if (whObj) {
    return isAr
      ? whObj.nameAr || whObj.code || whObj.id
      : whObj.nameEn || whObj.nameAr || whObj.code || whObj.id;
  }
  return String(whOrId);
};