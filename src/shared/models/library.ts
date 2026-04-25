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
  communityRating: number | null;
  productionYear: number | null;
}

export interface LibraryItemPerson {
  id: string;
  name: string;
  role: string;
  type: string;
  imageUrl: string | null;
}

export interface LibraryItemStudio {
  id: string;
  name: string;
}

export interface LibraryItemExternalUrl {
  name: string;
  url: string;
}

export interface LibraryItemMediaSource {
  id: string;
  container: string;
  path: string;
  videoCodec: string;
  videoStream: any;
  audioStreams: any[];
}

export interface LibraryItemDetails extends LibraryItem {
  type: string;
  overview: string;
  genres: string[];
  communityRating: number | null;
  officialRating: string;
  productionYear: number | null;
  people: LibraryItemPerson[];
  studios: LibraryItemStudio[];
  externalUrls: LibraryItemExternalUrl[];
  mediaSources: LibraryItemMediaSource[];
  backdropUrl: string | null;
}

export interface LibrarySeason {
  id: string;
  name: string;
  indexNumber: number;
  posterUrl: string | null;
}

export interface LibraryEpisode {
  id: string;
  name: string;
  overview: string;
  indexNumber: number;
  parentIndexNumber: number;
  posterUrl: string | null;
  runtimeTicks: number | null;
  serverPositionTicks: number | null;
}

