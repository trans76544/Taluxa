import type { ReactNode } from 'react';

type IconFamily = 'general' | 'playback' | 'subtitle' | 'media' | 'danmaku' | 'network' | 'account';
type IconAccent = 'danger';

export const settingsRowIconIds = {
  currentAccount: 'currentAccount',
  serverUrl: 'serverUrl',
  defaultVolume: 'defaultVolume',
  themeMode: 'themeMode',
  playbackScale: 'playbackScale',
  subtitleEnabled: 'subtitleEnabled',
  subtitleFont: 'subtitleFont',
  subtitleDelay: 'subtitleDelay',
  subtitleSize: 'subtitleSize',
  subtitlePosition: 'subtitlePosition',
  subtitleOutline: 'subtitleOutline',
  subtitleShadow: 'subtitleShadow',
  subtitleScale: 'subtitleScale',
  subtitleSecondary: 'subtitleSecondary',
  dataCache: 'dataCache',
  dataCacheExpiration: 'dataCacheExpiration',
  imageCache: 'imageCache',
  imageCacheLimit: 'imageCacheLimit',
  imageCacheResolution: 'imageCacheResolution',
  clearDataCache: 'clearDataCache',
  clearImageCache: 'clearImageCache',
  danmakuEnabled: 'danmakuEnabled',
  danmakuScrollLines: 'danmakuScrollLines',
  danmakuTopLines: 'danmakuTopLines',
  danmakuBottomLines: 'danmakuBottomLines',
  danmakuScale: 'danmakuScale',
  danmakuOpacity: 'danmakuOpacity',
  danmakuSpeed: 'danmakuSpeed',
  danmakuBold: 'danmakuBold',
  danmakuBlocklist: 'danmakuBlocklist',
  danmakuMatchMode: 'danmakuMatchMode',
  danmakuConversion: 'danmakuConversion',
  danmakuApi: 'danmakuApi',
  danmakuServerForm: 'danmakuServerForm',
  proxy: 'proxy',
  logout: 'logout',
} as const;

export type SettingsIconId = (typeof settingsRowIconIds)[keyof typeof settingsRowIconIds];

interface SettingsIconMeta {
  id: SettingsIconId;
  family: IconFamily;
  meaning: string;
  accent?: IconAccent;
}

export const subtitleIconIds: SettingsIconId[] = [
  'subtitleEnabled',
  'subtitleFont',
  'subtitleDelay',
  'subtitleSize',
  'subtitlePosition',
  'subtitleOutline',
  'subtitleShadow',
  'subtitleScale',
  'subtitleSecondary',
];

export const settingsIconRegistry: Record<SettingsIconId, SettingsIconMeta> = {
  currentAccount: { id: 'currentAccount', family: 'general', meaning: 'active account' },
  serverUrl: { id: 'serverUrl', family: 'general', meaning: 'server connection' },
  defaultVolume: { id: 'defaultVolume', family: 'general', meaning: 'startup volume' },
  themeMode: { id: 'themeMode', family: 'general', meaning: 'client color tone' },
  playbackScale: { id: 'playbackScale', family: 'playback', meaning: 'player scale mode' },
  subtitleEnabled: { id: 'subtitleEnabled', family: 'subtitle', meaning: 'subtitle visibility' },
  subtitleFont: { id: 'subtitleFont', family: 'subtitle', meaning: 'subtitle font family' },
  subtitleDelay: { id: 'subtitleDelay', family: 'subtitle', meaning: 'subtitle timing offset' },
  subtitleSize: { id: 'subtitleSize', family: 'subtitle', meaning: 'subtitle text size' },
  subtitlePosition: { id: 'subtitlePosition', family: 'subtitle', meaning: 'subtitle vertical position' },
  subtitleOutline: { id: 'subtitleOutline', family: 'subtitle', meaning: 'subtitle outline weight' },
  subtitleShadow: { id: 'subtitleShadow', family: 'subtitle', meaning: 'subtitle shadow offset' },
  subtitleScale: { id: 'subtitleScale', family: 'subtitle', meaning: 'subtitle scale ratio' },
  subtitleSecondary: { id: 'subtitleSecondary', family: 'subtitle', meaning: 'secondary subtitle track' },
  dataCache: { id: 'dataCache', family: 'media', meaning: 'media data cache' },
  dataCacheExpiration: { id: 'dataCacheExpiration', family: 'media', meaning: 'cache expiration timing' },
  imageCache: { id: 'imageCache', family: 'media', meaning: 'poster image cache' },
  imageCacheLimit: { id: 'imageCacheLimit', family: 'media', meaning: 'image cache storage limit' },
  imageCacheResolution: { id: 'imageCacheResolution', family: 'media', meaning: 'cached image resolution' },
  clearDataCache: { id: 'clearDataCache', family: 'media', meaning: 'clear media data cache' },
  clearImageCache: { id: 'clearImageCache', family: 'media', meaning: 'clear poster image cache' },
  danmakuEnabled: { id: 'danmakuEnabled', family: 'danmaku', meaning: 'danmaku visibility' },
  danmakuScrollLines: { id: 'danmakuScrollLines', family: 'danmaku', meaning: 'scrolling danmaku line limit' },
  danmakuTopLines: { id: 'danmakuTopLines', family: 'danmaku', meaning: 'top danmaku line limit' },
  danmakuBottomLines: { id: 'danmakuBottomLines', family: 'danmaku', meaning: 'bottom danmaku line limit' },
  danmakuScale: { id: 'danmakuScale', family: 'danmaku', meaning: 'danmaku scale ratio' },
  danmakuOpacity: { id: 'danmakuOpacity', family: 'danmaku', meaning: 'danmaku opacity' },
  danmakuSpeed: { id: 'danmakuSpeed', family: 'danmaku', meaning: 'danmaku scroll speed' },
  danmakuBold: { id: 'danmakuBold', family: 'danmaku', meaning: 'danmaku bold text' },
  danmakuBlocklist: { id: 'danmakuBlocklist', family: 'danmaku', meaning: 'danmaku blocklist' },
  danmakuMatchMode: { id: 'danmakuMatchMode', family: 'danmaku', meaning: 'danmaku match strategy' },
  danmakuConversion: { id: 'danmakuConversion', family: 'danmaku', meaning: 'danmaku text conversion' },
  danmakuApi: { id: 'danmakuApi', family: 'danmaku', meaning: 'danmaku api endpoint' },
  danmakuServerForm: { id: 'danmakuServerForm', family: 'danmaku', meaning: 'danmaku server list' },
  proxy: { id: 'proxy', family: 'network', meaning: 'network proxy' },
  logout: { id: 'logout', family: 'account', meaning: 'sign out action', accent: 'danger' },
};

interface SettingsIconProps {
  id: SettingsIconId;
}

export function SettingsIcon({ id }: SettingsIconProps) {
  const icon = settingsIconRegistry[id];

  return (
    <span
      aria-hidden="true"
      className="settings-row__icon"
      data-settings-icon-accent={icon.accent}
      data-settings-icon-family={icon.family}
      data-testid={`settings-icon-${id}`}
    >
      <svg viewBox="0 0 24 24" focusable="false">
        {renderIconGlyph(id)}
      </svg>
    </span>
  );
}

function renderIconGlyph(id: SettingsIconId): ReactNode {
  switch (id) {
    case 'currentAccount':
      return (
        <>
          <circle cx="12" cy="8" r="3.2" />
          <path d="M5.5 19c1.1-3.7 3.3-5.5 6.5-5.5s5.4 1.8 6.5 5.5" />
        </>
      );
    case 'serverUrl':
      return (
        <>
          <rect x="5" y="6" width="14" height="12" rx="2" />
          <path d="M8 10h8M8 14h5" />
        </>
      );
    case 'defaultVolume':
      return (
        <>
          <path d="M5 10v4h3l4 3V7l-4 3H5z" />
          <path d="M15 9c1.2 1.8 1.2 4.2 0 6M18 7c2.2 3 2.2 7 0 10" />
        </>
      );
    case 'themeMode':
      return (
        <>
          <circle cx="12" cy="12" r="7" />
          <path d="M12 5a7 7 0 0 1 0 14V5z" />
          <path d="M7 12h10" />
        </>
      );
    case 'playbackScale':
      return (
        <>
          <rect x="5" y="6" width="14" height="12" rx="2" />
          <path d="M9 10h6v4H9z" />
        </>
      );
    case 'subtitleEnabled':
      return (
        <>
          <rect x="4.5" y="6.5" width="15" height="11" rx="2" />
          <path d="M8 12h3M13 12h3M8 15h8" />
        </>
      );
    case 'subtitleFont':
      return (
        <>
          <path d="M7 18l5-12 5 12M9 14h6" />
          <path d="M6 6h12" />
        </>
      );
    case 'subtitleDelay':
      return (
        <>
          <circle cx="12" cy="12" r="7" />
          <path d="M12 8v4l3 2M5 5l2 2M19 5l-2 2" />
        </>
      );
    case 'subtitleSize':
      return (
        <>
          <path d="M5 17l4-10 4 10M7 13h4" />
          <path d="M14 17l2.5-6 2.5 6M15 14h3" />
        </>
      );
    case 'subtitlePosition':
      return (
        <>
          <rect x="5" y="5" width="14" height="14" rx="2" />
          <path d="M9 16h6M12 8v6M9.5 11.5L12 14l2.5-2.5" />
        </>
      );
    case 'subtitleOutline':
      return (
        <>
          <circle cx="12" cy="12" r="6" />
          <circle cx="12" cy="12" r="3" />
        </>
      );
    case 'subtitleShadow':
      return (
        <>
          <rect x="8" y="8" width="9" height="9" rx="2" />
          <path d="M5 14V7a2 2 0 0 1 2-2h7" />
        </>
      );
    case 'subtitleScale':
      return (
        <>
          <path d="M7 17V7h10v10H7z" />
          <path d="M7 10h10M10 7v10" />
        </>
      );
    case 'subtitleSecondary':
      return (
        <>
          <rect x="4.5" y="6" width="15" height="5" rx="1.5" />
          <rect x="4.5" y="13" width="15" height="5" rx="1.5" />
        </>
      );
    case 'dataCache':
      return (
        <>
          <ellipse cx="12" cy="7" rx="6" ry="2.5" />
          <path d="M6 7v8c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5V7M6 11c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5" />
        </>
      );
    case 'dataCacheExpiration':
      return (
        <>
          <circle cx="12" cy="12" r="7" />
          <path d="M12 8v4h4M7 5l-2 2M17 5l2 2" />
        </>
      );
    case 'imageCache':
      return (
        <>
          <rect x="5" y="6" width="14" height="12" rx="2" />
          <path d="M8 15l3-3 2 2 2-3 3 4" />
          <circle cx="9" cy="9" r="1" />
        </>
      );
    case 'imageCacheLimit':
      return (
        <>
          <rect x="5" y="6" width="14" height="12" rx="2" />
          <path d="M8 15h8M8 11h5M16 9v4" />
        </>
      );
    case 'imageCacheResolution':
      return (
        <>
          <rect x="5" y="7" width="14" height="10" rx="2" />
          <path d="M8 10h3v2H8zM13 10h3v2h-3zM8 14h8" />
        </>
      );
    case 'clearDataCache':
      return (
        <>
          <ellipse cx="12" cy="7" rx="5.5" ry="2.2" />
          <path d="M6.5 7v7c0 1.2 2.5 2.2 5.5 2.2 1.2 0 2.3-.2 3.2-.5M16 13l4 4M20 13l-4 4" />
        </>
      );
    case 'clearImageCache':
      return (
        <>
          <rect x="5" y="6" width="11" height="11" rx="2" />
          <path d="M7.5 14l2.5-2.5 2 2 1.5-2M16 13l4 4M20 13l-4 4" />
        </>
      );
    case 'danmakuEnabled':
      return (
        <>
          <rect x="4.5" y="7" width="15" height="10" rx="2" />
          <path d="M7 10h5M7 13h9" />
        </>
      );
    case 'danmakuScrollLines':
      return (
        <>
          <path d="M5 8h11M8 12h11M5 16h11" />
          <path d="M17 7l2 1-2 1M6 15l-2 1 2 1" />
        </>
      );
    case 'danmakuTopLines':
      return (
        <>
          <rect x="5" y="6" width="14" height="12" rx="2" />
          <path d="M8 9h8M8 12h6" />
        </>
      );
    case 'danmakuBottomLines':
      return (
        <>
          <rect x="5" y="6" width="14" height="12" rx="2" />
          <path d="M8 12h6M8 15h8" />
        </>
      );
    case 'danmakuScale':
      return (
        <>
          <path d="M6 16V8h12v8H6z" />
          <path d="M9 12h6M12 9v6" />
        </>
      );
    case 'danmakuOpacity':
      return (
        <>
          <path d="M12 5c4 3.6 6 6.2 6 8.5a6 6 0 0 1-12 0C6 11.2 8 8.6 12 5z" />
          <path d="M12 8v11" />
        </>
      );
    case 'danmakuSpeed':
      return (
        <>
          <path d="M5 15a7 7 0 1 1 14 0" />
          <path d="M12 15l4-4M7 17h10" />
        </>
      );
    case 'danmakuBold':
      return (
        <>
          <path d="M8 6h5a3 3 0 0 1 0 6H8z" />
          <path d="M8 12h6a3 3 0 0 1 0 6H8z" />
        </>
      );
    case 'danmakuBlocklist':
      return (
        <>
          <circle cx="12" cy="12" r="7" />
          <path d="M7.5 16.5l9-9" />
        </>
      );
    case 'danmakuMatchMode':
      return (
        <>
          <path d="M7 8h5a3 3 0 0 1 0 6H7" />
          <path d="M12 10h5M12 14h5" />
        </>
      );
    case 'danmakuConversion':
      return (
        <>
          <path d="M6 7h7M9.5 7v10M6.5 12h6" />
          <path d="M15 10l3 3-3 3M13 13h5" />
        </>
      );
    case 'danmakuApi':
      return (
        <>
          <path d="M8 8h8v8H8z" />
          <path d="M5 10h3M5 14h3M16 10h3M16 14h3M10 5v3M14 5v3M10 16v3M14 16v3" />
        </>
      );
    case 'danmakuServerForm':
      return (
        <>
          <rect x="6" y="5" width="12" height="6" rx="1.5" />
          <rect x="6" y="13" width="12" height="6" rx="1.5" />
          <path d="M9 8h.1M9 16h.1M12 8h3M12 16h3" />
        </>
      );
    case 'proxy':
      return (
        <>
          <path d="M12 4l7 3v5c0 4-2.7 6.8-7 8-4.3-1.2-7-4-7-8V7l7-3z" />
          <path d="M9 12l2 2 4-5" />
        </>
      );
    case 'logout':
      return (
        <>
          <path d="M9 6H6v12h3M11 12h8" />
          <path d="M16 9l3 3-3 3" />
        </>
      );
    default:
      return null;
  }
}
