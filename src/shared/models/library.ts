export interface LibraryView {
  id: string;
  name: string;
  collectionType: string;
}

export interface LibraryImageCandidate {
  url: string;
  kind: 'primary' | 'thumb' | 'backdrop';
}

export interface LibraryItem {
  id: string;
  name: string;
  posterUrl: string;
  imageCandidates: LibraryImageCandidate[];
  runtimeTicks: number | null;
  serverPositionTicks: number | null;
}
