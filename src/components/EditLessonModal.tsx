import React, { useState, useEffect } from 'react';
import { VideoLesson, SentencePair } from '../types';
import { extractYouTubeId } from '../lib/youtube';
import { X, Save, Sparkles, Plus, Trash2, Edit3, Youtube, FileText, Loader2, Check, AlertCircle } from 'lucide-react';

interface EditLessonModalProps {
  isOpen: boolean;
  lesson: VideoLesson | null;
  onClose: () => void;
  onSaveLesson: (updatedLesson: VideoLesson) => void;
}

export const EditLessonModal: React.FC<EditLessonModalProps> = ({
  isOpen,
  lesson,
  onClose,
  onSaveLesson,
}) => {
  if (!isOpen || !lesson) return null;

  const [activeTab, setActiveTab] = useState<'details' | 'sentences' | 'ai_reanalyze'>('details');
  const [title, setTitle] = useState(lesson.title);
  const [description, setDescription] = useState(lesson.description);
  const [youtubeUrl, setYoutubeUrl] = useState(lesson.youtubeUrl || '');
  const [level, setLevel] = useState<'B1' | 'B2' | 'C1'>(lesson.level || 'B2');
  const [durationMinutes, setDurationMinutes] = useState(lesson.durationMinutes || 8);

  // Sentences state
  const [sentences, setSentences] = useState<SentencePair[]>(lesson.sentences || []);

  // Raw text re-analyze state
  const [rawText, setRawText] = useState(
    lesson.sentences ? lesson.sentences.map((s) => s.en).join(' ') : ''
  );
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiSuccessMsg, setAiSuccessMsg] = useState('');
  const [aiErrorMsg, setAiErrorMsg] = useState('');

  useEffect(() => {
    if (lesson) {
      setTitle(lesson.title);
      setDescription(lesson.description);
      setYoutubeUrl(lesson.youtubeUrl || '');
      setLevel(lesson.level || 'B2');
      setDurationMinutes(lesson.durationMinutes || 8);
      setSentences(lesson.sentences || []);
      setRawText(lesson.sentences ? lesson.sentences.map((s) => s.en).join(' ') : '');
      setAiSuccessMsg('');
      setAiErrorMsg('');
    }
  }, [lesson]);

  // Sentence manipulation
  const handleSentenceChange = (index: number, field: keyof SentencePair, value: string) => {
    setSentences((prev) =>
      prev.map((s, idx) => (idx === index ? { ...s, [field]: value } : s))
    );
  };

  const handleAddSentence = () => {
    const newId = sentences.length > 0 ? Math.max(...sentences.map((s) => s.id)) + 1 : 1;
    const lastTimestamp = sentences.length > 0 ? sentences[sentences.length - 1].timestamp : '00:00';
    setSentences((prev) => [
      ...prev,
      {
        id: newId,
        en: '',
        tr: '',
        timestamp: lastTimestamp || '00:00',
      },
    ]);
  };

  const handleDeleteSentence = (index: number) => {
    setSentences((prev) => prev.filter((_, idx) => idx !== index));
  };

  // AI Re-analyze handler
  const handleAiReanalyze = async () => {
    if (!rawText.trim()) return;
    setIsAnalyzing(true);
    setAiErrorMsg('');
    setAiSuccessMsg('');

    try {
      const res = await fetch('/api/extract-transcript', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoInput: rawText.trim(), youtubeUrl: youtubeUrl.trim() }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Çeviri ve analiz sırasında hata oluştu.');
      }

      if (data.sentences && data.sentences.length > 0) {
        setSentences(data.sentences);
        setAiSuccessMsg(`Başarılı! Gemini AI ${data.sentences.length} cümleyi yeniden çevirdi ve senkronize etti.`);
        setActiveTab('sentences');
      } else {
        throw new Error('Yapay zeka transkript cümlelerini ayrıştıramadı.');
      }
    } catch (err: any) {
      setAiErrorMsg(err.message || 'Yapay zeka analizi başarısız oldu.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const ytId = extractYouTubeId(youtubeUrl);

    const updated: VideoLesson = {
      ...lesson,
      title: title.trim() || 'İsimsiz Çalışma',
      description: description.trim() || 'Açıklama yok.',
      youtubeUrl: youtubeUrl.trim(),
      youtubeId: ytId,
      level,
      durationMinutes: Number(durationMinutes) || 8,
      sentences: sentences.filter((s) => s.en.trim() || s.tr.trim()),
    };

    onSaveLesson(updated);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden my-8 space-y-0 text-slate-900">
        
        {/* Header */}
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-indigo-600/30 text-indigo-400 rounded-lg border border-indigo-500/30">
              <Edit3 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold">Çalışma İçeriğini Düzenle</h3>
              <p className="text-xs text-slate-400 truncate max-w-md">{lesson.title}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg transition hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center space-x-2 border-b border-slate-200 bg-slate-50 px-6 py-2.5">
          <button
            type="button"
            onClick={() => setActiveTab('details')}
            className={`flex items-center space-x-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
              activeTab === 'details'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-200/70'
            }`}
          >
            <Youtube className="w-3.5 h-3.5" />
            <span>Genel Bilgiler & Video</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('sentences')}
            className={`flex items-center space-x-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
              activeTab === 'sentences'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-200/70'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Cümle Cümle Transkript ({sentences.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('ai_reanalyze')}
            className={`flex items-center space-x-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
              activeTab === 'ai_reanalyze'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-amber-100/70 text-amber-900'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>AI ile Ham Metni Yeniden Çevir</span>
          </button>
        </div>

        {/* Modal Form Body */}
        <form onSubmit={handleSave} className="p-6 space-y-5 max-h-[65vh] overflow-y-auto">
          
          {/* TAB 1: GENERAL DETAILS */}
          {activeTab === 'details' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Çalışma / Ders Başlığı:
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  placeholder="Ders başlığını girin..."
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Açıklama:
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  placeholder="Ders hakkında kısa açıklama..."
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  YouTube Video Linki:
                </label>
                <input
                  type="text"
                  value={youtubeUrl}
                  onChange={(e) => setYoutubeUrl(e.target.value)}
                  placeholder="https://www.youtube.com/watch?v=..."
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    İngilizce Seviyesi:
                  </label>
                  <select
                    value={level}
                    onChange={(e) => setLevel(e.target.value as any)}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="B1">B1 Level</option>
                    <option value="B2">B2 Level</option>
                    <option value="C1">C1 Level</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Tahmini Süre (Dakika):
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={120}
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(parseInt(e.target.value, 10) || 5)}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: SENTENCE-BY-SENTENCE TRANSCRIPT EDITING */}
          {activeTab === 'sentences' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-600">
                  Cümleleri, Türkçe çevirilerini veya zaman damgalarını doğrudan düzenleyebilirsiniz:
                </p>
                <button
                  type="button"
                  onClick={handleAddSentence}
                  className="inline-flex items-center space-x-1 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-bold rounded-lg transition cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Yeni Cümle Ekle</span>
                </button>
              </div>

              <div className="space-y-3">
                {sentences.map((s, idx) => (
                  <div key={idx} className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center space-x-2">
                        <span className="text-[10px] font-bold text-slate-400 font-mono">
                          #{idx + 1}
                        </span>
                        <input
                          type="text"
                          value={s.timestamp || '00:00'}
                          onChange={(e) => handleSentenceChange(idx, 'timestamp', e.target.value)}
                          placeholder="00:00"
                          className="w-16 px-2 py-0.5 text-[11px] font-mono bg-white border border-slate-300 rounded text-center text-slate-800"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={() => handleDeleteSentence(idx)}
                        className="p-1 text-slate-400 hover:text-rose-600 rounded transition cursor-pointer"
                        title="Bu cümleyi sil"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="space-y-1.5">
                      <input
                        type="text"
                        value={s.en}
                        onChange={(e) => handleSentenceChange(idx, 'en', e.target.value)}
                        placeholder="İngilizce cümle..."
                        className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-900 focus:outline-none focus:border-indigo-500"
                      />
                      <input
                        type="text"
                        value={s.tr}
                        onChange={(e) => handleSentenceChange(idx, 'tr', e.target.value)}
                        placeholder="Türkçe çeviri..."
                        className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-600 italic focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: AI RAW TEXT RE-ANALYZE */}
          {activeTab === 'ai_reanalyze' && (
            <div className="space-y-4">
              <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl text-xs text-amber-900 space-y-1">
                <strong className="block font-bold">🤖 Gemini AI Yapay Zeka Çevirisi</strong>
                <p className="leading-relaxed">
                  İngilizce konuşma metnini aşağıya tamamen yapıştırın. Yapay zeka tüm metni dilbilgisi kurallarına göre cümlelere böler ve kaliteli Türkçe çevirilerini hazırlayarak transkripti günceller.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Tam İngilizce Transkript / Konuşma Metni:
                </label>
                <textarea
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  rows={8}
                  placeholder="İngilizce transkript metnini buraya yapıştırın..."
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-amber-500"
                  disabled={isAnalyzing}
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleAiReanalyze}
                  disabled={isAnalyzing || !rawText.trim()}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition flex items-center space-x-1.5 cursor-pointer shadow-sm"
                >
                  {isAnalyzing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Metin Analiz Ediliyor...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>Yeniden Çevir ve Cümleleri Oluştur</span>
                    </>
                  )}
                </button>
              </div>

              {aiSuccessMsg && (
                <div className="flex items-center space-x-2 text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 p-3 rounded-lg">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{aiSuccessMsg}</span>
                </div>
              )}

              {aiErrorMsg && (
                <div className="flex items-center space-x-2 text-xs text-rose-800 bg-rose-50 border border-rose-200 p-3 rounded-lg">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{aiErrorMsg}</span>
                </div>
              )}
            </div>
          )}

          {/* Modal Footer Buttons */}
          <div className="pt-4 border-t border-slate-200 flex items-center justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition cursor-pointer"
            >
              İptal
            </button>
            <button
              type="submit"
              className="flex items-center space-x-1.5 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg transition shadow-sm cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>Değişiklikleri Kaydet</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
