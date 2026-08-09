import React, { useState, useEffect } from 'react';
import { VideoLesson, VocabularyItem, GrammarRuleItem } from '../../types';
import { Sparkles, Volume2, BookOpen, CheckCircle, Lightbulb, Loader2, RefreshCw, AlertCircle } from 'lucide-react';

interface Layer2PhoneticsGrammarProps {
  lesson: VideoLesson;
  onCompleteLayer: () => void;
  onUpdateLessonData: (vocabulary: VocabularyItem[], grammarRules: GrammarRuleItem[]) => void;
}

export const Layer2PhoneticsGrammar: React.FC<Layer2PhoneticsGrammarProps> = ({
  lesson,
  onCompleteLayer,
  onUpdateLessonData,
}) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [activeTab, setActiveTab] = useState<'vocab' | 'grammar'>('vocab');
  const [speakingText, setSpeakingText] = useState<string | null>(null);

  const vocabularyList = lesson.vocabulary || [];
  const grammarList = lesson.grammarRules || [];

  // Auto generate if empty on mount
  useEffect(() => {
    if (vocabularyList.length === 0 && grammarList.length === 0 && !isGenerating && lesson.sentences?.length > 0) {
      handleGenerateAnalysis();
    }
  }, [lesson.id]);

  const speakWord = (text: string) => {
    if ('speechSynthesis' in window) {
      if (speakingText === text && window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
        setSpeakingText(null);
        return;
      }
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-US';
      utterance.rate = 0.85;
      utterance.onstart = () => setSpeakingText(text);
      utterance.onend = () => setSpeakingText(null);
      utterance.onerror = () => setSpeakingText(null);
      window.speechSynthesis.speak(utterance);
    }
  };

  const handleGenerateAnalysis = async () => {
    setIsGenerating(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/analyze-phonetics-grammar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcriptSentences: lesson.sentences }),
      });
      const data = await res.json();
      if (res.ok && data.vocabulary && data.grammarRules) {
        onUpdateLessonData(data.vocabulary, data.grammarRules);
      } else {
        setErrorMsg(data.error || 'Fonetik ve gramer analizi oluşturulamadı.');
      }
    } catch (err: any) {
      console.error('Failed to generate analysis', err);
      setErrorMsg('Sunucu bağlantı hatası oluştu. Lütfen tekrar deneyin.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Intro Header */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center space-x-2.5">
            <span className="px-2.5 py-1 bg-indigo-50 text-indigo-700 border border-indigo-200 text-xs font-bold rounded-md uppercase tracking-wider">
              Ekstra
            </span>
            <h2 className="text-base sm:text-lg font-bold text-slate-900">Fonetik ve Gramer Analizi (Genelden Özele)</h2>
          </div>

          <button
            onClick={handleGenerateAnalysis}
            disabled={isGenerating}
            className="flex items-center space-x-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition shadow-sm cursor-pointer"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Analiz Ediliyor...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5 text-indigo-200" />
                <span>{vocabularyList.length > 0 ? 'AI Analizini Yenile' : 'AI Fonetik & Gramer Analizi Yap'}</span>
              </>
            )}
          </button>
        </div>

        <p className="text-xs text-slate-600 leading-relaxed">
          Metindeki B2/C1 seviyesindeki kritik kelimeler, phrasal verb'ler ve telaffuz ipuçları aşağıda listelenmiştir. 
          Gramer öğretiminde <strong className="text-slate-900">"Genelden Özele" (context-driven)</strong> yaklaşım esastır: Karmaşık teorik kurallara girmeden, günlük hayattan 3 somut örnekle açıklanır.
        </p>

        {errorMsg && (
          <div className="flex items-center justify-between bg-rose-50 border border-rose-200 p-3 rounded-lg text-xs text-rose-800">
            <div className="flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
            <button
              onClick={handleGenerateAnalysis}
              className="ml-3 px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded text-[11px] font-bold shrink-0 cursor-pointer"
            >
              Tekrar Dene
            </button>
          </div>
        )}

        {/* Sub Navigation */}
        <div className="flex items-center space-x-2 pt-2 border-t border-slate-100">
          <button
            onClick={() => setActiveTab('vocab')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
              activeTab === 'vocab'
                ? 'bg-slate-900 text-white font-bold'
                : 'bg-slate-100 text-slate-600 hover:text-slate-900'
            }`}
          >
            Kritik Kelimeler & Fonetik ({vocabularyList.length})
          </button>

          <button
            onClick={() => setActiveTab('grammar')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
              activeTab === 'grammar'
                ? 'bg-slate-900 text-white font-bold'
                : 'bg-slate-100 text-slate-600 hover:text-slate-900'
            }`}
          >
            Gramer Yapıları & Örnek Cümleler ({grammarList.length})
          </button>
        </div>
      </div>

      {/* Content Section */}
      {activeTab === 'vocab' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {vocabularyList.length === 0 ? (
            <div className="col-span-1 md:col-span-2 bg-white border border-slate-200 p-8 rounded-xl text-center space-y-3 shadow-sm">
              <Loader2 className="w-8 h-8 text-indigo-600 animate-spin mx-auto" />
              <h3 className="text-sm font-bold text-slate-800">2. Katman Analizi Arka Planda Oluşturuluyor...</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Gemini AI transkriptteki B2/C1 kelimeleri, IPA okunuşlarını ve gramer kurallarını analiz ediyor. Birkaç saniye içinde hazır olur.
              </p>
              <button
                type="button"
                onClick={handleGenerateAnalysis}
                disabled={isGenerating}
                className="mt-2 inline-flex items-center space-x-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg transition shadow-sm cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isGenerating ? 'animate-spin' : ''}`} />
                <span>Tekrar Analiz Et</span>
              </button>
            </div>
          ) : (
            vocabularyList.map((item, idx) => (
              <div
                key={idx}
                className="bg-white border border-slate-200 rounded-xl p-4 space-y-2.5 hover:border-slate-300 transition shadow-sm"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center space-x-2">
                      <h3 className="text-base font-bold text-slate-900">{item.word}</h3>
                      {item.type && (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 font-semibold">
                          {item.type}
                        </span>
                      )}
                    </div>
                    {item.ipa && <p className="text-xs text-indigo-600 font-mono mt-0.5">{item.ipa}</p>}
                  </div>

                  <button
                    onClick={() => speakWord(item.word)}
                    className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition cursor-pointer"
                    title="Sesli Telaffuz Dinle"
                  >
                    <Volume2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-1.5 text-xs">
                  <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-slate-800 font-medium">
                    <span className="text-slate-500 font-normal">Anlam: </span>
                    {item.meaningTr}
                  </div>

                  {item.pronunciationNote && (
                    <div className="text-amber-900 bg-amber-50 border border-amber-200 p-2.5 rounded-lg text-[11px]">
                      <strong className="text-amber-800">Telaffuz İpucu: </strong>
                      {item.pronunciationNote}
                    </div>
                  )}

                  {item.exampleSentence && (
                    <div className="text-slate-500 italic text-[11px] pt-1">
                      "{item.exampleSentence}"
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {grammarList.length === 0 ? (
            <div className="bg-white border border-slate-200 p-8 rounded-xl text-center space-y-3 shadow-sm">
              <Sparkles className="w-8 h-8 text-indigo-600 mx-auto animate-bounce" />
              <p className="text-xs text-slate-600">
                Gramer analizi için butonla Gemini AI koçunuzu tetikleyebilirsiniz.
              </p>
            </div>
          ) : (
            grammarList.map((rule, idx) => (
              <div key={idx} className="bg-white border border-slate-200 rounded-xl p-5 space-y-3 shadow-sm">
                <div className="flex items-center space-x-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-indigo-600" />
                  <h3 className="text-sm sm:text-base font-bold text-slate-900">{rule.topic}</h3>
                </div>

                <p className="text-xs text-slate-700 leading-relaxed bg-indigo-50/50 p-3 rounded-lg border border-indigo-100">
                  {rule.explanationTr}
                </p>

                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    İlgili Örnek Cümleler & Metin İçi Kullanımlar ({rule.examples?.length || 0} Adet):
                  </h4>
                  <div className="space-y-2">
                    {rule.examples.map((ex, eIdx) => (
                      <div
                        key={eIdx}
                        className="bg-slate-50 p-3.5 rounded-lg border border-slate-200 text-sm space-y-1.5"
                      >
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-center">
                          <div className="flex items-center justify-between text-slate-900 font-bold text-sm sm:text-base">
                            <span>{eIdx + 1}. {ex.en}</span>
                            <button
                              onClick={() => speakWord(ex.en)}
                              className="p-1 text-slate-500 hover:text-indigo-600 transition cursor-pointer shrink-0 ml-2"
                              title="Sesli Dinle"
                            >
                              <Volume2 className="w-4 h-4" />
                            </button>
                          </div>
                          <p className="text-slate-700 font-medium text-xs sm:text-sm border-t md:border-t-0 md:border-l border-slate-200 pt-1 md:pt-0 md:pl-3">
                            {ex.tr}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Layer Completion CTA */}
      <div className="flex justify-end pt-2">
        <button
          onClick={onCompleteLayer}
          className="flex items-center space-x-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs sm:text-sm rounded-xl transition shadow-sm cursor-pointer"
        >
          <CheckCircle className="w-4 h-4" />
          <span>Ekstra Çalışmayı Tamamladım</span>
        </button>
      </div>
    </div>
  );
};
