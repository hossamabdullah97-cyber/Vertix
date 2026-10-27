import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { PrismaService } from '../prisma/prisma.service';

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

/** A stored file's name, as uploads are named ("<random>.<ext>"). */
const NAME = /^[A-Za-z0-9-]+\.[a-z]+$/i;

/**
 * Where uploaded images are kept:
 * - a bucket (S3, Cloudflare R2 or anything that speaks S3), when one is set up;
 * - else in production, the database (`stored_uploads`), so a host whose disk
 *   is replaced on each release (Hostinger's web apps) does not lose them;
 * - else (development) the local `uploads` folder.
 * UPLOADS_STORE=db or =disk picks one of the last two explicitly.
 */
@Injectable()
export class StorageService {
  private readonly log = new Logger(StorageService.name);
  private readonly bucket: BucketConfig | null;
  private readonly inDb: boolean;
  /** This API's public address, for files it serves itself. */
  private readonly publicBase: string | undefined;

  constructor(
    config: ConfigService,
    @Optional() private readonly prisma?: PrismaService,
  ) {
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
    }
    const store = get('UPLOADS_STORE');
    this.inDb = !this.bucket && !!prisma && (store === 'db' || (store !== 'disk' && config.get<string>('NODE_ENV') === 'production'));
    this.publicBase = get('API_PUBLIC_URL')?.replace(/\/$/, '');
    if (!this.bucket && !this.inDb && config.get<string>('NODE_ENV') === 'production') {
      this.log.warn('Uploads go to the local disk and are lost when the container is replaced.');
    }
  }

  /** True when files survive a release: in a bucket or in the database. */
  get durable(): boolean {
    return this.bucket !== null || this.inDb;
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
    if (this.inDb && this.prisma) {
      await this.prisma.client.storedUpload.create({ data: { name, type, bytes: new Uint8Array(bytes), size: bytes.length } });
      return `${this.publicBase ?? requestBase}/uploads/${name}`;
    }
    mkdirSync(UPLOAD_DIR, { recursive: true });
    writeFileSync(join(UPLOAD_DIR, name), bytes);
    return `${requestBase}/uploads/${name}`;
  }

  /** An image kept in the database, by its name; null when there is none (or files are not kept there). */
  async fromDb(name: string): Promise<StoredFile | null> {
    if (!this.prisma || !NAME.test(name)) return null;
    const row = await this.prisma.client.storedUpload.findUnique({ where: { name }, select: { bytes: true, type: true } });
    return row ? { bytes: Buffer.from(row.bytes), type: row.type } : null;
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
      if (this.inDb) {
        const kept = await this.fromDb(m[1]!);
        if (kept) return kept.bytes.length <= maxBytes ? kept : null;
      }
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
    if (!NAME.test(name)) return;
    if (this.prisma) await this.prisma.client.storedUpload.deleteMany({ where: { name } });
    if (this.bucket) {
      await this.bucket.client.send(new DeleteObjectCommand({ Bucket: this.bucket.bucket, Key: `uploads/${name}` }));
    }
    rmSync(join(UPLOAD_DIR, name), { force: true });
  }
}
