export interface SentencePair {
  id: number;
  en: string;
  tr: string;
  /** Görüntüleme amaçlı zaman etiketi, örn. "01:23" */
  timestamp?: string;
  /** YouTube altyazısından gelen GERÇEK başlangıç saniyesi. Senkronizasyonun tek kaynağı. */
  startSec?: number;
  /** Cümlenin bittiği saniye. */
  endSec?: number;
  notes?: string;
}

export interface VocabularyItem {
  word: string;
  type?: string;
  ipa?: string;
  meaningTr: string;
  pronunciationNote?: string;
  exampleSentence?: string;
}

export interface GrammarExample {
  en: string;
  tr: string;
}

export interface GrammarRuleItem {
  topic: string;
  explanationTr: string;
  examples: GrammarExample[];
}

export interface QuizQuestion {
  id: number;
  type: 'multiple_choice' | 'open_ended';
  question: string;
  options?: string[];
  correctOptionIndex?: number;
  sampleAnswerEn?: string;
  explanationTr: string;
}

export interface GrammarCorrection {
  original: string;
  corrected: string;
  explanationTr: string;
}

export interface NaturalPhrasingSuggestion {
  original: string;
  nativeSuggestion: string;
  whyBetterTr: string;
}

export interface WritingEvaluationResult {
  grammarCorrections: GrammarCorrection[];
  naturalPhrasing: NaturalPhrasingSuggestion[];
  generalFeedback: string;
}

export interface VideoLesson {
  id: string;
  title: string;
  speaker?: string;
  youtubeUrl: string;
  youtubeId?: string;
  description: string;
  level: 'B1' | 'B2' | 'C1';
  durationMinutes: number;
  sentences: SentencePair[];
  vocabulary?: VocabularyItem[];
  grammarRules?: GrammarRuleItem[];
  quizQuestions?: QuizQuestion[];
  userSummary?: string;
  userComment?: string;
  completedLayers: number[]; // e.g. [1, 2, 3]
  /** true ise cümlelerde YouTube'dan gelen gerçek zaman bilgisi var. */
  hasRealTimings?: boolean;
}

export interface UserProgress {
  completedVideoCount: number;
  goalVideoCount: number;
  studyStreakDays: number;
  lastStudyDate: string;
  /** Calisma yapilan gunler (YYYY-MM-DD). Seri bu listeden hesaplanir. */
  studyDates?: string[];
  bookmarkedWords: { word: string; enContext: string; trContext: string }[];
  weeklyStudyMinutes?: { day: string; date?: string; minutes: number }[];
}
