import React, { useState, useMemo, useEffect, useRef } from 'react';
import { VideoLesson } from '../../types';
import { extractYouTubeId } from '../../lib/youtube';
import { useYouTubePlayer, getSentenceStart } from '../../lib/useYouTubePlayer';
import { CheckCircle, Mic, Square, Play, RotateCcw, ChevronLeft, ChevronRight, Volume2, Trash2, Save, ListMusic } from 'lucide-react';
import {
  saveRecording,
  getRecording,
  listRecordings,
  deleteRecording,
  deleteAllRecordings,
  StoredRecording,
} from '../../lib/recordingStore';

interface Props {
  lesson: VideoLesson;
  onCompleteLayer: () => void;
}

/**
 * 3. KATMAN — SESLİ OKUMA (GÖLGELEME)
 * Cümle cümle ilerlenir: cümleyi dinle, konuşmacıyla birlikte sesli oku,
 * istersen kendi sesini kaydedip yan yana dinle.
 */
export const Layer3Shadowing: React.FC<Props> = ({ lesson, onCompleteLayer }) => {
  const ytId = lesson.youtubeId || extractYouTubeId(lesson.youtubeUrl);
  const { containerRef, currentTime, seekTo, pause } = useYouTubePlayer(ytId, 'yt-shadowing');

  const [index, setIndex] = useState(0);
  const [isLooping, setIsLooping] = useState(false);
  const stopAtRef = useRef<number | null>(null);

  // Ses kaydı
  const [isRecording, setIsRecording] = useState(false);
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const [recordError, setRecordError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Kalıcı kayıtlar (IndexedDB)
  const [savedList, setSavedList] = useState<StoredRecording[]>([]);
  const [hasSavedForCurrent, setHasSavedForCurrent] = useState(false);
  const [showAllRecordings, setShowAllRecordings] = useState(false);

  const sentences = lesson.sentences || [];
  const current = sentences[index];

  const bounds = useMemo(() => {
    if (!current) return null;
    const start = getSentenceStart(current);
    if (start === null) return null;
    const next = sentences[index + 1];
    const nextStart = next ? getSentenceStart(next) : null;
    const end =
      typeof current.endSec === 'number'
        ? current.endSec
        : nextStart !== null
        ? nextStart
        : start + 6;
    return { start, end };
  }, [current, index, sentences]);

  // Cümle bitince otomatik duraklat
  useEffect(() => {
    if (!isLooping || stopAtRef.current === null) return;
    if (currentTime >= stopAtRef.current) {
      pause();
      setIsLooping(false);
      stopAtRef.current = null;
    }
  }, [currentTime, isLooping, pause]);

  const playSentence = () => {
    if (!bounds) return;
    stopAtRef.current = bounds.end;
    setIsLooping(true);
    seekTo(bounds.start, true);
  };

  const speakSentence = () => {
    if (!current || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(current.en);
    u.lang = 'en-US';
    u.rate = 0.85;
    window.speechSynthesis.speak(u);
  };

  const refreshList = async () => {
    try {
      setSavedList(await listRecordings(lesson.id));
    } catch (err) {
      console.warn('Kayıt listesi okunamadı:', err);
    }
  };

  // Ders değişince kayıt listesini yükle
  useEffect(() => {
    refreshList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson.id]);

  // Cümle değişince o cümlenin kayıtlı sesini getir
  useEffect(() => {
    let cancelled = false;

    setRecordingUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setHasSavedForCurrent(false);

    if (!current) return;

    (async () => {
      try {
        const rec = await getRecording(lesson.id, current.id);
        if (cancelled || !rec) return;
        setRecordingUrl(URL.createObjectURL(rec.blob));
        setHasSavedForCurrent(true);
      } catch (err) {
        console.warn('Kayıt okunamadı:', err);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson.id, current?.id]);

  const handleDeleteCurrent = async () => {
    if (!current) return;
    try {
      await deleteRecording(lesson.id, current.id);
      setRecordingUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setHasSavedForCurrent(false);
      await refreshList();
    } catch (err) {
      console.warn('Kayıt silinemedi:', err);
    }
  };

  const handleDeleteAll = async () => {
    if (!window.confirm('Bu dersteki tüm ses kayıtları silinecek. Emin misiniz?')) return;
    try {
      await deleteAllRecordings(lesson.id);
      setRecordingUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setHasSavedForCurrent(false);
      await refreshList();
    } catch (err) {
      console.warn('Kayıtlar silinemedi:', err);
    }
  };

  const startRecording = async () => {
    setRecordError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setRecordingUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return URL.createObjectURL(blob);
        });
        stream.getTracks().forEach((t) => t.stop());

        // Kaydı kalıcı sakla; sayfa yenilenince kaybolmasın
        if (current) {
          try {
            await saveRecording({
              key: `${lesson.id}:${current.id}`,
              lessonId: lesson.id,
              sentenceId: current.id,
              sentenceText: current.en,
              blob,
              createdAt: Date.now(),
            });
            setHasSavedForCurrent(true);
            await refreshList();
          } catch (err) {
            console.warn('Kayıt saklanamadı:', err);
            setRecordError('Kayıt alındı ama cihaza saklanamadı.');
          }
        }
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
    } catch (err: any) {
      setRecordError(
        'Mikrofona erişilemedi. Tarayıcı izni verdiğinizden ve sitenin HTTPS olduğundan emin olun.'
      );
      console.warn('Mikrofon hatası:', err);
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  };

  const goTo = (nextIndex: number) => {
    if (nextIndex < 0 || nextIndex >= sentences.length) return;
    setIsLooping(false);
    stopAtRef.current = null;
    setIndex(nextIndex);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
        <div className="flex items-center space-x-2.5 mb-2">
          <span className="px-2.5 py-1 bg-violet-50 text-violet-700 border border-violet-200 text-xs font-bold rounded-md uppercase tracking-wider">
            Layer 3
          </span>
          <h2 className="text-base sm:text-lg font-bold text-slate-900">Sesli Okuma (Gölgeleme)</h2>
        </div>
        <p className="text-xs text-slate-600 leading-relaxed">
          Cümleyi dinleyin, ardından konuşmacıyla <strong>birlikte sesli okuyun</strong>. Dil bir
          kas grubudur; sesli okuma dil kaslarınızı esnetir ve ihlalları azaltır. İsterseniz kendi
          sesinizi kaydedip karşılaştırın.
        </p>
      </div>

      {sentences.length === 0 ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-900">
          Bu derste cümle bulunmuyor.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-5">
            <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm">
              <div className="aspect-video w-full rounded-lg overflow-hidden bg-slate-950">
                <div ref={containerRef} className="w-full h-full" />
              </div>
            </div>
          </div>

          <div className="lg:col-span-7 space-y-4">
            {/* Cümle kartı */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Cümle {index + 1} / {sentences.length}
                </span>
                <div className="flex items-center space-x-1">
                  <button
                    type="button"
                    onClick={() => goTo(index - 1)}
                    disabled={index === 0}
                    className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-700 cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => goTo(index + 1)}
                    disabled={index === sentences.length - 1}
                    className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-700 cursor-pointer"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <p className="transcript-en text-xl sm:text-2xl text-slate-900">
                {current?.en}
              </p>

              <div className="flex flex-wrap items-center gap-2">
                {bounds ? (
                  <button
                    type="button"
                    onClick={playSentence}
                    className="flex items-center space-x-1.5 px-3.5 py-2 bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold rounded-lg transition cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Cümleyi Oynat</span>
                  </button>
                ) : (
                  <span className="text-[11px] text-slate-500">
                    Bu cümlede zaman bilgisi yok, video oynatılamıyor.
                  </span>
                )}

                <button
                  type="button"
                  onClick={speakSentence}
                  className="flex items-center space-x-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-lg transition cursor-pointer"
                  title="Bilgisayar sesiyle yavaş okut"
                >
                  <Volume2 className="w-3.5 h-3.5" />
                  <span>Yavaş Okut</span>
                </button>

                {bounds && (
                  <button
                    type="button"
                    onClick={playSentence}
                    className="flex items-center space-x-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-lg transition cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Tekrarla</span>
                  </button>
                )}
              </div>
            </div>

            {/* Kayıt paneli */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-3">
              <h3 className="text-sm font-bold text-slate-900">Kendi Sesini Kaydet</h3>
              <p className="text-[11px] text-slate-600">
                Cümleyi sesli okuyun, sonra kaydınızı dinleyip orijinalle karşılaştırın.
                Kayıt tarayıcıda kalır, hiçbir yere gönderilmez.
              </p>

              <div className="flex flex-wrap items-center gap-2">
                {!isRecording ? (
                  <button
                    type="button"
                    onClick={startRecording}
                    className="flex items-center space-x-1.5 px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg transition cursor-pointer"
                  >
                    <Mic className="w-3.5 h-3.5" />
                    <span>{hasSavedForCurrent ? 'Yeniden Kaydet' : 'Kaydı Başlat'}</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={stopRecording}
                    className="flex items-center space-x-1.5 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-lg transition cursor-pointer"
                  >
                    <Square className="w-3.5 h-3.5 fill-current" />
                    <span>Durdur</span>
                  </button>
                )}

                {recordingUrl && (
                  <>
                    <audio controls src={recordingUrl} className="h-9 max-w-full" />
                    <button
                      type="button"
                      onClick={handleDeleteCurrent}
                      className="flex items-center space-x-1.5 px-3 py-2 bg-slate-100 hover:bg-rose-100 text-slate-700 hover:text-rose-700 text-xs font-bold rounded-lg transition cursor-pointer"
                      title="Bu cümlenin kaydını sil"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Sil</span>
                    </button>
                  </>
                )}
              </div>

              {hasSavedForCurrent && (
                <p className="inline-flex items-center space-x-1.5 text-[11px] font-semibold text-emerald-700">
                  <Save className="w-3.5 h-3.5" />
                  <span>Bu cümlenin kaydı cihazında saklı</span>
                </p>
              )}

              {/* Kayıtlı cümleler listesi */}
              {savedList.length > 0 && (
                <div className="pt-3 border-t border-slate-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setShowAllRecordings((v) => !v)}
                      className="flex items-center space-x-1.5 text-xs font-bold text-slate-700 hover:text-indigo-700 cursor-pointer"
                    >
                      <ListMusic className="w-3.5 h-3.5" />
                      <span>
                        Kayıtlarım ({savedList.length}) {showAllRecordings ? '▲' : '▼'}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={handleDeleteAll}
                      className="flex items-center space-x-1 text-[11px] font-bold text-slate-500 hover:text-rose-700 cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>Tümünü Sil</span>
                    </button>
                  </div>

                  {showAllRecordings && (
                    <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                      {savedList.map((rec) => {
                        const idx = sentences.findIndex((x) => x.id === rec.sentenceId);
                        return (
                          <div
                            key={rec.key}
                            className="flex items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5"
                          >
                            <button
                              type="button"
                              onClick={() => idx >= 0 && goTo(idx)}
                              className="flex-1 text-left text-[11px] text-slate-700 hover:text-indigo-700 truncate cursor-pointer"
                              title={rec.sentenceText}
                            >
                              {idx >= 0 ? `${idx + 1}. ` : ''}
                              {rec.sentenceText.slice(0, 60)}
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                await deleteRecording(lesson.id, rec.sentenceId);
                                if (current?.id === rec.sentenceId) {
                                  setRecordingUrl((prev) => {
                                    if (prev) URL.revokeObjectURL(prev);
                                    return null;
                                  });
                                  setHasSavedForCurrent(false);
                                }
                                await refreshList();
                              }}
                              className="p-1 text-slate-400 hover:text-rose-600 shrink-0 cursor-pointer"
                              title="Bu kaydı sil"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {recordError && (
                <p className="text-[11px] font-semibold text-rose-800 bg-rose-50 border border-rose-200 rounded px-2.5 py-1.5">
                  {recordError}
                </p>
              )}
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
          <span>3. Katmanı Tamamladım, 4. Katmana Geç</span>
        </button>
      </div>
    </div>
  );
};
