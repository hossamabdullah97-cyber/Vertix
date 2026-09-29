import { ConfigService } from '@nestjs/config';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { StorageService, UPLOAD_DIR, sniffImage } from './storage.service';

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(16)]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(16)]);

const storage = (env: Record<string, string> = {}) => new StorageService(new ConfigService(env));

describe('sniffImage', () => {
  it('knows an image by its first bytes, whatever it claims to be', () => {
    expect(sniffImage(PNG)).toEqual({ type: 'image/png', ext: '.png' });
    expect(sniffImage(JPEG)).toEqual({ type: 'image/jpeg', ext: '.jpg' });
    expect(sniffImage(Buffer.from('<html><script>alert(1)</script></html>'))).toBeNull();
    expect(sniffImage(Buffer.from([0xff, 0xd8]))).toBeNull();
  });
});

describe('StorageService on the local disk', () => {
  const name = 'spec-0001.png';
  beforeAll(() => {
    mkdirSync(UPLOAD_DIR, { recursive: true });
    writeFileSync(join(UPLOAD_DIR, name), PNG);
  });
  afterAll(() => rmSync(join(UPLOAD_DIR, name), { force: true }));

  it('is not durable without a bucket', () => {
    expect(storage().durable).toBe(false);
  });

  it('reads back what it stored, by its address', async () => {
    const file = await storage().readImage(`http://api.test/uploads/${name}`, 1024);
    expect(file?.type).toBe('image/png');
  });

  it('never reads anything else', async () => {
    const s = storage();
    expect(await s.readImage('http://api.test/uploads/../../package.json', 1e6)).toBeNull();
    expect(await s.readImage('https://evil.test/secrets', 1e6)).toBeNull();
    expect(await s.readImage(`http://api.test/uploads/${name}`, 4)).toBeNull();
    expect(await s.readImage(42, 1e6)).toBeNull();
  });
});

/**
 * Against a real S3-compatible server when one is given (for example
 * `moto_server -p 5055`, then S3_TEST_ENDPOINT=http://localhost:5055).
 */
const endpoint = process.env.S3_TEST_ENDPOINT;
(endpoint ? describe : describe.skip)('StorageService with a bucket', () => {
  const env = {
    S3_ENDPOINT: endpoint!,
    S3_REGION: 'us-east-1',
    S3_ACCESS_KEY: 'test',
    S3_SECRET_KEY: 'test',
    S3_BUCKET: 'vertex-test',
    S3_PUBLIC_URL: 'https://media.test',
  };

  beforeAll(async () => {
    const { S3Client, CreateBucketCommand } = await import('@aws-sdk/client-s3');
    const client = new S3Client({ region: 'us-east-1', endpoint, forcePathStyle: true, credentials: { accessKeyId: 'test', secretAccessKey: 'test' } });
    await client.send(new CreateBucketCommand({ Bucket: 'vertex-test' })).catch(() => {});
  });

  it('keeps a file in the bucket and reads it back by its public address', async () => {
    const s = storage(env);
    expect(s.durable).toBe(true);
    const url = await s.saveImage(JPEG, 'abc-123.jpg', 'image/jpeg', 'http://api.test');
    expect(url).toBe('https://media.test/uploads/abc-123.jpg');
    const back = await s.readImage(url, 1024);
    expect(back?.type).toBe('image/jpeg');
    expect(back?.bytes.equals(JPEG)).toBe(true);
  });

  it('reads nothing outside its uploads', async () => {
    const s = storage(env);
    expect(await s.readImage('https://media.test/private/key.txt', 1024)).toBeNull();
    expect(await s.readImage('https://media.test/uploads/missing.jpg', 1024)).toBeNull();
  });
});
