const LOCAL_EVENT = 'episteme-local-storage';

/**
 * Minimal localStorage-backed external store for useSyncExternalStore.
 * Re-renders subscribers on same-tab writes (custom event) and cross-tab
 * writes (native storage event).
 */
export function subscribeToLocalStorage(callback: () => void): () => void {
  window.addEventListener('storage', callback);
  window.addEventListener(LOCAL_EVENT, callback);
  return () => {
    window.removeEventListener('storage', callback);
    window.removeEventListener(LOCAL_EVENT, callback);
  };
}

export function readLocalStorage(key: string): string | null {
  return window.localStorage.getItem(key);
}

export function writeLocalStorage(key: string, value: string): void {
  window.localStorage.setItem(key, value);
  window.dispatchEvent(new Event(LOCAL_EVENT));
}
