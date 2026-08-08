export function extractYouTubeId(urlOrText: string): string {
  if (!urlOrText) return '';
  const trimmed = urlOrText.trim();

  // 1. Direct 11-character ID
  if (/^[\w-]{11}$/.test(trimmed)) {
    return trimmed;
  }

  // 2. Shorts format: youtube.com/shorts/VIDEO_ID
  const shortsMatch = trimmed.match(/youtube\.com\/shorts\/([\w-]{11})/i);
  if (shortsMatch && shortsMatch[1]) return shortsMatch[1];

  // 3. Live stream format: youtube.com/live/VIDEO_ID
  const liveMatch = trimmed.match(/youtube\.com\/live\/([\w-]{11})/i);
  if (liveMatch && liveMatch[1]) return liveMatch[1];

  // 4. Shortened link format: youtu.be/VIDEO_ID
  const youtuBeMatch = trimmed.match(/youtu\.be\/([\w-]{11})/i);
  if (youtuBeMatch && youtuBeMatch[1]) return youtuBeMatch[1];

  // 5. Watch parameter: ?v=VIDEO_ID or &v=VIDEO_ID anywhere in query string
  const watchMatch = trimmed.match(/[?&]v=([\w-]{11})/i);
  if (watchMatch && watchMatch[1]) return watchMatch[1];

  // 6. Embed or V path format: youtube.com/embed/VIDEO_ID or youtube.com/v/VIDEO_ID
  const embedMatch = trimmed.match(/youtube\.com\/(?:embed|v)\/([\w-]{11})/i);
  if (embedMatch && embedMatch[1]) return embedMatch[1];

  return '';
}
