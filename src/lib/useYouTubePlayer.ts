import { useState, useEffect, useRef, useCallback } from 'react';

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

/**
 * Yeni katmanlar (Aktif Dinleme, Gölgeleme, Altyazısız İzleme, Sadece Dinleme)
 * için ortak YouTube oynatıcı kancası.
 *
 * NOT: Katman 1 kendi oynatıcı kodunu kullanmaya devam ediyor. Çalışan bir
 * bileşeni yeniden yazmamak için kasıtlı olarak dokunulmadı.
 */
export function useYouTubePlayer(ytId: string, elementId: string) {
  const playerRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [isReady, setIsReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    if (!ytId) return;
    let subscribed = true;

    const createPlayer = () => {
      if (!window.YT || !window.YT.Player || !containerRef.current) return;

      containerRef.current.innerHTML = `<div id="${elementId}" class="w-full h-full"></div>`;

      try {
        playerRef.current = new window.YT.Player(elementId, {
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
            onReady: (e: any) => {
              if (!subscribed) return;
              setIsReady(true);
              try {
                setDuration(e.target.getDuration() || 0);
              } catch {
                /* yoksay */
              }
            },
            onStateChange: (e: any) => {
              if (!subscribed) return;
              const s = e.data;
              // BUFFERING sırasında "durdu" saymıyoruz; aksi halde vurgu donuyor
              setIsPlaying(
                s === window.YT.PlayerState.PLAYING || s === window.YT.PlayerState.BUFFERING
              );
            },
          },
        });
      } catch (err) {
        console.warn('YouTube Player başlatılamadı:', err);
      }
    };

    if (window.YT && window.YT.Player) {
      createPlayer();
    } else {
      if (!document.getElementById('yt-iframe-api-script')) {
        const tag = document.createElement('script');
        tag.id = 'yt-iframe-api-script';
        tag.src = 'https://www.youtube.com/iframe_api';
        const first = document.getElementsByTagName('script')[0];
        first.parentNode?.insertBefore(tag, first);
      }
      const previous = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (previous) previous();
        createPlayer();
      };
    }

    return () => {
      subscribed = false;
      setIsReady(false);
      if (playerRef.current?.destroy) {
        try {
          playerRef.current.destroy();
        } catch {
          /* yoksay */
        }
      }
      playerRef.current = null;
    };
  }, [ytId, elementId]);

  // Oynatıcı hazır olduğu sürece zamanı izle (duraklatılmışken atlamalar da doğru olsun)
  useEffect(() => {
    if (!isReady) return;
    const interval = setInterval(() => {
      const p = playerRef.current;
      if (p?.getCurrentTime) {
        const t = p.getCurrentTime();
        if (typeof t === 'number' && isFinite(t)) setCurrentTime(t);
      }
    }, 150);
    return () => clearInterval(interval);
  }, [isReady]);

  const seekTo = useCallback((seconds: number, andPlay = true) => {
    const p = playerRef.current;
    if (!p?.seekTo) return;
    p.seekTo(Math.max(0, seconds), true);
    if (andPlay) p.playVideo();
    setCurrentTime(Math.max(0, seconds));
  }, []);

  const play = useCallback(() => playerRef.current?.playVideo?.(), []);
  const pause = useCallback(() => playerRef.current?.pauseVideo?.(), []);

  return { containerRef, isReady, isPlaying, currentTime, duration, seekTo, play, pause };
}

export const formatSeconds = (total: number) => {
  const t = Math.max(0, Math.floor(total));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
};

/** Bir cümlenin gerçek başlangıç saniyesi. Zaman bilgisi yoksa null. */
export const getSentenceStart = (pair: { startSec?: number; timestamp?: string }): number | null => {
  if (typeof pair.startSec === 'number' && isFinite(pair.startSec)) return pair.startSec;
  if (pair.timestamp) {
    const parts = pair.timestamp.split(':').map((p) => parseInt(p, 10));
    if (parts.length === 2 && parts.every((n) => !isNaN(n))) return parts[0] * 60 + parts[1];
    if (parts.length === 3 && parts.every((n) => !isNaN(n))) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return null;
};
