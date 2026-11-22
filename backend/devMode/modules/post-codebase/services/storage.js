import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client
} from '@aws-sdk/client-s3';
import { NodeHttpHandler } from '@smithy/node-http-handler';

const backendRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const defaultRoot = path.join(backendRoot, 'storage-data', 'codebases');
const configuredRoot = process.env.CODEBASE_STORAGE_DIR;
const localRoot = path.resolve(configuredRoot
  ? (path.isAbsolute(configuredRoot) ? configuredRoot : path.join(backendRoot, configuredRoot))
  : defaultRoot);
const validKey = /^[0-9a-f-]{36}$/i;
const maxObjectBytes = 8 * 1024 * 1024;

export class StorageNotFoundError extends Error {
  constructor(key) {
    super('Stored file is unavailable.');
    this.name = 'StorageNotFoundError';
    this.code = 'STORAGE_NOT_FOUND';
    this.key = key;
  }
}

export class StorageChecksumError extends Error {
  constructor() {
    super('Stored file integrity verification failed.');
    this.name = 'StorageChecksumError';
    this.code = 'STORAGE_CHECKSUM_MISMATCH';
  }
}

export class StorageSizeError extends Error {
  constructor() {
    super('Stored file exceeds the maximum size.');
    this.name = 'StorageSizeError';
    this.code = 'STORAGE_TOO_LARGE';
  }
}

const toBuffer = value => Buffer.isBuffer(value) ? value : Buffer.from(value);
export const storageChecksum = buffer => createHash('sha256').update(buffer).digest('hex');
const checkSize = buffer => {
  if (buffer.length > maxObjectBytes) throw new StorageSizeError();
};
const descriptor = (provider, key, buffer, metadata = {}) => ({
  storageProvider: provider,
  storageKey: key,
  size: buffer.length,
  checksum: storageChecksum(buffer),
  contentType: metadata.contentType || 'application/octet-stream',
  metadataVersion: 1
});

export class LocalStorageProvider {
  constructor({ root = localRoot } = {}) {
    this.root = root;
    this.name = 'local';
  }

  async put(buffer, metadata = {}) {
    const content = toBuffer(buffer);
    checkSize(content);
    const key = randomUUID();
    await mkdir(this.root, { recursive: true });
    await writeFile(path.join(this.root, `${key}.txt`), content, { flag: 'wx', mode: 0o600 });
    return key;
  }

  async get(key, metadata = {}) {
    if (typeof key !== 'string' || !validKey.test(key)) throw new StorageNotFoundError(key);
    let content;
    try {
      content = await readFile(path.join(this.root, `${key}.txt`));
    } catch (error) {
      if (error.code === 'ENOENT') throw new StorageNotFoundError(key);
      throw error;
    }
    checkSize(content);
    verifyStorageMetadata(content, metadata);
    return content;
  }

  async remove(key) {
    if (typeof key !== 'string' || !validKey.test(key)) return;
    await rm(path.join(this.root, `${key}.txt`), { force: true });
  }

  async exists(key) {
    try {
      await this.get(key);
      return true;
    } catch (error) {
      if (error.code === 'STORAGE_NOT_FOUND') return false;
      throw error;
    }
  }

  async list() {
    let names = [];
    try { names = await readdir(this.root); } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    return names.filter(name => validKey.test(name.replace(/\.txt$/, ''))).map(name => name.replace(/\.txt$/, ''));
  }
}

export class R2StorageProvider {
  constructor({ client, bucket } = {}) {
    this.name = 'r2';
    this.bucket = bucket || process.env.R2_BUCKET_NAME;
    if (!this.bucket) throw new Error('R2_BUCKET_NAME is required when STORAGE_PROVIDER=r2.');
    if (!client && (!process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY)) {
      throw new Error('R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY are required when STORAGE_PROVIDER=r2.');
    }
    this.client = client || new S3Client({
      region: 'auto',
      maxAttempts: 3,
      requestHandler: new NodeHttpHandler({ connectionTimeout: 5000, requestTimeout: 15000 }),
      endpoint: this.endpoint(),
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
      }
    });
  }

  endpoint() {
    const accountId = process.env.R2_ACCOUNT_ID;
    if (!accountId) throw new Error('R2_ACCOUNT_ID is required when STORAGE_PROVIDER=r2.');
    return `https://${accountId}.r2.cloudflarestorage.com`;
  }

  async put(buffer, metadata = {}) {
    const content = toBuffer(buffer);
    checkSize(content);
    const key = randomUUID();
    const file = descriptor(this.name, key, content, metadata);
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: content,
      ContentLength: content.length,
      ContentType: file.contentType,
      Metadata: { sha256: file.checksum, size: String(file.size) }
    }));
    return key;
  }

  async get(key, metadata = {}) {
    if (typeof key !== 'string' || !validKey.test(key)) throw new StorageNotFoundError(key);
    let response;
    try {
      response = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch (error) {
      if (error.name === 'NoSuchKey' || error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) throw new StorageNotFoundError(key);
      throw error;
    }
    if (response.ContentLength > maxObjectBytes) throw new StorageSizeError();
    const content = Buffer.from(await response.Body.transformToByteArray());
    checkSize(content);
    const stored = { checksum: response.Metadata?.sha256, size: response.Metadata?.size ?? response.ContentLength ?? content.length };
    if (!stored.checksum || String(stored.size) !== String(content.length) || storageChecksum(content) !== stored.checksum) throw new StorageChecksumError();
    verifyStorageMetadata(content, metadata);
    return content;
  }

  async remove(key) {
    if (typeof key !== 'string' || !validKey.test(key)) return;
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async exists(key) {
    if (typeof key !== 'string' || !validKey.test(key)) return false;
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch (error) {
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) return false;
      throw error;
    }
  }

  async list() {
    const response = await this.client.send(new ListObjectsV2Command({ Bucket: this.bucket }));
    return (response.Contents || []).map(item => item.Key).filter(key => validKey.test(key));
  }
}

function verifyStorageMetadata(content, metadata = {}) {
  if (metadata.size !== undefined && Number(metadata.size) !== content.length) throw new StorageSizeError();
  if (metadata.checksum && metadata.checksum !== storageChecksum(content)) throw new StorageChecksumError();
}

const providerName = (process.env.STORAGE_PROVIDER || 'local').toLowerCase();
if (!['local', 'r2'].includes(providerName)) throw new Error('STORAGE_PROVIDER must be local or r2.');
if (providerName === 'r2' && process.env.NODE_ENV === 'test') throw new Error('R2 storage is not available in tests; use STORAGE_PROVIDER=local.');

const providers = {
  local: new LocalStorageProvider(),
  r2: providerName === 'r2' ? new R2StorageProvider() : null
};

export const storageProvider = providers[providerName];
export const storageProviderName = providerName;

export function providerForReference(reference = {}) {
  return providers[reference.storageProvider || 'local'];
}

export async function putStoredFile(buffer, metadata = {}) {
  const content = toBuffer(buffer);
  const key = await storageProvider.put(content, metadata);
  return descriptor(storageProvider.name, key, content, metadata);
}

export async function getStoredFile(reference) {
  const provider = providerForReference(reference);
  if (!provider) throw new Error(`Storage provider is unavailable: ${reference.storageProvider}`);
  return provider.get(reference.storageKey, reference);
}

export async function removeStoredFile(reference) {
  const provider = providerForReference(reference);
  if (provider && reference?.storageKey) await provider.remove(reference.storageKey);
}

export async function storageExists(reference) {
  const provider = providerForReference(reference);
  return Boolean(provider && reference?.storageKey && await provider.exists(reference.storageKey));
}

export { maxObjectBytes };
