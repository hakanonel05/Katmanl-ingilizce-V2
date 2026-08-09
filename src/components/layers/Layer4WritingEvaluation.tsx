import React, { useState } from 'react';
import { VideoLesson, WritingEvaluationResult } from '../../types';
import { Edit3, Sparkles, CheckCircle, Loader2, Lightbulb, AlertCircle, MessageSquareQuote, Check } from 'lucide-react';

interface Layer4WritingEvaluationProps {
  lesson: VideoLesson;
  onCompleteLayer: () => void;
  onSaveWriting: (summary: string, comment: string) => void;
}

export const Layer4WritingEvaluation: React.FC<Layer4WritingEvaluationProps> = ({
  lesson,
  onCompleteLayer,
  onSaveWriting,
}) => {
  const [summaryText, setSummaryText] = useState(lesson.userSummary || '');
  const [commentText, setCommentText] = useState(lesson.userComment || '');
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [evaluationResult, setEvaluationResult] = useState<WritingEvaluationResult | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const handleEvaluate = async (e: React.FormEvent) => {
    e.preventDefault();
    const combinedText = `${summaryText.trim()}\n\n${commentText.trim()}`.trim();
    if (!combinedText) {
      setErrorMsg('Lütfen önce İngilizce özetiniz veya yorumunuzu yazın.');
      return;
    }

    setIsEvaluating(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/evaluate-writing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userText: combinedText,
          topicContext: lesson.title,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setEvaluationResult(data);
        onSaveWriting(summaryText, commentText);
      } else {
        setErrorMsg(data.error || 'Yazı değerlendirilemedi.');
      }
    } catch (err: any) {
      setErrorMsg('Sunucu bağlantı hatası oluştu.');
    } finally {
      setIsEvaluating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Intro Header */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-3">
        <div className="flex items-center space-x-2.5">
          <span className="px-2.5 py-1 bg-indigo-50 text-indigo-700 border border-indigo-200 text-xs font-bold rounded-md uppercase tracking-wider">
            Layer 6
          </span>
          <h2 className="text-base sm:text-lg font-bold text-slate-900">İngilizce Özet ve Yorum Değerlendirmesi</h2>
        </div>

        <p className="text-xs text-slate-600 leading-relaxed">
          İzlediğiniz ve dinlediğiniz videodan aklınızda kalanları <strong className="text-slate-900">çeviri yapmadan direkt İngilizce yazın</strong>. 
          Bilinmeyen kelime geldiğinde durmayın, Türkçe yazıp fikir akışını kesmeden devam edin.
        </p>

        <div className="bg-indigo-50/60 border border-indigo-100 p-3.5 rounded-lg text-xs text-slate-700 space-y-1">
          <div className="flex items-center space-x-1.5 font-bold text-indigo-900">
            <Lightbulb className="w-4 h-4 text-indigo-600 shrink-0" />
            <span>Yazma Kuralları (Katmanlı Çalışma Metodu):</span>
          </div>
          <ul className="list-disc list-inside space-y-0.5 text-slate-600 pl-1 text-[11px]">
            <li>Basit cümlelerden çekinmeyin — nitelik değil, nicelik önemlidir.</li>
            <li>1. Kısım: Videonun İngilizce Özeti (Summary)</li>
            <li>2. Kısım: Konu hakkındaki kişisel İngilizce Yorumunuz (Commentary - Bağlam Kurma)</li>
          </ul>
        </div>
      </div>

      {/* Writing Inputs */}
      <form onSubmit={handleEvaluate} className="space-y-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 shadow-sm">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-900 flex items-center justify-between">
              <span>1. İngilizce Özetiniz (Summary)</span>
              <span className="text-[11px] text-slate-500 font-normal">1-2 Paragraf</span>
            </label>
            <textarea
              rows={4}
              value={summaryText}
              onChange={(e) => setSummaryText(e.target.value)}
              placeholder="In this video, the speaker explains layered learning which develops multiple language skills..."
              className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-lg text-xs sm:text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 leading-relaxed font-sans"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-900 flex items-center justify-between">
              <span>2. İngilizce Yorumunuz (Commentary & Personal Context)</span>
              <span className="text-[11px] text-slate-500 font-normal">Katılıyor musunuz? Kendi hayatınızla bağ kurun.</span>
            </label>
            <textarea
              rows={3}
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="In my opinion, this method is very useful for adult learners because it connects grammar with real life..."
              className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-lg text-xs sm:text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 leading-relaxed font-sans"
            />
          </div>

          {errorMsg && (
            <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 p-3 rounded-lg flex items-center space-x-1.5 font-medium">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{errorMsg}</span>
            </p>
          )}

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={isEvaluating}
              className="flex items-center space-x-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold text-xs sm:text-sm rounded-xl transition shadow-sm cursor-pointer"
            >
              {isEvaluating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Gemini Koçu İnceliyor...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-indigo-200" />
                  <span>Özet & Yorumu Değerlendir</span>
                </>
              )}
            </button>
          </div>
        </div>
      </form>

      {/* Evaluation Feedback Results */}
      {evaluationResult && (
        <div className="space-y-5 animate-fade-in">
          {/* General Encouragement */}
          <div className="bg-white border border-emerald-200 rounded-xl p-5 space-y-2 shadow-sm">
            <h3 className="text-sm font-bold text-emerald-800 flex items-center space-x-2">
              <MessageSquareQuote className="w-5 h-5 text-emerald-600" />
              <span>Gemini Dil Koçu Genel Değerlendirmesi</span>
            </h3>
            <p className="text-xs text-slate-700 leading-relaxed bg-emerald-50/50 p-3.5 rounded-lg border border-emerald-100 font-medium">
              {evaluationResult.generalFeedback}
            </p>
          </div>

          {/* Grammar & Vocabulary Corrections */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3 shadow-sm">
            <h3 className="text-sm font-bold text-slate-900 flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 text-indigo-600" />
              <span>1. Gramer & Kelime Düzeltmeleri ({evaluationResult.grammarCorrections.length})</span>
            </h3>

            {evaluationResult.grammarCorrections.length === 0 ? (
              <p className="text-xs text-emerald-800 bg-emerald-50 p-3 rounded-lg border border-emerald-200 font-medium">
                Harika! Metninizde kritik gramer hatasına rastlanmadı.
              </p>
            ) : (
              <div className="space-y-3">
                {evaluationResult.grammarCorrections.map((corr, idx) => (
                  <div key={idx} className="bg-slate-50 p-3.5 rounded-lg border border-slate-200 text-xs space-y-2">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div className="text-rose-900 bg-rose-50 p-2.5 rounded-lg border border-rose-200">
                        <span className="text-[10px] text-rose-700 font-bold block uppercase">Orijinal İfade:</span>
                        <span>"{corr.original}"</span>
                      </div>
                      <div className="text-emerald-900 bg-emerald-50 p-2.5 rounded-lg border border-emerald-200">
                        <span className="text-[10px] text-emerald-700 font-bold block uppercase">Doğru Kullanım:</span>
                        <span>"{corr.corrected}"</span>
                      </div>
                    </div>
                    <p className="text-slate-700 text-[11px] bg-white p-2.5 rounded-lg border border-slate-200">
                      <strong className="text-indigo-900">Neden Değiştirildi? </strong> {corr.explanationTr}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Natural Phrasing Suggestions */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3 shadow-sm">
            <h3 className="text-sm font-bold text-slate-900 flex items-center space-x-2">
              <Sparkles className="w-4 h-4 text-indigo-600" />
              <span>2. Ana Dili İngilizce Olan Biri Gibi İfade (Natural Phrasing - Native Suggestions)</span>
            </h3>

            <div className="space-y-3">
              {evaluationResult.naturalPhrasing.map((sug, idx) => (
                <div key={idx} className="bg-slate-50 p-3.5 rounded-lg border border-slate-200 text-xs space-y-2">
                  <div className="text-slate-700">
                    <span className="text-slate-500 text-[10px] block font-semibold">Cümleniz:</span>
                    <span>"{sug.original}"</span>
                  </div>
                  <div className="text-indigo-900 bg-indigo-50 p-2.5 rounded-lg border border-indigo-200">
                    <span className="text-[10px] text-indigo-700 font-bold block uppercase">Daha Doğal Alternatif (Native Speaker):</span>
                    <span className="font-semibold text-sm">"{sug.nativeSuggestion}"</span>
                  </div>
                  <p className="text-slate-600 text-[11px]">{sug.whyBetterTr}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Layer Completion */}
          <div className="flex justify-end pt-2">
            <button
              onClick={onCompleteLayer}
              className="flex items-center space-x-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs sm:text-sm rounded-xl transition shadow-sm cursor-pointer"
            >
              <CheckCircle className="w-4 h-4" />
              <span>6. Katmanı Tamamladım, 7. Katmana Geç</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
