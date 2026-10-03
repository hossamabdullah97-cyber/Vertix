import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

/** Where uploads live when no bucket is set up (development). Served at /uploads. */
export const UPLOAD_DIR = join(process.cwd(), 'uploads');

/** The image types accepted, by their first bytes rather than what the browser claims. */
const SIGNATURES: { type: string; ext: string; test: (b: Buffer) => boolean }[] = [
  { type: 'image/jpeg', ext: '.jpg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { type: 'image/png', ext: '.png', test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { type: 'image/gif', ext: '.gif', test: (b) => b.subarray(0, 4).toString('latin1') === 'GIF8' },
  { type: 'image/webp', ext: '.webp', test: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP' },
  { type: 'image/avif', ext: '.avif', test: (b) => b.subarray(4, 12).toString('latin1') === 'ftypavif' },
];

/** The image's real type and extension, or null when it is not an image we take. */
export function sniffImage(bytes: Buffer): { type: string; ext: string } | null {
  const hit = SIGNATURES.find((s) => bytes.length >= 12 && s.test(bytes));
  return hit ? { type: hit.type, ext: hit.ext } : null;
}

/** The stored file names ("<random>.<ext>") an upload address, or any text holding some, refers to. */
export function uploadNamesIn(text: string): string[] {
  return Array.from(new Set(Array.from(text.matchAll(/\/uploads\/([A-Za-z0-9-]+\.[a-z]+)/gi), (m) => m[1]!)));
}

export interface StoredFile {
  bytes: Buffer;
  type: string;
}

interface BucketConfig {
  client: S3Client;
  bucket: string;
  /** Where the bucket's objects are public, e.g. https://media.example.com */
  publicUrl: string;
}

/**
 * Where uploaded images are kept. With a bucket set up (S3, Cloudflare R2 or
 * anything that speaks S3), files go there and survive redeploys; without
 * one, they go to the local `uploads` folder, which suits development only.
 */
@Injectable()
export class StorageService {
  private readonly log = new Logger(StorageService.name);
  private readonly bucket: BucketConfig | null;

  constructor(config: ConfigService) {
    const get = (k: string) => config.get<string>(k)?.trim() || undefined;
    const endpoint = get('S3_ENDPOINT');
    const accessKeyId = get('S3_ACCESS_KEY');
    const secretAccessKey = get('S3_SECRET_KEY');
    const bucket = get('S3_BUCKET');
    const publicUrl = get('S3_PUBLIC_URL');
    if (accessKeyId && secretAccessKey && bucket && publicUrl) {
      this.bucket = {
        bucket,
        publicUrl: publicUrl.replace(/\/$/, ''),
        client: new S3Client({
          region: get('S3_REGION') ?? 'auto',
          ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
          credentials: { accessKeyId, secretAccessKey },
        }),
      };
    } else {
      this.bucket = null;
      if (config.get<string>('NODE_ENV') === 'production') {
        this.log.warn('No S3 bucket is set up: uploads go to the local disk and are lost when the container is replaced.');
      }
    }
  }

  /** True when files go to a bucket. */
  get durable(): boolean {
    return this.bucket !== null;
  }

  /**
   * Keeps an image and gives its public address. `requestBase` is this API's
   * own address, used for files kept on the local disk.
   */
  async saveImage(bytes: Buffer, name: string, type: string, requestBase: string): Promise<string> {
    if (this.bucket) {
      const key = `uploads/${name}`;
      await this.bucket.client.send(
        new PutObjectCommand({
          Bucket: this.bucket.bucket,
          Key: key,
          Body: bytes,
          ContentType: type,
          // Names are random and never reused, so a file never changes.
          CacheControl: 'public, max-age=31536000, immutable',
        }),
      );
      return `${this.bucket.publicUrl}/${key}`;
    }
    mkdirSync(UPLOAD_DIR, { recursive: true });
    writeFileSync(join(UPLOAD_DIR, name), bytes);
    return `${requestBase}/uploads/${name}`;
  }

  /**
   * Reads back an image this app stored, by its address: from the bucket, or
   * from the local folder (development, and files from before the bucket).
   * Any other address gives null: nothing here fetches what a user typed.
   */
  async readImage(url: unknown, maxBytes: number): Promise<StoredFile | null> {
    if (typeof url !== 'string' || !url) return null;
    try {
      if (this.bucket && url.startsWith(`${this.bucket.publicUrl}/`)) {
        const key = url.slice(this.bucket.publicUrl.length + 1);
        if (!/^uploads\/[A-Za-z0-9-]+\.[a-z]+$/.test(key)) return null;
        const res = await this.bucket.client.send(new GetObjectCommand({ Bucket: this.bucket.bucket, Key: key }));
        if (!res.Body || (res.ContentLength ?? 0) > maxBytes) return null;
        const bytes = Buffer.from(await res.Body.transformToByteArray());
        const kind = sniffImage(bytes);
        return kind && bytes.length <= maxBytes ? { bytes, type: kind.type } : null;
      }
      const path = new URL(url, 'http://local').pathname;
      const m = path.match(/^\/uploads\/([A-Za-z0-9-]+\.[a-z]+)$/i);
      if (!m) return null;
      const file = join(UPLOAD_DIR, basename(m[1]!));
      if (statSync(file).size > maxBytes) return null;
      const bytes = readFileSync(file);
      const kind = sniffImage(bytes);
      return kind ? { bytes, type: kind.type } : null;
    } catch {
      return null;
    }
  }

  /**
   * Removes a stored file by its name (see uploadNamesIn): from the bucket, and
   * from the local folder, where files from before the bucket may still be.
   * A file already gone counts as removed.
   */
  async deleteUpload(name: string): Promise<void> {
    if (!/^[A-Za-z0-9-]+\.[a-z]+$/i.test(name)) return;
    if (this.bucket) {
      await this.bucket.client.send(new DeleteObjectCommand({ Bucket: this.bucket.bucket, Key: `uploads/${name}` }));
    }
    rmSync(join(UPLOAD_DIR, name), { force: true });
  }
}
