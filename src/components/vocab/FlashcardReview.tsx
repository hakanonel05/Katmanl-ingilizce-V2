import React, { useState, useEffect, useMemo, useRef } from 'react';
import { VocabCard, putCard, isNewCard } from '../../lib/vocabStore';
import { bumpDailyCounter } from '../../lib/vocabSettings';
import { FsrsScheduler, Rating, CardState, formatInterval } from '../../lib/fsrs';
import { Volume2, RotateCcw, Check, Clock, PartyPopper, Pause, Play } from 'lucide-react';

interface Props {
  cards: VocabCard[];
  /** Günlük çalışma süresi hedefi (dakika). */
  sessionMinutes?: number;
  onCardUpdated: () => void;
  onExit?: () => void;
}

/** Hedef tutma oranı 0.90 — istenen ayar. */
const scheduler = new FsrsScheduler({ desiredRetention: 0.9 });

const KIND_LABEL: Record<string, string> = {
  word: 'Kelime',
  phrasal_verb: 'Phrasal Verb',
  collocation: 'Kalıp',
  idiom: 'Deyim',
  expression: 'Konuşma Kalıbı',
};

/**
 * Anki mantığında kart çalışma oturumu.
 * Yalnızca "Again" ve "Good" düğmeleri kullanılıyor (istenen çalışma biçimi).
 * Hard/Easy algoritmada mevcut ama arayüzde bilinçli olarak gösterilmiyor.
 */
export const FlashcardReview: React.FC<Props> = ({
  cards,
  sessionMinutes = 15,
  onCardUpdated,
  onExit,
}) => {
  const [queue, setQueue] = useState<VocabCard[]>([]);
  const [showAnswer, setShowAnswer] = useState(false);
  const [reviewedCount, setReviewedCount] = useState(0);
  const [againCount, setAgainCount] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [timeUp, setTimeUp] = useState(false);
  const startedRef = useRef<number>(Date.now());

  // Kuyruğu ilk yüklemede kur. Kartlar üst bileşende günlük sınırlara göre
  // zaten süzülmüş halde geliyor.
  useEffect(() => {
    setQueue(cards);
    startedRef.current = Date.now();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Süre sayacı
  useEffect(() => {
    if (isPaused || timeUp) return;
    const id = setInterval(() => {
      setElapsedMs((prev) => {
        const next = prev + 1000;
        if (next >= sessionMinutes * 60 * 1000) setTimeUp(true);
        return next;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [isPaused, timeUp, sessionMinutes]);

  const current = queue[0];

  const previews = useMemo(() => {
    if (!current) return null;
    const now = Date.now();
    return {
      again: formatInterval(scheduler.previewInterval(current, Rating.Again, now)),
      good: formatInterval(scheduler.previewInterval(current, Rating.Good, now)),
    };
  }, [current]);

  const speak = (text: string) => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US';
    u.rate = 0.9;
    window.speechSynthesis.speak(u);
  };

  const grade = async (rating: Rating) => {
    if (!current) return;
    const now = Date.now();
    const wasNew = isNewCard(current);
    const updated = { ...current, ...scheduler.reviewCard(current, rating, now) };

    try {
      await putCard(updated);
    } catch (err) {
      console.warn('Kart kaydedilemedi:', err);
    }

    // Günlük sayaç: kart ilk kez çalışıldıysa "yeni", değilse "tekrar"
    bumpDailyCounter(wasNew ? 'new' : 'review');

    setReviewedCount((c) => c + 1);
    if (rating === Rating.Again) setAgainCount((c) => c + 1);

    setQueue((prev) => {
      const rest = prev.slice(1);
      // Again ya da kısa aralıklı kartlar aynı oturumda tekrar gelsin
      const gap = updated.due - now;
      if (gap <= 20 * 60 * 1000) {
        // Kuyruğun ilerisine yerleştir (Anki'deki gibi araya sıkıştırma)
        const insertAt = Math.min(rest.length, rating === Rating.Again ? 3 : 8);
        return [...rest.slice(0, insertAt), updated, ...rest.slice(insertAt)];
      }
      return rest;
    });

    setShowAnswer(false);
    onCardUpdated();
  };

  // Klavye kısayolları: Anki alışkanlığı
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!current || timeUp) return;
      if (e.code === 'Space') {
        e.preventDefault();
        if (!showAnswer) setShowAnswer(true);
        else grade(Rating.Good);
      } else if (e.key === '1' && showAnswer) {
        grade(Rating.Again);
      } else if (e.key === '2' && showAnswer) {
        grade(Rating.Good);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const remainingMs = Math.max(0, sessionMinutes * 60 * 1000 - elapsedMs);
  const mm = String(Math.floor(remainingMs / 60000)).padStart(2, '0');
  const ss = String(Math.floor((remainingMs % 60000) / 1000)).padStart(2, '0');
  const timePct = Math.min(100, (elapsedMs / (sessionMinutes * 60 * 1000)) * 100);

  if (queue.length === 0) {
    return (
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-8 text-center space-y-3">
        <PartyPopper className="w-10 h-10 text-emerald-600 mx-auto" />
        <h3 className="text-base font-bold text-slate-900">Bugünlük kart kalmadı</h3>
        <p className="text-xs text-slate-600 max-w-md mx-auto">
          Vadesi gelen tüm kartları çalıştınız. FSRS bir sonraki tekrarı en verimli
          zamana yerleştirdi; yarın yeni kartlar hazır olacak.
        </p>
        {reviewedCount > 0 && (
          <p className="text-xs font-bold text-emerald-800">
            Bu oturumda {reviewedCount} tekrar yaptınız.
          </p>
        )}
      </div>
    );
  }

  if (timeUp) {
    return (
      <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-8 text-center space-y-3">
        <Clock className="w-10 h-10 text-indigo-600 mx-auto" />
        <h3 className="text-base font-bold text-slate-900">
          {sessionMinutes} dakikalık çalışma tamamlandı
        </h3>
        <p className="text-xs text-slate-600 max-w-md mx-auto">
          {reviewedCount} tekrar yaptınız, {againCount} kartı hatırlayamadınız.
          Günlük hedefe ulaştınız; kuyrukta {queue.length} kart kaldı ve yarın sizi bekliyor.
        </p>
        <div className="flex items-center justify-center gap-2 pt-1">
          <button
            type="button"
            onClick={() => {
              setTimeUp(false);
              setElapsedMs(0);
            }}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg cursor-pointer"
          >
            Devam Et ({sessionMinutes} dk daha)
          </button>
          {onExit && (
            <button
              type="button"
              onClick={onExit}
              className="px-4 py-2 bg-white border border-slate-300 text-slate-700 text-xs font-bold rounded-lg cursor-pointer"
            >
              Bitir
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Üst bar: süre ve sayaçlar */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm space-y-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center space-x-2 text-xs">
            <Clock className="w-4 h-4 text-indigo-600" />
            <span className="timecode text-slate-900 font-medium">
              {mm}:{ss}
            </span>
            <span className="text-slate-500">kaldı</span>
          </div>

          <div className="flex items-center space-x-2 text-[11px] font-semibold">
            <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded-full">
              Kuyruk: {queue.length}
            </span>
            <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full">
              Tekrar: {reviewedCount}
            </span>
            <button
              type="button"
              onClick={() => setIsPaused((p) => !p)}
              className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
              title={isPaused ? 'Devam et' : 'Duraklat'}
            >
              {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
          <div
            className="bg-indigo-500 h-1.5 rounded-full transition-all"
            style={{ width: `${timePct}%` }}
          />
        </div>
      </div>

      {/* Kart */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-[11px]">
          <div className="flex items-center gap-1.5">
            <span className="px-2 py-0.5 bg-indigo-100 text-indigo-800 font-bold rounded">
              {current.level}
            </span>
            <span className="px-2 py-0.5 bg-slate-200 text-slate-700 font-semibold rounded">
              {KIND_LABEL[current.kind] || current.kind}
            </span>
            {current.state !== CardState.Review && (
              <span className="px-2 py-0.5 bg-amber-100 text-amber-800 font-semibold rounded">
                {current.state === CardState.Learning ? 'Öğreniliyor' : 'Yeniden'}
              </span>
            )}
          </div>
          <span className="text-slate-500 truncate max-w-[45%]" title={current.lessonTitle}>
            {current.lessonTitle}
          </span>
        </div>

        <div className="p-6 sm:p-10 text-center space-y-4 min-h-[220px] flex flex-col justify-center">
          <div className="flex items-center justify-center gap-2">
            <h2 className="font-display text-3xl sm:text-4xl font-medium text-slate-900">{current.front}</h2>
            <button
              type="button"
              onClick={() => speak(current.front)}
              className="p-2 rounded-lg bg-slate-100 hover:bg-indigo-100 text-slate-700 hover:text-indigo-700 cursor-pointer"
              title="Sesli oku"
            >
              <Volume2 className="w-4 h-4" />
            </button>
          </div>

          {current.ipa && <p className="text-sm font-mono text-slate-500">{current.ipa}</p>}

          {showAnswer && (
            <div className="space-y-3 pt-3 border-t border-slate-200">
              <p className="text-lg sm:text-xl font-medium text-slate-900">{current.back}</p>

              {current.exampleEn && (
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-left space-y-1">
                  <p className="text-sm text-slate-900 font-medium">{current.exampleEn}</p>
                  {current.exampleTr && (
                    <p className="text-xs text-slate-600">{current.exampleTr}</p>
                  )}
                </div>
              )}

              {current.contextEn && current.contextEn !== current.exampleEn && (
                <p className="text-[11px] text-slate-500 italic px-2">
                  Videoda: &ldquo;{current.contextEn}&rdquo;
                </p>
              )}
            </div>
          )}
        </div>

        <div className="p-4 bg-slate-50 border-t border-slate-200">
          {!showAnswer ? (
            <button
              type="button"
              onClick={() => setShowAnswer(true)}
              className="w-full px-4 py-3 bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold rounded-xl transition cursor-pointer"
            >
              Cevabı Göster <span className="text-slate-400 font-normal">(boşluk)</span>
            </button>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => grade(Rating.Again)}
                className="flex flex-col items-center px-4 py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl transition cursor-pointer"
              >
                <span className="flex items-center space-x-1.5 text-sm font-bold">
                  <RotateCcw className="w-4 h-4" />
                  <span>Again</span>
                </span>
                <span className="text-[11px] text-rose-100 font-mono">{previews?.again}</span>
              </button>

              <button
                type="button"
                onClick={() => grade(Rating.Good)}
                className="flex flex-col items-center px-4 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl transition cursor-pointer"
              >
                <span className="flex items-center space-x-1.5 text-sm font-bold">
                  <Check className="w-4 h-4" />
                  <span>Good</span>
                </span>
                <span className="text-[11px] text-emerald-100 font-mono">{previews?.good}</span>
              </button>
            </div>
          )}

          <p className="text-[10px] text-slate-400 text-center pt-2">
            Kısayollar: boşluk = göster / Good &nbsp;·&nbsp; 1 = Again &nbsp;·&nbsp; 2 = Good
          </p>
        </div>
      </div>
    </div>
  );
};
