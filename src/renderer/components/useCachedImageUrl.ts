import { useEffect, useState } from 'react';

export function useCachedImageUrl(sourceUrl: string | null): string | null {
  const [resolvedUrl, setResolvedUrl] = useState(sourceUrl);

  useEffect(() => {
    setResolvedUrl(sourceUrl);

    if (!sourceUrl) {
      return;
    }

    const resolveImage = window.embyDesktop?.imageCache?.resolve;

    if (!resolveImage) {
      return;
    }

    let cancelled = false;

    resolveImage(sourceUrl)
      .then((entry) => {
        if (!cancelled) {
          setResolvedUrl(entry.url);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setResolvedUrl(sourceUrl);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [sourceUrl]);

  return resolvedUrl;
}
