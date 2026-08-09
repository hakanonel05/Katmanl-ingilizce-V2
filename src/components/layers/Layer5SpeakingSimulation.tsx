import React, { useState, useEffect, useRef } from 'react';
import { VideoLesson } from '../../types';
import { Mic, MicOff, Volume2, Send, Sparkles, CheckCircle, Loader2, Award, RefreshCw, AlertCircle, Repeat, Plus, Minus } from 'lucide-react';

/** Tekrar sayaçları ders bazında saklanır. */
const REPS_STORAGE_KEY = 'layered_learning_speaking_reps_v1';
const REP_TARGET = 15;
const REP_MINIMUM = 10;

interface Layer5SpeakingSimulationProps {
  lesson: VideoLesson;
  onCompleteLayer: () => void;
}

interface ChatTurn {
  step: number;
  coachFeedback?: string;
  coachQuestion: string;
  coachQuestionTr?: string;
  userResponse?: string;
}

export const Layer5SpeakingSimulation: React.FC<Layer5SpeakingSimulationProps> = ({
  lesson,
  onCompleteLayer,
}) => {
  // Sesli anlatım tekrar sayacı: metodoloji 10-15 tekrar öneriyor
  const [repCount, setRepCount] = useState<number>(() => {
    try {
      const raw = localStorage.getItem(REPS_STORAGE_KEY);
      if (raw) return JSON.parse(raw)[lesson.id] || 0;
    } catch (e) {
      console.error('Tekrar sayacı okunamadı:', e);
    }
    return 0;
  });

  useEffect(() => {
    try {
      const raw = localStorage.getItem(REPS_STORAGE_KEY);
      const all = raw ? JSON.parse(raw) : {};
      all[lesson.id] = repCount;
      localStorage.setItem(REPS_STORAGE_KEY, JSON.stringify(all));
    } catch (e) {
      console.error('Tekrar sayacı kaydedilemedi:', e);
    }
  }, [repCount, lesson.id]);

  const [currentStep, setCurrentStep] = useState<number>(1);
  const [history, setHistory] = useState<ChatTurn[]>([]);
  const [userSpeechInput, setUserSpeechInput] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [speakingText, setSpeakingText] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const recognitionRef = useRef<any>(null);

  // Start initial conversation question when component mounts
  useEffect(() => {
    if (history.length === 0) {
      startSimulation();
    }
  }, []);

  const speakText = (text: string) => {
    if ('speechSynthesis' in window) {
      if (speakingText === text && window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
        setSpeakingText(null);
        return;
      }
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-US';
      utterance.rate = 0.9;
      utterance.onstart = () => setSpeakingText(text);
      utterance.onend = () => setSpeakingText(null);
      utterance.onerror = () => setSpeakingText(null);
      window.speechSynthesis.speak(utterance);
    }
  };

  const startSimulation = async () => {
    setIsLoading(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/speaking-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentStep: 1,
          topicContext: lesson.title,
        }),
      });
      const data = await res.json();
      if (res.ok && data.nextQuestion) {
        setHistory([
          {
            step: 1,
            coachQuestion: data.nextQuestion,
            coachQuestionTr: data.nextQuestionTr,
          },
        ]);
        speakText(data.nextQuestion);
      } else {
        setErrorMsg(data.error || 'Konuşma simülasyonu başlatılamadı.');
      }
    } catch (err) {
      console.error('Failed to start speaking simulation', err);
      setErrorMsg('Sunucu bağlantı hatası oluştu.');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleMic = () => {
    if (isListening) {
      if (recognitionRef.current) recognitionRef.current.stop();
      setIsListening(false);
      return;
    }

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert('Tarayıcınız mikrofon ses tanımayı desteklemiyor. Metin yazarak devam edebilirsiniz.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => setIsListening(true);
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setUserSpeechInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
    };
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);

    recognitionRef.current = recognition;
    recognition.start();
  };

  const handleSubmitResponse = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!userSpeechInput.trim() || isLoading) return;

    const speechText = userSpeechInput.trim();
    setUserSpeechInput('');
    setIsLoading(true);
    setErrorMsg('');

    try {
      const currentTurn = history[history.length - 1];
      const res = await fetch('/api/speaking-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentStep,
          userResponse: speechText,
          conversationHistory: history,
          topicContext: lesson.title,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.error || 'Yanıtınız değerlendirilemedi.');
        setUserSpeechInput(speechText);
        return;
      }

      // Update current turn with user response & feedback
      const updatedHistory = [...history];
      updatedHistory[updatedHistory.length - 1].userResponse = speechText;
      if (data.feedback) {
        updatedHistory[updatedHistory.length - 1].coachFeedback = data.feedback;
      }

      if (data.nextQuestion) {
        const nextStepNum = currentStep + 1;
        setCurrentStep(nextStepNum);
        updatedHistory.push({
          step: nextStepNum,
          coachQuestion: data.nextQuestion,
          coachQuestionTr: data.nextQuestionTr,
        });
        speakText(data.nextQuestion);
      } else if (data.isCompleted || data.step === 'completed') {
        setIsCompleted(true);
      }

      setHistory(updatedHistory);
    } catch (err) {
      console.error('Failed to submit speaking response', err);
      setErrorMsg('Sunucu bağlantı hatası oluştu.');
      setUserSpeechInput(speechText);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Intro Header */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-3">
        <div className="flex items-center space-x-2.5">
          <span className="px-2.5 py-1 bg-indigo-50 text-indigo-700 border border-indigo-200 text-xs font-bold rounded-md uppercase tracking-wider">
            Layer 7
          </span>
          <h2 className="text-base sm:text-lg font-bold text-slate-900">Konuşma ve Sesli Anlatım Simülasyonu</h2>
        </div>

        <p className="text-xs text-slate-600 leading-relaxed">
          Gemini AI Dil Koçunuz video konusu üzerinden size <strong className="text-slate-900">sırayla 3 soru</strong> soracak. 
          Her soruyu mikrofonunuzu kullanarak veya yazarak cevaplayabilirsiniz. Koçunuz konuşma dilinizin akıcılığına odaklanacak ve kısa geri bildirimlerle sizi destekleyecektir.
        </p>

        {/* Sesli Anlatım Tekrar Sayacı */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center space-x-2">
              <Repeat className="w-4 h-4 text-amber-600" />
              <h3 className="text-sm font-bold text-amber-950">Sesli Anlatım Tekrarı</h3>
            </div>
            <span className="text-xs font-bold text-amber-900 bg-amber-200/80 px-2.5 py-0.5 rounded-full font-mono">
              {repCount} / {REP_TARGET}
            </span>
          </div>

          <p className="text-[11px] text-amber-900 leading-relaxed">
            Yazdığınız özet ve yorumu kendinize sesli anlatın. Metodoloji
            <strong> {REP_MINIMUM}-{REP_TARGET} tekrar</strong> öneriyor. Dışarıda kulaklıkla
            yürürken biriyle konuşuyormuş gibi pratik yapabilirsiniz. Her tekrardan sonra
            aşağıdaki düğmeye basın.
          </p>

          <div className="w-full bg-amber-200 rounded-full h-2 overflow-hidden">
            <div
              className={`h-2 rounded-full transition-all duration-500 ${
                repCount >= REP_MINIMUM ? 'bg-emerald-500' : 'bg-amber-500'
              }`}
              style={{ width: `${Math.min(100, (repCount / REP_TARGET) * 100)}%` }}
            />
          </div>

          <div className="flex items-center flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setRepCount((c) => c + 1)}
              className="flex items-center space-x-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-lg transition cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Bir Tekrar Yaptım</span>
            </button>

            <button
              type="button"
              onClick={() => setRepCount((c) => Math.max(0, c - 1))}
              disabled={repCount === 0}
              className="flex items-center space-x-1 px-3 py-2 bg-white hover:bg-amber-100 border border-amber-300 text-amber-900 text-xs font-bold rounded-lg transition disabled:opacity-40 cursor-pointer"
              title="Yanlışlıkla arttırdıysanız"
            >
              <Minus className="w-3.5 h-3.5" />
              <span>Geri Al</span>
            </button>

            <button
              type="button"
              onClick={() => setRepCount(0)}
              disabled={repCount === 0}
              className="px-3 py-2 text-[11px] font-bold text-amber-800 hover:text-amber-950 disabled:opacity-40 cursor-pointer"
            >
              Sıfırla
            </button>

            {repCount >= REP_MINIMUM && (
              <span className="inline-flex items-center space-x-1.5 text-[11px] font-bold text-emerald-700">
                <CheckCircle className="w-3.5 h-3.5" />
                <span>
                  {repCount >= REP_TARGET
                    ? 'Hedefi tamamladınız'
                    : `Alt sınırı geçtiniz, ${REP_TARGET}'e kadar devam edebilirsiniz`}
                </span>
              </span>
            )}
          </div>
        </div>

        {/* Step Progress Pills */}
        <div className="flex items-center space-x-2 pt-2 border-t border-slate-100">
          {[1, 2, 3].map((stepNum) => (
            <div
              key={stepNum}
              className={`flex-1 p-2 rounded-lg text-center text-xs font-bold border transition ${
                currentStep === stepNum && !isCompleted
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                  : currentStep > stepNum || isCompleted
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : 'bg-slate-50 text-slate-400 border-slate-200'
              }`}
            >
              Soru {stepNum} / 3
            </div>
          ))}
        </div>

        {errorMsg && (
          <div className="flex items-center justify-between bg-rose-50 border border-rose-200 p-3 rounded-lg text-xs text-rose-800 mt-2">
            <div className="flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
            <button
              onClick={startSimulation}
              className="ml-3 px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded text-[11px] font-bold shrink-0 cursor-pointer"
            >
              Tekrar Yenile
            </button>
          </div>
        )}
      </div>

      {/* Conversation Thread Container */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4 shadow-sm min-h-[300px]">
        {history.map((turn, index) => (
          <div key={index} className="space-y-3">
            {/* Coach Question Bubble */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2 max-w-3xl">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-indigo-700 uppercase tracking-wide flex items-center space-x-1">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Gemini Dil Koçu (Soru {turn.step}):</span>
                </span>
                <button
                  onClick={() => speakText(turn.coachQuestion)}
                  className="p-1.5 text-slate-500 hover:text-indigo-600 transition cursor-pointer"
                  title="Soruyu Sesli Dinle"
                >
                  <Volume2 className="w-4 h-4" />
                </button>
              </div>

              <p className="text-xs sm:text-sm font-bold text-slate-900 leading-relaxed">
                "{turn.coachQuestion}"
              </p>

              {turn.coachQuestionTr && (
                <p className="text-[11px] text-slate-500 italic">
                  İpucu / Türkçe: {turn.coachQuestionTr}
                </p>
              )}
            </div>

            {/* User Response Bubble */}
            {turn.userResponse && (
              <div className="flex justify-end">
                <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-200 text-xs sm:text-sm text-slate-900 max-w-2xl space-y-1">
                  <span className="text-[10px] text-indigo-700 font-bold block uppercase">Yanıtınız:</span>
                  <p className="leading-relaxed font-medium">"{turn.userResponse}"</p>
                </div>
              </div>
            )}

            {/* Coach Feedback for this answer */}
            {turn.coachFeedback && (
              <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-lg text-xs text-emerald-900 leading-relaxed font-medium">
                <strong className="text-emerald-800 block font-bold">Geri Bildirim: </strong>
                {turn.coachFeedback}
              </div>
            )}
          </div>
        ))}

        {isLoading && (
          <div className="flex items-center space-x-2 text-indigo-600 text-xs p-3">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Gemini koçunuz yanıtınızı dinliyor ve hazırlanıyor...</span>
          </div>
        )}
      </div>

      {/* Mic / Text Input Controls */}
      {!isCompleted ? (
        <form onSubmit={handleSubmitResponse} className="bg-white border border-slate-200 p-3 sm:p-4 rounded-xl space-y-3 shadow-sm">
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={toggleMic}
              className={`p-3 rounded-lg border transition flex items-center justify-center cursor-pointer ${
                isListening
                  ? 'bg-rose-600 text-white border-rose-600 animate-pulse'
                  : 'bg-slate-100 hover:bg-slate-200 text-indigo-600 border-slate-200'
              }`}
              title={isListening ? 'Konuşmayı durdur' : 'Mikrofonu açıp İngilizce konuşun'}
            >
              {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </button>

            <input
              type="text"
              value={userSpeechInput}
              onChange={(e) => setUserSpeechInput(e.target.value)}
              placeholder={isListening ? 'Mikrofon dinliyor... İngilizce konuşun...' : 'Sesinizi veya metninizi buraya yazın...'}
              className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-xs sm:text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              disabled={isLoading}
            />

            <button
              type="submit"
              disabled={isLoading || !userSpeechInput.trim()}
              className="px-5 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold text-xs sm:text-sm rounded-lg transition flex items-center space-x-1.5 cursor-pointer shadow-sm"
            >
              <span>Gönder</span>
              <Send className="w-4 h-4" />
            </button>
          </div>
        </form>
      ) : (
        <div className="bg-emerald-50 border border-emerald-200 p-6 rounded-xl text-center space-y-3 shadow-sm">
          <Award className="w-10 h-10 text-emerald-600 mx-auto" />
          <h3 className="text-lg font-bold text-slate-900">Tebrikler! 7. Katman Konuşma Simülasyonunu Tamamladınız!</h3>
          <p className="text-xs text-slate-600 max-w-xl mx-auto">
            3 soruluk karşılıklı konuşma pratiğini başarıyla gerçekleştirdiniz. Kendi kendinize 10-15 kez sesli anlatım tekrarı yapmayı unutmayın!
          </p>
          <div className="pt-2 flex justify-center">
            <button
              onClick={onCompleteLayer}
              className="flex items-center space-x-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs sm:text-sm rounded-xl transition shadow-sm cursor-pointer"
            >
              <CheckCircle className="w-4 h-4" />
              <span>Ders Katmanlarını Tamamla</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
