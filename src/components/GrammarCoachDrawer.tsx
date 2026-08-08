import React, { useState } from 'react';
import { X, Sparkles, Send, Loader2, BookOpen, Lightbulb } from 'lucide-react';

interface GrammarCoachDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  activeLessonTitle?: string;
}

export const GrammarCoachDrawer: React.FC<GrammarCoachDrawerProps> = ({
  isOpen,
  onClose,
  activeLessonTitle,
}) => {
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; text: string }[]>([
    {
      role: 'assistant',
      text: 'Merhaba! Ben "Genelden Özele" Gramer Koçunuz. Aklınıza takılan gramer yapısını veya cümleyi bana sorun. Karmaşık kurallar olmadan, günlük hayattan 3 örnekle açıklayayım!',
    },
  ]);
  const [isLoading, setIsLoading] = useState(false);

  if (!isOpen) return null;

  const handleAsk = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim() || isLoading) return;

    const userQ = question.trim();
    setQuestion('');
    setMessages((prev) => [...prev, { role: 'user', text: userQ }]);
    setIsLoading(true);

    try {
      const res = await fetch('/api/ask-grammar-coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: userQ,
          context: activeLessonTitle || '',
        }),
      });
      const data = await res.json();
      if (res.ok && data.answer) {
        setMessages((prev) => [...prev, { role: 'assistant', text: data.answer }]);
      } else {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', text: data.error || 'Üzgünüm, şu an yanıt verilemedi. Lütfen tekrar deneyin.' },
        ]);
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', text: 'Sunucu bağlantı hatası oluştu. Lütfen tekrar deneyin.' },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white border-l border-slate-200 w-full max-w-md h-full flex flex-col shadow-2xl text-slate-800">
        
        {/* Drawer Header */}
        <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-indigo-50 text-indigo-700 rounded-lg border border-indigo-200">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Genelden Özele Gramer Koçu</h3>
              <p className="text-[11px] text-slate-500 font-medium">Context-Driven Grammar Assistant</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Message Thread */}
        <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-slate-50/50">
          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`p-3.5 rounded-xl text-xs leading-relaxed space-y-1 ${
                msg.role === 'user'
                  ? 'bg-indigo-600 text-white font-medium ml-8 shadow-sm'
                  : 'bg-white text-slate-800 border border-slate-200 shadow-sm mr-4'
              }`}
            >
              <div className={`flex items-center space-x-1 font-bold text-[10px] ${msg.role === 'user' ? 'text-indigo-100' : 'text-indigo-700'}`}>
                {msg.role === 'user' ? 'Siz' : 'Gemini Gramer Koçu'}
              </div>
              <p className="whitespace-pre-line">{msg.text}</p>
            </div>
          ))}

          {isLoading && (
            <div className="flex items-center space-x-2 text-indigo-600 text-xs p-3">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Gramer kuralı bağlam içinde inceleniyor...</span>
            </div>
          )}
        </div>

        {/* Question Form */}
        <form onSubmit={handleAsk} className="p-3 border-t border-slate-200 bg-white flex space-x-2">
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Örn: 'Would' ne zaman kullanılır? veya 'Relative clauses' yapısı nedir?"
            className="flex-1 px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !question.trim()}
            className="p-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg transition cursor-pointer shadow-sm"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>

      </div>
    </div>
  );
};
