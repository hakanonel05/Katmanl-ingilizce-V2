import React, { useState, useEffect, useMemo } from 'react';
import { VideoLesson } from '../../types';
import {
  VocabCard,
  CardLevel,
  CardKind,
  getAllCards,
  getCardsByLesson,
  addCardsIfMissing,
  buildCard,
  deleteCard,
  putCard,
  computeStats,
  selectDueCards,
  VOCAB_CHANGED_EVENT,
} from '../../lib/vocabStore';
import { CardState } from '../../lib/fsrs';
import {
  VocabSettings, loadVocabSettings, saveVocabSettings,
  DEFAULT_VOCAB_SETTINGS, getDailyCounter, resetDailyCounter,
} from '../../lib/vocabSettings';
import { FlashcardReview } from './FlashcardReview';
import {
  Layers, Sparkles, Loader2, Search, Trash2, Play, BookMarked,
  Filter, EyeOff, Eye, Download, AlertTriangle, Settings2, PlusCircle, X, Check,
} from 'lucide-react';

interface Props {
  lesson: VideoLesson | null;
  lessons: VideoLesson[];
}

type Tab = 'lesson' | 'all' | 'study';

const LEVELS: CardLevel[] = ['A2', 'B1', 'B2', 'C1', 'C2'];
const KINDS: { value: CardKind; label: string }[] = [
  { value: 'word', label: 'Kelime' },
  { value: 'phrasal_verb', label: 'Phrasal Verb' },
  { value: 'collocation', label: 'Kalıp' },
  { value: 'idiom', label: 'Deyim' },
  { value: 'expression', label: 'Konuşma Kalıbı' },
];

export const VocabHub: React.FC<Props> = ({ lesson, lessons }) => {
  const [tab, setTab] = useState<Tab>('lesson');
  const [allCards, setAllCards] = useState<VocabCard[]>([]);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [extractInfo, setExtractInfo] = useState<string | null>(null);

  // Filtreler
  const [search, setSearch] = useState('');
  const [levelFilter, setLevelFilter] = useState<CardLevel | 'all'>('all');
  const [kindFilter, setKindFilter] = useState<CardKind | 'all'>('all');
  const [lessonFilter, setLessonFilter] = useState<string>('all');
  const [studyScope, setStudyScope] = useState<'all' | 'lesson'>('all');

  // Ayarlar ve manuel kart ekleme
  const [settings, setSettings] = useState<VocabSettings>(() => loadVocabSettings());
  const [showSettings, setShowSettings] = useState(false);
  const [showManualAdd, setShowManualAdd] = useState(false);
  const [manualFront, setManualFront] = useState('');
  const [manualBack, setManualBack] = useState('');
  const [manualLevel, setManualLevel] = useState<CardLevel>('B2');
  const [manualKind, setManualKind] = useState<CardKind>('word');
  const [manualExample, setManualExample] = useState('');
  const [manualBusy, setManualBusy] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);
  const [daily, setDaily] = useState(() => getDailyCounter());

  const updateSettings = (patch: Partial<VocabSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveVocabSettings(next);
  };

  /** Yapay zekadan anlamı doldurmasını iste. */
  const autoFillManual = async () => {
    if (!manualFront.trim()) return;
    setManualBusy(true);
    setManualError(null);
    try {
      const res = await fetch('/api/define-word', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ word: manualFront.trim() }),
      });
      const raw = await res.text();
      let data: any;
      try {
        data = JSON.parse(raw);
      } catch {
        throw new Error('Sunucu beklenmeyen bir yanıt döndürdü.');
      }
      if (!res.ok) throw new Error(data.error || 'Anlam getirilemedi.');

      setManualFront(data.front || manualFront);
      setManualBack(data.back || '');
      if (data.level) setManualLevel(data.level);
      if (data.kind) setManualKind(data.kind);
      if (data.exampleEn) setManualExample(data.exampleEn);
    } catch (err: any) {
      setManualError(err?.message || 'Anlam getirilemedi.');
    } finally {
      setManualBusy(false);
    }
  };

  const saveManualCard = async () => {
    if (!manualFront.trim() || !manualBack.trim()) return;
    try {
      const card = buildCard({
        lessonId: lesson?.id || 'manuel',
        lessonTitle: lesson?.title || 'Elle Eklenenler',
        front: manualFront.trim(),
        back: manualBack.trim(),
        kind: manualKind,
        level: manualLevel,
        exampleEn: manualExample.trim() || undefined,
      });
      await addCardsIfMissing([card]);
      await refresh();
      setManualFront('');
      setManualBack('');
      setManualExample('');
      setShowManualAdd(false);
    } catch (err: any) {
      setManualError(err?.message || 'Kart eklenemedi.');
    }
  };

  const refresh = async () => {
    try {
      setAllCards(await getAllCards());
    } catch (err) {
      console.warn('Kartlar okunamadı:', err);
    }
  };

  useEffect(() => {
    refresh();

    // Kart başka bir ekrandan eklenmiş olabilir (transkriptte seçim gibi).
    // Hem depo olayını hem de sekmeye geri dönüşü dinliyoruz.
    const onChanged = () => refresh();
    const onFocus = () => refresh();

    window.addEventListener(VOCAB_CHANGED_EVENT, onChanged);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);

    return () => {
      window.removeEventListener(VOCAB_CHANGED_EVENT, onChanged);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lessonCards = useMemo(
    () => (lesson ? allCards.filter((c) => c.lessonId === lesson.id) : []),
    [allCards, lesson]
  );

  const handleExtract = async () => {
    if (!lesson) return;
    setIsExtracting(true);
    setExtractError(null);
    setExtractInfo(null);

    try {
      const text = (lesson.sentences || []).map((s) => s.en).join(' ');
      if (!text.trim()) throw new Error('Bu derste metin bulunmuyor.');

      const res = await fetch('/api/extract-vocabulary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, count: settings.extractCount }),
      });

      const raw = await res.text();
      let data: any;
      try {
        data = JSON.parse(raw);
      } catch {
        throw new Error('Sunucu beklenmeyen bir yanıt döndürdü. Video çok uzun olabilir.');
      }
      if (!res.ok) throw new Error(data.error || 'Kelimeler ayıklanamadı.');

      const items: any[] = data.items || [];
      if (items.length === 0) throw new Error('Metinden uygun ifade çıkarılamadı.');

      const cards = items.map((it) =>
        buildCard({
          lessonId: lesson.id,
          lessonTitle: lesson.title,
          front: it.front,
          back: it.back,
          ipa: it.ipa,
          kind: it.kind,
          level: it.level,
          exampleEn: it.exampleEn,
          exampleTr: it.exampleTr,
          contextEn: it.contextEn,
        })
      );

      const added = await addCardsIfMissing(cards);
      await refresh();

      setExtractInfo(
        added === items.length
          ? `${added} yeni kart eklendi.`
          : `${added} yeni kart eklendi, ${items.length - added} tanesi zaten vardı (ilerlemeleri korundu).`
      );
    } catch (err: any) {
      setExtractError(err?.message || 'Kelimeler ayıklanamadı.');
    } finally {
      setIsExtracting(false);
    }
  };

  const filtered = useMemo(() => {
    const term = search.toLowerCase().trim();
    return allCards
      .filter((c) => (levelFilter === 'all' ? true : c.level === levelFilter))
      .filter((c) => (kindFilter === 'all' ? true : c.kind === kindFilter))
      .filter((c) => (lessonFilter === 'all' ? true : c.lessonId === lessonFilter))
      .filter(
        (c) =>
          !term ||
          c.front.toLowerCase().includes(term) ||
          c.back.toLowerCase().includes(term)
      )
      .sort((a, b) => a.due - b.due);
  }, [allCards, search, levelFilter, kindFilter, lessonFilter]);

  const studyPool = useMemo(
    () => (studyScope === 'lesson' ? lessonCards : allCards),
    [studyScope, lessonCards, allCards]
  );

  /** Günlük sınırlar düşülmüş, bugün gerçekten çalışılabilecek kartlar. */
  const limitedPool = useMemo(() => {
    const newRemaining =
      settings.newCardsPerDay > 0
        ? Math.max(0, settings.newCardsPerDay - daily.newIntroduced)
        : 0;
    const reviewRemaining =
      settings.reviewsPerDay > 0
        ? Math.max(0, settings.reviewsPerDay - daily.reviewsDone)
        : 0;
    return selectDueCards(studyPool, Date.now(), { newRemaining, reviewRemaining });
  }, [studyPool, settings.newCardsPerDay, settings.reviewsPerDay, daily]);

  const stats = useMemo(() => computeStats(studyPool), [studyPool]);
  const lessonStats = useMemo(() => computeStats(lessonCards), [lessonCards]);
  const globalStats = useMemo(() => computeStats(allCards), [allCards]);

  const handleDelete = async (id: string) => {
    await deleteCard(id);
    await refresh();
  };

  const toggleSuspend = async (card: VocabCard) => {
    await putCard({ ...card, suspended: !card.suspended });
    await refresh();
  };

  const exportCsv = () => {
    // Anki'ye alınabilecek basit CSV
    const rows = filtered.map((c) =>
      [c.front, c.back, c.exampleEn || '', c.level, c.lessonTitle]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(',')
    );
    const csv = ['"Front","Back","Example","Level","Lesson"', ...rows].join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'kelime-kartlari.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const StatPill: React.FC<{ label: string; value: number; tone?: string }> = ({
    label,
    value,
    tone = 'bg-slate-100 text-slate-700',
  }) => (
    <span className={`px-2.5 py-1 rounded-lg text-[11px] font-bold ${tone}`}>
      {label}: {value}
    </span>
  );

  return (
    <div className="space-y-5">
      {/* Başlık */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center space-x-2.5">
            <span className="px-2.5 py-1 bg-teal-50 text-teal-700 border border-teal-200 text-xs font-bold rounded-md uppercase tracking-wider">
              Kelime
            </span>
            <h2 className="text-base sm:text-lg font-bold text-slate-900">Kelime Kartları</h2>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setShowManualAdd(true)}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition cursor-pointer"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>Kart Ekle</span>
            </button>
            <button
              type="button"
              onClick={() => setShowSettings((v) => !v)}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition cursor-pointer"
            >
              <Settings2 className="w-3.5 h-3.5" />
              <span>Ayarlar</span>
            </button>
          </div>
        </div>
        <p className="text-xs text-slate-600 leading-relaxed">
          Kartlar <strong>FSRS-6</strong> algoritmasıyla planlanıyor (Anki ile aynı algoritma,
          hedef tutma oranı %90). Çalışırken yalnızca <strong>Again</strong> ve
          <strong> Good</strong> düğmelerini kullanıyorsunuz.
        </p>

        <div className="flex items-center gap-1.5 border-b border-slate-200 -mb-4 pt-1">
          {([
            ['lesson', `Bu Ders (${lessonCards.length})`],
            ['all', `Tüm Kartlar (${allCards.length})`],
            ['study', 'Çalış'],
          ] as [Tab, string][]).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setTab(value)}
              className={`px-3.5 py-2 text-xs font-bold rounded-t-lg transition cursor-pointer ${
                tab === value
                  ? 'bg-teal-600 text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {label}
              {value === 'study' && globalStats.due > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 bg-rose-500 text-white rounded-full text-[10px]">
                  {globalStats.due}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Ayarlar paneli */}
      {showSettings && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">Çalışma Ayarları</h3>
            <button
              type="button"
              onClick={() => setShowSettings(false)}
              className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-700 block">
                Günlük yeni kart sınırı
              </label>
              <input
                type="number"
                min={0}
                max={500}
                value={settings.newCardsPerDay}
                onChange={(e) => updateSettings({ newCardsPerDay: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-teal-500"
              />
              <p className="text-[10px] text-slate-500">
                Bugün {daily.newIntroduced} yeni kart gördünüz. 0 yazarsanız sınırsız olur.
              </p>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-700 block">
                Günlük tekrar sınırı
              </label>
              <input
                type="number"
                min={0}
                max={2000}
                value={settings.reviewsPerDay}
                onChange={(e) => updateSettings({ reviewsPerDay: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-teal-500"
              />
              <p className="text-[10px] text-slate-500">
                Bugün {daily.reviewsDone} tekrar yaptınız. 0 = sınırsız (önerilen).
              </p>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-700 block">
                Oturum süresi (dakika)
              </label>
              <input
                type="number"
                min={1}
                max={180}
                value={settings.sessionMinutes}
                onChange={(e) => updateSettings({ sessionMinutes: Math.max(1, parseInt(e.target.value, 10) || 15) })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-teal-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-700 block">
                Ayıklamada istenecek kelime sayısı
              </label>
              <input
                type="number"
                min={8}
                max={40}
                value={settings.extractCount}
                onChange={(e) => updateSettings({ extractCount: Math.min(40, Math.max(8, parseInt(e.target.value, 10) || 20)) })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-teal-500"
              />
              <p className="text-[10px] text-slate-500">
                En fazla 40. Kısa videolarda model bu sayıya ulaşamayabilir.
              </p>
            </div>
          </div>

          {/* Teşhis: kartların gerçekte hangi derse yazıldığını gösterir */}
          <div className="pt-3 border-t border-slate-200 space-y-1.5">
            <h4 className="text-[11px] font-bold text-slate-700">
              Kart dağılımı (veritabanındaki gerçek durum)
            </h4>
            {allCards.length === 0 ? (
              <p className="text-[11px] text-slate-500">Veritabanında hiç kart yok.</p>
            ) : (
              <div className="space-y-0.5 max-h-40 overflow-y-auto">
                {Object.entries(
                  allCards.reduce((acc: Record<string, number>, c) => {
                    const key = `${c.lessonTitle} [${c.lessonId}]`;
                    acc[key] = (acc[key] || 0) + 1;
                    return acc;
                  }, {})
                ).map(([key, count]) => (
                  <div
                    key={key}
                    className="flex items-center justify-between text-[11px] bg-slate-50 border border-slate-200 rounded px-2 py-1"
                  >
                    <span className="truncate text-slate-700">{key}</span>
                    <span className="font-bold text-slate-900 shrink-0 ml-2">{count}</span>
                  </div>
                ))}
              </div>
            )}
            <p className="text-[10px] text-slate-500">
              Toplam {allCards.length} kart.
              {lesson
                ? ` Aktif ders: ${lesson.title} [${lesson.id}] — ${lessonCards.length} kart.`
                : ' Aktif ders seçili değil.'}
            </p>
          </div>

          <div className="flex items-center gap-2 pt-1 border-t border-slate-200">
            <button
              type="button"
              onClick={refresh}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold rounded-lg cursor-pointer"
            >
              Listeyi yenile
            </button>
            <button
              type="button"
              onClick={() => {
                resetDailyCounter();
                setDaily(getDailyCounter());
              }}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold rounded-lg cursor-pointer"
            >
              Günlük sayacı sıfırla
            </button>
            <button
              type="button"
              onClick={() => {
                setSettings({ ...DEFAULT_VOCAB_SETTINGS });
                saveVocabSettings({ ...DEFAULT_VOCAB_SETTINGS });
              }}
              className="px-3 py-1.5 text-[11px] font-bold text-slate-500 hover:text-slate-800 cursor-pointer"
            >
              Varsayılanlara dön
            </button>
          </div>
        </div>
      )}

      {/* Manuel kart ekleme */}
      {showManualAdd && (
        <div className="fixed inset-0 bg-slate-900/40 z-[70] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-3 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">Elle Kart Ekle</h3>
              <button
                type="button"
                onClick={() => setShowManualAdd(false)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-600">İngilizce ifade</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={manualFront}
                  onChange={(e) => setManualFront(e.target.value)}
                  placeholder="örn. come across"
                  className="flex-1 px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm font-bold focus:outline-none focus:border-teal-500"
                />
                <button
                  type="button"
                  onClick={autoFillManual}
                  disabled={!manualFront.trim() || manualBusy}
                  className="flex items-center space-x-1.5 px-3 py-2 bg-teal-600 hover:bg-teal-700 disabled:bg-slate-300 text-white text-xs font-bold rounded-lg cursor-pointer"
                  title="Anlamı ve örneği yapay zeka doldursun"
                >
                  {manualBusy ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5" />
                  )}
                  <span>Doldur</span>
                </button>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-600">Türkçe karşılık</label>
              <input
                type="text"
                value={manualBack}
                onChange={(e) => setManualBack(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-teal-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-600">Seviye</label>
                <select
                  value={manualLevel}
                  onChange={(e) => setManualLevel(e.target.value as CardLevel)}
                  className="w-full px-2.5 py-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold cursor-pointer"
                >
                  {LEVELS.map((l) => (
                    <option key={l} value={l}>{l}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-600">Tür</label>
                <select
                  value={manualKind}
                  onChange={(e) => setManualKind(e.target.value as CardKind)}
                  className="w-full px-2.5 py-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold cursor-pointer"
                >
                  {KINDS.map((k) => (
                    <option key={k.value} value={k.value}>{k.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-600">Örnek cümle (isteğe bağlı)</label>
              <input
                type="text"
                value={manualExample}
                onChange={(e) => setManualExample(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs focus:outline-none focus:border-teal-500"
              />
            </div>

            <p className="text-[10px] text-slate-500">
              Kart {lesson ? `"${lesson.title.slice(0, 40)}"` : '"Elle Eklenenler"'} altına eklenecek.
            </p>

            {manualError && (
              <p className="text-[11px] font-semibold text-rose-800 bg-rose-50 border border-rose-200 rounded px-2.5 py-1.5">
                {manualError}
              </p>
            )}

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={saveManualCard}
                disabled={!manualFront.trim() || !manualBack.trim()}
                className="flex-1 flex items-center justify-center space-x-1.5 px-4 py-2.5 bg-teal-600 hover:bg-teal-700 disabled:bg-slate-300 text-white text-xs font-bold rounded-xl cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>Ekle</span>
              </button>
              <button
                type="button"
                onClick={() => setShowManualAdd(false)}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl cursor-pointer"
              >
                Vazgeç
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BU DERS */}
      {tab === 'lesson' && (
        <div className="space-y-4">
          {!lesson ? (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-900">
              Önce bir ders seçin.
            </div>
          ) : (
            <>
              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-3">
                <div className="flex items-start justify-between flex-wrap gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">{lesson.title}</h3>
                    <div className="flex flex-wrap items-center gap-1.5 pt-2">
                      <StatPill label="Kart" value={lessonStats.total} />
                      <StatPill
                        label="Vadesi gelen"
                        value={lessonStats.due}
                        tone="bg-rose-100 text-rose-800"
                      />
                      <StatPill
                        label="Öğreniliyor"
                        value={lessonStats.learning + lessonStats.relearning}
                        tone="bg-amber-100 text-amber-800"
                      />
                      <StatPill
                        label="Tekrar"
                        value={lessonStats.review}
                        tone="bg-emerald-100 text-emerald-800"
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleExtract}
                    disabled={isExtracting}
                    className="flex items-center space-x-2 px-4 py-2.5 bg-teal-600 hover:bg-teal-700 disabled:bg-teal-300 text-white text-xs font-bold rounded-xl transition cursor-pointer"
                  >
                    {isExtracting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Sparkles className="w-4 h-4" />
                    )}
                    <span>
                      {isExtracting ? 'Ayıklanıyor...' : 'Bu Dersten Kelime Ayıkla'}
                    </span>
                  </button>
                </div>

                <p className="text-[11px] text-slate-500">
                  Transkriptten B2-C1 seviyesindeki kelimeler, phrasal verb'ler, kalıplar,
                  deyimler ve gerçek konuşma ifadeleri ayıklanır. Aynı ifade zaten kartlarınızda
                  varsa üzerine yazılmaz, tekrar geçmişiniz korunur.
                </p>

                {extractError && (
                  <p className="flex items-start space-x-1.5 text-[11px] font-semibold text-rose-800 bg-rose-50 border border-rose-200 rounded px-2.5 py-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>{extractError}</span>
                  </p>
                )}
                {extractInfo && (
                  <p className="text-[11px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded px-2.5 py-1.5">
                    {extractInfo}
                  </p>
                )}

                {lessonStats.due > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setStudyScope('lesson');
                      setTab('study');
                    }}
                    className="w-full flex items-center justify-center space-x-2 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition cursor-pointer"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    <span>Bu dersin {lessonStats.due} kartını çalış</span>
                  </button>
                )}
              </div>

              <CardTable
                cards={lessonCards}
                onDelete={handleDelete}
                onToggleSuspend={toggleSuspend}
                emptyText="Bu ders için henüz kart yok. Yukarıdaki düğmeyle ayıklayabilirsiniz."
              />
            </>
          )}
        </div>
      )}

      {/* TÜM KARTLAR */}
      {tab === 'all' && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <StatPill label="Toplam" value={globalStats.total} />
              <StatPill label="Vadesi gelen" value={globalStats.due} tone="bg-rose-100 text-rose-800" />
              <StatPill
                label="Öğreniliyor"
                value={globalStats.learning + globalStats.relearning}
                tone="bg-amber-100 text-amber-800"
              />
              <StatPill label="Tekrar" value={globalStats.review} tone="bg-emerald-100 text-emerald-800" />
              <StatPill label="Askıda" value={globalStats.suspended} />
            </div>

            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Kelime veya anlam ara..."
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-teal-500"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="flex items-center space-x-1 text-[11px] font-bold text-slate-500">
                <Filter className="w-3.5 h-3.5" />
                <span>Filtre:</span>
              </span>

              <select
                value={levelFilter}
                onChange={(e) => setLevelFilter(e.target.value as any)}
                className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 cursor-pointer"
              >
                <option value="all">Tüm seviyeler</option>
                {LEVELS.map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>

              <select
                value={kindFilter}
                onChange={(e) => setKindFilter(e.target.value as any)}
                className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 cursor-pointer"
              >
                <option value="all">Tüm türler</option>
                {KINDS.map((k) => (
                  <option key={k.value} value={k.value}>{k.label}</option>
                ))}
              </select>

              <select
                value={lessonFilter}
                onChange={(e) => setLessonFilter(e.target.value)}
                className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 cursor-pointer max-w-[220px]"
              >
                <option value="all">Tüm dersler</option>
                {lessons.map((l) => (
                  <option key={l.id} value={l.id}>{l.title.slice(0, 40)}</option>
                ))}
              </select>

              <button
                type="button"
                onClick={exportCsv}
                disabled={filtered.length === 0}
                className="flex items-center space-x-1.5 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-700 text-xs font-bold rounded-lg cursor-pointer"
                title="Anki'ye alınabilecek CSV olarak indir"
              >
                <Download className="w-3.5 h-3.5" />
                <span>CSV</span>
              </button>

              <span className="text-[11px] text-slate-500 ml-auto">
                {filtered.length} kart gösteriliyor
              </span>
            </div>
          </div>

          <CardTable
            cards={filtered}
            onDelete={handleDelete}
            onToggleSuspend={toggleSuspend}
            showLesson
            emptyText="Filtreye uyan kart yok."
          />
        </div>
      )}

      {/* ÇALIŞ */}
      {tab === 'study' && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setStudyScope('all')}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer ${
                  studyScope === 'all'
                    ? 'bg-teal-600 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Tüm Kartlar ({globalStats.due})
              </button>
              <button
                type="button"
                onClick={() => setStudyScope('lesson')}
                disabled={!lesson}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition disabled:opacity-40 cursor-pointer ${
                  studyScope === 'lesson'
                    ? 'bg-teal-600 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Sadece Bu Ders ({lessonStats.due})
              </button>
            </div>
            <span className="text-[11px] text-slate-500">
              Günlük hedef: {settings.sessionMinutes} dk · Bugün {daily.newIntroduced}
              {settings.newCardsPerDay > 0 ? `/${settings.newCardsPerDay}` : ''} yeni kart
            </span>
          </div>

          {limitedPool.length === 0 && studyPool.some((c) => c.due <= Date.now()) ? (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center space-y-2">
              <h3 className="text-sm font-bold text-slate-900">Günlük sınıra ulaşıldı</h3>
              <p className="text-xs text-slate-600 max-w-md mx-auto">
                Bugün için ayarladığınız yeni kart sınırına ({settings.newCardsPerDay})
                ulaştınız. Daha fazla çalışmak isterseniz Ayarlar'dan sınırı yükseltin
                veya günlük sayacı sıfırlayın.
              </p>
              <button
                type="button"
                onClick={() => setShowSettings(true)}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-lg cursor-pointer"
              >
                Ayarları Aç
              </button>
            </div>
          ) : (
            <FlashcardReview
              key={`${studyScope}-${limitedPool.length}-${settings.sessionMinutes}`}
              cards={limitedPool}
              sessionMinutes={settings.sessionMinutes}
              onCardUpdated={() => {
                refresh();
                setDaily(getDailyCounter());
              }}
              onExit={() => setTab('all')}
            />
          )}
        </div>
      )}
    </div>
  );
};

/* ---------------- Kart listesi ---------------- */

const CardTable: React.FC<{
  cards: VocabCard[];
  onDelete: (id: string) => void;
  onToggleSuspend: (card: VocabCard) => void;
  showLesson?: boolean;
  emptyText: string;
}> = ({ cards, onDelete, onToggleSuspend, showLesson, emptyText }) => {
  if (cards.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
        <BookMarked className="w-8 h-8 text-slate-300 mx-auto mb-2" />
        <p className="text-xs text-slate-500">{emptyText}</p>
      </div>
    );
  }

  const now = Date.now();

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
      <div className="divide-y divide-slate-200 max-h-[65vh] overflow-y-auto">
        {cards.map((c) => {
          const isDue = !c.suspended && c.due <= now;
          const dueLabel = isDue
            ? 'Hazır'
            : new Date(c.due).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });

          return (
            <div
              key={c.id}
              className={`p-3.5 flex items-start justify-between gap-3 ${
                c.suspended ? 'opacity-50' : ''
              }`}
            >
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center flex-wrap gap-1.5">
                  <span className="font-bold text-sm text-slate-900">{c.front}</span>
                  <span className="px-1.5 py-0.5 bg-indigo-100 text-indigo-800 text-[10px] font-bold rounded">
                    {c.level}
                  </span>
                  <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 text-[10px] font-semibold rounded">
                    {KINDS.find((k) => k.value === c.kind)?.label || c.kind}
                  </span>
                  {c.state !== CardState.Review && (
                    <span className="px-1.5 py-0.5 bg-amber-100 text-amber-800 text-[10px] font-semibold rounded">
                      yeni
                    </span>
                  )}
                </div>

                <p className="text-xs text-slate-700">{c.back}</p>

                {c.exampleEn && (
                  <p className="text-[11px] text-slate-500 italic truncate">{c.exampleEn}</p>
                )}

                <div className="flex items-center flex-wrap gap-2 text-[10px] text-slate-400 pt-0.5">
                  <span className={isDue ? 'text-rose-600 font-bold' : ''}>{dueLabel}</span>
                  <span>tekrar: {c.reps}</span>
                  {c.lapses > 0 && <span>unutma: {c.lapses}</span>}
                  {c.stability !== null && <span>S: {c.stability.toFixed(1)}g</span>}
                  {showLesson && (
                    <span className="truncate max-w-[180px]" title={c.lessonTitle}>
                      · {c.lessonTitle}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => onToggleSuspend(c)}
                  className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 cursor-pointer"
                  title={c.suspended ? 'Askıdan çıkar' : 'Askıya al'}
                >
                  {c.suspended ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(c.id)}
                  className="p-1.5 rounded-lg bg-slate-100 hover:bg-rose-100 text-slate-500 hover:text-rose-700 cursor-pointer"
                  title="Kartı sil"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
