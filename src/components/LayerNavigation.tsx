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
    <nav aria-label="Katmanlar" className="border-y border-[var(--hairline)] bg-[var(--paper)]">
      <div className="flex overflow-x-auto snap-x scrollbar-hide">
        {LAYER_TABS.map((tab) => {
          const isActive = activeLayer === tab.id;
          const isCompleted = completedLayers.includes(tab.id);
          const isCore = tab.id <= CORE_LAYER_COUNT;

          return (
            <button
              key={tab.id}
              onClick={() => onSelectLayer(tab.id)}
              aria-current={isActive ? 'step' : undefined}
              className={`group relative shrink-0 snap-start text-left px-4 sm:px-5 py-3.5 border-r border-[var(--hairline)] last:border-r-0 transition-colors cursor-pointer min-w-[132px] ${
                isActive
                  ? 'bg-[var(--paper-2)]'
                  : 'bg-transparent hover:bg-[var(--paper-3)]'
              }`}
            >
              {/* Aktif katman: üstte tek çizgi. Vurgu için kutu değil, kenar. */}
              <span
                className={`absolute left-0 right-0 top-0 h-[2px] transition-colors ${
                  isActive ? 'bg-[var(--ink)]' : 'bg-transparent'
                }`}
              />

              <span className="flex items-center gap-2 mb-1.5">
                {/* Numara: gerçek bir sıra bildirdiği için var */}
                <span
                  className={`timecode font-medium ${
                    isActive ? 'text-[var(--ink)]' : 'text-[var(--ink-3)]'
                  }`}
                >
                  {isCore ? String(tab.id).padStart(2, '0') : '··'}
                </span>

                {isCompleted && (
                  <CheckCircle2
                    className={`w-3.5 h-3.5 shrink-0 ${
                      isActive ? 'text-[var(--ink)]' : 'text-[var(--ok)]'
                    }`}
                  />
                )}
              </span>

              <span
                className={`block text-[13px] leading-snug ${
                  isActive
                    ? 'text-[var(--ink)] font-medium'
                    : 'text-[var(--ink-2)] group-hover:text-[var(--ink)]'
                }`}
              >
                {tab.label.replace(/^\d+\.\s*/, '')}
              </span>

              <span className="block text-[11px] mt-0.5 text-[var(--ink-3)] leading-snug">
                {tab.subLabel}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
