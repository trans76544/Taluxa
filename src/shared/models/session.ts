export interface Session {
  userId: string;
  userName: string;
  accessToken: string;
}

export interface SavedAccount extends Session {
  id: string;
  serverUrl: string;
  lastUsedAt: string;
}
