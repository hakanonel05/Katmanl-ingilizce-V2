import React, { useState, useEffect } from 'react';
import { PRESET_LESSONS } from './data/presetLessons';
import { VideoLesson, UserProgress, VocabularyItem, GrammarRuleItem, QuizQuestion } from './types';
import { Header } from './components/Header';
import { LessonSelector } from './components/LessonSelector';
import { LayerNavigation, LAYER_TABS } from './components/LayerNavigation';
import { Layer1BilingualReading } from './components/layers/Layer1BilingualReading';
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

  const [progress, setProgress] = useState<UserProgress>({
    completedVideoCount: 1,
    goalVideoCount: 20,
    studyStreakDays: 3,
    lastStudyDate: new Date().toISOString(),
    bookmarkedWords: [
      {
        word: 'Holistic',
        enContext: 'Layered learning takes a holistic approach to language acquisition.',
        trContext: 'Katmanlı çalışma dil edinimine bütüncül bir yaklaşım getirir.',
      },
    ],
  });

  const activeLesson = lessons.find((l) => l.id === activeLessonId) || lessons[0] || null;

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

    // If layer 5 completed, increment completed video count
    if (layerNum === 5) {
      setProgress((prev) => ({
        ...prev,
        completedVideoCount: Math.min(20, prev.completedVideoCount + 1),
      }));
    }

    // Move to next layer if not at max
    if (layerNum < 6) {
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
  if (!sentRes.ok) throw new Error(sentData.error || 'Transkript alinamadi.');

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
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-amber-500 selection:text-slate-950 flex flex-col antialiased">
      {/* Top Header */}
      <Header
        progress={progress}
        onOpenGuide={() => setIsGuideOpen(true)}
        onOpenGrammarCoach={() => setIsGrammarCoachOpen(true)}
      />

      {/* Main Content Workspace */}
      <main className="flex-1 max-w-[1920px] w-full mx-auto px-3 sm:px-6 lg:px-8 py-5 space-y-6">
        {/* Lesson Selector Component */}
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

        {/* 7-Layer Navigation Stepper */}
        <LayerNavigation
          activeLayer={activeLayer}
          onSelectLayer={setActiveLayer}
          completedLayers={activeLesson ? activeLesson.completedLayers : []}
        />

        {/* Dynamic Layer Views */}
        <div className="min-h-[500px]">
          {!activeLesson && activeLayer !== 6 ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-4 shadow-sm max-w-xl mx-auto my-12">
              <h3 className="text-base font-bold text-slate-900">Çalışacak Ders Seçilmedi</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Tüm dersler silindi. Yukarıdaki &quot;Yeni YouTube Videosu / Metin Ekle&quot; butonundan kendi çalışmanızı ekleyebilir veya örnek dersleri geri yükleyebilirsiniz.
              </p>
              <button
                type="button"
                onClick={handleRestorePresetLessons}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-sm transition cursor-pointer"
              >
                Varsayılan Örnek Dersleri Yükle
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
                <Layer2PhoneticsGrammar
                  lesson={activeLesson}
                  onCompleteLayer={() => handleCompleteLayer(2)}
                  onUpdateLessonData={handleUpdateLessonData}
                />
              )}

              {activeLayer === 3 && activeLesson && (
                <Layer3ComprehensionQuiz
                  lesson={activeLesson}
                  onCompleteLayer={() => handleCompleteLayer(3)}
                  onUpdateQuizData={handleUpdateQuizData}
                />
              )}

              {activeLayer === 4 && activeLesson && (
                <Layer4WritingEvaluation
                  lesson={activeLesson}
                  onCompleteLayer={() => handleCompleteLayer(4)}
                  onSaveWriting={handleSaveWriting}
                />
              )}

              {activeLayer === 5 && activeLesson && (
                <Layer5SpeakingSimulation
                  lesson={activeLesson}
                  onCompleteLayer={() => handleCompleteLayer(5)}
                />
              )}

              {activeLayer === 6 && (
                <ProgressDashboard
                  progress={progress}
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
