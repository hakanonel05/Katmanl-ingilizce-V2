import React, { useState, useEffect, useRef, useMemo } from 'react';
import { VideoLesson, SentencePair } from '../../types';
import { extractYouTubeId } from '../../lib/youtube';
import { Volume2, Bookmark, CheckCircle, Search, Eye, EyeOff, Youtube, Edit2, Check, X, LayoutGrid, List, Play, Pause, Sparkles, Clock, Sliders } from 'lucide-react';

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
}

const parseTimestampToSeconds = (ts?: string, fallbackIndex = 0): number => {
  if (!ts) return fallbackIndex * 7;
  const parts = ts.split(':').map((p) => parseInt(p, 10));
  if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
    return parts[0] * 60 + parts[1];
  }
  if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return fallbackIndex * 7;
};

export const Layer1BilingualReading: React.FC<Layer1BilingualReadingProps> = ({
  lesson,
  onBookmarkWord,
  bookmarkedWords,
  onCompleteLayer,
  onUpdateVideoUrl,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [hideTurkish, setHideTurkish] = useState(false);
  const [playingSentenceId, setPlayingSentenceId] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<'split' | 'stacked'>('split');

  // Video Offset Adjustment (e.g. TED intro offset +7s or custom adjustment)
  const [offsetSeconds, setOffsetSeconds] = useState<number>(0);

  const [showVideoUrlInput, setShowVideoUrlInput] = useState(false);
  const [newVideoUrl, setNewVideoUrl] = useState('');

  // YouTube Player State
  const playerRef = useRef<any>(null);
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const activeSentenceRef = useRef<HTMLDivElement | null>(null);

  const [currentVideoTime, setCurrentVideoTime] = useState<number>(0);
  const [isVideoPlaying, setIsVideoPlaying] = useState<boolean>(false);
  const [isPlayerReady, setIsPlayerReady] = useState<boolean>(false);

  const ytId = lesson.youtubeId || extractYouTubeId(lesson.youtubeUrl);

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

      playerContainerRef.current.innerHTML = '<div id="yt-embed-element" className="w-full h-full"></div>';

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
          },
          events: {
            onReady: () => {
              if (isSubscribed) setIsPlayerReady(true);
            },
            onStateChange: (event: any) => {
              if (!isSubscribed) return;
              if (event.data === window.YT.PlayerState.PLAYING) {
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

  // Periodic timer to sync video playback time with state
  useEffect(() => {
    let interval: any = null;
    if (isVideoPlaying && playerRef.current) {
      interval = setInterval(() => {
        if (playerRef.current && typeof playerRef.current.getCurrentTime === 'function') {
          const t = playerRef.current.getCurrentTime();
          setCurrentVideoTime(t);
        }
      }, 150);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isVideoPlaying]);

  // Adjusted speech time accounting for intro/jingle offset
  const speechTime = useMemo(() => {
    return Math.max(0, currentVideoTime - offsetSeconds);
  }, [currentVideoTime, offsetSeconds]);

  // Determine active sentence index & active sentence ID
  const { activeSentenceId, activeSentenceIndex } = useMemo(() => {
    if (!lesson.sentences || lesson.sentences.length === 0) {
      return { activeSentenceId: null, activeSentenceIndex: -1 };
    }

    if (playingSentenceId !== null) {
      const idx = lesson.sentences.findIndex((s) => s.id === playingSentenceId);
      return { activeSentenceId: playingSentenceId, activeSentenceIndex: idx };
    }

    if (currentVideoTime > 0) {
      for (let i = 0; i < lesson.sentences.length; i++) {
        const currSec = parseTimestampToSeconds(lesson.sentences[i].timestamp, i);
        const nextSec = lesson.sentences[i + 1]
          ? parseTimestampToSeconds(lesson.sentences[i + 1].timestamp, i + 1)
          : Infinity;

        if (speechTime >= currSec && speechTime < nextSec) {
          return { activeSentenceId: lesson.sentences[i].id, activeSentenceIndex: i };
        }
      }
    }

    return { activeSentenceId: null, activeSentenceIndex: -1 };
  }, [speechTime, currentVideoTime, playingSentenceId, lesson.sentences]);

  // Auto-scroll active sentence into view
  useEffect(() => {
    if (activeSentenceId && activeSentenceRef.current) {
      activeSentenceRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    }
  }, [activeSentenceId]);

  // Calculate active word index within current sentence for Word-Level Karaoke Highlight
  const activeWordIndex = useMemo(() => {
    if (activeSentenceIndex < 0 || !lesson.sentences[activeSentenceIndex]) return -1;
    const currentSentence = lesson.sentences[activeSentenceIndex];
    const startSec = parseTimestampToSeconds(currentSentence.timestamp, activeSentenceIndex);
    const nextSentence = lesson.sentences[activeSentenceIndex + 1];
    const endSec = nextSentence
      ? parseTimestampToSeconds(nextSentence.timestamp, activeSentenceIndex + 1)
      : startSec + 8;

    const duration = Math.max(1, endSec - startSec);
    const elapsed = speechTime - startSec;
    const progress = Math.min(1, Math.max(0, elapsed / duration));

    const words = currentSentence.en.split(' ');
    if (words.length === 0) return -1;

    return Math.min(words.length - 1, Math.floor(progress * words.length));
  }, [activeSentenceIndex, speechTime, lesson.sentences]);

  // Jump to sentence in YouTube Video (adds offsetSeconds so video plays at correct moment)
  const jumpToSentenceInVideo = (pair: SentencePair, index: number) => {
    const rawTargetSec = parseTimestampToSeconds(pair.timestamp, index);
    const actualVideoTime = rawTargetSec + offsetSeconds;

    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      setPlayingSentenceId(null);
    }

    if (playerRef.current && typeof playerRef.current.seekTo === 'function') {
      playerRef.current.seekTo(actualVideoTime, true);
      playerRef.current.playVideo();
      setCurrentVideoTime(actualVideoTime);
      setIsVideoPlaying(true);
    } else {
      speakText(pair.id, pair.en);
    }
  };

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

  const formatSeconds = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = Math.floor(totalSeconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getSentenceTimestamp = (pair: SentencePair, index: number) => {
    if (pair.timestamp) return pair.timestamp;
    return formatSeconds(index * 7);
  };

  const filteredSentences = lesson.sentences.filter(
    (s) =>
      s.en.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.tr.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Control Header */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center space-x-2.5">
            <span className="px-2.5 py-1 bg-indigo-50 text-indigo-700 border border-indigo-200 text-xs font-bold rounded-md uppercase tracking-wider">
              Layer 1
            </span>
            <h2 className="text-base sm:text-lg font-bold text-slate-900">
              Çift Dilli Okuma & Kelime Bazlı Canlı Senkronizasyon
            </h2>
          </div>

          <div className="flex items-center space-x-2 flex-wrap gap-1">
            {/* View Mode Toggle */}
            <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
              <button
                type="button"
                onClick={() => setViewMode('split')}
                className={`flex items-center space-x-1 px-2.5 py-1 rounded-md text-xs font-bold transition cursor-pointer ${
                  viewMode === 'split'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
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
                  viewMode === 'stacked'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Tek Sütun Liste Görünümü"
              >
                <List className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Tek Sütun</span>
              </button>
            </div>

            {/* Hide Turkish Toggle */}
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

        {/* Sync & Offset Settings Bar */}
        <div className="flex items-center justify-between bg-amber-50/90 border border-amber-200 p-3 rounded-lg flex-wrap gap-2">
          <div className="flex items-center space-x-2 text-amber-950 font-bold text-xs">
            <Sliders className="w-4 h-4 text-amber-600 shrink-0" />
            <span>Senkronizasyon Hassas Ayarı:</span>
            <span className="font-mono text-amber-900 font-bold bg-amber-200/90 px-2 py-0.5 rounded text-[11px]">
              {offsetSeconds === 0 ? '0s (Birebir)' : offsetSeconds > 0 ? `+${offsetSeconds}s İntro` : `${offsetSeconds}s`}
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
              0s
            </button>

            <button
              type="button"
              onClick={() => setOffsetSeconds(7)}
              className={`px-2.5 py-1 rounded text-[11px] font-bold transition cursor-pointer ${
                offsetSeconds === 7
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'bg-white hover:bg-amber-100 text-amber-900 border border-amber-300'
              }`}
              title="TED videoları için 7 saniyelik jenerik gecikmesini uygular"
            >
              🎬 TED İntro (+7s)
            </button>

            <div className="flex items-center space-x-1 border-l border-amber-300 pl-2">
              <button
                type="button"
                onClick={() => setOffsetSeconds((prev) => parseFloat((prev - 1).toFixed(1)))}
                className="px-2 py-0.5 bg-white hover:bg-amber-200 border border-amber-300 text-amber-950 rounded text-xs font-bold cursor-pointer"
                title="1 saniye geriye kaydır"
              >
                -1s
              </button>
              <button
                type="button"
                onClick={() => setOffsetSeconds((prev) => parseFloat((prev - 0.5).toFixed(1)))}
                className="px-2 py-0.5 bg-white hover:bg-amber-200 border border-amber-300 text-amber-950 rounded text-xs font-bold cursor-pointer"
                title="0.5 saniye geriye kaydır"
              >
                -0.5s
              </button>
              <button
                type="button"
                onClick={() => setOffsetSeconds((prev) => parseFloat((prev + 0.5).toFixed(1)))}
                className="px-2 py-0.5 bg-white hover:bg-amber-200 border border-amber-300 text-amber-950 rounded text-xs font-bold cursor-pointer"
                title="0.5 saniye ileriye kaydır"
              >
                +0.5s
              </button>
              <button
                type="button"
                onClick={() => setOffsetSeconds((prev) => parseFloat((prev + 1).toFixed(1)))}
                className="px-2 py-0.5 bg-white hover:bg-amber-200 border border-amber-300 text-amber-950 rounded text-xs font-bold cursor-pointer"
                title="1 saniye ileriye kaydır"
              >
                +1s
              </button>
            </div>
          </div>
        </div>

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

      {/* Main Layout: Split (Side-by-Side TED Style) vs Stacked */}
      <div className={viewMode === 'split' ? 'grid grid-cols-1 lg:grid-cols-12 gap-6 items-start' : 'space-y-6'}>
        
        {/* Video Player Column */}
        <div className={viewMode === 'split' ? 'lg:col-span-5 lg:sticky lg:top-4 space-y-3' : 'space-y-3'}>
          {ytId ? (
            <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm space-y-2">
              {/* YouTube Player Container */}
              <div className="aspect-video w-full rounded-lg overflow-hidden bg-slate-950 border border-slate-200 shadow-inner relative">
                <div ref={playerContainerRef} className="w-full h-full" />
              </div>

              {/* Status & Video Edit */}
              <div className="flex items-center justify-between pt-1">
                <div className="flex items-center space-x-2 truncate max-w-[220px]">
                  {isVideoPlaying && (
                    <span className="inline-flex items-center space-x-1 px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded-full animate-pulse">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
                      <span>Canlı Oynatılıyor ({formatSeconds(currentVideoTime)})</span>
                    </span>
                  )}
                  {!isVideoPlaying && (
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
                        <button
                          type="submit"
                          className="px-2 py-1 bg-indigo-600 text-white text-[11px] font-bold rounded cursor-pointer"
                        >
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

        {/* Scrollable Transcript Column with Word-Level Karaoke Highlight */}
        <div className={viewMode === 'split' ? 'lg:col-span-7' : 'w-full'}>
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            
            {/* Header */}
            <div className="bg-slate-900 text-white px-4 py-3 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className={`w-2.5 h-2.5 rounded-full ${isVideoPlaying ? 'bg-amber-400 animate-ping' : 'bg-slate-500'}`} />
                <h3 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-100">
                  Transkript (Kelime Kelime Canlı Vurgu)
                </h3>
              </div>
              <span className="text-[11px] font-mono font-semibold text-slate-400">
                {filteredSentences.length} Cümle
              </span>
            </div>

            {/* Sentences List */}
            <div className={`divide-y divide-slate-200 ${viewMode === 'split' ? 'max-h-[75vh] overflow-y-auto' : ''}`}>
              {filteredSentences.map((pair, index) => {
                const isActive = activeSentenceId === pair.id;
                const timeTag = getSentenceTimestamp(pair, index);

                return (
                  <div
                    key={pair.id}
                    ref={isActive ? activeSentenceRef : null}
                    onClick={() => jumpToSentenceInVideo(pair, index)}
                    className={`p-4 sm:p-5 transition-all duration-200 cursor-pointer border-l-4 ${
                      isActive
                        ? 'bg-amber-50/95 border-amber-500 ring-2 ring-amber-300/80 shadow-md scale-[1.001]'
                        : 'hover:bg-amber-50/40 border-slate-200 hover:border-amber-300'
                    }`}
                  >
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 items-start">
                      {/* Left Column: English Sentence */}
                      <div className="flex items-start space-x-3">
                        {/* Time Badge button */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            jumpToSentenceInVideo(pair, index);
                          }}
                          className={`inline-flex items-center space-x-1 px-2.5 py-1 rounded text-xs font-mono font-bold transition cursor-pointer shrink-0 mt-0.5 ${
                            isActive
                              ? 'bg-amber-600 text-white shadow-sm animate-pulse'
                              : 'bg-slate-100 hover:bg-amber-200 text-slate-800'
                          }`}
                          title="Videoda bu saniyeye atla"
                        >
                          <Play className="w-3 h-3 fill-current" />
                          <span>{timeTag}</span>
                        </button>

                        {/* Sentence Text with Clean Active Highlight */}
                        <div className="flex-1">
                          {isActive ? (
                            <div className="bg-amber-100/90 text-amber-950 font-bold p-3.5 rounded-lg border border-amber-300 shadow-sm leading-relaxed">
                              <p className="text-amber-950 font-bold leading-relaxed text-base sm:text-lg">
                                {pair.en}
                              </p>
                              <div className="mt-2 inline-flex items-center space-x-1.5 px-2.5 py-0.5 bg-amber-600 text-white text-xs font-bold rounded-full uppercase tracking-wider shadow-sm">
                                <Volume2 className="w-3.5 h-3.5 animate-bounce" />
                                <span>Canlı Konuşuluyor ({timeTag})</span>
                              </div>
                            </div>
                          ) : (
                            <p className="text-slate-900 font-bold leading-relaxed text-base sm:text-lg">
                              {pair.en}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Right Column: Turkish Translation + Actions */}
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

                        {/* Right Actions */}
                        <div className="flex items-center space-x-1 shrink-0 ml-2" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => jumpToSentenceInVideo(pair, index)}
                            className={`p-2 rounded-lg transition cursor-pointer ${
                              isActive
                                ? 'bg-amber-600 text-white font-bold shadow-sm'
                                : 'bg-slate-100 hover:bg-amber-100 text-slate-700 hover:text-amber-900'
                            }`}
                            title="Videoda Oynat"
                          >
                            <Play className="w-4 h-4 fill-current" />
                          </button>

                          <button
                            type="button"
                            onClick={() => speakText(pair.id, pair.en)}
                            className="p-2 rounded-lg bg-slate-100 hover:bg-indigo-100 text-slate-700 hover:text-indigo-700 transition cursor-pointer"
                            title="Sadece Yapay Zeka Sesli Okunuş Dinle"
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
