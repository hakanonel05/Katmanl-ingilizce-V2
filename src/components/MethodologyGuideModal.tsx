import React from 'react';
import { X, CheckCircle2, ArrowRight, Layers, Lightbulb, BookOpen, Mic, Ear, Eye, Edit3, Target } from 'lucide-react';

interface MethodologyGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const MethodologyGuideModal: React.FC<MethodologyGuideModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-xl text-slate-800 p-6 md:p-8 space-y-6 my-8">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 pb-4">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-indigo-50 text-indigo-700 rounded-xl border border-indigo-200">
              <Layers className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900">Katmanlı Çalışma Yöntem Rehberi</h2>
              <p className="text-xs text-indigo-600 font-semibold">Bütüncül İngilizce Öğrenme Sistemi</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Why Katmanlı Çalışma */}
        <div className="bg-indigo-50/60 p-5 rounded-xl border border-indigo-100">
          <div className="flex items-start space-x-3">
            <Lightbulb className="w-6 h-6 text-indigo-600 shrink-0 mt-1" />
            <div className="space-y-1 text-sm">
              <h3 className="font-bold text-indigo-950">Neden Katmanlı Çalışma?</h3>
              <p className="text-slate-700 leading-relaxed text-xs sm:text-sm">
                Geleneksel gramer kitaplarına en baştan başlamak veya boşluk doldurma egzersizleri yapmak yorucu ve verimsizdir. 
                <strong className="text-slate-900"> Katmanlı Çalışma</strong>, tek bir video içerik üzerinden okuma, dinleme, yazma ve konuşma becerilerini kapalı devre bir sistemde geliştirir.
              </p>
            </div>
          </div>
        </div>

        {/* 7 Layers Infographic Grid */}
        <div className="space-y-4">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">7 Temel Öğrenme Katmanı</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-1.5">
              <div className="flex items-center space-x-2 text-indigo-700 font-bold text-xs uppercase tracking-wide">
                <BookOpen className="w-4 h-4" />
                <span>1. KATMAN: Çift Dilli Okuma</span>
              </div>
              <p className="text-xs text-slate-600">
                Sol kolonda İngilizce, sağ kolonda Türkçe cümleler yer alır. Kelime ezberlemek için değil, cümle içindeki anlam ağlarını zihinde oturtmak için okuyun.
              </p>
            </div>

            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-1.5">
              <div className="flex items-center space-x-2 text-indigo-700 font-bold text-xs uppercase tracking-wide">
                <Ear className="w-4 h-4" />
                <span>2. KATMAN: Aktif Dinleme</span>
              </div>
              <p className="text-xs text-slate-600">
                Video oynatılırken metni gözlerinizle takip edin. Bu çalışma fonetik bilginizi ve kelimelerin ses karşılıklarını zihninize yükler.
              </p>
            </div>

            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-1.5">
              <div className="flex items-center space-x-2 text-indigo-700 font-bold text-xs uppercase tracking-wide">
                <Mic className="w-4 h-4" />
                <span>3. KATMAN: Sesli Okuma (Gölgeleme)</span>
              </div>
              <p className="text-xs text-slate-600">
                Videoyu tekrar açıp konuşmacıyla birlikte sesli okuyun. Dil bir kas grubudur; sesli okuma dil kaslarınızı esnetir ve "ıhlamaları" azaltır.
              </p>
            </div>

            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-1.5">
              <div className="flex items-center space-x-2 text-indigo-700 font-bold text-xs uppercase tracking-wide">
                <Eye className="w-4 h-4" />
                <span>4. KATMAN: Altyazısız İzleme</span>
              </div>
              <p className="text-xs text-slate-600">
                Altyazıyı tamamen kapatın ve videoyu izleyin. %100 anlamak zorunda değilsiniz; başlangıçta %60-70 yakalamak yeterlidir.
              </p>
            </div>

            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-1.5">
              <div className="flex items-center space-x-2 text-indigo-700 font-bold text-xs uppercase tracking-wide">
                <Ear className="w-4 h-4" />
                <span>5. KATMAN: Sadece Dinleme</span>
              </div>
              <p className="text-xs text-slate-600">
                Videoyu görsel, jest ve slayt desteği olmadan sadece kulaklıkla ses modunda dinleyin. Beynin doğrudan sese odaklanmasını sağlar.
              </p>
            </div>

            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-1.5">
              <div className="flex items-center space-x-2 text-indigo-700 font-bold text-xs uppercase tracking-wide">
                <Edit3 className="w-4 h-4" />
                <span>6. KATMAN: Özet ve Yorum Yazma</span>
              </div>
              <p className="text-xs text-slate-600">
                Aklınızda kalanı çeviri yapmadan direkt İngilizce yazın. Ardından kendi yorumunuzu ekleyin. Bilgiyi kendi hayat bağlamınıza çeker.
              </p>
            </div>

            <div className="bg-indigo-50/50 p-4 rounded-xl text-indigo-950 border border-indigo-200 col-span-1 md:col-span-2 space-y-1.5">
              <div className="flex items-center space-x-2 font-bold text-xs uppercase tracking-wide text-indigo-700">
                <Mic className="w-4 h-4" />
                <span>7. KATMAN: Sesli Anlatım ve Konuşma</span>
              </div>
              <p className="text-xs text-slate-700">
                Yazdığınız özet ve yorumu birkaç kez okuyun, ardından kendi kendinize sesli anlatın (10-15 kez tekrarlamaktan çekinmeyin). 
                Dışarıda kulaklıkla yürürken biriyle konuşuyormuş gibi pratik yapabilirsiniz.
              </p>
            </div>

          </div>
        </div>

        {/* General-to-Specific Grammar Principles */}
        <div className="bg-slate-50 border border-slate-200 p-5 rounded-xl space-y-3">
          <h3 className="text-sm font-bold text-slate-900 flex items-center space-x-2">
            <Target className="w-4 h-4 text-indigo-600" />
            <span>Gramer Yaklaşımı: "Genelden Özele" (Context-Driven)</span>
          </h3>
          <ul className="text-xs text-slate-600 space-y-2 list-disc list-inside leading-relaxed">
            <li><strong className="text-slate-800">Yanlış Yaklaşım (Özelden Genele):</strong> Gramer kitabını baştan sona çalışmak. 20. konuya gelince 9. konu unutulur.</li>
            <li><strong className="text-slate-800">Doğru Yaklaşım (Genelden Özele):</strong> Metni okurken veya yazarken eksiğinizi fark edin, o an sadece ilgili kuralı çalışın.</li>
            <li>Önce pratik yapılır, ardından eksik gramer puzzle gibi tespit edilip tamamlanır.</li>
          </ul>
        </div>

        {/* Process Planning */}
        <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-xl text-xs text-slate-800 flex items-center justify-between flex-wrap gap-3">
          <div>
            <strong className="text-emerald-800 block font-bold text-sm">Somut İlerleme Hedefi: 20 Video</strong>
            <span className="text-slate-600">7 katmanı tek günde yapmak zorunda değilsiniz. Her katmanı ayrı bir güne yayabilir, 7 katmanı 7-10 günde tamamlayabilirsiniz.</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg transition text-xs cursor-pointer ml-auto shadow-sm"
          >
            Anladım, Çalışmaya Başla
          </button>
        </div>

      </div>
    </div>
  );
};
