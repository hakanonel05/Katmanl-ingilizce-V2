import React, { useMemo, useEffect, useRef } from 'react';
import { VideoLesson } from '../../types';
import { extractYouTubeId } from '../../lib/youtube';
import { useYouTubePlayer, formatSeconds, getSentenceStart } from '../../lib/useYouTubePlayer';
import { CheckCircle, Ear, AlertTriangle } from 'lucide-react';
import { SelectionToCard } from '../vocab/SelectionToCard';

interface Props {
  lesson: VideoLesson;
  onCompleteLayer: () => void;
}

/**
 * 2. KATMAN — AKTİF DİNLEME
 * Video oynatılırken metin gözle takip edilir. Türkçe çeviri bilinçli olarak
 * gösterilmez: amaç sesle yazıyı eşleştirmek, anlamı Türkçeden hatırlamak değil.
 */
export const Layer2ActiveListening: React.FC<Props> = ({ lesson, onCompleteLayer }) => {
  const ytId = lesson.youtubeId || extractYouTubeId(lesson.youtubeUrl);
  const { containerRef, isPlaying, currentTime } = useYouTubePlayer(ytId, 'yt-active-listening');
  const activeRef = useRef<HTMLDivElement | null>(null);
  const transcriptAreaRef = useRef<HTMLDivElement | null>(null);

  const syncPoints = useMemo(
    () =>
      (lesson.sentences || [])
        .map((pair, index) => ({ index, id: pair.id, start: getSentenceStart(pair) }))
        .filter((p): p is { index: number; id: number; start: number } => p.start !== null)
        .sort((a, b) => a.start - b.start),
    [lesson.sentences]
  );

  const hasTimings = syncPoints.length > 0;

  const activeId = useMemo(() => {
    if (!hasTimings || currentTime <= 0) return null;
    let found: number | null = null;
    for (const p of syncPoints) {
      if (currentTime >= p.start) found = p.id;
      else break;
    }
    return found;
  }, [currentTime, syncPoints, hasTimings]);

  useEffect(() => {
    if (activeId && activeRef.current) {
      activeRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activeId]);

  return (
    <div className="space-y-6">
      <SelectionToCard
        containerRef={transcriptAreaRef}
        lessonId={lesson.id}
        lessonTitle={lesson.title}
        onAdded={() => { /* VocabHub depo olayıyla kendini tazeliyor */ }}
      />

      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
        <div className="flex items-center space-x-2.5 mb-2">
          <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold rounded-md uppercase tracking-wider">
            Layer 2
          </span>
          <h2 className="text-base sm:text-lg font-bold text-slate-900">Aktif Dinleme</h2>
        </div>
        <p className="text-xs text-slate-600 leading-relaxed">
          Videoyu oynatın ve metni <strong>gözlerinizle</strong> takip edin. Bu katmanda Türkçe
          çeviri bilinçli olarak gösterilmiyor; amaç duyduğunuz sesi yazıyla eşleştirmek. Bu
          çalışma fonetik bilginizi ve kelimelerin ses karşılıklarını zihninize yükler.
        </p>
      </div>

      {!ytId ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-900">
          Bu derste gömülü video yok. Katman 1'den video linki ekleyebilirsiniz.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-5 lg:sticky lg:top-4">
            <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm space-y-2">
              <div className="aspect-video w-full rounded-lg overflow-hidden bg-slate-950">
                <div ref={containerRef} className="w-full h-full" />
              </div>
              <div className="flex items-center space-x-2 pt-1">
                {isPlaying ? (
                  <span className="inline-flex items-center space-x-1 px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded-full">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                    <span>Dinleniyor ({formatSeconds(currentTime)})</span>
                  </span>
                ) : (
                  <span className="text-[11px] font-semibold text-slate-500">
                    Videoyu başlatın ve metni takip edin
                  </span>
                )}
              </div>
            </div>
          </div>

          <div ref={transcriptAreaRef} className="lg:col-span-7">
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
              <div className="bg-slate-900 text-white px-4 py-3 flex items-center space-x-2">
                <Ear className="w-4 h-4 text-emerald-400" />
                <h3 className="text-xs sm:text-sm font-bold uppercase tracking-wider">
                  İngilizce Metin (Türkçe Gizli)
                </h3>
              </div>

              {!hasTimings && (
                <div className="flex items-start space-x-2 bg-rose-50 border-b border-rose-200 p-3 text-xs text-rose-900">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <p>
                    Bu derste zaman bilgisi yok, canlı vurgu çalışmıyor. Katman 1'deki
                    &quot;Gerçek Altyazıdan Senkronize Et&quot; düğmesini kullanabilirsiniz.
                  </p>
                </div>
              )}

              <div className="divide-y divide-slate-200 max-h-[70vh] overflow-y-auto">
                {(lesson.sentences || []).map((pair) => {
                  const isActive = activeId === pair.id;
                  return (
                    <div
                      key={pair.id}
                      ref={isActive ? activeRef : null}
                      className={`p-4 border-l-4 transition-all ${
                        isActive
                          ? 'bg-amber-50 border-amber-500 shadow-sm'
                          : 'border-transparent'
                      }`}
                    >
                      <p
                        className={`transcript-en ${
                          isActive ? 'text-[var(--marker-ink)] font-medium' : 'text-slate-700'
                        }`}
                      >
                        {pair.en}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-end pt-2">
        <button
          type="button"
          onClick={onCompleteLayer}
          className="flex items-center space-x-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs sm:text-sm rounded-xl transition shadow-sm cursor-pointer"
        >
          <CheckCircle className="w-4 h-4" />
          <span>2. Katmanı Tamamladım, 3. Katmana Geç</span>
        </button>
      </div>
    </div>
  );
};
