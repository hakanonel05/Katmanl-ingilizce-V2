/**
 * Gölgeleme ses kayıtları için IndexedDB deposu.
 *
 * Neden localStorage değil: localStorage sadece metin saklar ve tipik sınırı
 * ~5 MB. Ses kayıtlarını base64'e çevirmek boyutu ~%33 şişirir; birkaç cümlelik
 * kayıt bile kotayı doldurur. IndexedDB Blob'ları doğrudan saklar ve çok daha
 * geniştir.
 */

const DB_NAME = 'layered_learning_recordings';
const DB_VERSION = 1;
const STORE = 'recordings';

export interface StoredRecording {
  key: string;          // `${lessonId}:${sentenceId}`
  lessonId: string;
  sentenceId: number;
  sentenceText: string;
  blob: Blob;
  createdAt: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'key' });
        store.createIndex('lessonId', 'lessonId', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function recordingKey(lessonId: string, sentenceId: number): string {
  return `${lessonId}:${sentenceId}`;
}

export async function saveRecording(rec: StoredRecording): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(rec);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

export async function getRecording(
  lessonId: string,
  sentenceId: number
): Promise<StoredRecording | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(recordingKey(lessonId, sentenceId));
    req.onsuccess = () => {
      db.close();
      resolve(req.result || null);
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

export async function listRecordings(lessonId: string): Promise<StoredRecording[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const index = tx.objectStore(STORE).index('lessonId');
    const req = index.getAll(lessonId);
    req.onsuccess = () => {
      db.close();
      const items: StoredRecording[] = req.result || [];
      items.sort((a, b) => a.sentenceId - b.sentenceId);
      resolve(items);
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

/** Tum derslerdeki kayitlar (senkronizasyon icin). */
export async function listAllRecordings(): Promise<StoredRecording[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => {
      db.close();
      resolve(req.result || []);
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

/** Senkronizasyon sirasinda kayit yazar (saveRecording ile ayni, ayri isim netlik icin). */
export async function saveRecordingSilently(rec: StoredRecording): Promise<void> {
  return saveRecording(rec);
}

export async function deleteRecording(lessonId: string, sentenceId: number): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(recordingKey(lessonId, sentenceId));
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

export async function deleteAllRecordings(lessonId: string): Promise<void> {
  const items = await listRecordings(lessonId);
  for (const item of items) {
    await deleteRecording(lessonId, item.sentenceId);
  }
}
