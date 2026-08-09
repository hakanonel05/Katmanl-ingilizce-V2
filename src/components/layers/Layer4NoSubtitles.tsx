import React, { useState } from 'react';
import { VideoLesson } from '../../types';
import { extractYouTubeId } from '../../lib/youtube';
import { useYouTubePlayer, formatSeconds } from '../../lib/useYouTubePlayer';
import { Layer3ComprehensionQuiz } from './Layer3ComprehensionQuiz';
import { EyeOff, Check } from 'lucide-react';

interface Props {
  lesson: VideoLesson;
  onCompleteLayer: () => void;
  onUpdateQuizData: (data: any) => void;
}

/**
 * 4. KATMAN — ALTYAZISIZ İZLEME
 * Önce metin görmeden izleme, ardından anlama kontrolü.
 * Anlama testi bölümü mevcut (çalışan) quiz bileşeninden geliyor;
 * yeniden yazılmadı, sadece bu akışın içine alındı.
 */
export const Layer4NoSubtitles: React.FC<Props> = ({
  lesson,
  onCompleteLayer,
  onUpdateQuizData,
}) => {
  const ytId = lesson.youtubeId || extractYouTubeId(lesson.youtubeUrl);
  const { containerRef, currentTime } = useYouTubePlayer(ytId, 'yt-no-subs');
  const [watched, setWatched] = useState(false);

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
        <div className="flex items-center space-x-2.5 mb-2">
          <span className="px-2.5 py-1 bg-orange-50 text-orange-700 border border-orange-200 text-xs font-bold rounded-md uppercase tracking-wider">
            Layer 4
          </span>
          <h2 className="text-base sm:text-lg font-bold text-slate-900">Altyazısız İzleme</h2>
        </div>
        <p className="text-xs text-slate-600 leading-relaxed">
          Altyazıyı tamamen kapatın ve videoyu izleyin. <strong>%100 anlamak zorunda
          değilsiniz</strong>; başlangıçta %60-70 yakalamak yeterlidir. İzledikten sonra
          aşağıdaki anlama testine geçin.
        </p>
      </div>

      {!ytId ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-900">
          Bu derste gömülü video yok.
        </div>
      ) : (
        <div className="max-w-3xl mx-auto space-y-3">
          <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm">
            <div className="aspect-video w-full rounded-lg overflow-hidden bg-slate-950">
              <div ref={containerRef} className="w-full h-full" />
            </div>
            <div className="flex items-center justify-between pt-2">
              <span className="text-[11px] font-mono text-slate-500">
                {formatSeconds(currentTime)}
              </span>
              <span className="inline-flex items-center space-x-1.5 text-[11px] font-semibold text-orange-700">
                <EyeOff className="w-3.5 h-3.5" />
                <span>Metin gösterilmiyor — bu katmanda kasıtlı</span>
              </span>
            </div>
          </div>

          {!watched && (
            <button
              type="button"
              onClick={() => setWatched(true)}
              className="w-full flex items-center justify-center space-x-2 px-4 py-3 bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold rounded-xl transition cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>Videoyu altyazısız izledim, teste geç</span>
            </button>
          )}
        </div>
      )}

      {watched && (
        <div className="pt-2 border-t border-slate-200">
          <Layer3ComprehensionQuiz
            lesson={lesson}
            onCompleteLayer={onCompleteLayer}
            onUpdateQuizData={onUpdateQuizData}
          />
        </div>
      )}
    </div>
  );
};
