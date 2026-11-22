import { LocalStorageProvider } from './storage.js';

const provider = new LocalStorageProvider();
export const localFileStorage = {
  async put(buffer, metadata) { return provider.put(buffer, metadata); },
  get(key) { return provider.get(key); },
  remove(key) { return provider.remove(typeof key === 'string' ? key : key?.storageKey); },
  exists(key) { return provider.exists(key); }
};
