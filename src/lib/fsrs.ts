/**
 * FSRS-6 (Free Spaced Repetition Scheduler)
 *
 * open-spaced-repetition/py-fsrs referans uygulamasından birebir çevrildi.
 * Ezberden yazılmadı: parametreler, formüller ve durum makinesi kaynak koddan
 * alındı, sonrasında birim testleriyle doğrulandı.
 *
 * Anki ile aynı algoritma. Hedef tutma oranı (desired retention) 0.90.
 */

export const FSRS_DEFAULT_DECAY = 0.1542;

/** FSRS-6 varsayılan parametreleri (21 adet, sonuncusu decay). */
export const DEFAULT_PARAMETERS: number[] = [
  0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666,
  0.796, 1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658,
  FSRS_DEFAULT_DECAY,
];

export const STABILITY_MIN = 0.001;
export const MIN_DIFFICULTY = 1.0;
export const MAX_DIFFICULTY = 10.0;

/** Anki derecelendirmeleri. Bu uygulamada yalnızca Again ve Good kullanılıyor. */
export enum Rating {
  Again = 1,
  Hard = 2,
  Good = 3,
  Easy = 4,
}

export enum CardState {
  Learning = 'learning',
  Review = 'review',
  Relearning = 'relearning',
}

export interface FsrsCardFields {
  state: CardState;
  /** Öğrenme/yeniden öğrenme adımı; Review durumunda null. */
  step: number | null;
  stability: number | null;
  difficulty: number | null;
  /** Kartın gösterileceği zaman (epoch ms). */
  due: number;
  /** Son tekrar zamanı (epoch ms). */
  lastReview: number | null;
  reps: number;
  lapses: number;
}

export interface SchedulerOptions {
  parameters?: number[];
  desiredRetention?: number;
  /** Dakika cinsinden öğrenme adımları. */
  learningSteps?: number[];
  relearningSteps?: number[];
  maximumInterval?: number;
  enableFuzzing?: boolean;
}

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

const FUZZ_RANGES = [
  { start: 2.5, end: 7.0, factor: 0.15 },
  { start: 7.0, end: 20.0, factor: 0.1 },
  { start: 20.0, end: Infinity, factor: 0.05 },
];

export function createNewCard(now = Date.now()): FsrsCardFields {
  return {
    state: CardState.Learning,
    step: 0,
    stability: null,
    difficulty: null,
    due: now,
    lastReview: null,
    reps: 0,
    lapses: 0,
  };
}

export class FsrsScheduler {
  readonly parameters: number[];
  readonly desiredRetention: number;
  readonly learningSteps: number[];
  readonly relearningSteps: number[];
  readonly maximumInterval: number;
  readonly enableFuzzing: boolean;

  private readonly DECAY: number;
  private readonly FACTOR: number;

  constructor(opts: SchedulerOptions = {}) {
    this.parameters = opts.parameters ?? DEFAULT_PARAMETERS;
    this.desiredRetention = opts.desiredRetention ?? 0.9;
    this.learningSteps = opts.learningSteps ?? [1, 10];
    this.relearningSteps = opts.relearningSteps ?? [10];
    this.maximumInterval = opts.maximumInterval ?? 36500;
    this.enableFuzzing = opts.enableFuzzing ?? true;

    this.DECAY = -this.parameters[20];
    this.FACTOR = Math.pow(0.9, 1 / this.DECAY) - 1;
  }

  private clampDifficulty(d: number): number {
    return Math.min(Math.max(d, MIN_DIFFICULTY), MAX_DIFFICULTY);
  }

  private clampStability(s: number): number {
    return Math.max(s, STABILITY_MIN);
  }

  /** Kartın şu andaki hatırlanabilirliği (0-1). */
  getRetrievability(card: FsrsCardFields, now = Date.now()): number {
    if (card.stability === null || card.lastReview === null) return 0;
    const elapsedDays = Math.max(0, (now - card.lastReview) / DAY);
    return Math.pow(1 + (this.FACTOR * elapsedDays) / card.stability, this.DECAY);
  }

  private initialStability(rating: Rating): number {
    return this.clampStability(this.parameters[rating - 1]);
  }

  private initialDifficulty(rating: Rating, clamp: boolean): number {
    const d = this.parameters[4] - Math.exp(this.parameters[5] * (rating - 1)) + 1;
    return clamp ? this.clampDifficulty(d) : d;
  }

  /** Gün cinsinden bir sonraki aralık. */
  private nextIntervalDays(stability: number): number {
    let interval =
      (stability / this.FACTOR) * (Math.pow(this.desiredRetention, 1 / this.DECAY) - 1);
    interval = Math.round(interval);
    interval = Math.max(interval, 1);
    return Math.min(interval, this.maximumInterval);
  }

  private shortTermStability(stability: number, rating: Rating): number {
    let increase =
      Math.exp(this.parameters[17] * (rating - 3 + this.parameters[18])) *
      Math.pow(stability, -this.parameters[19]);

    if (rating !== Rating.Again) {
      increase = Math.max(increase, 1.0);
    }

    return this.clampStability(stability * increase);
  }

  private nextDifficulty(difficulty: number, rating: Rating): number {
    const arg1 = this.initialDifficulty(Rating.Easy, false);
    const deltaDifficulty = -(this.parameters[6] * (rating - 3));
    const linearDamping = ((10.0 - difficulty) * deltaDifficulty) / 9.0;
    const arg2 = difficulty + linearDamping;
    const next = this.parameters[7] * arg1 + (1 - this.parameters[7]) * arg2;
    return this.clampDifficulty(next);
  }

  private nextForgetStability(d: number, s: number, r: number): number {
    const longTerm =
      this.parameters[11] *
      Math.pow(d, -this.parameters[12]) *
      (Math.pow(s + 1, this.parameters[13]) - 1) *
      Math.exp((1 - r) * this.parameters[14]);

    const shortTerm = s / Math.exp(this.parameters[17] * this.parameters[18]);

    return Math.min(longTerm, shortTerm);
  }

  private nextRecallStability(d: number, s: number, r: number, rating: Rating): number {
    const hardPenalty = rating === Rating.Hard ? this.parameters[15] : 1;
    const easyBonus = rating === Rating.Easy ? this.parameters[16] : 1;

    return (
      s *
      (1 +
        Math.exp(this.parameters[8]) *
          (11 - d) *
          Math.pow(s, -this.parameters[9]) *
          (Math.exp((1 - r) * this.parameters[10]) - 1) *
          hardPenalty *
          easyBonus)
    );
  }

  private nextStability(d: number, s: number, r: number, rating: Rating): number {
    const next =
      rating === Rating.Again
        ? this.nextForgetStability(d, s, r)
        : this.nextRecallStability(d, s, r, rating);
    return this.clampStability(next);
  }

  /** 2.5 günden kısa aralıklara fuzz uygulanmaz. */
  private fuzzIntervalDays(intervalDays: number): number {
    if (!this.enableFuzzing || intervalDays < 2.5) return intervalDays;

    let delta = 1.0;
    for (const range of FUZZ_RANGES) {
      delta += range.factor * Math.max(Math.min(intervalDays, range.end) - range.start, 0.0);
    }

    let minIvl = Math.round(intervalDays - delta);
    let maxIvl = Math.round(intervalDays + delta);
    minIvl = Math.max(2, minIvl);
    maxIvl = Math.min(maxIvl, this.maximumInterval);
    minIvl = Math.min(minIvl, maxIvl);

    return Math.floor(Math.random() * (maxIvl - minIvl + 1)) + minIvl;
  }

  /**
   * Kartı verilen derecelendirmeyle gözden geçirir ve güncellenmiş halini döndürür.
   * Girdi kartı değiştirilmez.
   */
  reviewCard(card: FsrsCardFields, rating: Rating, now = Date.now()): FsrsCardFields {
    const c: FsrsCardFields = { ...card };

    const daysSinceLastReview =
      c.lastReview !== null ? (now - c.lastReview) / DAY : null;

    let nextIntervalMs = 0;

    if (c.state === CardState.Learning) {
      // Kararlılık ve zorluk güncellemesi
      if (c.stability === null || c.difficulty === null) {
        c.stability = this.initialStability(rating);
        c.difficulty = this.initialDifficulty(rating, true);
      } else if (daysSinceLastReview !== null && daysSinceLastReview < 1) {
        c.stability = this.shortTermStability(c.stability, rating);
        c.difficulty = this.nextDifficulty(c.difficulty, rating);
      } else {
        const r = this.getRetrievability(c, now);
        c.stability = this.nextStability(c.difficulty, c.stability, r, rating);
        c.difficulty = this.nextDifficulty(c.difficulty, rating);
      }

      const step = c.step ?? 0;

      if (this.learningSteps.length === 0 || (step >= this.learningSteps.length && rating !== Rating.Again)) {
        c.state = CardState.Review;
        c.step = null;
        nextIntervalMs = this.fuzzIntervalDays(this.nextIntervalDays(c.stability)) * DAY;
      } else if (rating === Rating.Again) {
        c.step = 0;
        nextIntervalMs = this.learningSteps[0] * MINUTE;
      } else if (rating === Rating.Hard) {
        if (step === 0 && this.learningSteps.length === 1) {
          nextIntervalMs = this.learningSteps[0] * 1.5 * MINUTE;
        } else if (step === 0 && this.learningSteps.length >= 2) {
          nextIntervalMs = ((this.learningSteps[0] + this.learningSteps[1]) / 2.0) * MINUTE;
        } else {
          nextIntervalMs = this.learningSteps[step] * MINUTE;
        }
      } else if (rating === Rating.Good) {
        if (step + 1 === this.learningSteps.length) {
          c.state = CardState.Review;
          c.step = null;
          nextIntervalMs = this.fuzzIntervalDays(this.nextIntervalDays(c.stability)) * DAY;
        } else {
          c.step = step + 1;
          nextIntervalMs = this.learningSteps[c.step] * MINUTE;
        }
      } else {
        // Easy: doğrudan mezun olur
        c.state = CardState.Review;
        c.step = null;
        nextIntervalMs = this.fuzzIntervalDays(this.nextIntervalDays(c.stability)) * DAY;
      }
    } else if (c.state === CardState.Review) {
      const r = this.getRetrievability(c, now);

      if (daysSinceLastReview !== null && daysSinceLastReview < 1) {
        c.stability = this.shortTermStability(c.stability as number, rating);
      } else {
        c.stability = this.nextStability(
          c.difficulty as number,
          c.stability as number,
          r,
          rating
        );
      }
      c.difficulty = this.nextDifficulty(c.difficulty as number, rating);

      if (rating === Rating.Again) {
        c.lapses += 1;
        if (this.relearningSteps.length === 0) {
          nextIntervalMs = this.fuzzIntervalDays(this.nextIntervalDays(c.stability)) * DAY;
        } else {
          c.state = CardState.Relearning;
          c.step = 0;
          nextIntervalMs = this.relearningSteps[0] * MINUTE;
        }
      } else {
        nextIntervalMs = this.fuzzIntervalDays(this.nextIntervalDays(c.stability)) * DAY;
      }
    } else {
      // Relearning
      if (daysSinceLastReview !== null && daysSinceLastReview < 1) {
        c.stability = this.shortTermStability(c.stability as number, rating);
      } else {
        const r = this.getRetrievability(c, now);
        c.stability = this.nextStability(
          c.difficulty as number,
          c.stability as number,
          r,
          rating
        );
      }
      c.difficulty = this.nextDifficulty(c.difficulty as number, rating);

      const step = c.step ?? 0;

      if (this.relearningSteps.length === 0 || (step >= this.relearningSteps.length && rating !== Rating.Again)) {
        c.state = CardState.Review;
        c.step = null;
        nextIntervalMs = this.fuzzIntervalDays(this.nextIntervalDays(c.stability)) * DAY;
      } else if (rating === Rating.Again) {
        c.step = 0;
        nextIntervalMs = this.relearningSteps[0] * MINUTE;
      } else if (rating === Rating.Hard) {
        if (step === 0 && this.relearningSteps.length === 1) {
          nextIntervalMs = this.relearningSteps[0] * 1.5 * MINUTE;
        } else if (step === 0 && this.relearningSteps.length >= 2) {
          nextIntervalMs = ((this.relearningSteps[0] + this.relearningSteps[1]) / 2.0) * MINUTE;
        } else {
          nextIntervalMs = this.relearningSteps[step] * MINUTE;
        }
      } else if (rating === Rating.Good) {
        if (step + 1 === this.relearningSteps.length) {
          c.state = CardState.Review;
          c.step = null;
          nextIntervalMs = this.fuzzIntervalDays(this.nextIntervalDays(c.stability)) * DAY;
        } else {
          c.step = step + 1;
          nextIntervalMs = this.relearningSteps[c.step] * MINUTE;
        }
      } else {
        c.state = CardState.Review;
        c.step = null;
        nextIntervalMs = this.fuzzIntervalDays(this.nextIntervalDays(c.stability)) * DAY;
      }
    }

    c.reps += 1;
    c.lastReview = now;
    c.due = now + nextIntervalMs;

    return c;
  }

  /** Bir kartın seçilen derecelendirmede ne kadar sonra tekrar geleceğini önizler. */
  previewInterval(card: FsrsCardFields, rating: Rating, now = Date.now()): number {
    const result = this.reviewCard(card, rating, now);
    return result.due - now;
  }
}

/** "3 gün", "12 dakika" gibi okunabilir aralık metni. */
export function formatInterval(ms: number): string {
  const minutes = ms / MINUTE;
  if (minutes < 60) return `${Math.max(1, Math.round(minutes))} dk`;
  const hours = minutes / 60;
  if (hours < 24) return `${Math.round(hours)} saat`;
  const days = hours / 24;
  if (days < 30) return `${Math.round(days)} gün`;
  const months = days / 30;
  if (months < 12) return `${Math.round(months)} ay`;
  return `${(days / 365).toFixed(1)} yıl`;
}
