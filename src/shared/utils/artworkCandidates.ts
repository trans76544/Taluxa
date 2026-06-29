import type { LibraryImageCandidate } from '@shared/models/library';

export interface ArtworkCandidateSet {
  posterUrl: string;
  imageCandidates: LibraryImageCandidate[];
}

function normalizeCandidateUrl(url: string | null | undefined): string {
  return typeof url === 'string' ? url.trim() : '';
}

function addCandidate(
  candidates: LibraryImageCandidate[],
  seenUrls: Set<string>,
  candidate: LibraryImageCandidate | null | undefined
) {
  const url = normalizeCandidateUrl(candidate?.url);

  if (!url || seenUrls.has(url)) {
    return;
  }

  seenUrls.add(url);
  candidates.push({
    url,
    kind: candidate?.kind ?? 'primary',
  });
}

export function normalizeArtworkCandidates(input: {
  preferredUrl?: string | null;
  candidates?: LibraryImageCandidate[] | null;
  parentCandidates?: LibraryImageCandidate[] | null;
}): LibraryImageCandidate[] {
  const normalizedCandidates: LibraryImageCandidate[] = [];
  const seenUrls = new Set<string>();
  const preferredUrl = normalizeCandidateUrl(input.preferredUrl);

  if (preferredUrl) {
    addCandidate(normalizedCandidates, seenUrls, {
      url: preferredUrl,
      kind: 'primary',
    });
  }

  for (const candidate of input.candidates ?? []) {
    addCandidate(normalizedCandidates, seenUrls, candidate);
  }

  for (const candidate of input.parentCandidates ?? []) {
    addCandidate(normalizedCandidates, seenUrls, candidate);
  }

  return normalizedCandidates;
}

export function createArtworkCandidateSet(input: {
  preferredUrl?: string | null;
  candidates?: LibraryImageCandidate[] | null;
  parentCandidates?: LibraryImageCandidate[] | null;
}): ArtworkCandidateSet {
  const imageCandidates = normalizeArtworkCandidates(input);

  return {
    posterUrl: imageCandidates[0]?.url ?? '',
    imageCandidates,
  };
}

export function createParentArtworkCandidates(
  candidates: LibraryImageCandidate[] | null | undefined
): LibraryImageCandidate[] {
  return (candidates ?? []).map((candidate) => ({
    url: candidate.url,
    kind:
      candidate.kind === 'thumb'
        ? 'parent-thumb'
        : candidate.kind === 'backdrop'
          ? 'parent-backdrop'
          : 'parent-primary',
  }));
}
