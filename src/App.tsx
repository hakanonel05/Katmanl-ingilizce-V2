import React, { useState, useEffect, useMemo } from 'react';
import { PRESET_LESSONS } from './data/presetLessons';
import { VideoLesson, UserProgress, VocabularyItem, GrammarRuleItem, QuizQuestion } from './types';
import { Header } from './components/Header';
import { LessonSelector } from './components/LessonSelector';
import { LayerNavigation, LAYER_TABS } from './components/LayerNavigation';
import { Layer1BilingualReading } from './components/layers/Layer1BilingualReading';
import { Layer2ActiveListening } from './components/layers/Layer2ActiveListening';
import { Layer3Shadowing } from './components/layers/Layer3Shadowing';
import { Layer4NoSubtitles } from './components/layers/Layer4NoSubtitles';
import { Layer5AudioOnly } from './components/layers/Layer5AudioOnly';
import { VocabHub } from './components/vocab/VocabHub';
import { Layer2PhoneticsGrammar } from './components/layers/Layer2PhoneticsGrammar';
import { Layer3ComprehensionQuiz } from './components/layers/Layer3ComprehensionQuiz';
import { Layer4WritingEvaluation } from './components/layers/Layer4WritingEvaluation';
import { Layer5SpeakingSimulation } from './components/layers/Layer5SpeakingSimulation';
import { ProgressDashboard } from './components/ProgressDashboard';
import { MethodologyGuideModal } from './components/MethodologyGuideModal';
import { GrammarCoachDrawer } from './components/GrammarCoachDrawer';
import { EditLessonModal } from './components/EditLessonModal';
import { extractYouTubeId } from './lib/youtube';

// Sürüm anahtarı: eski kayıtlarda bozuk/eksik zaman damgaları vardı.
// Anahtar değiştiği için eski dersler otomatik devre dışı kalır ve
// kullanıcının localStorage'ı elle temizlemesine gerek kalmaz.
const LESSONS_STORAGE_KEY = 'layered_learning_lessons_v2';
const PROGRESS_STORAGE_KEY = 'layered_learning_progress_v1';

/** Bugunun tarihi, YYYY-MM-DD (yerel saat). */
function todayKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Ardisik calisma gunu sayisini hesaplar.
 * Seri bugunden veya dunden geriye dogru kesintisiz devam ettigi surece sayilir;
 * bir gun atlanirsa sifirlanir. Boylece sayi gercek kullanimi yansitir.
 */
function calculateStreak(dates: string[]): number {
  if (!dates || dates.length === 0) return 0;

  const unique = Array.from(new Set(dates)).sort().reverse();
  const today = todayKey();
  const yesterday = todayKey(new Date(Date.now() - 86400000));

  // Seri ancak bugun veya dun calisilmissa canlidir
  if (unique[0] !== today && unique[0] !== yesterday) return 0;

  let streak = 1;
  for (let i = 1; i < unique.length; i++) {
    const prev = new Date(unique[i - 1] + 'T00:00:00');
    const curr = new Date(unique[i] + 'T00:00:00');
    const diffDays = Math.round((prev.getTime() - curr.getTime()) / 86400000);
    if (diffDays === 1) streak++;
    else break;
  }
  return streak;
}

export default function App() {
  const [lessons, setLessons] = useState<VideoLesson[]>(() => {
    try {
      const saved = localStorage.getItem(LESSONS_STORAGE_KEY);
      if (saved !== null) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      }
    } catch (e) {
      console.error('Failed to load lessons from localStorage:', e);
    }
    return PRESET_LESSONS;
  });

  const [activeLessonId, setActiveLessonId] = useState<string>(() => lessons[0]?.id || '');
  const [activeLayer, setActiveLayer] = useState<number>(1);
  const [isGuideOpen, setIsGuideOpen] = useState<boolean>(false);
  const [isGrammarCoachOpen, setIsGrammarCoachOpen] = useState<boolean>(false);
  const [editingLesson, setEditingLesson] = useState<VideoLesson | null>(null);

  // Sync lessons to localStorage when updated
  useEffect(() => {
    try {
      localStorage.setItem(LESSONS_STORAGE_KEY, JSON.stringify(lessons));
    } catch (e) {
      console.error('Failed to save lessons to localStorage:', e);
    }
  }, [lessons]);

  const [progress, setProgress] = useState<UserProgress>(() => {
    try {
      const saved = localStorage.getItem(PROGRESS_STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error('Failed to load progress:', e);
    }
    return {
    completedVideoCount: 0,
    goalVideoCount: 20,
    studyStreakDays: 0,
    lastStudyDate: new Date().toISOString(),
    studyDates: [],
    bookmarkedWords: [
      {
        word: 'Holistic',
        enContext: 'Layered learning takes a holistic approach to language acquisition.',
        trContext: 'Katmanlı çalışma dil edinimine bütüncül bir yaklaşım getirir.',
      },
    ],
    };
  });

  // Ilerlemeyi kalici sakla
  useEffect(() => {
    try {
      localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(progress));
    } catch (e) {
      console.error('Failed to save progress:', e);
    }
  }, [progress]);

  /** Bugunu calisma gunu olarak isaretler ve seriyi yeniden hesaplar. */
  const recordStudyToday = () => {
    setProgress((prev) => {
      const dates = Array.from(new Set([...(prev.studyDates || []), todayKey()]));
      return {
        ...prev,
        studyDates: dates,
        studyStreakDays: calculateStreak(dates),
        lastStudyDate: new Date().toISOString(),
      };
    });
  };

  /** Hedef ve seri gibi degerleri kullanicinin duzenlemesine izin verir. */
  const handleUpdateProgress = (patch: Partial<UserProgress>) => {
    setProgress((prev) => ({ ...prev, ...patch }));
  };

  const activeLesson = lessons.find((l) => l.id === activeLessonId) || lessons[0] || null;

  /**
   * Tamamlanan video sayisi artik sayacla degil, derslerin gercek durumundan
   * turetiliyor. Boylece ders silinince veya katman geri alininca sayi da
   * dogru kaliyor; ayni dersi iki kez bitirmek sayiyi sisirmiyor.
   */
  const displayProgress: UserProgress = useMemo(() => {
    const completed = lessons.filter((l) => l.completedLayers?.includes(7)).length;
    return {
      ...progress,
      completedVideoCount: completed,
      studyStreakDays: calculateStreak(progress.studyDates || []),
    };
  }, [lessons, progress]);

  // Delete Lesson handler
  const handleDeleteLesson = (lessonId: string) => {
    const updated = lessons.filter((l) => l.id !== lessonId);
    setLessons(updated);
    if (updated.length > 0) {
      if (activeLessonId === lessonId) {
        setActiveLessonId(updated[0].id);
      }
    } else {
      setActiveLessonId('');
    }
    setActiveLayer(1);
  };

  // Restore Default Preset Lessons handler
  const handleRestorePresetLessons = () => {
    setLessons(PRESET_LESSONS);
    setActiveLessonId(PRESET_LESSONS[0].id);
    setActiveLayer(1);
  };

  // Edit Lesson handler
  const handleSaveEditedLesson = (updatedLesson: VideoLesson) => {
    setLessons((prev) =>
      prev.map((l) => (l.id === updatedLesson.id ? updatedLesson : l))
    );
  };

  // Bookmark Word handler
  const handleBookmarkWord = (word: string, enContext: string, trContext: string) => {
    setProgress((prev) => {
      if (prev.bookmarkedWords.some((b) => b.word.toLowerCase() === word.toLowerCase())) {
        return prev;
      }
      return {
        ...prev,
        bookmarkedWords: [...prev.bookmarkedWords, { word, enContext, trContext }],
      };
    });
  };

  // Complete Layer handler
  const handleCompleteLayer = (layerNum: number) => {
    setLessons((prev) =>
      prev.map((l) => {
        if (l.id === activeLesson.id) {
          const updatedLayers = Array.from(new Set([...l.completedLayers, layerNum]));
          return { ...l, completedLayers: updatedLayers };
        }
        return l;
      })
    );

    // Herhangi bir katman tamamlandiginda bugun "calisilmis" sayilir
    recordStudyToday();

    // Çekirdek 7 katman içinde otomatik ilerle. 8 ekstra çalışma olduğu için
    // oradan otomatik geçiş yapılmıyor.
    if (layerNum < 7) {
      setActiveLayer(layerNum + 1);
    }
  };

/**
 * Sunucudan gelen yaniti guvenle okur. Netlify zaman asiminda JSON yerine
 * HTML hata sayfasi donuyor ve JSON.parse "Unexpected token '<'" hatasi
 * veriyordu. Burada anlasilir bir mesaja cevriliyor.
 */
async function readJsonResponse(res: Response, fallbackMsg: string): Promise<any> {
  const raw = await res.text();
  try {
    return JSON.parse(raw);
  } catch {
    if (res.status === 502 || res.status === 504 || /timed?\s*out|gateway/i.test(raw)) {
      throw new Error(
        'Sunucu zaman asimina ugradi. Video cok uzun olabilir; daha kisa bir videoyla deneyin.'
      );
    }
    throw new Error(`${fallbackMsg} (HTTP ${res.status})`);
  }
}

/** Frontend'in cagirdigi grup boyutu. Her istek birkac saniyede biter. */
const TRANSLATE_BATCH_SIZE = 20;

/**
 * Dersi PARCA PARCA olusturur: once cumleler ve gercek zaman damgalari,
 * sonra sirayla ceviri gruplari, en son ogrenme materyali. Boylece hicbir
 * istek serverless zaman sinirina takilmaz.
 */
async function buildLessonData(
  input: string,
  youtubeUrlInput?: string,
  onProgress?: (message: string) => void
) {
  onProgress?.('Altyazi aliniyor...');

  const sentRes = await fetch('/api/transcript-sentences', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ videoInput: input, youtubeUrl: youtubeUrlInput }),
  });
  const sentData = await readJsonResponse(sentRes, 'Transkript alinamadi.');
  if (!sentRes.ok) {
    // Sunucu gercek sebebi "reason" alaninda dondurur; teshis icin gorunur yap
    const detail = sentData.reason ? ` (Sunucu: ${sentData.reason})` : '';
    throw new Error((sentData.error || 'Transkript alınamadı.') + detail);
  }

  const sentences: any[] = sentData.sentences || [];
  if (sentences.length === 0) throw new Error('Transkriptten cumle cikarilamadi.');

  // Ceviriyi gruplar halinde, sirayla iste
  const translations: Record<number, string> = {};
  const totalBatches = Math.ceil(sentences.length / TRANSLATE_BATCH_SIZE);

  for (let i = 0; i < sentences.length; i += TRANSLATE_BATCH_SIZE) {
    const batchNo = Math.floor(i / TRANSLATE_BATCH_SIZE) + 1;
    onProgress?.(`Ceviriliyor... (${batchNo}/${totalBatches})`);

    const chunk = sentences
      .slice(i, i + TRANSLATE_BATCH_SIZE)
      .map((s) => ({ id: s.id, en: s.en }));

    const trRes = await fetch('/api/translate-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sentences: chunk }),
    });
    const trData = await readJsonResponse(trRes, 'Ceviri yapilamadi.');
    if (!trRes.ok) throw new Error(trData.error || 'Ceviri yapilamadi.');

    Object.assign(translations, trData.translations || {});
  }

  const finalSentences = sentences.map((s) => ({
    ...s,
    tr: translations[s.id] || '',
  }));

  // Ogrenme materyali: basarisiz olursa ders yine de olusur,
  // eksik katmanlar arka planda tamamlanir.
  let material: any = {};
  try {
    onProgress?.('Kelime, gramer ve quiz hazirlaniyor...');
    const fullText = sentences.map((s) => s.en).join(' ');
    const matRes = await fetch('/api/study-material', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: fullText }),
    });
    if (matRes.ok) material = await readJsonResponse(matRes, '');
  } catch (e) {
    console.warn('Ogrenme materyali uretilemedi, arka planda tekrar denenecek:', e);
  }

  return {
    title: sentData.title,
    sentences: finalSentences,
    hasRealTimings: !!sentData.hasRealTimings,
    vocabulary: material.vocabulary || [],
    grammarRules: material.grammarRules || [],
    quizQuestions: material.quizQuestions || [],
  };
}

  // Custom Video Import Handler
  const handleImportCustomLesson = async (
    input: string,
    youtubeUrlInput?: string,
    onProgress?: (message: string) => void
  ) => {
    const data = await buildLessonData(input, youtubeUrlInput, onProgress);

    const activeYtUrl = (youtubeUrlInput && youtubeUrlInput.trim()) ? youtubeUrlInput.trim() : input;
    const ytId = extractYouTubeId(activeYtUrl);

    const newLesson: VideoLesson = {
      id: `custom-${Date.now()}`,
      title: data.title || 'Yeni İçe Aktarılan Video',
      youtubeUrl: activeYtUrl,
      youtubeId: ytId,
      description: 'YouTube altyazısından otomatik oluşturulan çift dilli transkript.',
      level: 'B2',
      durationMinutes: 8,
      completedLayers: [],
      sentences: data.sentences || [],
      hasRealTimings: data.hasRealTimings,
      vocabulary: data.vocabulary || [],
      grammarRules: data.grammarRules || [],
      quizQuestions: data.quizQuestions || [],
    };

    setLessons((prev) => [newLesson, ...prev]);
    setActiveLessonId(newLesson.id);
    setActiveLayer(1);
  };

  // Background Auto-Generation for Katman 2 & 3 if missing
  useEffect(() => {
    if (
      activeLesson &&
      activeLesson.sentences &&
      activeLesson.sentences.length > 0 &&
      ((!activeLesson.vocabulary || activeLesson.vocabulary.length === 0) ||
       (!activeLesson.grammarRules || activeLesson.grammarRules.length === 0) ||
       (!activeLesson.quizQuestions || activeLesson.quizQuestions.length === 0))
    ) {
      let isCancelled = false;
      const generateAllLayersInBackground = async () => {
        try {
          const fullText = activeLesson.sentences.map((s) => s.en).join(' ');

          const phoneticsPromise = fetch('/api/analyze-phonetics-grammar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ transcriptSentences: activeLesson.sentences }),
          }).then((r) => r.json());

          const quizPromise = fetch('/api/generate-quiz', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ transcriptText: fullText }),
          }).then((r) => r.json());

          const [phoneticsData, quizData] = await Promise.all([phoneticsPromise, quizPromise]);

          if (!isCancelled) {
            setLessons((prev) =>
              prev.map((l) => {
                if (l.id === activeLesson.id) {
                  return {
                    ...l,
                    vocabulary: (l.vocabulary && l.vocabulary.length > 0) ? l.vocabulary : (phoneticsData.vocabulary || []),
                    grammarRules: (l.grammarRules && l.grammarRules.length > 0) ? l.grammarRules : (phoneticsData.grammarRules || []),
                    quizQuestions: (l.quizQuestions && l.quizQuestions.length > 0) ? l.quizQuestions : (quizData.quizQuestions || []),
                  };
                }
                return l;
              })
            );
          }
        } catch (e) {
          console.warn('Background analysis generation failed:', e);
        }
      };

      generateAllLayersInBackground();
      return () => { isCancelled = true; };
    }
  }, [activeLessonId, activeLesson?.id, activeLesson?.vocabulary?.length, activeLesson?.grammarRules?.length, activeLesson?.quizQuestions?.length]);

  /**
   * Mevcut bir dersi (özellikle elle yazılmış hazır dersleri) videonun
   * GERÇEK YouTube altyazısından yeniden üretir. Cümleler ve zaman
   * damgaları sunucuda gerçek cue verisinden hesaplanır.
   */
  const handleResyncLessonFromCaptions = async (
    lessonId: string,
    onProgress?: (message: string) => void
  ) => {
    const target = lessons.find((l) => l.id === lessonId);
    if (!target) throw new Error('Ders bulunamadı.');

    const url = target.youtubeUrl || target.youtubeId || '';
    if (!extractYouTubeId(url)) {
      throw new Error('Bu derste geçerli bir YouTube linki yok. Önce "URL Değiştir" ile link ekleyin.');
    }

    const data = await buildLessonData(url, undefined, onProgress);

    if (!data.hasRealTimings) {
      throw new Error('Bu videoda zaman bilgisi içeren bir altyazı bulunamadı.');
    }

    setLessons((prev) =>
      prev.map((l) => {
        if (l.id !== lessonId) return l;
        return {
          ...l,
          title: data.title || l.title,
          sentences: data.sentences || l.sentences,
          hasRealTimings: true,
          vocabulary: data.vocabulary?.length ? data.vocabulary : l.vocabulary,
          grammarRules: data.grammarRules?.length ? data.grammarRules : l.grammarRules,
          quizQuestions: data.quizQuestions?.length ? data.quizQuestions : l.quizQuestions,
        };
      })
    );
  };

  // Update Lesson YouTube Video URL
  const handleUpdateLessonVideoUrl = (youtubeUrl: string) => {
    const ytId = extractYouTubeId(youtubeUrl);
    setLessons((prev) =>
      prev.map((l) => {
        if (l.id === activeLesson.id) {
          return { ...l, youtubeUrl, youtubeId: ytId };
        }
        return l;
      })
    );
  };

  // Update Layer 2 Vocabulary & Grammar Rules
  const handleUpdateLessonData = (
    vocabulary: VocabularyItem[],
    grammarRules: GrammarRuleItem[]
  ) => {
    setLessons((prev) =>
      prev.map((l) => {
        if (l.id === activeLesson.id) {
          return { ...l, vocabulary, grammarRules };
        }
        return l;
      })
    );
  };

  // Update Layer 3 Quiz Data
  const handleUpdateQuizData = (quizQuestions: QuizQuestion[]) => {
    setLessons((prev) =>
      prev.map((l) => {
        if (l.id === activeLesson.id) {
          return { ...l, quizQuestions };
        }
        return l;
      })
    );
  };

  // Update Layer 4 User Summary & Comment
  const handleSaveWriting = (summary: string, comment: string) => {
    setLessons((prev) =>
      prev.map((l) => {
        if (l.id === activeLesson.id) {
          return { ...l, userSummary: summary, userComment: comment };
        }
        return l;
      })
    );
  };

  return (
    <div className="min-h-screen bg-[var(--paper)] text-[var(--ink)] flex flex-col">
      {/* Top Header */}
      <Header
        progress={displayProgress}
        onUpdateProgress={handleUpdateProgress}
        onOpenGuide={() => setIsGuideOpen(true)}
        onOpenGrammarCoach={() => setIsGrammarCoachOpen(true)}
      />

      {/* Main Content Workspace */}
      <main className="flex-1 w-full">
        <div className="max-w-[1400px] w-full mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-5">
        <LessonSelector
          lessons={lessons}
          activeLesson={activeLesson}
          onSelectLesson={(lesson) => {
            setActiveLessonId(lesson.id);
            setActiveLayer(1);
          }}
          onImportCustomLesson={handleImportCustomLesson}
          onDeleteLesson={handleDeleteLesson}
          onEditLesson={(lesson) => setEditingLesson(lesson)}
          onRestorePresetLessons={handleRestorePresetLessons}
        />
        </div>

        <LayerNavigation
          activeLayer={activeLayer}
          onSelectLayer={setActiveLayer}
          completedLayers={activeLesson ? activeLesson.completedLayers : []}
        />

        <div className="min-h-[500px] max-w-[1400px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {!activeLesson && activeLayer !== 9 && activeLayer !== 10 ? (
            <div className="max-w-md mx-auto my-16 text-center space-y-4">
              <p className="eyebrow">Başlangıç</p>
              <h3 className="font-display text-2xl text-[var(--ink)]">
                Bir <em className="italic font-light">ders</em> ekleyin
              </h3>
              <p className="text-sm text-[var(--ink-2)] leading-relaxed">
                Yukarıdan bir YouTube linki verin; altyazı çekilip cümlelere bölünür ve
                yedi katmanlı çalışma başlar. Dilerseniz örnek derslerle de deneyebilirsiniz.
              </p>
              <button
                type="button"
                onClick={handleRestorePresetLessons}
                className="h-10 px-5 rounded-[10px] border border-[var(--hairline)] text-[var(--ink)] text-xs font-medium hover:border-[var(--ink)] transition-colors cursor-pointer inline-flex items-center justify-center"
              >
                Örnek dersleri yükle
              </button>
            </div>
          ) : (
            <>
              {activeLayer === 1 && activeLesson && (
                <Layer1BilingualReading
                  lesson={activeLesson}
                  onBookmarkWord={handleBookmarkWord}
                  bookmarkedWords={progress.bookmarkedWords}
                  onCompleteLayer={() => handleCompleteLayer(1)}
                  onUpdateVideoUrl={handleUpdateLessonVideoUrl}
                  onResyncFromCaptions={(onProgress) => handleResyncLessonFromCaptions(activeLesson.id, onProgress)}
                />
              )}

              {activeLayer === 2 && activeLesson && (
                <Layer2ActiveListening
                  lesson={activeLesson}
                  onCompleteLayer={() => handleCompleteLayer(2)}
                />
              )}

              {activeLayer === 3 && activeLesson && (
                <Layer3Shadowing
                  lesson={activeLesson}
                  onCompleteLayer={() => handleCompleteLayer(3)}
                />
              )}

              {activeLayer === 4 && activeLesson && (
                <Layer4NoSubtitles
                  lesson={activeLesson}
                  onCompleteLayer={() => handleCompleteLayer(4)}
                  onUpdateQuizData={handleUpdateQuizData}
                />
              )}

              {activeLayer === 5 && activeLesson && (
                <Layer5AudioOnly
                  lesson={activeLesson}
                  onCompleteLayer={() => handleCompleteLayer(5)}
                />
              )}

              {activeLayer === 6 && activeLesson && (
                <Layer4WritingEvaluation
                  lesson={activeLesson}
                  onCompleteLayer={() => handleCompleteLayer(6)}
                  onSaveWriting={handleSaveWriting}
                />
              )}

              {activeLayer === 7 && activeLesson && (
                <Layer5SpeakingSimulation
                  lesson={activeLesson}
                  onCompleteLayer={() => handleCompleteLayer(7)}
                />
              )}

              {/* Ekstra katman: metodolojinin çekirdeğinde yok, destek çalışması */}
              {activeLayer === 8 && activeLesson && (
                <Layer2PhoneticsGrammar
                  lesson={activeLesson}
                  onCompleteLayer={() => handleCompleteLayer(8)}
                  onUpdateLessonData={handleUpdateLessonData}
                />
              )}

              {activeLayer === 10 && (
                <VocabHub lesson={activeLesson} lessons={lessons} />
              )}

              {activeLayer === 9 && (
                <ProgressDashboard
                  progress={displayProgress}
                  lessons={lessons}
                  onSelectLesson={(lesson) => {
                    setActiveLessonId(lesson.id);
                    setActiveLayer(1);
                  }}
                />
              )}
            </>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-4 text-center text-xs text-slate-500">
        <p>Katmanlı Çalışma (Layered Learning) Metodolojisi &bull; Gemini AI Studio Dil Koçu</p>
      </footer>

      {/* Modals & Drawers */}
      <MethodologyGuideModal
        isOpen={isGuideOpen}
        onClose={() => setIsGuideOpen(false)}
      />

      <GrammarCoachDrawer
        isOpen={isGrammarCoachOpen}
        onClose={() => setIsGrammarCoachOpen(false)}
        activeLessonTitle={activeLesson ? activeLesson.title : ''}
      />

      <EditLessonModal
        isOpen={!!editingLesson}
        lesson={editingLesson}
        onClose={() => setEditingLesson(null)}
        onSaveLesson={handleSaveEditedLesson}
      />
    </div>
  );
}
