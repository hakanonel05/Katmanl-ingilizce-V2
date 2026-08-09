import React, { useState, useEffect } from 'react';
import { VideoLesson, QuizQuestion } from '../../types';
import { HelpCircle, CheckCircle2, XCircle, Sparkles, CheckCircle, Loader2, Award, AlertCircle } from 'lucide-react';

interface Layer3ComprehensionQuizProps {
  lesson: VideoLesson;
  onCompleteLayer: () => void;
  onUpdateQuizData: (questions: QuizQuestion[]) => void;
}

export const Layer3ComprehensionQuiz: React.FC<Layer3ComprehensionQuizProps> = ({
  lesson,
  onCompleteLayer,
  onUpdateQuizData,
}) => {
  const [userAnswers, setUserAnswers] = useState<{ [questionId: number]: any }>({});
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const quizQuestions = lesson.quizQuestions || [];

  // Auto generate if empty on mount
  useEffect(() => {
    if (quizQuestions.length === 0 && !isGenerating && lesson.sentences?.length > 0) {
      handleGenerateQuiz();
    }
  }, [lesson.id]);

  const handleGenerateQuiz = async () => {
    setIsGenerating(true);
    setErrorMsg('');
    try {
      const fullText = lesson.sentences.map((s) => s.en).join(' ');
      const res = await fetch('/api/generate-quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcriptText: fullText }),
      });
      const data = await res.json();
      if (res.ok && data.questions) {
        onUpdateQuizData(data.questions);
        setIsSubmitted(false);
        setUserAnswers({});
      } else {
        setErrorMsg(data.error || 'Quiz oluşturulamadı.');
      }
    } catch (err: any) {
      console.error('Quiz generation failed', err);
      setErrorMsg('Sunucu bağlantı hatası oluştu. Lütfen tekrar deneyin.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSelectOption = (qId: number, optIdx: number) => {
    if (isSubmitted) return;
    setUserAnswers((prev) => ({ ...prev, [qId]: optIdx }));
  };

  const handleOpenEndedChange = (qId: number, text: string) => {
    if (isSubmitted) return;
    setUserAnswers((prev) => ({ ...prev, [qId]: text }));
  };

  const calculateScore = () => {
    let score = 0;
    quizQuestions.forEach((q) => {
      if (q.type === 'multiple_choice' && userAnswers[q.id] === q.correctOptionIndex) {
        score += 1;
      } else if (q.type === 'open_ended' && userAnswers[q.id]?.trim()?.length > 10) {
        score += 1;
      }
    });
    return score;
  };

  return (
    <div className="space-y-6">
      {/* Intro Header */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center space-x-2.5">
            <span className="px-2.5 py-1 bg-indigo-50 text-indigo-700 border border-indigo-200 text-xs font-bold rounded-md uppercase tracking-wider">
              Layer 4
            </span>
            <h2 className="text-base sm:text-lg font-bold text-slate-900">Anlama Kontrolü (Altyazısız İzleme & Dinleme)</h2>
          </div>

          <button
            onClick={handleGenerateQuiz}
            disabled={isGenerating}
            className="flex items-center space-x-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition shadow-sm cursor-pointer"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Test Hazırlanıyor...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5 text-indigo-200" />
                <span>{quizQuestions.length > 0 ? 'Soruları Yenile' : 'AI Testi Oluştur'}</span>
              </>
            )}
          </button>
        </div>

        <p className="text-xs text-slate-600 leading-relaxed">
          Videoyu altyazısız izledikten ve kulaklıkla dinledikten sonra kavrayışınızı test etmek için 5 soru hazırlanmıştır. 
          Yanıtlarınızı girdikten sonra cevap anahtarını ve analizini inceleyebilirsiniz.
        </p>

        {errorMsg && (
          <div className="flex items-center justify-between bg-rose-50 border border-rose-200 p-3 rounded-lg text-xs text-rose-800">
            <div className="flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
            <button
              onClick={handleGenerateQuiz}
              className="ml-3 px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded text-[11px] font-bold shrink-0 cursor-pointer"
            >
              Tekrar Dene
            </button>
          </div>
        )}

        {isSubmitted && (
          <div className="bg-emerald-50 border border-emerald-200 p-3.5 rounded-lg flex items-center justify-between text-xs text-emerald-900">
            <div className="flex items-center space-x-2 font-semibold">
              <Award className="w-5 h-5 text-emerald-600" />
              <span>Test Sonucu: {calculateScore()} / {quizQuestions.length} Doğru Kavrayış</span>
            </div>
            <button
              onClick={() => setIsSubmitted(false)}
              className="text-xs font-bold text-emerald-700 hover:text-emerald-900 underline cursor-pointer"
            >
              Yeniden Çöz
            </button>
          </div>
        )}
      </div>

      {/* Quiz Questions List */}
      <div className="space-y-4">
        {quizQuestions.length === 0 ? (
          <div className="bg-white border border-slate-200 p-8 rounded-xl text-center space-y-3 shadow-sm">
            <Loader2 className="w-8 h-8 text-indigo-600 animate-spin mx-auto" />
            <h3 className="text-sm font-bold text-slate-800">Anlama Testi Arka Planda Oluşturuluyor...</h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Gemini AI transkript içeriğini analiz ederek 5 özel anlama sorusu hazırlıyor. Birkaç saniye içinde tamamlanacaktır.
            </p>
            <button
              type="button"
              onClick={handleGenerateQuiz}
              disabled={isGenerating}
              className="mt-2 inline-flex items-center space-x-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg transition shadow-sm cursor-pointer disabled:opacity-50"
            >
              <HelpCircle className={`w-3.5 h-3.5 ${isGenerating ? 'animate-spin' : ''}`} />
              <span>Tekrar Soru Üret</span>
            </button>
          </div>
        ) : (
          quizQuestions.map((q, qIdx) => {
            const isMultipleChoice = q.type === 'multiple_choice';
            const isCorrect = isMultipleChoice && userAnswers[q.id] === q.correctOptionIndex;

            return (
              <div
                key={q.id || qIdx}
                className={`bg-white border rounded-xl p-5 space-y-3 transition shadow-sm ${
                  isSubmitted
                    ? isMultipleChoice
                      ? isCorrect
                        ? 'border-emerald-300 bg-emerald-50/30'
                        : 'border-rose-300 bg-rose-50/30'
                      : 'border-slate-200'
                    : 'border-slate-200'
                }`}
              >
                <div className="flex items-start space-x-2">
                  <span className="text-xs font-bold px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
                    Soru {qIdx + 1}
                  </span>
                  <h3 className="text-xs sm:text-sm font-bold text-slate-900 leading-relaxed">
                    {q.question}
                  </h3>
                </div>

                {/* Multiple Choice Options */}
                {isMultipleChoice && q.options && (
                  <div className="space-y-2 pt-1">
                    {q.options.map((opt, optIdx) => {
                      const isSelected = userAnswers[q.id] === optIdx;
                      const isRightOption = q.correctOptionIndex === optIdx;

                      let btnStyle = 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100 hover:border-slate-300';
                      if (isSubmitted) {
                        if (isRightOption) {
                          btnStyle = 'bg-emerald-50 border-emerald-400 text-emerald-900 font-semibold';
                        } else if (isSelected && !isRightOption) {
                          btnStyle = 'bg-rose-50 border-rose-300 text-rose-900';
                        }
                      } else if (isSelected) {
                        btnStyle = 'bg-indigo-50 border-indigo-400 text-indigo-900 font-semibold';
                      }

                      return (
                        <button
                          key={optIdx}
                          onClick={() => handleSelectOption(q.id, optIdx)}
                          className={`w-full text-left p-3 rounded-lg border text-xs transition flex items-center justify-between cursor-pointer ${btnStyle}`}
                        >
                          <span>{opt}</span>
                          {isSubmitted && isRightOption && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
                          {isSubmitted && isSelected && !isRightOption && <XCircle className="w-4 h-4 text-rose-600 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Open Ended Answer Field */}
                {!isMultipleChoice && (
                  <div className="space-y-2 pt-1">
                    <textarea
                      rows={3}
                      value={userAnswers[q.id] || ''}
                      onChange={(e) => handleOpenEndedChange(q.id, e.target.value)}
                      disabled={isSubmitted}
                      placeholder="İngilizce veya Türkçe yanıtınızı yazın..."
                      className="w-full p-3 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    />

                    {isSubmitted && q.sampleAnswerEn && (
                      <div className="bg-indigo-50 p-3 rounded-lg border border-indigo-200 text-xs space-y-1">
                        <strong className="text-indigo-900 block font-bold">Örnek Doğru Yanıt (İngilizce):</strong>
                        <p className="text-slate-800 font-mono text-[11px]">{q.sampleAnswerEn}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Explanation Box on Submit */}
                {isSubmitted && q.explanationTr && (
                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs text-slate-700 space-y-1">
                    <strong className="text-slate-900 block font-bold">Çözüm Analizi:</strong>
                    <p className="text-slate-600 leading-relaxed text-[11px]">{q.explanationTr}</p>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Actions Bar */}
      {quizQuestions.length > 0 && !isSubmitted && (
        <div className="flex justify-end pt-2">
          <button
            onClick={() => setIsSubmitted(true)}
            className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs sm:text-sm rounded-xl transition shadow-sm cursor-pointer"
          >
            Yanıtları Kontrol Et & Analiz Et
          </button>
        </div>
      )}

      {isSubmitted && (
        <div className="flex justify-end pt-2">
          <button
            onClick={onCompleteLayer}
            className="flex items-center space-x-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs sm:text-sm rounded-xl transition shadow-sm cursor-pointer"
          >
            <CheckCircle className="w-4 h-4" />
            <span>4. Katmanı Tamamladım, 5. Katmana Geç</span>
          </button>
        </div>
      )}
    </div>
  );
};
