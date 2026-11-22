import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand
} from '@aws-sdk/client-s3';
import { LocalStorageProvider, R2StorageProvider, StorageNotFoundError, storageChecksum } from '../../devMode/modules/post-codebase/services/storage.js';

test('local provider stores, reads, checks existence, and removes opaque keys', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'debugdsa-storage-'));
  const provider = new LocalStorageProvider({ root });
  try {
    const key = await provider.put(Buffer.from('private source'));
    expect(key).toMatch(/^[0-9a-f-]{36}$/i);
    expect(await provider.get(key)).toEqual(Buffer.from('private source'));
    expect(await provider.exists(key)).toBe(true);
    await provider.remove(key);
    expect(await provider.exists(key)).toBe(false);
    await expect(provider.get(key)).rejects.toBeInstanceOf(StorageNotFoundError);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('R2 provider writes private objects and verifies SHA-256 metadata', async () => {
  const calls = [];
  const client = {
    async send(command) {
      calls.push(command);
      if (command instanceof GetObjectCommand) {
        return {
          Metadata: { sha256: storageChecksum(Buffer.from('r2 source')) },
          Body: { transformToByteArray: async () => Buffer.from('r2 source') }
        };
      }
      return {};
    }
  };
  const provider = new R2StorageProvider({ client, bucket: 'private-test-bucket' });
  const key = await provider.put(Buffer.from('r2 source'), { contentType: 'text/plain' });
  expect(key).toMatch(/^[0-9a-f-]{36}$/i);
  expect(calls[0]).toBeInstanceOf(PutObjectCommand);
  expect(calls[0].input.Bucket).toBe('private-test-bucket');
  expect(calls[0].input.ACL).toBeUndefined();
  expect(calls[0].input.Metadata.sha256).toBe(storageChecksum(Buffer.from('r2 source')));
  expect(await provider.get(key)).toEqual(Buffer.from('r2 source'));
  await provider.exists(key);
  await provider.remove(key);
  expect(calls.some(command => command instanceof HeadObjectCommand)).toBe(true);
  expect(calls.some(command => command instanceof DeleteObjectCommand)).toBe(true);
});

test('R2 provider rejects corrupted object content', async () => {
  const provider = new R2StorageProvider({
    client: {
      async send() {
        return {
          Metadata: { sha256: storageChecksum(Buffer.from('expected')) },
          Body: { transformToByteArray: async () => Buffer.from('corrupted') }
        };
      }
    },
    bucket: 'private-test-bucket'
  });
  await expect(provider.get('00000000-0000-4000-8000-000000000000')).rejects.toMatchObject({ code: 'STORAGE_CHECKSUM_MISMATCH' });
});

test('R2 provider maps missing objects to a typed not-found error', async () => {
  const provider = new R2StorageProvider({
    client: { async send() { throw Object.assign(new Error('missing'), { name: 'NoSuchKey' }); } },
    bucket: 'private-test-bucket'
  });
  await expect(provider.get('00000000-0000-4000-8000-000000000000')).rejects.toBeInstanceOf(StorageNotFoundError);
});
