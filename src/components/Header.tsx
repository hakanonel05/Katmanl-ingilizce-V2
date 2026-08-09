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
    <header className="bg-[#0F172A] border-b border-slate-800 text-white sticky top-0 z-30 shadow-sm">
      <div className="max-w-[1920px] w-full mx-auto px-3 sm:px-6 lg:px-8 py-3.5 flex flex-wrap items-center justify-between gap-4">
        {/* Brand Title */}
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-md shadow-indigo-900/30 font-black">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-lg sm:text-xl font-bold tracking-tight text-white flex items-center gap-2">
                Katmanlı Çalışma
              </h1>
              <span className="text-[11px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2 py-0.5 rounded-md font-semibold tracking-wide uppercase">
                Gemini Coach
              </span>
            </div>
            <p className="text-xs text-slate-400 hidden sm:block">
              7-Layered English Learning System
            </p>
          </div>
        </div>

        {/* Progress & Quick Tools */}
        <div className="flex items-center space-x-3 sm:space-x-4 relative">
          {/* Streak Counter */}
          <button
            type="button"
            onClick={openEditor}
            className="flex items-center space-x-1.5 bg-slate-800/80 hover:bg-slate-700/80 px-3 py-1.5 rounded-lg border border-slate-700/80 text-xs text-amber-400 font-semibold transition cursor-pointer"
            title="Seriyi ve hedefi düzenle"
          >
            <Flame className="w-4 h-4 text-amber-400 fill-amber-400" />
            <span>{progress.studyStreakDays} Gün Seri</span>
          </button>

          {/* Video Goal Counter */}
          <button
            type="button"
            onClick={openEditor}
            className="flex items-center space-x-2.5 bg-slate-800/80 hover:bg-slate-700/80 px-3 py-1.5 rounded-lg border border-slate-700/80 transition cursor-pointer"
            title="Hedefi düzenle"
          >
            <Award className="w-4 h-4 text-indigo-400" />
            <div className="text-xs">
              <div className="flex justify-between items-center space-x-2 text-slate-300 font-medium">
                <span>Hedef: <strong className="text-indigo-300 font-bold">{progress.completedVideoCount}/{progress.goalVideoCount}</strong> Video</span>
              </div>
              <div className="w-20 bg-slate-700 rounded-full h-1.5 mt-1 overflow-hidden">
                <div
                  className="bg-indigo-500 h-1.5 rounded-full transition-all duration-500"
                  style={{ width: `${goalPercentage}%` }}
                />
              </div>
            </div>
            <Settings2 className="w-3.5 h-3.5 text-slate-500" />
          </button>

          {/* Düzenleme Paneli */}
          {isEditing && onUpdateProgress && (
            <div className="absolute top-full right-0 mt-2 w-72 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-4 z-50 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white">Hedef ve Seri</h3>
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="p-1 text-slate-400 hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300 block">
                  Video Hedefi
                </label>
                <input
                  type="number"
                  min={1}
                  max={999}
                  value={goalDraft}
                  onChange={(e) => setGoalDraft(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-800 border border-slate-600 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500"
                />
                <p className="text-[11px] text-slate-500">
                  Şu an {progress.completedVideoCount} video tamamlandı. Bu sayı
                  derslerin gerçek durumundan hesaplanıyor.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300 block">
                  Çalışma Serisi (gün)
                </label>
                <input
                  type="number"
                  min={0}
                  max={9999}
                  value={streakDraft}
                  onChange={(e) => setStreakDraft(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-800 border border-slate-600 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500"
                />
                <p className="text-[11px] text-slate-500">
                  Seri normalde otomatik sayılıyor: bir katman tamamladığın her gün
                  işaretleniyor, bir gün atlarsan sıfırlanıyor. Buradan elle de
                  ayarlayabilirsin.
                </p>
              </div>

              <div className="flex items-center space-x-2 pt-1">
                <button
                  type="button"
                  onClick={saveEdits}
                  className="flex-1 flex items-center justify-center space-x-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg transition cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Kaydet</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-lg transition cursor-pointer"
                >
                  Vazgeç
                </button>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <button
            onClick={onOpenGrammarCoach}
            className="flex items-center space-x-1.5 px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-sm transition cursor-pointer"
            title="Genelden Özele Gramer Asistanı"
          >
            <Sparkles className="w-4 h-4 text-indigo-200" />
            <span className="hidden md:inline">Gramer Koçu</span>
          </button>

          <button
            onClick={onOpenGuide}
            className="flex items-center space-x-1.5 px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition cursor-pointer"
            title="Yöntem Rehberi ve 7 Katman Özeti"
          >
            <HelpCircle className="w-4 h-4 text-amber-400" />
            <span className="hidden sm:inline">Metot Rehberi</span>
          </button>
        </div>
      </div>
    </header>
  );
};
