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
  type?: string | null;
  seriesId?: string | null;
  seriesName?: string | null;
  parentId?: string | null;
  parentIndexNumber?: number | null;
  indexNumber?: number | null;
  posterUrl: string;
  imageCandidates: LibraryImageCandidate[];
  runtimeTicks: number | null;
  serverPositionTicks: number | null;
  played?: boolean;
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
  size: number | null;
  bitrate: number | null;
  videoCodec: string;
  videoStream: {
    Codec?: string | null;
    Width?: number | null;
    Height?: number | null;
    RealFrameRate?: number | null;
  } | null;
  audioStreams: Array<{
    Index?: number | null;
    DisplayTitle?: string | null;
    Language?: string | null;
    Codec?: string | null;
    Channels?: number | null;
    ChannelLayout?: string | null;
    IsDefault?: boolean | null;
  }>;
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
  imageCandidates?: LibraryImageCandidate[];
  runtimeTicks: number | null;
  serverPositionTicks: number | null;
  played?: boolean;
  mediaSources: LibraryItemMediaSource[];
}

