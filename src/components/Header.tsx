import React, { useState } from 'react';
import { BookOpen, Sparkles, Award, HelpCircle, Flame, Layers, Settings2, Check, X } from 'lucide-react';
import { UserProgress } from '../types';

interface HeaderProps {
  progress: UserProgress;
  onOpenGuide: () => void;
  onOpenGrammarCoach: () => void;
  /** Hedef ve seri degerlerini duzenlemek icin. */
  onUpdateProgress?: (patch: Partial<UserProgress>) => void;
}

export const Header: React.FC<HeaderProps> = ({
  progress,
  onOpenGuide,
  onOpenGrammarCoach,
  onUpdateProgress,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [goalDraft, setGoalDraft] = useState(String(progress.goalVideoCount));
  const [streakDraft, setStreakDraft] = useState(String(progress.studyStreakDays));

  const goalPercentage = Math.min(
    100,
    Math.round((progress.completedVideoCount / Math.max(1, progress.goalVideoCount)) * 100)
  );

  const openEditor = () => {
    setGoalDraft(String(progress.goalVideoCount));
    setStreakDraft(String(progress.studyStreakDays));
    setIsEditing(true);
  };

  const saveEdits = () => {
    if (!onUpdateProgress) return setIsEditing(false);

    const goal = Math.max(1, Math.min(999, parseInt(goalDraft, 10) || 1));
    const streak = Math.max(0, Math.min(9999, parseInt(streakDraft, 10) || 0));

    // Seri elle degistirilirse, gecmis gunler o sayiya uyacak sekilde yeniden
    // kurulur; aksi halde bir sonraki hesaplamada eski degere geri donerdi.
    const dates: string[] = [];
    for (let i = streak - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      dates.push(
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      );
    }

    onUpdateProgress({
      goalVideoCount: goal,
      studyStreakDays: streak,
      studyDates: dates,
    });
    setIsEditing(false);
  };

  return (
    <header className="bg-[var(--paper)] border-b border-[var(--hairline)] sticky top-0 z-30">
      <div className="max-w-[1400px] w-full mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Marka — kelime işareti, ikon kutusu yok */}
        <div className="flex items-baseline gap-3 min-w-0">
          <span className="font-display text-[19px] sm:text-[21px] font-medium text-[var(--ink)] whitespace-nowrap">
            Katmanlı <em className="italic font-light text-[var(--ink-2)]">İngilizce</em>
          </span>
          <span className="eyebrow hidden lg:inline">Yedi Katmanlı Çalışma</span>
        </div>

        {/* Ölçüler ve araçlar */}
        <div className="flex items-center gap-1 sm:gap-2 relative">
          {/* Seri ve hedef: tek bir sayı şeridi */}
          <button
            type="button"
            onClick={openEditor}
            title="Hedefi ve seriyi düzenle"
            className="group flex items-stretch divide-x divide-[var(--hairline)] border border-[var(--hairline)] rounded-[10px] overflow-hidden hover:border-[var(--hairline-2)] transition-colors cursor-pointer"
          >
            <span className="flex flex-col items-start px-3 py-1.5 leading-tight">
              <span className="timecode text-[var(--ink)] font-medium">
                {progress.studyStreakDays}
              </span>
              <span className="text-[9px] uppercase tracking-[0.12em] text-[var(--ink-3)]">
                gün seri
              </span>
            </span>

            <span className="flex flex-col items-start px-3 py-1.5 leading-tight">
              <span className="timecode text-[var(--ink)] font-medium">
                {progress.completedVideoCount}<span className="text-[var(--ink-3)]">/{progress.goalVideoCount}</span>
              </span>
              <span className="text-[9px] uppercase tracking-[0.12em] text-[var(--ink-3)]">
                video
              </span>
            </span>

            {/* İlerleme: ince dikey şerit */}
            <span className="hidden sm:flex items-center px-2.5">
              <span className="w-14 h-[3px] bg-[var(--hairline)] rounded-full overflow-hidden">
                <span
                  className="block h-full bg-[var(--ink)] transition-all duration-500"
                  style={{ width: `${goalPercentage}%` }}
                />
              </span>
            </span>
          </button>

          <button
            onClick={onOpenGrammarCoach}
            title="Gramer koçuna sor"
            className="flex items-center gap-1.5 h-9 px-3.5 rounded-[10px] bg-[var(--ink)] text-[var(--paper-2)] text-xs font-medium hover:opacity-90 transition-opacity cursor-pointer shrink-0 whitespace-nowrap"
          >
            <Sparkles className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden md:inline">Gramer Koçu</span>
          </button>

          <button
            onClick={onOpenGuide}
            title="Yöntem rehberi"
            className="flex items-center gap-1.5 h-9 px-3.5 rounded-[10px] border border-[var(--hairline)] text-[var(--ink-2)] text-xs font-medium hover:border-[var(--hairline-2)] hover:text-[var(--ink)] transition-colors cursor-pointer shrink-0 whitespace-nowrap"
          >
            <HelpCircle className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden sm:inline">Metot</span>
          </button>
        </div>
      </div>
    </header>
  );
};
