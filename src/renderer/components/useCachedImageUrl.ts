import { useEffect, useState } from 'react';
import { createSessionSnapshotStore } from '@shared/utils/sessionSnapshot';

type ImageCacheBridge = Window['embyDesktop']['imageCache'];

function createImageUrlStore() {
  return {
    urls: createSessionSnapshotStore<string>({ maxEntries: 2000 }),
    pending: new Map<string, Promise<string>>(),
  };
}

const stores = new WeakMap<ImageCacheBridge, ReturnType<typeof createImageUrlStore>>();

function getImageUrlStore(bridge: ImageCacheBridge) {
  let store = stores.get(bridge);
  if (!store) {
    store = createImageUrlStore();
    stores.set(bridge, store);
  }
  return store;
}

export function invalidateCachedImageUrls(sourceUrl?: string) {
  const bridge = window.embyDesktop?.imageCache;
  if (!bridge) return;
  if (sourceUrl) {
    getImageUrlStore(bridge).urls.invalidate((key) => key === sourceUrl);
  } else {
    stores.delete(bridge);
  }
}

export function useCachedImageUrl(sourceUrl: string | null): string | null {
  const bridge = window.embyDesktop?.imageCache;
  const store = typeof bridge?.resolve === 'function' ? getImageUrlStore(bridge) : null;
  const initialUrl = sourceUrl && store ? store.urls.get(sourceUrl) ?? null : sourceUrl;
  const [resolved, setResolved] = useState({ sourceUrl, store, url: initialUrl });

  useEffect(() => {
    setResolved({ sourceUrl, store, url: initialUrl });
    if (!sourceUrl || !store || !bridge || initialUrl) {
      return;
    }

    let pending = store.pending.get(sourceUrl);
    if (!pending) {
      pending = Promise.resolve()
        .then(() => bridge.resolve(sourceUrl))
        .then((entry) => {
          if (stores.get(bridge) !== store) return sourceUrl;
          // Failures and disabled-cache responses must be retried on the next visit.
          if (entry.url.startsWith('taluxa-image-cache://')) {
            store.urls.set(sourceUrl, entry.url);
          }
          return entry.url;
        })
        .catch(() => sourceUrl)
        .finally(() => store.pending.delete(sourceUrl));
      store.pending.set(sourceUrl, pending);
    }
    let cancelled = false;
    pending.then((url) => {
      if (!cancelled) setResolved({ sourceUrl, store, url });
    });
    return () => {
      cancelled = true;
    };
  }, [sourceUrl, store, bridge]);

  return resolved.sourceUrl === sourceUrl && resolved.store === store ? resolved.url : initialUrl;
}
