/**
 * Kelime kartı ayarları ve günlük yeni kart sayacı.
 * Ayarlar küçük olduğu için localStorage yeterli (kart verisi IndexedDB'de).
 */

const SETTINGS_KEY = 'layered_learning_vocab_settings_v1';
const DAILY_KEY = 'layered_learning_vocab_daily_v1';

export interface VocabSettings {
  /** Bir oturumda çalışılacak süre (dakika). */
  sessionMinutes: number;
  /** Günde kaç YENİ kart tanıtılsın (Anki'deki "new cards/day"). 0 = sınırsız. */
  newCardsPerDay: number;
  /** Günde kaç tekrar kartı gösterilsin. 0 = sınırsız. */
  reviewsPerDay: number;
  /** Kelime ayıklarken kaç ifade istensin. */
  extractCount: number;
  /** FSRS hedef tutma oranı. */
  desiredRetention: number;
}

export const DEFAULT_VOCAB_SETTINGS: VocabSettings = {
  sessionMinutes: 15,
  newCardsPerDay: 20,
  reviewsPerDay: 0,
  extractCount: 20,
  desiredRetention: 0.9,
};

export function loadVocabSettings(): VocabSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...DEFAULT_VOCAB_SETTINGS, ...JSON.parse(raw) };
  } catch (e) {
    console.error('Kelime ayarları okunamadı:', e);
  }
  return { ...DEFAULT_VOCAB_SETTINGS };
}

export function saveVocabSettings(settings: VocabSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (e) {
    console.error('Kelime ayarları kaydedilemedi:', e);
  }
}

/* ---------------- Günlük sayaç ---------------- */

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface DailyCounter {
  date: string;
  newIntroduced: number;
  reviewsDone: number;
}

export function getDailyCounter(): DailyCounter {
  try {
    const raw = localStorage.getItem(DAILY_KEY);
    if (raw) {
      const parsed: DailyCounter = JSON.parse(raw);
      // Gün değiştiyse sayaç sıfırlanır
      if (parsed.date === todayKey()) return parsed;
    }
  } catch (e) {
    console.error('Günlük sayaç okunamadı:', e);
  }
  return { date: todayKey(), newIntroduced: 0, reviewsDone: 0 };
}

export function bumpDailyCounter(kind: 'new' | 'review'): DailyCounter {
  const current = getDailyCounter();
  const next: DailyCounter = {
    ...current,
    newIntroduced: current.newIntroduced + (kind === 'new' ? 1 : 0),
    reviewsDone: current.reviewsDone + (kind === 'review' ? 1 : 0),
  };
  try {
    localStorage.setItem(DAILY_KEY, JSON.stringify(next));
  } catch (e) {
    console.error('Günlük sayaç kaydedilemedi:', e);
  }
  return next;
}

export function resetDailyCounter(): void {
  try {
    localStorage.setItem(
      DAILY_KEY,
      JSON.stringify({ date: todayKey(), newIntroduced: 0, reviewsDone: 0 })
    );
  } catch (e) {
    console.error('Günlük sayaç sıfırlanamadı:', e);
  }
}
