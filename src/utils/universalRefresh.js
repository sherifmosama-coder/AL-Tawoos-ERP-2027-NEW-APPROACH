import { playNotificationSound } from './notificationEngine';

/**
 * Universally triggers an actual database refresh while preserving the current tab and sub-route.
 * @param {string} tabName - Active tab identifier (e.g. 'orders', 'accounts', 'stock')
 * @param {string} moduleName - Active module identifier (e.g. 'purchases', 'finance')
 */
export function triggerDatabaseRefresh(tabName, moduleName) {
  try {
    const activeTab = tabName || (typeof window !== 'undefined' ? window.location.hash.replace(/^#/, '').split('?')[0] : '');
    const currentHash = typeof window !== 'undefined' ? window.location.hash : '';
    
    if (typeof window !== 'undefined') {
      if (activeTab && activeTab !== 'landing') {
        sessionStorage.setItem('tawoos_last_active_tab', activeTab);
        if (moduleName) {
          sessionStorage.setItem('tawoos_last_active_module', moduleName);
        }
      }

      // Preserve query params / sub-tab in hash if present
      if (activeTab && (!currentHash || !currentHash.startsWith('#' + activeTab))) {
        window.location.hash = activeTab;
      }

      // Dispatch custom refresh notification event across active windows
      window.dispatchEvent(new CustomEvent('app_database_refresh', {
        detail: { tab: activeTab, module: moduleName }
      }));

      // Play soft harmonic feedback chime
      try {
        playNotificationSound();
      } catch (e) {
        // AudioContext fallback
      }

      // Allow 150ms for UI button spin animation and audio chime before hard reload
      setTimeout(() => {
        window.location.reload();
      }, 150);
    }
  } catch (err) {
    console.error('Database refresh failed:', err);
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  }
}
