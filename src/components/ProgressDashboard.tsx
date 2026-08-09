import React from 'react';
import { UserProgress, VideoLesson } from '../types';
import { Award, Flame, Calendar, BookMarked, CheckCircle2, Trophy, Clock, ArrowRight, TrendingUp, BarChart2 } from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from 'recharts';

interface ProgressDashboardProps {
  progress: UserProgress;
  lessons: VideoLesson[];
  onSelectLesson: (lesson: VideoLesson) => void;
}

export const ProgressDashboard: React.FC<ProgressDashboardProps> = ({
  progress,
  lessons,
  onSelectLesson,
}) => {
  const goalPercentage = Math.min(
    100,
    Math.round((progress.completedVideoCount / progress.goalVideoCount) * 100)
  );

  // Generate 7-day daily study time data
  const getLast7DaysData = () => {
    if (progress.weeklyStudyMinutes && progress.weeklyStudyMinutes.length === 7) {
      return progress.weeklyStudyMinutes.map((item, i) => ({
        ...item,
        isToday: i === 6,
      }));
    }

    const dayShorts = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
    const dayFulls = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
    const sampleMinutes = [25, 40, 30, 55, 35, 60, 45]; // realistic values in minutes

    const today = new Date();
    const result = [];

    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(today.getDate() - i);
      const dayIndex = d.getDay();
      const dayName = dayShorts[dayIndex];
      const fullDay = dayFulls[dayIndex];
      const dateStr = `${d.getDate()} ${['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'][d.getMonth()]}`;

      result.push({
        day: dayName,
        date: dateStr,
        fullDay,
        minutes: sampleMinutes[6 - i] || 30,
        isToday: i === 0,
      });
    }

    return result;
  };

  const chartData = getLast7DaysData();
  const totalMinutes = chartData.reduce((acc, curr) => acc + curr.minutes, 0);
  const avgMinutes = Math.round(totalMinutes / chartData.length);
  const maxMinutesItem = [...chartData].sort((a, b) => b.minutes - a.minutes)[0];

  return (
    <div className="space-y-6">
      {/* 20 Video Goal Overview Banner */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <span className="text-xs font-bold text-indigo-700 uppercase tracking-wider flex items-center space-x-1">
              <Trophy className="w-4 h-4 text-indigo-600" />
              <span>Süreç Yönetimi & Somut İlerleme Hedefi</span>
            </span>
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900">
              20 Video Tamamlama Hedefi ({progress.completedVideoCount} / {progress.goalVideoCount})
            </h2>
            <p className="text-xs text-slate-600 max-w-2xl leading-relaxed">
              Katmanlı Çalışma metodunda gelişim 3. veya 4. videodan itibaren hissedilir hale gelir. 
              Günde 1 katman ilerleyerek 7-10 günde 1 videoyu tamamlayabilir ve 20 videoda konuşma hakimiyeti kazanabilirsiniz.
            </p>
          </div>

          <div className="bg-indigo-50/80 p-4 rounded-xl border border-indigo-100 text-center min-w-[140px]">
            <span className="text-3xl font-bold text-indigo-700">{goalPercentage}%</span>
            <span className="block text-[11px] text-slate-600 mt-0.5 font-medium">Hedef İlerlemesi</span>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden p-0.5 border border-slate-200">
          <div
            className="bg-indigo-600 h-full rounded-full transition-all duration-700"
            style={{ width: `${goalPercentage}%` }}
          />
        </div>

        {/* Milestones badges */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
          <div className={`p-3.5 rounded-xl border text-xs space-y-1 ${
            progress.completedVideoCount >= 3 ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-slate-50 border-slate-200 text-slate-600'
          }`}>
            <div className="flex items-center space-x-1.5 font-bold">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Milestone 1: 3-4 Video</span>
            </div>
            <p className="text-[11px] text-slate-600">İlk görünür ilerleme ve konuşma reflekslerinin uyanışı.</p>
          </div>

          <div className={`p-3.5 rounded-xl border text-xs space-y-1 ${
            progress.completedVideoCount >= 10 ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-slate-50 border-slate-200 text-slate-600'
          }`}>
            <div className="flex items-center space-x-1.5 font-bold">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Milestone 2: 10 Video</span>
            </div>
            <p className="text-[11px] text-slate-600">Altyazısız %70+ anlama ve hızlı cümle kurma yetisi.</p>
          </div>

          <div className={`p-3.5 rounded-xl border text-xs space-y-1 ${
            progress.completedVideoCount >= 20 ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-slate-50 border-slate-200 text-slate-600'
          }`}>
            <div className="flex items-center space-x-1.5 font-bold">
              <Trophy className="w-4 h-4 text-indigo-600" />
              <span>Milestone 3: 20 Video</span>
            </div>
            <p className="text-[11px] text-slate-600">Akıcı dil hakimiyeti ve uzun vadeli hafıza dönüşümü.</p>
          </div>
        </div>
      </div>

      {/* 7-Day Daily Study Time Bar Chart */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <span className="text-xs font-bold text-indigo-700 uppercase tracking-wider flex items-center space-x-1.5">
              <TrendingUp className="w-4 h-4 text-indigo-600" />
              <span>Gelişim Grafiği</span>
            </span>
            <h3 className="text-base font-bold text-slate-900">
              Son 7 Günlük Çalışma Süresi Gelişimi
            </h3>
          </div>

          <div className="flex items-center space-x-3 text-xs">
            <div className="bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg flex items-center space-x-1.5">
              <Clock className="w-3.5 h-3.5 text-indigo-600" />
              <span className="text-slate-600 font-medium">Haftalık Toplam:</span>
              <span className="font-bold text-slate-900">{totalMinutes} dk ({Math.floor(totalMinutes / 60)}s {totalMinutes % 60}dk)</span>
            </div>
            <div className="bg-indigo-50 border border-indigo-100 px-3 py-1.5 rounded-lg flex items-center space-x-1.5">
              <Flame className="w-3.5 h-3.5 text-indigo-600" />
              <span className="text-indigo-800 font-medium">Ortalama:</span>
              <span className="font-bold text-indigo-900">{avgMinutes} dk/gün</span>
            </div>
          </div>
        </div>

        {/* Recharts Bar Chart */}
        <div className="w-full h-60 pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
              <XAxis
                dataKey="day"
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#64748B', fontSize: 12, fontWeight: 600 }}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#94A3B8', fontSize: 11 }}
                unit=" dk"
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div className="bg-slate-900 text-white p-2.5 rounded-lg shadow-lg text-xs space-y-0.5 border border-slate-800">
                        <p className="font-bold text-slate-200">{data.fullDay || data.day} {data.date ? `(${data.date})` : ''}</p>
                        <p className="text-indigo-300 font-semibold">
                          Çalışma Süresi: <span className="text-white font-bold">{data.minutes} Dakika</span>
                        </p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Bar dataKey="minutes" radius={[6, 6, 0, 0]}>
                {chartData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={entry.isToday ? '#4F46E5' : '#818CF8'}
                    className="transition-all hover:opacity-80"
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="flex flex-wrap items-center justify-between text-xs text-slate-600 border-t border-slate-100 pt-3 gap-2">
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 inline-block"></span>
            <span>Bugün ({chartData.find((d) => d.isToday)?.minutes || 0} dk)</span>
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-400 inline-block ml-3"></span>
            <span>Geçmiş Günler</span>
          </div>

          {maxMinutesItem && (
            <p className="text-slate-500 font-medium">
              En yüksek performans: <strong className="text-slate-800">{maxMinutesItem.fullDay || maxMinutesItem.day} ({maxMinutesItem.minutes} dk)</strong>
            </p>
          )}
        </div>
      </div>

      {/* Suggested 7-Day Study Schedule */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3 shadow-sm">
        <h3 className="text-sm font-bold text-slate-900 flex items-center space-x-2">
          <Calendar className="w-4 h-4 text-indigo-600" />
          <span>7-10 Günlük Örnek Çalışma Planı (Sürdürülebilir Rutin)</span>
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5 text-xs">
          <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
            <span className="font-bold text-indigo-700 block">Gün 1-2:</span>
            <span className="text-slate-700">1. Katman (Çift Dilli Okuma)</span>
          </div>

          <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
            <span className="font-bold text-indigo-700 block">Gün 3:</span>
            <span className="text-slate-700">2 &amp; 3. Katman (Aktif Dinleme &amp; Gölgeleme)</span>
          </div>

          <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
            <span className="font-bold text-indigo-700 block">Gün 4-5:</span>
            <span className="text-slate-700">4 & 5. Katman (Altyazısız İzleme & Sadece Dinleme)</span>
          </div>

          <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
            <span className="font-bold text-indigo-700 block">Gün 6-7:</span>
            <span className="text-slate-700">6 & 7. Katman (Özet, Yorum Yazma & Sesli Anlatım)</span>
          </div>
        </div>
      </div>

      {/* Bookmarked Vocabulary List */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3 shadow-sm">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900 flex items-center space-x-2">
            <BookMarked className="w-4 h-4 text-indigo-600" />
            <span>Kaydedilen Kelimelerim & Cümlelerim ({progress.bookmarkedWords.length})</span>
          </h3>
        </div>

        {progress.bookmarkedWords.length === 0 ? (
          <p className="text-xs text-slate-500 bg-slate-50 p-4 rounded-lg text-center border border-slate-200">
            Henüz kaydedilmiş kelimeniz bulunmuyor. Okuma esnasında "Kaydet" butonuna basarak ekleyebilirsiniz.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {progress.bookmarkedWords.map((item, idx) => (
              <div key={idx} className="bg-slate-50 p-3.5 rounded-lg border border-slate-200 text-xs space-y-1">
                <span className="font-bold text-indigo-900 text-sm block">{item.word}</span>
                <p className="text-slate-800 font-medium">{item.enContext}</p>
                <p className="text-slate-500 text-[11px]">{item.trContext}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
