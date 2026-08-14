import React, { useState, useEffect, useRef, useMemo } from 'react';
import { VideoLesson, SentencePair } from '../../types';
import { extractYouTubeId } from '../../lib/youtube';
import { SelectionToCard } from '../vocab/SelectionToCard';
import { Volume2, Bookmark, CheckCircle, Search, Eye, EyeOff, Youtube, Edit2, Check, X, LayoutGrid, List, Play, Sliders, AlertTriangle, RefreshCw, Pause } from 'lucide-react';

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

interface Layer1BilingualReadingProps {
  lesson: VideoLesson;
  onBookmarkWord: (word: string, enContext: string, trContext: string) => void;
  bookmarkedWords: { word: string }[];
  onCompleteLayer: () => void;
  onUpdateVideoUrl?: (youtubeUrl: string) => void;
  /** Dersi videonun gerçek YouTube altyazısından yeniden üretir. */
  onResyncFromCaptions?: (onProgress?: (message: string) => void) => Promise<void>;
}

/**
 * Bir cümlenin GERÇEK başlangıç saniyesini döndürür.
 * Öncelik sırası: startSec (sunucudan gelen gerçek değer) > timestamp metni.
 * Zaman bilgisi yoksa null döner. ESKİ "index * 7" TAHMİNİ KALDIRILDI:
 * o tahmin, videonun ilerleyen dakikalarında kaymanın ana sebebiydi.
 */
const getStartSeconds = (pair: SentencePair): number | null => {
  if (typeof pair.startSec === 'number' && isFinite(pair.startSec)) {
    return pair.startSec;
  }
  if (pair.timestamp) {
    const parts = pair.timestamp.split(':').map((p) => parseInt(p, 10));
    if (parts.length === 2 && parts.every((n) => !isNaN(n))) {
      return parts[0] * 60 + parts[1];
    }
    if (parts.length === 3 && parts.every((n) => !isNaN(n))) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
  }
  return null;
};

const formatSeconds = (totalSeconds: number) => {
  const total = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const mm = minutes.toString().padStart(2, '0');
  const ss = seconds.toString().padStart(2, '0');
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
};

export const Layer1BilingualReading: React.FC<Layer1BilingualReadingProps> = ({
  lesson,
  onBookmarkWord,
  onCompleteLayer,
  onUpdateVideoUrl,
  onResyncFromCaptions,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [hideTurkish, setHideTurkish] = useState(false);
  const [playingSentenceId, setPlayingSentenceId] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<'split' | 'stacked'>('split');

  // İnce ayar ofseti. Gerçek altyazı zamanları kullanıldığında 0 olmalıdır.
  const [offsetSeconds, setOffsetSeconds] = useState<number>(0);

  const [showVideoUrlInput, setShowVideoUrlInput] = useState(false);
  const [newVideoUrl, setNewVideoUrl] = useState('');

  // Gerçek altyazıdan yeniden üretme durumu
  const [isResyncing, setIsResyncing] = useState(false);
  const [resyncError, setResyncError] = useState<string | null>(null);
  const [resyncProgress, setResyncProgress] = useState('');

  // YouTube Player State
  const playerRef = useRef<any>(null);
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const activeSentenceRef = useRef<HTMLDivElement | null>(null);
  const transcriptAreaRef = useRef<HTMLDivElement | null>(null);

  const [currentVideoTime, setCurrentVideoTime] = useState<number>(0);
  const [isVideoPlaying, setIsVideoPlaying] = useState<boolean>(false);
  const [isPlayerReady, setIsPlayerReady] = useState<boolean>(false);

  const ytId = lesson.youtubeId || extractYouTubeId(lesson.youtubeUrl);

  // Zaman bilgisi olan cümlelerin listesi (senkronizasyon tablosu)
  const syncPoints = useMemo(() => {
    return (lesson.sentences || [])
      .map((pair, index) => ({ index, id: pair.id, start: getStartSeconds(pair) }))
      .filter((p): p is { index: number; id: number; start: number } => p.start !== null)
      .sort((a, b) => a.start - b.start);
  }, [lesson.sentences]);

  const hasTimings = syncPoints.length > 0;

  const handleResync = async () => {
    if (!onResyncFromCaptions || isResyncing) return;
    setIsResyncing(true);
    setResyncError(null);
    setResyncProgress('Başlatılıyor...');
    try {
      await onResyncFromCaptions(setResyncProgress);
    } catch (err: any) {
      setResyncError(err?.message || 'Senkronizasyon başarısız oldu.');
    } finally {
      setIsResyncing(false);
      setResyncProgress('');
    }
  };

  const handleSaveVideoUrl = (e: React.FormEvent) => {
    e.preventDefault();
    if (onUpdateVideoUrl && newVideoUrl.trim()) {
      onUpdateVideoUrl(newVideoUrl.trim());
      setShowVideoUrlInput(false);
      setNewVideoUrl('');
    }
  };

  // Initialize YouTube Iframe Player
  useEffect(() => {
    if (!ytId) return;

    let isSubscribed = true;

    const createPlayer = () => {
      if (!window.YT || !window.YT.Player || !playerContainerRef.current) return;

      // DÜZELTME: ham HTML içinde "className" geçersizdir, "class" olmalı.
      playerContainerRef.current.innerHTML = '<div id="yt-embed-element" class="w-full h-full"></div>';

      try {
        playerRef.current = new window.YT.Player('yt-embed-element', {
          height: '100%',
          width: '100%',
          videoId: ytId,
          playerVars: {
            autoplay: 0,
            rel: 0,
            modestbranding: 1,
            enablejsapi: 1,
            playsinline: 1,
            origin: typeof window !== 'undefined' ? window.location.origin : undefined,
          },
          events: {
            onReady: () => {
              if (isSubscribed) setIsPlayerReady(true);
            },
            onStateChange: (event: any) => {
              if (!isSubscribed) return;
              const state = event.data;
              // DÜZELTME: BUFFERING durumunda oynatma "durdu" sayılmamalı,
              // aksi halde tampon sırasında vurgu donuyordu.
              if (state === window.YT.PlayerState.PLAYING || state === window.YT.PlayerState.BUFFERING) {
                setIsVideoPlaying(true);
              } else {
                setIsVideoPlaying(false);
              }
            },
          },
        });
      } catch (err) {
        console.warn('YouTube Player initialization failed:', err);
      }
    };

    if (window.YT && window.YT.Player) {
      createPlayer();
    } else {
      if (!document.getElementById('yt-iframe-api-script')) {
        const tag = document.createElement('script');
        tag.id = 'yt-iframe-api-script';
        tag.src = 'https://www.youtube.com/iframe_api';
        const firstScriptTag = document.getElementsByTagName('script')[0];
        firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
      }

      const previousOnReady = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (previousOnReady) previousOnReady();
        createPlayer();
      };
    }

    return () => {
      isSubscribed = false;
      setIsPlayerReady(false);
      if (playerRef.current) {
        try {
          if (typeof playerRef.current.destroy === 'function') {
            playerRef.current.destroy();
          }
        } catch (e) {
          // ignore cleanup errors
        }
        playerRef.current = null;
      }
    };
  }, [ytId]);

  // DÜZELTME: Zamanlayıcı artık oynatıcı hazır olduğu sürece çalışıyor.
  // Böylece durdurulmuşken yapılan atlamalarda da vurgu doğru cümleye gidiyor.
  useEffect(() => {
    if (!isPlayerReady) return;

    const interval = setInterval(() => {
      const player = playerRef.current;
      if (player && typeof player.getCurrentTime === 'function') {
        const t = player.getCurrentTime();
        if (typeof t === 'number' && isFinite(t)) {
          setCurrentVideoTime(t);
        }
      }
    }, 150);

    return () => clearInterval(interval);
  }, [isPlayerReady]);

  // Intro/jenerik ofseti düşülmüş konuşma zamanı
  const speechTime = useMemo(
    () => Math.max(0, currentVideoTime - offsetSeconds),
    [currentVideoTime, offsetSeconds]
  );

  // Aktif cümleyi belirle
  const { activeSentenceId, activeSentenceIndex } = useMemo(() => {
    if (playingSentenceId !== null) {
      const idx = lesson.sentences.findIndex((s) => s.id === playingSentenceId);
      return { activeSentenceId: playingSentenceId, activeSentenceIndex: idx };
    }

    if (!hasTimings || currentVideoTime <= 0) {
      return { activeSentenceId: null as number | null, activeSentenceIndex: -1 };
    }

    // Zaman sırasına dizilmiş listede, speechTime'ı geçmeyen son cümle aktiftir
    let found: { index: number; id: number } | null = null;
    for (let i = 0; i < syncPoints.length; i++) {
      if (speechTime >= syncPoints[i].start) {
        found = { index: syncPoints[i].index, id: syncPoints[i].id };
      } else {
        break;
      }
    }

    if (!found) return { activeSentenceId: null as number | null, activeSentenceIndex: -1 };
    return { activeSentenceId: found.id, activeSentenceIndex: found.index };
  }, [speechTime, currentVideoTime, playingSentenceId, lesson.sentences, syncPoints, hasTimings]);

  // Aktif cümleyi görünür alana kaydır
  useEffect(() => {
    if (activeSentenceId && activeSentenceRef.current) {
      activeSentenceRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [activeSentenceId]);

  const filteredSentences = useMemo(() => {
    const term = searchTerm.toLowerCase();
    // DÜZELTME: orijinal index korunuyor. Eskiden filtrelenmiş dizinin index'i
    // kullanıldığı için arama yapılınca yanlış saniyeye atlanıyordu.
    return (lesson.sentences || [])
      .map((pair, originalIndex) => ({ pair, originalIndex }))
      .filter(
        ({ pair }) =>
          pair.en.toLowerCase().includes(term) || (pair.tr || '').toLowerCase().includes(term)
      );
  }, [lesson.sentences, searchTerm]);

  // Videoda ilgili saniyeye atla
  const jumpToSentenceInVideo = (pair: SentencePair) => {
    const start = getStartSeconds(pair);

    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      setPlayingSentenceId(null);
    }

    if (start === null) {
      // Zaman bilgisi yoksa videoyu oynatmak yerine sadece seslendir
      speakText(pair.id, pair.en);
      return;
    }

    const actualVideoTime = Math.max(0, start + offsetSeconds);

    if (playerRef.current && typeof playerRef.current.seekTo === 'function') {
      playerRef.current.seekTo(actualVideoTime, true);
      playerRef.current.playVideo();
      setCurrentVideoTime(actualVideoTime);
      setIsVideoPlaying(true);
    } else {
      speakText(pair.id, pair.en);
    }
  };

  /** Videoyu oynat/duraklat. Transkriptten ayrılmadan kontrol için. */
  const togglePlayback = () => {
    const player = playerRef.current;
    if (!player) return;
    try {
      if (isVideoPlaying) {
        player.pauseVideo();
        setIsVideoPlaying(false);
      } else {
        player.playVideo();
        setIsVideoPlaying(true);
      }
    } catch (err) {
      console.warn('Oynatma durumu değiştirilemedi:', err);
    }
  };

  // Boşluk tuşu: oynat/duraklat. Yazı alanlarında devre dışı.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || el?.isContentEditable) return;
      // Metin seçiliyken boşluk tuşu seçimi bozmasın
      if (window.getSelection()?.toString()) return;
      e.preventDefault();
      togglePlayback();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const speakText = (sentenceId: number, text: string) => {
    if ('speechSynthesis' in window) {
      if (playingSentenceId === sentenceId) {
        window.speechSynthesis.cancel();
        setPlayingSentenceId(null);
        return;
      }
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-US';
      utterance.rate = 0.9;
      utterance.onstart = () => setPlayingSentenceId(sentenceId);
      utterance.onend = () => setPlayingSentenceId(null);
      utterance.onerror = () => setPlayingSentenceId(null);
      window.speechSynthesis.speak(utterance);
    }
  };

  return (
    <div className="space-y-6">
      {/* Metinde kelime seçilince "Karta Ekle" balonu */}
      <SelectionToCard
        containerRef={transcriptAreaRef}
        lessonId={lesson.id}
        lessonTitle={lesson.title}
        onAdded={() => { /* VocabHub depo olayıyla kendini tazeliyor */ }}
      />

      {/* Control Header */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center space-x-2.5">
            <span className="px-2.5 py-1 bg-indigo-50 text-indigo-700 border border-indigo-200 text-xs font-bold rounded-md uppercase tracking-wider">
              Layer 1
            </span>
            <h2 className="text-base sm:text-lg font-bold text-slate-900">
              Çift Dilli Okuma & Canlı Senkronizasyon
            </h2>
          </div>

          <div className="flex items-center space-x-2 flex-wrap gap-1">
            <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
              <button
                type="button"
                onClick={() => setViewMode('split')}
                className={`flex items-center space-x-1 px-2.5 py-1 rounded-md text-xs font-bold transition cursor-pointer ${
                  viewMode === 'split' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
                title="TED Stili Yan Yana Video ve Transkript Görünümü"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">TED Stili Yan Yana</span>
              </button>

              <button
                type="button"
                onClick={() => setViewMode('stacked')}
                className={`flex items-center space-x-1 px-2.5 py-1 rounded-md text-xs font-bold transition cursor-pointer ${
                  viewMode === 'stacked' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Tek Sütun Liste Görünümü"
              >
                <List className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Tek Sütun</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => setHideTurkish(!hideTurkish)}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-lg transition border border-slate-200 cursor-pointer"
            >
              {hideTurkish ? <Eye className="w-4 h-4 text-emerald-600" /> : <EyeOff className="w-4 h-4 text-indigo-600" />}
              <span>{hideTurkish ? 'Türkçe Çeviriyi Göster' : 'Türkçe Çeviriyi Gizle'}</span>
            </button>
          </div>
        </div>

        {/* Zaman bilgisi yoksa uyarı + tek tıkla düzeltme */}
        {!hasTimings && (
          <div className="bg-rose-50 border border-rose-200 p-3 rounded-lg text-xs text-rose-900 space-y-2.5">
            <div className="flex items-start space-x-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <p>
                Bu derste zaman bilgisi yok, bu yüzden cümleler videoyla senkronize edilemiyor.
                Hazır dersler elle yazıldığı için zaman damgası içermez.
                {ytId && onResyncFromCaptions
                  ? ' Aşağıdaki düğme, dersi videonun gerçek YouTube altyazısından yeniden üretir.'
                  : ' Senkron için önce geçerli bir YouTube linki ekleyin.'}
              </p>
            </div>

            {ytId && onResyncFromCaptions && (
              <button
                type="button"
                onClick={handleResync}
                disabled={isResyncing}
                className="flex items-center space-x-2 px-3.5 py-2 bg-rose-600 hover:bg-rose-700 disabled:bg-rose-300 disabled:cursor-wait text-white font-bold rounded-lg transition shadow-sm cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isResyncing ? 'animate-spin' : ''}`} />
                <span>
                  {isResyncing
                    ? (resyncProgress || 'Altyazı çekiliyor...')
                    : 'Gerçek Altyazıdan Senkronize Et'}
                </span>
              </button>
            )}

            {isResyncing && (
              <p className="text-[11px] text-rose-700 pl-0.5">
                Videonun altyazısı indiriliyor, cümlelere bölünüyor ve Türkçeye çevriliyor.
                Sayfadan ayrılma.
              </p>
            )}

            {resyncError && (
              <p className="text-[11px] font-semibold text-rose-800 bg-rose-100 border border-rose-300 rounded px-2.5 py-1.5">
                {resyncError}
              </p>
            )}
          </div>
        )}

        {/* Sync & Offset Settings Bar */}
        {hasTimings && (
          <div className="flex items-center justify-between bg-amber-50/90 border border-amber-200 p-3 rounded-lg flex-wrap gap-2">
            <div className="flex items-center space-x-2 text-amber-950 font-bold text-xs">
              <Sliders className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Senkronizasyon İnce Ayarı:</span>
              <span className="font-mono text-amber-900 font-bold bg-amber-200/90 px-2 py-0.5 rounded text-[11px]">
                {offsetSeconds === 0 ? '0s (Birebir)' : offsetSeconds > 0 ? `+${offsetSeconds}s` : `${offsetSeconds}s`}
              </span>
              <span className="hidden md:inline font-normal text-amber-800">
                Gerçek altyazı zamanları kullanılıyor, normalde 0 kalmalı.
              </span>
            </div>

            <div className="flex items-center space-x-1.5 flex-wrap gap-1">
              <button
                type="button"
                onClick={() => setOffsetSeconds(0)}
                className={`px-2.5 py-1 rounded text-[11px] font-bold transition cursor-pointer ${
                  offsetSeconds === 0
                    ? 'bg-amber-600 text-white shadow-sm'
                    : 'bg-white hover:bg-amber-100 text-amber-900 border border-amber-300'
                }`}
                title="Tam zamanında senkronizasyon (0s)"
              >
                Sıfırla (0s)
              </button>

              {ytId && onResyncFromCaptions && (
                <button
                  type="button"
                  onClick={handleResync}
                  disabled={isResyncing}
                  className="flex items-center space-x-1 px-2.5 py-1 rounded text-[11px] font-bold bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 disabled:opacity-60 disabled:cursor-wait cursor-pointer"
                  title="Dersi videonun gerçek altyazısından yeniden üret"
                >
                  <RefreshCw className={`w-3 h-3 ${isResyncing ? 'animate-spin' : ''}`} />
                  <span>{isResyncing ? (resyncProgress || 'Yenileniyor...') : 'Altyazıdan Yenile'}</span>
                </button>
              )}

              <div className="flex items-center space-x-1 border-l border-amber-300 pl-2">
                {[-1, -0.5, 0.5, 1].map((delta) => (
                  <button
                    key={delta}
                    type="button"
                    onClick={() => setOffsetSeconds((prev) => parseFloat((prev + delta).toFixed(1)))}
                    className="px-2 py-0.5 bg-white hover:bg-amber-200 border border-amber-300 text-amber-950 rounded text-xs font-bold cursor-pointer"
                    title={`${delta} saniye kaydır`}
                  >
                    {delta > 0 ? `+${delta}s` : `${delta}s`}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Search Bar */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Cümle veya kelime ara..."
            className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          />
        </div>
      </div>

      {/* Main Layout */}
      <div className={viewMode === 'split' ? 'grid grid-cols-1 lg:grid-cols-12 gap-6 items-start' : 'space-y-6'}>

        {/* Video Player Column */}
        <div className={viewMode === 'split' ? 'lg:col-span-5 lg:sticky lg:top-4 space-y-3' : 'space-y-3'}>
          {ytId ? (
            <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm space-y-2">
              <div className="aspect-video w-full rounded-lg overflow-hidden bg-slate-950 border border-slate-200 shadow-inner relative">
                <div ref={playerContainerRef} className="w-full h-full" />
              </div>

              <div className="flex items-center justify-between pt-1">
                <div className="flex items-center space-x-2 truncate max-w-[260px]">
                  <button
                    type="button"
                    onClick={togglePlayback}
                    title={isVideoPlaying ? 'Duraklat' : 'Oynat'}
                    className="flex items-center justify-center w-8 h-8 rounded-full border border-[var(--hairline)] hover:border-[var(--ink)] text-[var(--ink)] transition-colors cursor-pointer shrink-0"
                  >
                    {isVideoPlaying ? (
                      <Pause className="w-3.5 h-3.5 fill-current" />
                    ) : (
                      <Play className="w-3.5 h-3.5 fill-current" />
                    )}
                  </button>
                  {isVideoPlaying ? (
                    <span className="inline-flex items-center space-x-1 px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded-full">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse"></span>
                      <span>Canlı ({formatSeconds(currentVideoTime)})</span>
                    </span>
                  ) : (
                    <span className="text-[11px] font-semibold text-slate-500 truncate" title={lesson.title}>
                      🎬 {lesson.title}
                    </span>
                  )}
                </div>

                {onUpdateVideoUrl && (
                  <div>
                    {!showVideoUrlInput ? (
                      <button
                        type="button"
                        onClick={() => { setShowVideoUrlInput(true); setNewVideoUrl(lesson.youtubeUrl || ''); }}
                        className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 flex items-center space-x-1 transition cursor-pointer"
                      >
                        <Edit2 className="w-3 h-3" />
                        <span>URL Değiştir</span>
                      </button>
                    ) : (
                      <form onSubmit={handleSaveVideoUrl} className="flex items-center space-x-1.5 bg-slate-50 p-1.5 rounded-lg border border-slate-200">
                        <input
                          type="text"
                          value={newVideoUrl}
                          onChange={(e) => setNewVideoUrl(e.target.value)}
                          placeholder="YouTube URL..."
                          className="px-2 py-1 text-xs bg-white border border-slate-300 rounded focus:outline-none w-36"
                        />
                        <button type="submit" className="px-2 py-1 bg-indigo-600 text-white text-[11px] font-bold rounded cursor-pointer">
                          <Check className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowVideoUrlInput(false)}
                          className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </form>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-900 space-y-2">
              <div className="flex items-center space-x-2 font-bold text-amber-950">
                <Youtube className="w-4 h-4 text-red-600" />
                <span>Gömülü YouTube Videosu Ekle</span>
              </div>
              <p className="text-[11px] text-amber-800">
                Görsel ve işitsel takibi senkronize yapmak için YouTube video linkini yapıştırabilirsiniz:
              </p>
              <form onSubmit={handleSaveVideoUrl} className="flex gap-2 pt-1">
                <input
                  type="text"
                  value={newVideoUrl}
                  onChange={(e) => setNewVideoUrl(e.target.value)}
                  placeholder="https://www.youtube.com/watch?v=..."
                  className="px-3 py-1.5 text-xs bg-white border border-amber-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 flex-1"
                />
                <button
                  type="submit"
                  disabled={!newVideoUrl.trim()}
                  className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-bold rounded-lg cursor-pointer"
                >
                  Göm
                </button>
              </form>
            </div>
          )}
        </div>

        {/* Transcript Column */}
        <div ref={transcriptAreaRef} className={viewMode === 'split' ? 'lg:col-span-7' : 'w-full'}>
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">

            <div className="bg-slate-900 text-white px-4 py-2.5 border-b border-slate-800 flex items-center justify-between gap-3 sticky top-0 z-10">
              <div className="flex items-center gap-2.5 min-w-0">
                {ytId && (
                  <button
                    type="button"
                    onClick={togglePlayback}
                    title={isVideoPlaying ? 'Duraklat (boşluk)' : 'Oynat (boşluk)'}
                    className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-medium transition-colors cursor-pointer shrink-0"
                  >
                    {isVideoPlaying ? (
                      <Pause className="w-3.5 h-3.5 fill-current" />
                    ) : (
                      <Play className="w-3.5 h-3.5 fill-current" />
                    )}
                    <span>{isVideoPlaying ? 'Duraklat' : 'Oynat'}</span>
                  </button>
                )}
                <h3 className="text-xs font-medium tracking-wide text-slate-300 truncate">
                  Transkript
                </h3>
              </div>
              <span className="timecode text-slate-400 shrink-0">
                {isVideoPlaying ? formatSeconds(currentVideoTime) : `${filteredSentences.length} cümle`}
              </span>
            </div>

            <div className={`divide-y divide-slate-200 ${viewMode === 'split' ? 'max-h-[75vh] overflow-y-auto' : ''}`}>
              {filteredSentences.map(({ pair }) => {
                const isActive = activeSentenceId === pair.id;
                const start = getStartSeconds(pair);
                const timeTag = start !== null ? (pair.timestamp || formatSeconds(start)) : null;

                return (
                  <div
                    key={pair.id}
                    ref={isActive ? activeSentenceRef : null}
                    className={`p-4 sm:p-5 transition-all duration-200 border-l-4 select-text ${
                      isActive
                        ? 'bg-amber-50/95 border-amber-500 shadow-sm'
                        : 'border-slate-200'
                    }`}
                  >
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 items-start">
                      {/* English */}
                      <div className="flex items-start space-x-3">
                        {timeTag && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              jumpToSentenceInVideo(pair);
                            }}
                            className={`timecode inline-flex items-center space-x-1 px-2 py-1 rounded transition cursor-pointer shrink-0 mt-0.5 ${
                              isActive ? 'bg-amber-600 text-white shadow-sm' : 'bg-slate-100 hover:bg-amber-200 text-slate-800'
                            }`}
                            title="Videoda bu saniyeye atla"
                          >
                            <Play className="w-3 h-3 fill-current" />
                            <span>{timeTag}</span>
                          </button>
                        )}

                        <div className="flex-1">
                          {isActive ? (
                            <div className="bg-amber-100/90 text-amber-950 font-bold p-3.5 rounded-lg border border-amber-300 shadow-sm leading-relaxed">
                              <p className="transcript-en text-amber-950 font-medium">{pair.en}</p>
                              <div className="mt-2 inline-flex items-center space-x-1.5 px-2.5 py-0.5 bg-amber-600 text-white text-xs font-bold rounded-full uppercase tracking-wider shadow-sm">
                                <Volume2 className="w-3.5 h-3.5" />
                                <span>Canlı Konuşuluyor{timeTag ? ` (${timeTag})` : ''}</span>
                              </div>
                            </div>
                          ) : (
                            <p className="transcript-en text-slate-900">{pair.en}</p>
                          )}
                        </div>
                      </div>

                      {/* Turkish + actions */}
                      <div className="flex items-start justify-between gap-3 border-t md:border-t-0 md:border-l border-slate-200 pt-2.5 md:pt-0 md:pl-4">
                        {!hideTurkish ? (
                          <p className={`flex-1 text-sm sm:text-base leading-relaxed ${
                            isActive ? 'text-amber-950 font-bold' : 'text-slate-700 font-medium'
                          }`}>
                            {pair.tr}
                          </p>
                        ) : (
                          <span className="text-xs text-slate-400 italic flex-1">Türkçe çeviri gizlendi</span>
                        )}

                        <div className="flex items-center space-x-1 shrink-0 ml-2">
                          {start !== null && (
                            <button
                              type="button"
                              onClick={() => jumpToSentenceInVideo(pair)}
                              className={`p-2 rounded-lg transition cursor-pointer ${
                                isActive
                                  ? 'bg-amber-600 text-white font-bold shadow-sm'
                                  : 'bg-slate-100 hover:bg-amber-100 text-slate-700 hover:text-amber-900'
                              }`}
                              title="Videoda Oynat"
                            >
                              <Play className="w-4 h-4 fill-current" />
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => speakText(pair.id, pair.en)}
                            className="p-2 rounded-lg bg-slate-100 hover:bg-indigo-100 text-slate-700 hover:text-indigo-700 transition cursor-pointer"
                            title="Sesli Okunuşu Dinle"
                          >
                            <Volume2 className="w-4 h-4" />
                          </button>

                          <button
                            type="button"
                            onClick={() => onBookmarkWord(pair.en.split(' ')[0], pair.en, pair.tr)}
                            className="p-2 rounded-lg bg-slate-100 hover:bg-indigo-100 text-slate-700 hover:text-indigo-700 transition cursor-pointer"
                            title="Notlarıma Ekle"
                          >
                            <Bookmark className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Layer Completion CTA */}
      <div className="flex justify-end pt-2">
        <button
          type="button"
          onClick={onCompleteLayer}
          className="flex items-center space-x-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs sm:text-sm rounded-xl transition shadow-sm cursor-pointer"
        >
          <CheckCircle className="w-4 h-4" />
          <span>1. Katmanı Tamamladım, 2. Katmana Geç</span>
        </button>
      </div>
    </div>
  );
};
