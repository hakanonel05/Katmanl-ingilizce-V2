import React, { useState } from 'react';
import { VideoLesson } from '../../types';
import { extractYouTubeId } from '../../lib/youtube';
import { useYouTubePlayer, formatSeconds } from '../../lib/useYouTubePlayer';
import { CheckCircle, Headphones, Play, Pause, Eye, EyeOff } from 'lucide-react';

interface Props {
  lesson: VideoLesson;
  onCompleteLayer: () => void;
}

/**
 * 5. KATMAN — SADECE DİNLEME
 * Görüntü kapatılır, yalnızca ses kalır. Görsel ipuçları (jest, slayt, dudak
 * hareketi) ortadan kalkınca beyin doğrudan sese odaklanmak zorunda kalır.
 *
 * NOT: iframe DOM'dan kaldırılmıyor, üzeri örtülüyor. display:none yapılırsa
 * bazı tarayıcılarda oynatma duruyor.
 */
export const Layer5AudioOnly: React.FC<Props> = ({ lesson, onCompleteLayer }) => {
  const ytId = lesson.youtubeId || extractYouTubeId(lesson.youtubeUrl);
  const { containerRef, isPlaying, currentTime, duration, play, pause } = useYouTubePlayer(
    ytId,
    'yt-audio-only'
  );
  const [peek, setPeek] = useState(false);

  const progressPct = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
        <div className="flex items-center space-x-2.5 mb-2">
          <span className="px-2.5 py-1 bg-sky-50 text-sky-700 border border-sky-200 text-xs font-bold rounded-md uppercase tracking-wider">
            Layer 5
          </span>
          <h2 className="text-base sm:text-lg font-bold text-slate-900">Sadece Dinleme</h2>
        </div>
        <p className="text-xs text-slate-600 leading-relaxed">
          Videoyu görsel, jest ve slayt desteği olmadan <strong>sadece kulaklıkla</strong> ses
          modunda dinleyin. Görüntü kapalı olduğu için beyniniz doğrudan sese odaklanır.
        </p>
      </div>

      {!ytId ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-900">
          Bu derste gömülü video yok.
        </div>
      ) : (
        <div className="max-w-2xl mx-auto">
          <div className="bg-slate-900 rounded-2xl p-6 shadow-lg space-y-5">
            {/* Oynatıcı: görünmez ama DOM'da */}
            <div className="relative rounded-xl overflow-hidden bg-slate-950 aspect-video">
              <div ref={containerRef} className="w-full h-full" />
              {!peek && (
                <div className="absolute inset-0 bg-slate-900 flex flex-col items-center justify-center space-y-3">
                  <Headphones className="w-14 h-14 text-sky-400" />
                  <p className="text-sm font-bold text-slate-200">Görüntü Kapalı</p>
                  <p className="text-[11px] text-slate-500 px-8 text-center">
                    Sadece sese odaklanın. Anlamadığınız yerleri not edin.
                  </p>
                </div>
              )}
            </div>

            {/* İlerleme */}
            <div className="space-y-1.5">
              <div className="w-full bg-slate-700 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-sky-500 h-1.5 rounded-full transition-all"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <div className="flex justify-between text-[11px] font-mono text-slate-400">
                <span>{formatSeconds(currentTime)}</span>
                <span>{duration > 0 ? formatSeconds(duration) : '--:--'}</span>
              </div>
            </div>

            {/* Kontroller */}
            <div className="flex items-center justify-center space-x-3">
              <button
                type="button"
                onClick={() => (isPlaying ? pause() : play())}
                className="flex items-center space-x-2 px-6 py-3 bg-sky-600 hover:bg-sky-700 text-white text-sm font-bold rounded-xl transition cursor-pointer"
              >
                {isPlaying ? (
                  <>
                    <Pause className="w-4 h-4 fill-current" />
                    <span>Duraklat</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-current" />
                    <span>Dinlemeye Başla</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => setPeek((p) => !p)}
                className="flex items-center space-x-1.5 px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl transition cursor-pointer"
                title="Zorlandığınızda kısa süre görüntüye bakabilirsiniz"
              >
                {peek ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                <span>{peek ? 'Görüntüyü Kapat' : 'Kısa Bak'}</span>
              </button>
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
          <span>5. Katmanı Tamamladım, 6. Katmana Geç</span>
        </button>
      </div>
    </div>
  );
};
