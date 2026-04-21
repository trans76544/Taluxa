export interface LibraryView {
  id: string;
  name: string;
  collectionType: string;
}

export interface LibraryItem {
  id: string;
  name: string;
  posterUrl: string;
  runtimeTicks: number | null;
}
