import React from 'react';
import { BookOpen, Sparkles, Award, HelpCircle, Flame, Layers } from 'lucide-react';
import { UserProgress } from '../types';

interface HeaderProps {
  progress: UserProgress;
  onOpenGuide: () => void;
  onOpenGrammarCoach: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  progress,
  onOpenGuide,
  onOpenGrammarCoach,
}) => {
  const goalPercentage = Math.min(
    100,
    Math.round((progress.completedVideoCount / progress.goalVideoCount) * 100)
  );

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
        <div className="flex items-center space-x-3 sm:space-x-4">
          {/* Streak Counter */}
          <div className="flex items-center space-x-1.5 bg-slate-800/80 px-3 py-1.5 rounded-lg border border-slate-700/80 text-xs text-amber-400 font-semibold">
            <Flame className="w-4 h-4 text-amber-400 fill-amber-400" />
            <span>{progress.studyStreakDays} Gün Seri</span>
          </div>

          {/* 20 Video Goal Counter */}
          <div className="flex items-center space-x-2.5 bg-slate-800/80 px-3 py-1.5 rounded-lg border border-slate-700/80">
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
          </div>

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
