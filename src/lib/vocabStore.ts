import { FsrsCardFields, CardState, createNewCard } from './fsrs';

/**
 * Kelime kartları için IndexedDB deposu.
 * Kart sayısı yüzlere/binlere çıkabildiği ve her tekrarda güncellendiği için
 * localStorage yerine IndexedDB kullanılıyor.
 */

const DB_NAME = 'layered_learning_vocab';
const DB_VERSION = 1;
const STORE = 'cards';

export type CardLevel = 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
export type CardKind = 'word' | 'phrasal_verb' | 'collocation' | 'idiom' | 'expression';

export interface VocabCard extends FsrsCardFields {
  id: string;
  lessonId: string;
  lessonTitle: string;
  /** İngilizce ifade (kartın ön yüzü). */
  front: string;
  /** Türkçe karşılık (kartın arka yüzü). */
  back: string;
  ipa?: string;
  kind: CardKind;
  level: CardLevel;
  /** İfadenin geçtiği örnek cümle. */
  exampleEn?: string;
  exampleTr?: string;
  /** Transkriptte geçtiği asıl cümle. */
  contextEn?: string;
  note?: string;
  suspended?: boolean;
  createdAt: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('lessonId', 'lessonId', { unique: false });
        store.createIndex('due', 'due', { unique: false });
        store.createIndex('front', 'front', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = fn(t.objectStore(STORE));
        req.onsuccess = () => {
          resolve(req.result);
        };
        req.onerror = () => reject(req.error);
        t.oncomplete = () => db.close();
        t.onerror = () => {
          db.close();
          reject(t.error);
        };
      })
  );
}

/**
 * Kart deposu her değiştiğinde tetiklenen olay.
 * Kartlar birden çok ekrandan eklenebildiği için (transkriptte seçim,
 * elle ekleme, ayıklama) listeyi gösteren bileşenin haberdar olması gerekiyor.
 */
export const VOCAB_CHANGED_EVENT = 'vocab-cards-changed';

function notifyChanged() {
  try {
    window.dispatchEvent(new CustomEvent(VOCAB_CHANGED_EVENT));
  } catch {
    /* tarayıcı dışı ortamlarda yoksay */
  }
}

export function makeCardId(lessonId: string, front: string): string {
  return `${lessonId}::${front.toLowerCase().trim()}`;
}

export function buildCard(input: {
  lessonId: string;
  lessonTitle: string;
  front: string;
  back: string;
  ipa?: string;
  kind?: CardKind;
  level?: CardLevel;
  exampleEn?: string;
  exampleTr?: string;
  contextEn?: string;
}): VocabCard {
  return {
    id: makeCardId(input.lessonId, input.front),
    lessonId: input.lessonId,
    lessonTitle: input.lessonTitle,
    front: input.front.trim(),
    back: input.back.trim(),
    ipa: input.ipa,
    kind: input.kind || 'word',
    level: input.level || 'B2',
    exampleEn: input.exampleEn,
    exampleTr: input.exampleTr,
    contextEn: input.contextEn,
    createdAt: Date.now(),
    ...createNewCard(Date.now()),
  };
}

export async function getAllCards(): Promise<VocabCard[]> {
  return tx<VocabCard[]>('readonly', (s) => s.getAll());
}

export async function getCardsByLesson(lessonId: string): Promise<VocabCard[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, 'readonly');
    const req = t.objectStore(STORE).index('lessonId').getAll(lessonId);
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

export async function putCard(card: VocabCard): Promise<void> {
  await tx('readwrite', (s) => s.put({ ...card, updatedAt: Date.now() } as any));
  notifyChanged();
}

/**
 * Senkronizasyon sirasinda kullanilir: her kayitta olay firlatmaz.
 * Yuzlerce kart cekilirken arayuzun surekli yeniden cizilmesini onler.
 */
export async function putCardSilently(card: VocabCard): Promise<void> {
  await tx('readwrite', (s) => s.put(card));
}

/**
 * Kartları toplu ekler. AYNI kart varsa ÜZERİNE YAZMAZ — tekrar geçmişi
 * korunur. Aynı dersten kelimeler yeniden çıkarıldığında ilerleme kaybolmaz.
 */
export async function addCardsIfMissing(cards: VocabCard[]): Promise<number> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, 'readwrite');
    const store = t.objectStore(STORE);
    let added = 0;
    let pending = cards.length;

    if (pending === 0) {
      db.close();
      return resolve(0);
    }

    cards.forEach((card) => {
      const getReq = store.get(card.id);
      getReq.onsuccess = () => {
        if (!getReq.result) {
          store.put(card);
          added++;
        }
        if (--pending === 0) {
          /* transaction oncomplete halleder */
        }
      };
      getReq.onerror = () => {
        if (--pending === 0) {
          /* yoksay */
        }
      };
    });

    t.oncomplete = () => {
      db.close();
      notifyChanged();
      resolve(added);
    };
    t.onerror = () => {
      db.close();
      reject(t.error);
    };
  });
}

export async function deleteCard(id: string): Promise<void> {
  await tx('readwrite', (s) => s.delete(id) as unknown as IDBRequest<void>);
  notifyChanged();
}

export async function deleteCardsByLesson(lessonId: string): Promise<void> {
  const cards = await getCardsByLesson(lessonId);
  for (const c of cards) await deleteCard(c.id);
}

export interface DueSelectionLimits {
  /** Bugün kaç YENİ kart daha tanıtılabilir. undefined veya 0 = sınırsız. */
  newRemaining?: number;
  /** Bugün kaç tekrar kartı daha gösterilebilir. undefined veya 0 = sınırsız. */
  reviewRemaining?: number;
}

/** Kart daha önce hiç çalışılmamışsa "yeni" sayılır. */
export function isNewCard(c: VocabCard): boolean {
  return c.reps === 0;
}

/**
 * Bugün çalışılabilecek kartlar: vadesi gelmiş, askıya alınmamış ve
 * günlük sınırların içinde kalanlar (Anki'deki gibi).
 */
export function selectDueCards(
  cards: VocabCard[],
  now = Date.now(),
  limits: DueSelectionLimits = {}
): VocabCard[] {
  const due = cards
    .filter((c) => !c.suspended && c.due <= now)
    .sort((a, b) => {
      // Önce öğrenme/yeniden öğrenme kartları, sonra vadesi en eski olan
      const rank = (c: VocabCard) => (c.state === CardState.Review ? 1 : 0);
      const r = rank(a) - rank(b);
      return r !== 0 ? r : a.due - b.due;
    });

  const newLimit = limits.newRemaining;
  const reviewLimit = limits.reviewRemaining;

  if (!newLimit && !reviewLimit) return due;

  let newLeft = newLimit && newLimit > 0 ? newLimit : Infinity;
  let reviewLeft = reviewLimit && reviewLimit > 0 ? reviewLimit : Infinity;

  const result: VocabCard[] = [];
  for (const c of due) {
    if (isNewCard(c)) {
      if (newLeft > 0) {
        result.push(c);
        newLeft--;
      }
    } else {
      if (reviewLeft > 0) {
        result.push(c);
        reviewLeft--;
      }
    }
  }
  return result;
}

export interface DeckStats {
  total: number;
  due: number;
  learning: number;
  review: number;
  relearning: number;
  suspended: number;
}

export function computeStats(cards: VocabCard[], now = Date.now()): DeckStats {
  return {
    total: cards.length,
    due: cards.filter((c) => !c.suspended && c.due <= now).length,
    learning: cards.filter((c) => c.state === CardState.Learning).length,
    review: cards.filter((c) => c.state === CardState.Review).length,
    relearning: cards.filter((c) => c.state === CardState.Relearning).length,
    suspended: cards.filter((c) => c.suspended).length,
  };
}
