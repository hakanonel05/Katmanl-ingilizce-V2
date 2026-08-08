import React, { useState } from 'react';
import { VideoLesson } from '../types';
import { Youtube, Sparkles, Plus, Loader2, Play, CheckCircle2, Clock, BarChart2, Trash2, FileText, Edit3, RefreshCw } from 'lucide-react';

interface LessonSelectorProps {
  lessons: VideoLesson[];
  activeLesson?: VideoLesson | null;
  onSelectLesson: (lesson: VideoLesson) => void;
  onImportCustomLesson: (
    input: string,
    youtubeUrl?: string,
    onProgress?: (message: string) => void
  ) => Promise<void>;
  onDeleteLesson?: (lessonId: string) => void;
  onEditLesson?: (lesson: VideoLesson) => void;
  onRestorePresetLessons?: () => void;
}

export const LessonSelector: React.FC<LessonSelectorProps> = ({
  lessons,
  activeLesson,
  onSelectLesson,
  onImportCustomLesson,
  onDeleteLesson,
  onEditLesson,
  onRestorePresetLessons,
}) => {
  const [inputMode, setInputMode] = useState<'youtube' | 'text'>('youtube');
  const [youtubeInput, setYoutubeInput] = useState('');
  const [manualYoutubeUrl, setManualYoutubeUrl] = useState('');
  const [textInput, setTextInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [progressMsg, setProgressMsg] = useState('');
  const [showImportForm, setShowImportForm] = useState(false);

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (inputMode === 'youtube') {
      if (!youtubeInput.trim()) return;
      setIsLoading(true);
      setErrorMsg('');
      setProgressMsg('Başlatılıyor...');
      try {
        await onImportCustomLesson(youtubeInput.trim(), undefined, setProgressMsg);
        setYoutubeInput('');
        setShowImportForm(false);
      } catch (err: any) {
        setErrorMsg(err.message || 'Video işlenirken hata oluştu.');
      } finally {
        setIsLoading(false);
        setProgressMsg('');
      }
    } else {
      if (!textInput.trim()) return;
      setIsLoading(true);
      setErrorMsg('');
      setProgressMsg('Başlatılıyor...');
      try {
        await onImportCustomLesson(
          textInput.trim(),
          manualYoutubeUrl.trim() || youtubeInput.trim(),
          setProgressMsg
        );
        setTextInput('');
        setManualYoutubeUrl('');
        setYoutubeInput('');
        setShowImportForm(false);
      } catch (err: any) {
        setErrorMsg(err.message || 'Metin işlenirken hata oluştu.');
      } finally {
        setIsLoading(false);
        setProgressMsg('');
      }
    }
  };

  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);

  const handleDeleteClick = (e: React.MouseEvent, lessonId: string) => {
    e.stopPropagation();
    setConfirmingDeleteId(lessonId);
  };

  const handleConfirmDelete = (e: React.MouseEvent, lessonId: string) => {
    e.stopPropagation();
    if (onDeleteLesson) {
      onDeleteLesson(lessonId);
    }
    setConfirmingDeleteId(null);
  };

  const handleCancelDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmingDeleteId(null);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-sm space-y-4">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 bg-red-50 text-red-600 rounded-lg flex items-center justify-center border border-red-100">
            <Youtube className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm sm:text-base font-bold text-slate-900">Çalışma İçeriği Seçimi</h2>
            <p className="text-[11px] text-slate-500">{lessons.length} Ders Hazır Transkript</p>
          </div>
        </div>

        <button
          onClick={() => setShowImportForm(!showImportForm)}
          className="flex items-center space-x-1.5 px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>{showImportForm ? 'Formu Kapat' : 'Yeni YouTube Videosu / Metin Ekle'}</span>
        </button>
      </div>

      {/* Import Custom Video Form */}
      {showImportForm && (
        <form onSubmit={handleImport} className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
          {/* Tabs: Youtube vs Manual Text */}
          <div className="flex items-center space-x-2 border-b border-slate-200 pb-2">
            <button
              type="button"
              onClick={() => { setInputMode('youtube'); setErrorMsg(''); }}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                inputMode === 'youtube'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Youtube className="w-3.5 h-3.5" />
              <span>YouTube Linki ile Ekle</span>
            </button>

            <button
              type="button"
              onClick={() => { setInputMode('text'); setErrorMsg(''); }}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                inputMode === 'text'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>İngilizce Metin / Transkript Yapıştır</span>
            </button>
          </div>

          {inputMode === 'youtube' ? (
            <div className="space-y-2">
              <p className="text-[11px] text-slate-600">
                YouTube video linkini yapıştırın. Sistem videonun <strong>resmi/otomatik İngilizce altyazısını (CC)</strong> çeker ve Gemini AI ile cümle cümle çevirerek Katmanlı Çalışma formatına getirir.
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={youtubeInput}
                  onChange={(e) => setYoutubeInput(e.target.value)}
                  placeholder="Örn: https://www.youtube.com/watch?v=1bszFX_XcbU"
                  className="flex-1 px-3.5 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  disabled={isLoading}
                />
                <button
                  type="submit"
                  disabled={isLoading || !youtubeInput.trim()}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition flex items-center justify-center space-x-1.5 cursor-pointer shadow-sm"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>{progressMsg || 'Altyazılar Çekiliyor...'}</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>Transkript Çıkar</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-[11px] text-slate-600">
                Altyazısı çekilemeyen videolar veya herhangi bir İngilizce konuşma metnini doğrudan yapıştırın. Videoyu derse gömmek için YouTube linkini de ekleyebilirsiniz.
              </p>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  YouTube Video Linki (İsteğe Bağlı - Videoyu Gömmek İçin):
                </label>
                <input
                  type="text"
                  value={manualYoutubeUrl}
                  onChange={(e) => setManualYoutubeUrl(e.target.value)}
                  placeholder="Örn: https://www.youtube.com/watch?v=1bszFX_XcbU"
                  className="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  disabled={isLoading}
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  İngilizce Metin / Transkript (Zorunlu):
                </label>
                <textarea
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  placeholder="İngilizce transkript veya konuşma metnini buraya yapıştırın..."
                  rows={4}
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  disabled={isLoading}
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={isLoading || !textInput.trim()}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition flex items-center justify-center space-x-1.5 cursor-pointer shadow-sm"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>{progressMsg || 'Metin İşleniyor...'}</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>Ders Oluştur</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {errorMsg && (
            <div className="text-xs text-rose-800 bg-rose-50 border border-rose-200 p-3 rounded-lg space-y-1">
              <strong className="block font-bold">İşlem Başarısız:</strong>
              <p>{errorMsg}</p>
            </div>
          )}
        </form>
      )}

      {/* Preset & Custom Lesson Cards */}
      {lessons.length === 0 ? (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 text-center space-y-3">
          <p className="text-xs text-slate-600 font-medium">
            Henüz eklenmiş bir çalışma dersi bulunmuyor.
          </p>
          {onRestorePresetLessons && (
            <button
              type="button"
              onClick={onRestorePresetLessons}
              className="inline-flex items-center space-x-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition shadow-sm cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Varsayılan Örnek Dersleri Yükle</span>
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {lessons.map((lesson) => {
            const isSelected = activeLesson ? lesson.id === activeLesson.id : false;
            return (
              <div
                key={lesson.id}
                onClick={() => onSelectLesson(lesson)}
                className={`group relative p-4 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                  isSelected
                    ? 'bg-indigo-50/50 border-indigo-500 ring-1 ring-indigo-500 shadow-sm'
                    : 'bg-white border-slate-200 hover:bg-slate-50 hover:border-slate-300'
                }`}
              >
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                      lesson.level === 'C1' ? 'bg-purple-100 text-purple-800 border border-purple-200' : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                    }`}>
                      {lesson.level} Level
                    </span>

                    <div className="flex items-center space-x-2">
                      <span className="text-[11px] text-slate-500 flex items-center space-x-1">
                        <Clock className="w-3 h-3 text-slate-400" />
                        <span>~{lesson.durationMinutes} min</span>
                      </span>

                      {onEditLesson && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onEditLesson(lesson);
                          }}
                          className="p-1 text-slate-400 hover:text-indigo-600 rounded transition cursor-pointer opacity-80 hover:opacity-100"
                          title="Bu çalışmayı düzenle"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {onDeleteLesson && (
                        confirmingDeleteId === lesson.id ? (
                          <div className="flex items-center space-x-1 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded text-[10px]">
                            <span className="text-rose-700 font-bold">Silinsin mi?</span>
                            <button
                              type="button"
                              onClick={(e) => handleConfirmDelete(e, lesson.id)}
                              className="px-1.5 py-0.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded cursor-pointer"
                            >
                              Evet
                            </button>
                            <button
                              type="button"
                              onClick={handleCancelDelete}
                              className="px-1.5 py-0.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-medium rounded cursor-pointer"
                            >
                              İptal
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => handleDeleteClick(e, lesson.id)}
                            className="p-1 text-slate-400 hover:text-rose-600 rounded transition cursor-pointer opacity-80 hover:opacity-100"
                            title="Bu dersi sil"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )
                      )}
                    </div>
                  </div>

                  <h3 className={`text-xs sm:text-sm font-bold line-clamp-2 ${isSelected ? 'text-indigo-900' : 'text-slate-800 group-hover:text-slate-900'}`}>
                    {lesson.title}
                  </h3>
                  <p className="text-[11px] text-slate-500 line-clamp-2 leading-relaxed">
                    {lesson.description}
                  </p>
                </div>

                <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs">
                  <div className="flex items-center space-x-1 text-slate-500">
                    <BarChart2 className="w-3.5 h-3.5 text-indigo-500" />
                    <span>{lesson.sentences.length} Cümle</span>
                  </div>

                  {isSelected ? (
                    <span className="flex items-center space-x-1 text-indigo-700 font-bold text-xs">
                      <CheckCircle2 className="w-4 h-4 text-indigo-600" />
                      <span>Aktif Ders</span>
                    </span>
                  ) : (
                    <span className="flex items-center space-x-1 text-slate-500 group-hover:text-indigo-600 text-xs font-semibold">
                      <Play className="w-3.5 h-3.5" />
                      <span>Seç ve Çalış</span>
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
