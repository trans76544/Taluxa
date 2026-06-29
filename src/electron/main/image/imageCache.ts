import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DEFAULT_NETWORK_TIMEOUT_MS } from '@shared/models/network';

export const IMAGE_CACHE_PROTOCOL = 'taluxa-image-cache';
export const DEFAULT_IMAGE_CACHE_MAX_BYTES = 500 * 1024 * 1024;

export interface ImageCacheFetch {
  (url: string, init?: RequestInit): Promise<Response>;
}

export interface ImageCacheTransformResult {
  bytes: Buffer;
  contentType: string;
}

export interface ImageCacheTransform {
  (
    bytes: Buffer,
    contentType: string,
    maxDimension: number
  ): Promise<ImageCacheTransformResult> | ImageCacheTransformResult;
}

export interface ResolvedImageCacheEntry {
  cacheKey: string;
  filePath: string;
  fromCache: boolean;
  url: string;
}

interface ImageCacheMetadata {
  cachedAt: string;
  contentType: string;
  fileName: string;
  lastAccessedAt: string;
  sizeBytes: number;
  sourceUrl: string;
}

interface ImageCacheOptions {
  cacheDir: string;
  enabled?: boolean;
  fetcher: ImageCacheFetch;
  maxDimension?: number | null;
  maxBytes?: number;
  now?: () => Date;
  timeoutMs?: number;
  transformImage?: ImageCacheTransform;
}

export interface CachedImageBytes {
  bytes: Buffer;
  contentType: string;
}

export interface ImageCacheStats {
  count: number;
  sizeBytes: number;
}

export interface ImageCacheConfig {
  enabled?: boolean;
  maxDimension?: number | null;
  maxBytes?: number;
}

function isCacheKey(cacheKey: string): boolean {
  return /^[a-f0-9]{64}$/.test(cacheKey);
}

function createCacheKey(sourceUrl: string, maxDimension: number | null): string {
  return createHash('sha256')
    .update(JSON.stringify({ sourceUrl, maxDimension }))
    .digest('hex');
}

function createProtocolUrl(cacheKey: string): string {
  return `${IMAGE_CACHE_PROTOCOL}://${cacheKey}`;
}

function getImageFileName(cacheKey: string): string {
  return `${cacheKey}.img`;
}

function getMetadataFileName(cacheKey: string): string {
  return `${cacheKey}.json`;
}

function isCacheableImageUrl(sourceUrl: string): boolean {
  try {
    const url = new URL(sourceUrl);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export class ImageCache {
  private readonly cacheDir: string;
  private readonly fetcher: ImageCacheFetch;
  private readonly transformImage?: ImageCacheTransform;
  private enabled: boolean;
  private maxDimension: number | null;
  private maxBytes: number;
  private readonly now: () => Date;
  private readonly timeoutMs: number;
  private readonly inFlightByRequestKey = new Map<string, Promise<ResolvedImageCacheEntry>>();

  constructor({
    cacheDir,
    fetcher,
    enabled = true,
    maxDimension = null,
    maxBytes = DEFAULT_IMAGE_CACHE_MAX_BYTES,
    now = () => new Date(),
    timeoutMs = DEFAULT_NETWORK_TIMEOUT_MS.image,
    transformImage,
  }: ImageCacheOptions) {
    this.cacheDir = cacheDir;
    this.fetcher = fetcher;
    this.transformImage = transformImage;
    this.enabled = enabled;
    this.maxDimension = maxDimension;
    this.maxBytes = maxBytes;
    this.now = now;
    this.timeoutMs = timeoutMs;
  }

  async resolve(sourceUrl: string): Promise<ResolvedImageCacheEntry> {
    if (!this.enabled) {
      throw new Error('Image cache is disabled');
    }

    if (!isCacheableImageUrl(sourceUrl)) {
      throw new Error('Image URL must be http or https');
    }

    const maxDimension = this.maxDimension;
    const requestKey = createCacheKey(sourceUrl, maxDimension);
    const inFlight = this.inFlightByRequestKey.get(requestKey);

    if (inFlight) {
      return inFlight;
    }

    const nextResolve = this.resolveUnshared(sourceUrl, maxDimension).finally(() => {
      this.inFlightByRequestKey.delete(requestKey);
    });

    this.inFlightByRequestKey.set(requestKey, nextResolve);
    return nextResolve;
  }

  async read(cacheKey: string): Promise<CachedImageBytes> {
    if (!isCacheKey(cacheKey)) {
      throw new Error('Invalid image cache key');
    }

    const metadata = await this.readMetadata(cacheKey);
    const bytes = await readFile(join(this.cacheDir, metadata.fileName));

    return {
      bytes,
      contentType: metadata.contentType,
    };
  }

  configure({ enabled, maxDimension, maxBytes }: ImageCacheConfig) {
    if (enabled !== undefined) {
      this.enabled = enabled;
    }

    if (maxDimension !== undefined) {
      this.maxDimension = maxDimension;
    }

    if (maxBytes !== undefined) {
      this.maxBytes = maxBytes;
    }
  }

  async stats(): Promise<ImageCacheStats> {
    const entries = await this.readAllMetadata();

    return {
      count: entries.length,
      sizeBytes: entries.reduce((total, entry) => total + entry.metadata.sizeBytes, 0),
    };
  }

  async clear(): Promise<void> {
    const files = await readdir(this.cacheDir).catch(() => []);

    await Promise.all(
      files.map((file) => rm(join(this.cacheDir, file), { force: true, recursive: true }))
    );
  }

  private async resolveUnshared(
    sourceUrl: string,
    maxDimension: number | null
  ): Promise<ResolvedImageCacheEntry> {
    await mkdir(this.cacheDir, { recursive: true });

    const cacheKey = createCacheKey(sourceUrl, maxDimension);
    const fileName = getImageFileName(cacheKey);
    const filePath = join(this.cacheDir, fileName);
    const metadata = await this.tryReadMetadata(cacheKey);

    if (metadata) {
      try {
        await stat(filePath);
        await this.writeMetadata(cacheKey, {
          ...metadata,
          lastAccessedAt: this.now().toISOString(),
        });

        return {
          cacheKey,
          filePath,
          fromCache: true,
          url: createProtocolUrl(cacheKey),
        };
      } catch {
        await this.deleteEntry(cacheKey);
      }
    }

    const response = await this.fetchImageWithTimeout(sourceUrl);

    if (!response.ok) {
      throw new Error(`Failed to download image (${response.status})`);
    }

    let bytes = Buffer.from(await response.arrayBuffer());
    let contentType = response.headers.get('Content-Type')?.split(';')[0]?.trim() || 'image/jpeg';

    if (bytes.length === 0) {
      throw new Error('Downloaded image was empty');
    }

    if (maxDimension && this.transformImage) {
      try {
        const transformed = await this.transformImage(bytes, contentType, maxDimension);
        bytes = Buffer.from(transformed.bytes);
        contentType = transformed.contentType;
      } catch {
        // Keep the original image when resizing fails; cache correctness is more important.
      }
    }

    const now = this.now().toISOString();
    const tempPath = join(this.cacheDir, `${fileName}.${process.pid}.tmp`);

    await writeFile(tempPath, bytes);
    await rename(tempPath, filePath);
    await this.writeMetadata(cacheKey, {
      cachedAt: now,
      contentType,
      fileName,
      lastAccessedAt: now,
      sizeBytes: bytes.length,
      sourceUrl,
    });
    await this.pruneIfNeeded(cacheKey);

    return {
      cacheKey,
      filePath,
      fromCache: false,
      url: createProtocolUrl(cacheKey),
    };
  }

  private async fetchImageWithTimeout(sourceUrl: string): Promise<Response> {
    const abortController = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      timeoutId = setTimeout(() => {
        abortController.abort();
        reject(new Error('Image cache request timed out'));
      }, this.timeoutMs);
    });

    try {
      return await Promise.race([
        this.fetcher(sourceUrl, { signal: abortController.signal }),
        timeoutPromise,
      ]);
    } finally {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
    }
  }

  private async pruneIfNeeded(protectedCacheKey: string) {
    const entries = await this.readAllMetadata();
    let totalBytes = entries.reduce((total, entry) => total + entry.metadata.sizeBytes, 0);

    if (totalBytes <= this.maxBytes) {
      return;
    }

    for (const entry of entries.sort((left, right) =>
      left.metadata.lastAccessedAt.localeCompare(right.metadata.lastAccessedAt)
    )) {
      if (entry.cacheKey === protectedCacheKey) {
        continue;
      }

      await this.deleteEntry(entry.cacheKey);
      totalBytes -= entry.metadata.sizeBytes;

      if (totalBytes <= this.maxBytes) {
        return;
      }
    }
  }

  private async readAllMetadata(): Promise<Array<{ cacheKey: string; metadata: ImageCacheMetadata }>> {
    const files = await readdir(this.cacheDir).catch(() => []);
    const metadataEntries: Array<{ cacheKey: string; metadata: ImageCacheMetadata }> = [];

    for (const file of files) {
      if (!file.endsWith('.json')) {
        continue;
      }

      const cacheKey = file.slice(0, -'.json'.length);
      const metadata = await this.tryReadMetadata(cacheKey);

      if (metadata) {
        metadataEntries.push({ cacheKey, metadata });
      }
    }

    return metadataEntries;
  }

  private metadataPath(cacheKey: string): string {
    return join(this.cacheDir, getMetadataFileName(cacheKey));
  }

  private async readMetadata(cacheKey: string): Promise<ImageCacheMetadata> {
    return JSON.parse(await readFile(this.metadataPath(cacheKey), 'utf8')) as ImageCacheMetadata;
  }

  private async tryReadMetadata(cacheKey: string): Promise<ImageCacheMetadata | null> {
    try {
      return await this.readMetadata(cacheKey);
    } catch {
      return null;
    }
  }

  private writeMetadata(cacheKey: string, metadata: ImageCacheMetadata): Promise<void> {
    return writeFile(this.metadataPath(cacheKey), JSON.stringify(metadata, null, 2), 'utf8');
  }

  private async deleteEntry(cacheKey: string) {
    await Promise.all([
      rm(join(this.cacheDir, getImageFileName(cacheKey)), { force: true }),
      rm(this.metadataPath(cacheKey), { force: true }),
    ]);
  }
}
