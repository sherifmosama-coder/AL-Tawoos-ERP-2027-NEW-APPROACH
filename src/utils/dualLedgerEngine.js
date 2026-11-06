/**
 * dualLedgerEngine.js
 * -----------------------------------------------------------------------------
 * Dual-Ledger Architecture Engine for Al-Tawoos ERP
 *
 * Implements two visibility tiers:
 * 1. Standard View (Default):
 *    - The default baseline for all screens, trial balances, general ledger,
 *      financial statements, and printouts.
 *    - Automatically excludes operational records that bypassed VAT / tax integration.
 *
 * 2. Consolidated View:
 *    - The full operational and financial records.
 *    - Accessible via the discreet lock gesture using the administrator passcode.
 *    - Real-time passcode synchronization with Firestore (`system_config/ledger_security`).
 */

import { db } from '../firebase.js';
import { doc, getDoc, setDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';

export const LEDGER_MODES = {
  OFFICIAL: 'official',
  MASTER: 'master',
  STANDARD: 'official',
  CONSOLIDATED: 'master'
};

export const DEFAULT_MASTER_PIN = '7799';
const STORAGE_KEY_PIN = 'tawoos_master_ledger_pin';
const SESSION_KEY_UNLOCKED = 'tawoos_master_ledger_unlocked';
const SESSION_KEY_MODE = 'tawoos_active_ledger_mode';
const LEDGER_CHANGE_EVENT = 'tawoos_ledger_mode_changed';

// In-memory synced passcode cache
let cachedFirestorePin = DEFAULT_MASTER_PIN;
let isFirestoreListenerInitialized = false;

/**
 * Initializes real-time listener for passcode from Firestore
 */
export function initPasscodeListener() {
  if (isFirestoreListenerInitialized || typeof window === 'undefined' || !db) return;
  try {
    const docRef = doc(db, 'system_config', 'ledger_security');
    onSnapshot(docRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data.passcode) {
          cachedFirestorePin = String(data.passcode).trim();
          localStorage.setItem(STORAGE_KEY_PIN, cachedFirestorePin);
        }
      }
    }, (err) => {
      console.warn('Note: Could not listen to ledger_security in Firestore:', err.message);
    });
    isFirestoreListenerInitialized = true;
  } catch (err) {
    console.warn('Failed to initialize passcode listener:', err);
  }
}

// Auto-initialize on module load
if (typeof window !== 'undefined') {
  initPasscodeListener();
}

/**
 * Retrieves the currently configured Passcode
 */
export function getMasterPin() {
  if (typeof window === 'undefined') return DEFAULT_MASTER_PIN;
  return cachedFirestorePin || localStorage.getItem(STORAGE_KEY_PIN) || DEFAULT_MASTER_PIN;
}

/**
 * Saves a new passcode to Firestore (used in Admin Control Panel)
 */
export async function saveMasterPinToFirestore(newPin, updatedBy = 'Admin') {
  const cleanPin = String(newPin).trim();
  if (cleanPin.length < 4) {
    throw new Error('Passcode must be at least 4 digits');
  }

  // Update in Firestore
  const docRef = doc(db, 'system_config', 'ledger_security');
  await setDoc(docRef, {
    passcode: cleanPin,
    updatedAt: serverTimestamp(),
    updatedBy
  }, { merge: true });

  // Update locally
  cachedFirestorePin = cleanPin;
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY_PIN, cleanPin);
  }
  return true;
}

/**
 * Validates entered passcode
 */
export function verifyMasterPin(enteredPin) {
  const currentPin = getMasterPin();
  return String(enteredPin).trim() === currentPin;
}

/**
 * Checks if the Consolidated View is currently unlocked in this browser session
 */
export function isMasterUnlocked() {
  if (typeof window === 'undefined') return false;
  return sessionStorage.getItem(SESSION_KEY_UNLOCKED) === 'true';
}

/**
 * Retrieves the currently active ledger mode ('official' | 'master')
 */
export function getActiveLedgerMode() {
  if (typeof window === 'undefined') return LEDGER_MODES.OFFICIAL;
  if (!isMasterUnlocked()) {
    return LEDGER_MODES.OFFICIAL;
  }
  return sessionStorage.getItem(SESSION_KEY_MODE) || LEDGER_MODES.MASTER;
}

/**
 * Unlocks the Consolidated View for the active session
 */
export function unlockMasterLedger() {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(SESSION_KEY_UNLOCKED, 'true');
  sessionStorage.setItem(SESSION_KEY_MODE, LEDGER_MODES.MASTER);
  dispatchLedgerModeChange();
}

/**
 * Locks back to Standard View immediately
 */
export function lockMasterLedger() {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(SESSION_KEY_UNLOCKED);
  sessionStorage.setItem(SESSION_KEY_MODE, LEDGER_MODES.OFFICIAL);
  dispatchLedgerModeChange();
}

/**
 * Switches between 'official' and 'master' if unlocked
 */
export function setActiveLedgerMode(mode) {
  if (typeof window === 'undefined') return;
  if (mode === LEDGER_MODES.MASTER && !isMasterUnlocked()) {
    console.warn('Cannot switch without unlocking');
    return;
  }
  sessionStorage.setItem(SESSION_KEY_MODE, mode);
  dispatchLedgerModeChange();
}

/**
 * Dispatches cross-component event on ledger mode change
 */
function dispatchLedgerModeChange() {
  if (typeof window === 'undefined') return;
  const event = new CustomEvent(LEDGER_CHANGE_EVENT, {
    detail: {
      mode: getActiveLedgerMode(),
      isUnlocked: isMasterUnlocked()
    }
  });
  window.dispatchEvent(event);
}

/**
 * Reactively subscribes to ledger mode & unlock changes
 */
export function subscribeToLedgerModeChange(callback) {
  if (typeof window === 'undefined') return () => {};
  const handler = (e) => {
    callback(e.detail);
  };
  window.addEventListener(LEDGER_CHANGE_EVENT, handler);
  return () => window.removeEventListener(LEDGER_CHANGE_EVENT, handler);
}

/**
 * Evaluates whether a transaction is officially tax-compliant
 */
export function isTransactionTaxOfficial(item) {
  if (!item) return false;

  // 1. Direct explicit boolean flag
  if (item.isTaxOfficial === true) return true;
  if (item.isTaxOfficial === false) return false;

  // 2. Cash voucher tax document classification
  if (item.taxDocumentType === 'taxable') return true;
  if (item.taxDocumentType === 'non_taxable' || item.taxDocumentType === 'no_document') return false;

  // 3. Operational documents linked in accrual entries
  if (item.sourceGrn) {
    return Boolean(item.sourceGrn.isTaxOfficial);
  }
  if (item.rawTx) {
    return isTransactionTaxOfficial(item.rawTx);
  }

  // 4. Tax invoice number check
  if (item.taxInvoiceNumber && String(item.taxInvoiceNumber).trim().length > 0) {
    return true;
  }
  if (item.taxDetails && item.taxDetails.invoiceNumber) {
    return true;
  }

  // 5. VAT calculation check
  const totalVat = Number(item.financials?.totalVat) || Number(item.totalVat) || Number(item.taxDetails?.vatAmount) || 0;
  if (totalVat > 0) {
    return true;
  }

  return false;
}

/**
 * Filters unified journal entries based on active mode
 */
export function filterUnifiedJournalByLedger(entries = [], mode = LEDGER_MODES.OFFICIAL) {
  if (mode === LEDGER_MODES.MASTER) {
    return entries;
  }
  return entries.filter((entry) => isTransactionTaxOfficial(entry));
}

/**
 * Filters cash transactions
 */
export function filterCashTransactionsByLedger(transactions = [], mode = LEDGER_MODES.OFFICIAL) {
  if (mode === LEDGER_MODES.MASTER) {
    return transactions;
  }
  return transactions.filter((tx) => isTransactionTaxOfficial(tx));
}

/**
 * Filters journal entries
 */
export function filterJournalEntriesByLedger(journalEntries = [], mode = LEDGER_MODES.OFFICIAL) {
  if (mode === LEDGER_MODES.MASTER) {
    return journalEntries;
  }
  return journalEntries.filter((je) => isTransactionTaxOfficial(je));
}
