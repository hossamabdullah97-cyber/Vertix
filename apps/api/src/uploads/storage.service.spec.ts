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

describe('StorageService in the database (production without a bucket)', () => {
  function db() {
    const rows = new Map<string, { bytes: Uint8Array; type: string }>();
    const storedUpload = {
      create: jest.fn(async ({ data }) => rows.set(data.name, { bytes: data.bytes, type: data.type })),
      findUnique: jest.fn(async ({ where }) => rows.get(where.name) ?? null),
      deleteMany: jest.fn(async ({ where }) => ({ count: rows.delete(where.name) ? 1 : 0 })),
    };
    return { prisma: { client: { storedUpload } } as never, storedUpload, rows };
  }
  const prod = { NODE_ENV: 'production', API_PUBLIC_URL: 'https://api.example.com/' };
  // ConfigService reads the process's own NODE_ENV first, so production is set there.
  const env = process.env.NODE_ENV;
  beforeEach(() => (process.env.NODE_ENV = 'production'));
  afterEach(() => (process.env.NODE_ENV = env));

  it('keeps an upload in the database and gives it the API’s public address', async () => {
    const { prisma, storedUpload } = db();
    const s = new StorageService(new ConfigService(prod), prisma);
    expect(s.durable).toBe(true);
    const url = await s.saveImage(PNG, 'abc-1.png', 'image/png', 'http://internal:4000');
    expect(url).toBe('https://api.example.com/uploads/abc-1.png');
    expect(storedUpload.create.mock.calls[0][0].data).toMatchObject({ name: 'abc-1.png', type: 'image/png', size: PNG.length });
  });

  it('reads it back by its address, and removes it', async () => {
    const { prisma } = db();
    const s = new StorageService(new ConfigService(prod), prisma);
    await s.saveImage(PNG, 'abc-2.png', 'image/png', 'http://internal:4000');
    expect((await s.readImage('https://api.example.com/uploads/abc-2.png', 1024))?.type).toBe('image/png');
    expect(await s.readImage('https://api.example.com/uploads/abc-2.png', 4)).toBeNull();
    await s.deleteUpload('abc-2.png');
    expect(await s.fromDb('abc-2.png')).toBeNull();
  });

  it('never looks up a name that is not an upload’s', async () => {
    const { prisma, storedUpload } = db();
    const s = new StorageService(new ConfigService(prod), prisma);
    expect(await s.fromDb('../etc/passwd')).toBeNull();
    expect(storedUpload.findUnique).not.toHaveBeenCalled();
  });

  it('stays on the disk in development, or when told to', () => {
    process.env.NODE_ENV = 'development';
    expect(new StorageService(new ConfigService({}), db().prisma).durable).toBe(false);
    process.env.NODE_ENV = 'production';
    expect(new StorageService(new ConfigService({ ...prod, UPLOADS_STORE: 'disk' }), db().prisma).durable).toBe(false);
    expect(new StorageService(new ConfigService({ UPLOADS_STORE: 'db' }), db().prisma).durable).toBe(true);
  });
});
