import { useMemo, useSyncExternalStore } from 'react';
import { NAVIGATE_EVENT, parseRoute, type Route } from '../app/route';

function subscribe(onChange: () => void): () => void {
  window.addEventListener('popstate', onChange);
  window.addEventListener(NAVIGATE_EVENT, onChange);
  return () => {
    window.removeEventListener('popstate', onChange);
    window.removeEventListener(NAVIGATE_EVENT, onChange);
  };
}

export function useRoute(): Route {
  const pathname = useSyncExternalStore(subscribe, () => window.location.pathname);
  return useMemo(() => parseRoute(pathname), [pathname]);
}
