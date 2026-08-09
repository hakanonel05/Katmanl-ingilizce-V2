import React from 'react';
import { BookOpen, Sparkles, HelpCircle, Edit3, Mic, CheckCircle2, Award, Ear, Volume2, EyeOff, Headphones, Layers } from 'lucide-react';

export interface LayerTab {
  id: number;
  label: string;
  subLabel: string;
  icon: React.ReactNode;
}

interface LayerNavigationProps {
  activeLayer: number;
  onSelectLayer: (layerId: number) => void;
  completedLayers: number[];
}

export const LAYER_TABS: LayerTab[] = [
  {
    id: 1,
    label: '1. Çift Dilli Okuma',
    subLabel: 'Anlam Ağlarını Oturtma',
    icon: <BookOpen className="w-4 h-4" />
  },
  {
    id: 2,
    label: '2. Aktif Dinleme',
    subLabel: 'Sesi Yazıyla Eşleştirme',
    icon: <Ear className="w-4 h-4" />
  },
  {
    id: 3,
    label: '3. Sesli Okuma',
    subLabel: 'Gölgeleme (Shadowing)',
    icon: <Volume2 className="w-4 h-4" />
  },
  {
    id: 4,
    label: '4. Altyazısız İzleme',
    subLabel: 'Anlama Kontrolü',
    icon: <EyeOff className="w-4 h-4" />
  },
  {
    id: 5,
    label: '5. Sadece Dinleme',
    subLabel: 'Görselsiz Ses Modu',
    icon: <Headphones className="w-4 h-4" />
  },
  {
    id: 6,
    label: '6. Özet & Yorum',
    subLabel: 'İngilizce Yazma',
    icon: <Edit3 className="w-4 h-4" />
  },
  {
    id: 7,
    label: '7. Sesli Anlatım',
    subLabel: 'Konuşma Simülasyonu',
    icon: <Mic className="w-4 h-4" />
  },
  {
    id: 8,
    label: 'Ekstra: Fonetik & Gramer',
    subLabel: 'Genelden Özele Analiz',
    icon: <Sparkles className="w-4 h-4" />
  },
  {
    id: 10,
    label: 'Kelime Kartları',
    subLabel: 'FSRS Aralıklı Tekrar',
    icon: <Layers className="w-4 h-4" />
  },
  {
    id: 9,
    label: 'Süreç & Hedefler',
    subLabel: 'İlerleme Panosu',
    icon: <Award className="w-4 h-4" />
  }
];

/** Metodolojinin çekirdeği 7 katman; 8 ekstra çalışma, 9 ise panodur. */
export const CORE_LAYER_COUNT = 7;

export const LayerNavigation: React.FC<LayerNavigationProps> = ({
  activeLayer,
  onSelectLayer,
  completedLayers,
}) => {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-2.5 shadow-sm">
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-5 gap-2">
        {LAYER_TABS.map((tab) => {
          const isActive = activeLayer === tab.id;
          const isCompleted = completedLayers.includes(tab.id);

          return (
            <button
              key={tab.id}
              onClick={() => onSelectLayer(tab.id)}
              className={`relative flex flex-col items-start p-3 rounded-lg border text-left transition-all cursor-pointer ${
                isActive
                  ? 'bg-slate-900 text-white border-slate-900 border-l-4 border-l-indigo-500 shadow-sm'
                  : isCompleted
                  ? 'bg-indigo-50/60 text-indigo-900 border-indigo-200/80 hover:bg-indigo-100/50'
                  : 'bg-slate-50 text-slate-700 border-slate-200/80 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              {/* Checkmark Badge if completed */}
              {isCompleted && !isActive && (
                <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600 absolute top-2.5 right-2.5" />
              )}

              <div className="flex items-center space-x-2 w-full mb-1">
                <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                  isActive ? 'bg-indigo-500/30 text-indigo-200' : 'bg-slate-200/70 text-slate-600'
                }`}>
                  0{tab.id}
                </span>
                <div className={`p-1 rounded ${isActive ? 'text-indigo-300' : 'text-slate-500'}`}>
                  {tab.icon}
                </div>
              </div>

              <span className="text-xs font-bold leading-tight line-clamp-1">{tab.label}</span>
              <span className={`text-[10px] mt-0.5 font-medium line-clamp-1 ${
                isActive ? 'text-slate-300' : 'text-slate-500'
              }`}>
                {tab.subLabel}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
