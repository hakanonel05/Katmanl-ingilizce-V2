import express from "express";
import path from "path";
// NOT: vite yalnizca gelistirme modunda gerekli. Statik import birakilirsa
// Netlify fonksiyon paketine tum Vite girer. Bu yuzden startServer() icinde
// dinamik olarak yukleniyor.
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import { YoutubeTranscript } from "youtube-transcript";

dotenv.config();

// Helper to extract 11-char YouTube ID
function extractYouTubeId(urlOrText: string): string {
  if (!urlOrText) return '';
  const trimmed = urlOrText.trim();
  if (/^[\w-]{11}$/.test(trimmed)) return trimmed;
  const match = trimmed.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/|live\/))([\w-]{11})/i);
  return (match && match[1]) ? match[1] : '';
}

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "10mb" }));

/* ============================================================
   YOUTUBE ALTYAZI (CUE) İŞLEME
   ------------------------------------------------------------
   KRİTİK NOT: youtube-transcript kütüphanesi iki farklı XML
   formatı parse ediyor:
     - srv3   <p t="65000" d="3000">        -> offset MİLİSANİYE
     - klasik <text start="65.0" dur="3.0"> -> offset SANİYE
   Eski kod her ikisini de saniye sayıyordu; 1:05'teki bir cümle
   1083:20 olarak damgalanıyor ve senkronizasyon tamamen bozuluyordu.
   ============================================================ */

interface Cue {
  text: string;
  startSec: number;
  endSec: number;
}

interface BuiltSentence {
  id: number;
  en: string;
  startSec?: number;
  endSec?: number;
  timestamp?: string;
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

/** Cue listesinin birimini tespit edip her zaman SANİYE'ye normalize eder. */
function normalizeCues(items: any[]): Cue[] {
  const offsets = items.map((i) => Number(i.offset) || 0);
  const durations = items.map((i) => Number(i.duration) || 0);

  const allIntegerOffsets = offsets.every((o) => Number.isInteger(o));
  const sortedDur = [...durations].sort((a, b) => a - b);
  const medianDuration = sortedDur[Math.floor(sortedDur.length / 2)] || 0;
  const maxOffset = offsets.length ? Math.max(...offsets) : 0;

  // Bir altyazı satırı 100 saniye sürmez, 10 saatlik offset de olmaz -> ms demektir.
  const looksLikeMilliseconds =
    (allIntegerOffsets && medianDuration > 100) || maxOffset > 36000;

  const divisor = looksLikeMilliseconds ? 1000 : 1;

  console.log(
    `[Transcript] ${items.length} cue alindi. Birim: ${looksLikeMilliseconds ? 'MILISANIYE' : 'SANIYE'} (medyan sure: ${medianDuration})`
  );

  const cues: Cue[] = [];
  for (const item of items) {
    const rawText = decodeEntities(String(item.text || '')).replace(/\s+/g, ' ').trim();
    if (!rawText) continue;

    const startSec = (Number(item.offset) || 0) / divisor;
    const durSec = (Number(item.duration) || 0) / divisor;

    cues.push({
      text: rawText,
      startSec: Math.max(0, startSec),
      endSec: Math.max(0, startSec + (durSec > 0 ? durSec : 2)),
    });
  }

  cues.sort((a, b) => a.startSec - b.startSec);
  return cues;
}

/** İngilizce altyazıyı dil tercihine göre sırayla dener. */
/* ------------------------------------------------------------
   ALTYAZI KAYNAGI
   CAPTION_PROVIDER ortam degiskeni:
     - "auto"   (varsayilan) -> once dogrudan YouTube, olmazsa harici API
     - "direct" -> sadece dogrudan YouTube (youtube-transcript kutuphanesi)
     - "api"    -> sadece youtube-transcript.io
   YouTube, Netlify/Lambda gibi veri merkezi IP'lerini engelledigi icin
   bulutta "direct" yolu calismayabilir. Harici API kendi proxy havuzunu
   kullandigindan bu engeli asar.
   ------------------------------------------------------------ */

const CAPTION_PROVIDER = (process.env.CAPTION_PROVIDER || 'auto').toLowerCase();

/**
 * Gelen JSON'un icinde altyazi parcalarindan olusan diziyi arar.
 * youtube-transcript.io yanit semasini belgelemedigi icin sema tahmin
 * etmek yerine, "metin + baslangic zamani" iceren ilk diziyi buluyoruz.
 * Bu sayede saglayici formatini degistirse de kod calismaya devam eder.
 */
function findSegmentArray(node: any, depth = 0): any[] | null {
  if (!node || depth > 6) return null;

  if (Array.isArray(node)) {
    const looksLikeSegments =
      node.length > 0 &&
      node.every(
        (item) =>
          item &&
          typeof item === 'object' &&
          (typeof item.text === 'string' || typeof item.snippet === 'string') &&
          (item.start !== undefined || item.offset !== undefined || item.startMs !== undefined)
      );
    if (looksLikeSegments) return node;

    for (const item of node) {
      const found = findSegmentArray(item, depth + 1);
      if (found) return found;
    }
    return null;
  }

  if (typeof node === 'object') {
    for (const key of Object.keys(node)) {
      const found = findSegmentArray(node[key], depth + 1);
      if (found) return found;
    }
  }

  return null;
}

/** youtube-transcript.io uzerinden altyazi ceker. */
async function fetchCuesFromApi(videoId: string): Promise<{ cues: Cue[]; raw: any }> {
  const token = process.env.YOUTUBE_TRANSCRIPT_IO_TOKEN;
  if (!token) {
    throw new Error("YOUTUBE_TRANSCRIPT_IO_TOKEN environment variable is missing.");
  }

  const res = await fetch("https://www.youtube-transcript.io/api/transcripts", {
    method: "POST",
    headers: {
      "Authorization": `Basic ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ids: [videoId] }),
  });

  if (!res.ok) {
    const body = await res.text();
    const error: any = new Error(`youtube-transcript.io ${res.status}: ${body.slice(0, 300)}`);
    error.httpStatus = res.status;
    const retryAfter = res.headers.get("retry-after");
    if (retryAfter) error.retryAfterMs = Math.ceil(parseFloat(retryAfter) * 1000);
    throw error;
  }

  const data: any = await res.json();
  const segments = findSegmentArray(data);

  if (!segments || segments.length === 0) {
    throw new Error(
      "youtube-transcript.io yanitinda altyazi parcalari bulunamadi. Yanit semasi degismis olabilir."
    );
  }

  // Ortak bicime cevir; birim tespitini normalizeCues yapar
  const items = segments.map((seg: any) => ({
    text: seg.text ?? seg.snippet ?? '',
    offset: Number(seg.start ?? seg.offset ?? seg.startMs ?? 0),
    duration: Number(seg.dur ?? seg.duration ?? seg.durationMs ?? 0),
  }));

  return { cues: normalizeCues(items), raw: data };
}

/** Dogrudan YouTube'dan altyazi ceker (kutuphane yolu). */
async function fetchCuesDirect(videoId: string): Promise<Cue[]> {
  const langAttempts: (string | undefined)[] = ['en', 'en-US', 'en-GB', undefined];
  let lastError: any = null;

  for (const lang of langAttempts) {
    try {
      const items = await YoutubeTranscript.fetchTranscript(
        videoId,
        lang ? { lang } : undefined
      );
      if (items && items.length > 0) return normalizeCues(items);
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || new Error('Altyazi bulunamadi.');
}

/**
 * Secilen stratejiye gore altyaziyi ceker.
 * "auto" modunda once dogrudan denenir (bedava), olmazsa harici API'ye gecilir.
 */
async function fetchYoutubeCues(videoId: string): Promise<Cue[]> {
  const hasApiToken = !!process.env.YOUTUBE_TRANSCRIPT_IO_TOKEN;

  if (CAPTION_PROVIDER === 'api') {
    const { cues } = await fetchCuesFromApi(videoId);
    return cues;
  }

  try {
    return await fetchCuesDirect(videoId);
  } catch (directError: any) {
    if (CAPTION_PROVIDER === 'direct' || !hasApiToken) throw directError;

    console.warn(
      `[Captions] Dogrudan cekme basarisiz (${directError?.message || directError}). ` +
      `youtube-transcript.io deneniyor.`
    );
    const { cues } = await fetchCuesFromApi(videoId);
    return cues;
  }
}

/**
 * Ham cue'lari anlamli cumlelere birlestirir.
 * ZAMAN DAMGASI YAPAY ZEKAYA HESAPLATILMAZ; her cumlenin baslangici,
 * o cumleyi baslatan cue'nun GERCEK zamanidir.
 */
function buildSentencesFromCues(cues: Cue[]): BuiltSentence[] {
  const sentences: BuiltSentence[] = [];

  let buffer = '';
  let startSec: number | null = null;
  let endSec = 0;
  let previousCueEnd = 0;

  const flush = () => {
    const text = buffer.replace(/\s+/g, ' ').trim();
    if (text && startSec !== null) {
      sentences.push({
        id: sentences.length + 1,
        en: text,
        startSec: Number(startSec.toFixed(2)),
        endSec: Number(Math.max(endSec, startSec + 0.5).toFixed(2)),
      });
    }
    buffer = '';
    startSec = null;
  };

  for (const cue of cues) {
    const text = cue.text.replace(/\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim();
    if (!text) continue;

    // Otomatik altyazilardaki tekrar eden (rolling) satirlari atla
    if (buffer && buffer.toLowerCase().endsWith(text.toLowerCase())) {
      previousCueEnd = cue.endSec;
      continue;
    }

    const gap = startSec === null ? 0 : cue.startSec - previousCueEnd;

    // Uzun sessizlikten sonra ve elde yeterli metin varsa cumleyi kapat
    if (buffer.length > 60 && gap > 1.2) flush();

    if (startSec === null) startSec = cue.startSec;
    buffer += (buffer ? ' ' : '') + text;
    endSec = cue.endSec;
    previousCueEnd = cue.endSec;

    const endsWithPunctuation = /[.!?\u2026]["'\u2019\u201d)\]]?$/.test(text);
    if (endsWithPunctuation || buffer.length > 240) flush();
  }

  flush();
  return sentences;
}

/** Elle yapistirilan metni cumlelere boler (gercek zaman bilgisi yoktur). */
function buildSentencesFromPlainText(raw: string): BuiltSentence[] {
  const cleaned = raw
    .replace(/\[\d{1,2}:\d{2}(?::\d{2})?\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const parts = cleaned.match(/[^.!?\u2026]+[.!?\u2026]+["'\u2019\u201d)\]]?|\S[^.!?\u2026]*$/g) || [];

  return parts
    .map((p) => p.trim())
    .filter((p) => p.length > 1)
    .map((p, i) => ({ id: i + 1, en: p }));
}

function formatTimestamp(totalSeconds: number): string {
  const total = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const mm = minutes.toString().padStart(2, '0');
  const ss = seconds.toString().padStart(2, '0');
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

/* ============================================================
   YAPAY ZEKA SAGLAYICI KATMANI
   ------------------------------------------------------------
   AI_PROVIDER ortam degiskeni ile saglayici secilir:
     - "gemini" (varsayilan) -> Google Gemini
     - "groq"                -> Groq uzerinden acik agirlikli modeller
   Groq, OpenAI uyumlu bir uc nokta sundugu icin ek SDK gerekmez.
   ============================================================ */

const AI_PROVIDER = (process.env.AI_PROVIDER || 'gemini').toLowerCase();

// Groq model sirasi. Groq modelleri sik degisiyor; guncel liste:
// https://console.groq.com/docs/models
// 17 Haziran 2026'da llama-3.3-70b-versatile ve qwen/qwen3-32b kullanimdan
// kaldirildi, yerlerine asagidakiler onerildi.
const GROQ_MODELS = [
  "openai/gpt-oss-120b",
  "qwen/qwen3.6-27b",
  "openai/gpt-oss-20b",
];

const GEMINI_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-2.0-flash",
];

/**
 * Saglayici oncelik sirasi. AI_PROVIDERS ile virgullu liste verilebilir:
 *   AI_PROVIDERS="gemini,groq"
 * Bir saglayici kota/limit hatasi verirse sistem otomatik olarak
 * sonrakine gecer. Anahtari tanimli olmayan saglayicilar atlanir.
 * Geriye donuk uyumluluk icin tekil AI_PROVIDER de desteklenir.
 */
function getProviderChain(): string[] {
  const raw = process.env.AI_PROVIDERS || process.env.AI_PROVIDER || 'gemini,groq';
  const requested = raw.split(',').map((p) => p.trim().toLowerCase()).filter(Boolean);

  const hasKey: Record<string, boolean> = {
    gemini: !!process.env.GEMINI_API_KEY,
    groq: !!process.env.GROQ_API_KEY,
  };

  const available = requested.filter((p) => hasKey[p]);

  if (available.length === 0) {
    // Hicbiri tanimli degilse ilk isteneni birak ki hata mesaji anlamli olsun
    return requested.length ? [requested[0]] : ['gemini'];
  }
  return available;
}

// Helper to instantiate Gemini AI
function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is missing.");
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

/** Groq secildiginde Gemini istemcisi gerekmez. */
function getAIClient(): GoogleGenAI | null {
  // Zincirin ilk saglayicisi Gemini degilse istemci gerekmez.
  // Anahtar yoksa da hata firlatmayiz; zincirdeki diger saglayici devreye girer.
  if (!process.env.GEMINI_API_KEY) return null;
  try {
    return getGeminiClient();
  } catch {
    return null;
  }
}

function isRateLimitError(err: any): boolean {
  const errStr = (err?.message || "") + JSON.stringify(err || {});
  return (
    err?.status === "RESOURCE_EXHAUSTED" ||
    err?.code === 429 ||
    err?.httpStatus === 429 ||
    errStr.includes("429") ||
    errStr.includes("RESOURCE_EXHAUSTED") ||
    errStr.includes("rate_limit") ||
    errStr.includes("quota")
  );
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 429 hatasinin GUNLUK mi DAKIKALIK mi oldugunu ayirt eder.
 * Ikisi cok farkli: dakikalik limitte beklemek yeter, gunluk limitte
 * kota UTC gece yarisina kadar geri gelmez.
 */
function describeRateLimit(error: any): string {
  const raw = (error?.message || '') + JSON.stringify(error || {});

  const retryMatch = raw.match(/retryDelay["':\s]+([0-9.]+)s/i);
  const retrySeconds = retryMatch ? Math.ceil(parseFloat(retryMatch[1])) : null;

  const isDaily = /PerDay|RequestsPerDay|daily/i.test(raw);
  const isPerMinute = /PerMinute|RequestsPerMinute|TokensPerMinute/i.test(raw);

  if (isDaily) {
    return "GUNLUK ucretsiz kotan doldu. Bu kota UTC gece yarisinda (Turkiye saatiyle 03:00) sifirlanir. Beklemek istemiyorsan AI_PROVIDER ortam degiskenini 'groq' yapip Groq'un ayri kotasini kullanabilirsin.";
  }

  if (isPerMinute) {
    return retrySeconds
      ? `Dakikalik istek limitine takildin. Yaklasik ${retrySeconds} saniye sonra tekrar deneyin.`
      : "Dakikalik istek limitine takildin. Bir dakika bekleyip tekrar deneyin.";
  }

  return retrySeconds
    ? `Yapay zeka istek limitine ulasildi. Yaklasik ${retrySeconds} saniye sonra tekrar deneyin.`
    : "Yapay zeka istek limitine ulasildi. Lutfen 30 saniye sonra tekrar deneyin.";
}

/** Groq'un OpenAI uyumlu sohbet ucunu cagirir. */
async function callGroq(
  model: string,
  prompt: string,
  systemInstruction: string,
  jsonHint?: string
): Promise<{ text: string }> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY environment variable is missing.");
  }

  const systemContent = jsonHint
    ? `${systemInstruction}\n\nSADECE gecerli JSON dondur. Markdown, aciklama veya kod bloğu isareti ekleme. Kullanilacak sema:\n${jsonHint}`
    : systemInstruction;

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemContent },
        { role: "user", content: prompt },
      ],
      temperature: 0.3,
      ...(jsonHint ? { response_format: { type: "json_object" } } : {}),
    }),
  });

  if (!res.ok) {
    const bodyText = await res.text();
    const error: any = new Error(`Groq ${res.status}: ${bodyText.slice(0, 300)}`);
    error.httpStatus = res.status;
    // 429 durumunda Groq, beklenmesi gereken sureyi bu baslikta bildirir
    const retryAfter = res.headers.get("retry-after");
    if (retryAfter) error.retryAfterMs = Math.ceil(parseFloat(retryAfter) * 1000);
    throw error;
  }

  const data: any = await res.json();
  const text = data?.choices?.[0]?.message?.content || "";
  return { text };
}

/**
 * Saglayicidan bagimsiz uretim. Model listesi sirayla denenir; 429 durumunda
 * ustel bekleme (exponential backoff) uygulanir ve varsa Retry-After basligina
 * uyulur. Cagiranlar response.text okumaya devam edebilir.
 */
async function generateContentWithRetry(
  ai: GoogleGenAI | null,
  params: {
    contents: any;
    config?: any;
    primaryModel?: string;
    /** Groq icin beklenen JSON semasinin kisa tarifi. Gemini bunu yok sayar. */
    jsonHint?: string;
  }
): Promise<{ text: string }> {
  const providers = getProviderChain();
  let lastError: any = null;

  // Saglayicilar sirayla denenir. Biri kotasini doldurursa digerine gecilir.
  for (const provider of providers) {
    const isGroq = provider === 'groq';
    const baseModels = isGroq ? GROQ_MODELS : GEMINI_MODELS;
    const models = params.primaryModel ? [params.primaryModel, ...baseModels] : baseModels;

    let providerExhausted = false;

    for (const modelName of models) {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          if (isGroq) {
            return await callGroq(
              modelName,
              typeof params.contents === 'string' ? params.contents : JSON.stringify(params.contents),
              params.config?.systemInstruction || '',
              params.jsonHint || (params.config?.responseMimeType === 'application/json' ? '{}' : undefined)
            );
          }

          const client = ai || getGeminiClient();
          const response = await client.models.generateContent({
            model: modelName,
            contents: params.contents,
            config: params.config,
          });
          return { text: response.text || "" };
        } catch (err: any) {
          lastError = err;

          if (isRateLimitError(err)) {
            const raw = (err?.message || '') + JSON.stringify(err || {});

            // GUNLUK kota dolduysa beklemenin faydasi yok; dogrudan
            // sonraki saglayiciya gec.
            if (/PerDay|RequestsPerDay|daily/i.test(raw)) {
              console.warn(`[AI] ${provider} gunluk kotasi dolmus, sonraki saglayiciya geciliyor.`);
              providerExhausted = true;
              break;
            }

            const backoffMs = err?.retryAfterMs || 2000 * Math.pow(2, attempt);
            console.warn(
              `[AI] ${provider}/${modelName} limite takildi (429). ${backoffMs} ms bekleniyor (deneme ${attempt + 1}/3).`
            );
            await sleep(backoffMs);
          } else {
            console.warn(`[AI] ${provider}/${modelName} hatasi:`, err?.message || err);
            break; // Sonraki modele gec
          }
        }
      }

      if (providerExhausted) break;
    }
  }

  throw lastError;
}

function formatErrorMessage(error: any, defaultMsg: string): string {
  if (!error) return defaultMsg;
  const rawMsg = error.message || (typeof error === 'string' ? error : '');
  if (rawMsg.startsWith('{') || rawMsg.includes('"error":')) {
    try {
      const parsed = typeof rawMsg === 'string' ? JSON.parse(rawMsg) : rawMsg;
      if (parsed.error?.message) {
        return `Yapay zeka yanıt veremedi: ${parsed.error.message}`;
      }
    } catch {}
  }
  return rawMsg || defaultMsg;
}

const SYSTEM_INSTRUCTION_COACH = `Sen "Katmanlı Çalışma" (Layered Learning) metodolojisi konusunda uzmanlaşmış profesyonel bir İngilizce Dil Koçusun.
Görevin, kullanıcının sunduğu YouTube veya TED Talks videolarının transkriptleri üzerinden 7 katmanlı öğrenme sürecini yönetmektir.

Temel Kuralların:
1. Kullanıcıyı adım adım yönlendir; tüm katmanları tek seferde verme.
2. Kullanıcının seviyesine uyum sağla; düzeltme yaparken motive edici ve yapıcı ol.
3. Gramer öğretiminde "Genelden Özele" (context-driven) yaklaş: Kullanıcının yaptığı hatalar veya metindeki kritik yapılar üzerinden sadece ilgili gramer kuralını, basit ve günlük hayattan 3 somut örnekle anlat.
4. Türkçe-İngilizce çift dilli metin oluştururken her satırın tam bir cümle olmasına ve çevirinin bağlamsal doğruluğuna dikkat et.`;

// API Endpoints

/**
 * TEK bir cumle grubunu cevirir. Zaman damgalari sunucuda hesaplandigi ve
 * eslesme "id" uzerinden yapildigi icin model cumleleri bolse bile senkron bozulmaz.
 */
/* ============================================================
   CEVIRI SAGLAYICISI
   ------------------------------------------------------------
   TRANSLATE_PROVIDER ortam degiskeni:
     - "ai"    (varsayilan) -> cumleleri LLM cevirir (baglami anlar,
                               kaliteli, ama kotayi hizli tuketir)
     - "libre" -> LibreTranslate cevirir (kota derdi yok, kalite daha duz)
   LibreTranslate hata verirse otomatik olarak LLM'e dusulur.
   ============================================================ */

const TRANSLATE_PROVIDER = (process.env.TRANSLATE_PROVIDER || 'ai').toLowerCase();
const LIBRETRANSLATE_URL = process.env.LIBRETRANSLATE_URL || 'https://libretranslate.com/translate';

/**
 * LibreTranslate ile toplu ceviri. API birden fazla metni tek istekte
 * kabul ediyor, bu yuzden bir grup tek cagrida cevriliyor.
 */
async function translateWithLibre(
  chunk: { id: number; en: string }[]
): Promise<Record<number, string>> {
  const body: any = {
    q: chunk.map((s) => s.en),
    source: 'en',
    target: 'tr',
    format: 'text',
  };

  // Bazi ornekler (libretranslate.com dahil) anahtar istiyor, bazilari istemiyor
  if (process.env.LIBRETRANSLATE_API_KEY) {
    body.api_key = process.env.LIBRETRANSLATE_API_KEY;
  }

  const res = await fetch(LIBRETRANSLATE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LibreTranslate ${res.status}: ${text.slice(0, 200)}`);
  }

  const data: any = await res.json();
  const translated = data?.translatedText;

  // Dizi gonderdigimizde dizi bekleriz; tek metin donerse de idare edelim
  const list: string[] = Array.isArray(translated)
    ? translated
    : (typeof translated === 'string' ? [translated] : []);

  if (list.length !== chunk.length) {
    throw new Error(
      `LibreTranslate ${chunk.length} cumle icin ${list.length} ceviri dondurdu.`
    );
  }

  const translations: Record<number, string> = {};
  chunk.forEach((s, i) => {
    translations[s.id] = list[i] || '';
  });
  return translations;
}

async function translateChunk(
  ai: GoogleGenAI | null,
  chunk: { id: number; en: string }[]
): Promise<Record<number, string>> {
  const translations: Record<number, string> = {};

  // LibreTranslate secilmisse once onu dene. Basarisiz olursa LLM'e dus,
  // boylece ceviri hic yapilamamis olmaz.
  if (TRANSLATE_PROVIDER === 'libre') {
    try {
      return await translateWithLibre(chunk);
    } catch (err: any) {
      console.warn('[Translate] LibreTranslate basarisiz, LLM ile deneniyor:', err?.message || err);
    }
  }

  const numbered = chunk.map((s) => `${s.id}. ${s.en}`).join('\n');

  const prompt = `Asagida numaralandirilmis Ingilizce cumleler var.
Her cumlenin DOGAL ve AKICI Turkce cevirisini yap.

KESIN KURALLAR:
- Cumleleri BIRLESTIRME, BOLME veya ATLAMA. Kac cumle verildiyse o kadar ceviri dondur.
- Her ceviriyi kendi "id" numarasiyla eslestir.
- Ceviri disinda hicbir sey ekleme.

CUMLELER:
${numbered}`;

  const response = await generateContentWithRetry(ai, {
    contents: prompt,
    jsonHint: '{"translations":[{"id":1,"tr":"Turkce ceviri"}]}',
    config: {
      systemInstruction: SYSTEM_INSTRUCTION_COACH,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          translations: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.INTEGER },
                tr: { type: Type.STRING },
              },
              required: ["id", "tr"],
            },
          },
        },
        required: ["translations"],
      },
    },
  });

  try {
    const parsed = JSON.parse(response.text || "{}");
    const list = Array.isArray(parsed.translations) ? parsed.translations : [];
    for (const item of list) {
      if (typeof item?.id === 'number' && typeof item?.tr === 'string') {
        translations[item.id] = item.tr;
      }
    }
  } catch (e) {
    console.warn('[Translate] Grup parse edilemedi:', e);
  }

  return translations;
}

/**
 * Tum cumleleri gruplar halinde cevirir (tek istekte calisan eski akis icin).
 * Netlify'da bu yol zaman asimina ugrar; frontend parcali uc noktalari kullanir.
 */
async function translateSentencesInBatches(
  ai: GoogleGenAI | null,
  sentences: BuiltSentence[]
): Promise<Record<number, string>> {
  const BATCH_SIZE = 30;
  let translations: Record<number, string> = {};

  for (let i = 0; i < sentences.length; i += BATCH_SIZE) {
    if (i > 0) await sleep(1500);
    const chunk = sentences.slice(i, i + BATCH_SIZE);
    translations = { ...translations, ...(await translateChunk(ai, chunk)) };
  }

  return translations;
}

/** Kelime, gramer ve quiz verilerini tek cagrida uretir. */
async function generateStudyMaterial(ai: GoogleGenAI | null, fullText: string) {
  const prompt = `Asagidaki Ingilizce konusma metnini incele ve ogrenme materyali uret.

METIN:
"${fullText.slice(0, 14000)}"

TALIMATLAR:
1. "vocabulary": Metinde gecen 6-10 kritik B2/C1 kelime/phrasal verb, IPA okunusu, Turkce anlami, telaffuz ipucu ve ornek cumle.
2. "grammarRules": Metinde tespit edilen gramer yapilarini "Genelden Ozele" mantigiyla Turkce acikla. Her yapi icin 5-10 ornek cumle ve Turkce karsiliklari.
3. "quizQuestions": Metni test eden 5 Ingilizce soru. 3 tanesi coktan secmeli (4 sikli "options", "correctOptionIndex" 0-3, "explanationTr"), 2 tanesi acik uclu ("sampleAnswerEn", "explanationTr").`;

  const response = await generateContentWithRetry(ai, {
    contents: prompt,
    jsonHint: '{"vocabulary":[{"word":"","type":"","ipa":"","meaningTr":"","pronunciationNote":"","exampleSentence":""}],"grammarRules":[{"topic":"","explanationTr":"","examples":[{"en":"","tr":""}]}],"quizQuestions":[{"id":1,"type":"multiple_choice","question":"","options":["","","",""],"correctOptionIndex":0,"sampleAnswerEn":"","explanationTr":""}]}',
    config: {
      systemInstruction: SYSTEM_INSTRUCTION_COACH,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          vocabulary: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                word: { type: Type.STRING },
                type: { type: Type.STRING },
                ipa: { type: Type.STRING },
                meaningTr: { type: Type.STRING },
                pronunciationNote: { type: Type.STRING },
                exampleSentence: { type: Type.STRING }
              },
              required: ["word", "meaningTr", "pronunciationNote"]
            }
          },
          grammarRules: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                topic: { type: Type.STRING },
                explanationTr: { type: Type.STRING },
                examples: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      en: { type: Type.STRING },
                      tr: { type: Type.STRING }
                    },
                    required: ["en", "tr"]
                  }
                }
              },
              required: ["topic", "explanationTr", "examples"]
            }
          },
          quizQuestions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.INTEGER },
                type: { type: Type.STRING },
                question: { type: Type.STRING },
                options: { type: Type.ARRAY, items: { type: Type.STRING } },
                correctOptionIndex: { type: Type.INTEGER },
                sampleAnswerEn: { type: Type.STRING },
                explanationTr: { type: Type.STRING }
              },
              required: ["id", "type", "question", "explanationTr"]
            }
          }
        },
        required: ["vocabulary", "grammarRules", "quizQuestions"]
      }
    }
  });

  try {
    return JSON.parse(response.text || "{}");
  } catch {
    return { vocabulary: [], grammarRules: [], quizQuestions: [] };
  }
}

// API Endpoints

/**
 * TESHIS (adres cubugundan calisir):
 *   https://siten.netlify.app/api/check-captions?v=VIDEO_ID_VEYA_LINK
 * Gemini/Groq cagrilmaz. Altyazinin cekilip cekilemedigini ve cekilemiyorsa
 * TAM hata metnini dondurur.
 */
app.get("/api/check-captions", async (req, res) => {
  const started = Date.now();
  const input = String(req.query.v || req.query.url || '');
  const ytId = extractYouTubeId(input.trim());

  if (!ytId) {
    return res.status(400).json({
      ok: false,
      error: "Gecerli bir YouTube linki veya video ID gerekli. Ornek: /api/check-captions?v=arj7oStGLkU",
    });
  }

  try {
    const cues = await fetchYoutubeCues(ytId);
    const sentences = buildSentencesFromCues(cues);
    res.json({
      ok: true,
      videoId: ytId,
      captionProvider: CAPTION_PROVIDER,
      cueCount: cues.length,
      sentenceCount: sentences.length,
      elapsedMs: Date.now() - started,
      preview: sentences.slice(0, 3).map((s) => ({
        timestamp: formatTimestamp(s.startSec || 0),
        en: s.en.slice(0, 90),
      })),
    });
  } catch (error: any) {
    // ?raw=1 eklenirse youtube-transcript.io'nun ham yaniti donulur.
    // Yanit semasi belgelenmedigi icin sorun cikarsa buradan gorulur.
    let rawSample: any = undefined;
    if (req.query.raw && process.env.YOUTUBE_TRANSCRIPT_IO_TOKEN) {
      try {
        const r = await fetch("https://www.youtube-transcript.io/api/transcripts", {
          method: "POST",
          headers: {
            "Authorization": `Basic ${process.env.YOUTUBE_TRANSCRIPT_IO_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ ids: [ytId] }),
        });
        rawSample = JSON.stringify(await r.json()).slice(0, 1200);
      } catch (e: any) {
        rawSample = `ham yanit alinamadi: ${e?.message || e}`;
      }
    }

    res.status(502).json({
      ok: false,
      videoId: ytId,
      captionProvider: CAPTION_PROVIDER,
      elapsedMs: Date.now() - started,
      error: error?.message || String(error),
      rawSample,
      hint: "Bu hata sadece Netlify'da goruluyor ve her videoda tekrarliyorsa, YouTube veri merkezi IP'lerini engelliyor demektir. YOUTUBE_TRANSCRIPT_IO_TOKEN ekleyerek harici API'ye gecebilirsiniz.",
    });
  }
});

/**
 * 0. TESHIS UCU: Sadece altyaziyi cekip ozet dondurur, Gemini cagrilmaz.
 * Netlify/Lambda gibi ortamlarda YouTube'un veri merkezi IP'lerini engelleyip
 * engellemedigini 1-3 saniyede anlamak icin. Zaman asimina takilmaz.
 */
app.post("/api/check-captions", async (req, res) => {
  const started = Date.now();
  try {
    const { videoInput } = req.body;
    const ytId = extractYouTubeId(String(videoInput || '').trim());
    if (!ytId) {
      return res.status(400).json({ ok: false, error: "Gecerli bir YouTube linki gerekli." });
    }

    const cues = await fetchYoutubeCues(ytId);
    const sentences = buildSentencesFromCues(cues);

    res.json({
      ok: true,
      videoId: ytId,
      cueCount: cues.length,
      sentenceCount: sentences.length,
      elapsedMs: Date.now() - started,
      // Ilk 3 cumle: zaman damgalarinin makul olup olmadigini gozle dogrulamak icin
      preview: sentences.slice(0, 3).map((s) => ({
        timestamp: formatTimestamp(s.startSec || 0),
        startSec: s.startSec,
        en: s.en.slice(0, 90),
      })),
    });
  } catch (error: any) {
    console.error("Error in /api/check-captions:", error);
    res.status(502).json({
      ok: false,
      elapsedMs: Date.now() - started,
      error: error?.message || "Altyazi cekilemedi.",
      hint: "Bu hata Netlify/Lambda uzerinde goruluyorsa YouTube veri merkezi IP'sini engelliyor olabilir.",
    });
  }
});

// 1. Extract / Process Bilingual Transcript (Katman 1)
app.post("/api/extract-transcript", async (req, res) => {
  try {
    const { videoInput, youtubeUrl } = req.body;
    if (!videoInput || !videoInput.trim()) {
      return res.status(400).json({ error: "Video linki veya metin gereklidir." });
    }

    const inputTrimmed = videoInput.trim();
    const ytIdFromInput = extractYouTubeId(inputTrimmed);
    const ytIdFromUrlField = youtubeUrl ? extractYouTubeId(youtubeUrl.trim()) : '';
    const activeYtId = ytIdFromInput || ytIdFromUrlField;

    let fetchedTitle = "";
    let sentences: BuiltSentence[] = [];
    let hasRealTimings = false;
    let syncNotice = "";
    let captionError = "";

    if (activeYtId) {
      try {
        const oembedRes = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${activeYtId}&format=json`);
        if (oembedRes.ok) {
          const oembedData: any = await oembedRes.json();
          if (oembedData.title) fetchedTitle = oembedData.title;
        }
      } catch (e) {
        console.warn("Could not fetch YouTube title via oEmbed:", e);
      }
    }

    // Bir YouTube ID varsa HER ZAMAN gercek altyazi zamanlarini cekmeyi dene.
    // Gercek cue zamanlari, senkronizasyonun tek dogru kaynagidir.
    if (activeYtId) {
      try {
        const cues = await fetchYoutubeCues(activeYtId);
        const built = buildSentencesFromCues(cues);
        if (built.length > 0) {
          sentences = built;
          hasRealTimings = true;
        }
      } catch (err: any) {
        captionError = err?.message || String(err);
        console.warn("YoutubeTranscript error:", captionError);
      }
    }

    // Altyazi cekilemediyse elle yapistirilan metne dus
    if (!hasRealTimings) {
      const manualText = ytIdFromInput ? '' : inputTrimmed;
      if (!manualText) {
        return res.status(400).json({
          error: "Bu YouTube videosunun altyazisi (CC) alinamadi. Lutfen 'Ingilizce Metin / Transkript Yapistir' sekmesini secip metni manuel yapistirin.",
          reason: captionError || "bilinmiyor",
        });
      }
      sentences = buildSentencesFromPlainText(manualText);
      syncNotice = "Bu ders elle yapistirilan metinden olusturuldu; YouTube altyazi zamanlari bulunamadigi icin cumle bazli otomatik senkronizasyon devre disi.";
    }

    if (sentences.length === 0) {
      return res.status(500).json({ error: "Cumleler ayristirilamadi." });
    }

    // Goruntulenecek zaman damgasi metnini burada uret (model uretmez)
    for (const s of sentences) {
      if (typeof s.startSec === 'number') {
        s.timestamp = formatTimestamp(s.startSec);
      }
    }

    const ai = getAIClient();
    const fullText = sentences.map((s) => s.en).join(' ');

    // Istekleri PARALEL degil SIRALI calistiriyoruz. Paralel calistirmak
    // dakikalik istek/token kotasini aninda tuketip 429 aliyordu.
    const translations = await translateSentencesInBatches(ai, sentences);
    const material = await generateStudyMaterial(ai, fullText);

    const finalSentences = sentences.map((s) => ({
      id: s.id,
      en: s.en,
      tr: translations[s.id] || '',
      startSec: s.startSec,
      endSec: s.endSec,
      timestamp: s.timestamp,
    }));

    res.json({
      title: fetchedTitle || "Video Transkripti",
      sentences: finalSentences,
      vocabulary: material.vocabulary || [],
      grammarRules: material.grammarRules || [],
      quizQuestions: material.quizQuestions || [],
      hasRealTimings,
      syncNotice,
    });
  } catch (error: any) {
    console.error("Error in /api/extract-transcript:", error);
    const isQuota = error?.status === "RESOURCE_EXHAUSTED" || error?.code === 429 || JSON.stringify(error).includes("429");
    const statusCode = isQuota ? 429 : 500;
    const msg = isQuota
      ? describeRateLimit(error)
      : formatErrorMessage(error, "Transkript islenirken hata olustu.");
    res.status(statusCode).json({ error: msg });
  }
});

/* ============================================================
   PARCALI AKIS (Netlify / serverless icin)
   ------------------------------------------------------------
   /api/extract-transcript tek istekte her seyi yapiyor ve uzun
   videolarda Netlify'in 10 saniyelik fonksiyon sinirini asiyor.
   Asagidaki uc uc nokta isi kucuk parcalara boler; her biri
   birkac saniyede biter. Frontend bunlari sirayla cagirir.
   ============================================================ */

// 1a. Sadece cumleleri ve gercek zaman damgalarini dondurur. Yapay zeka cagrilmaz.
app.post("/api/transcript-sentences", async (req, res) => {
  try {
    const { videoInput, youtubeUrl } = req.body;
    if (!videoInput || !videoInput.trim()) {
      return res.status(400).json({ error: "Video linki veya metin gereklidir." });
    }

    const inputTrimmed = videoInput.trim();
    const ytIdFromInput = extractYouTubeId(inputTrimmed);
    const ytIdFromUrlField = youtubeUrl ? extractYouTubeId(youtubeUrl.trim()) : '';
    const activeYtId = ytIdFromInput || ytIdFromUrlField;

    let fetchedTitle = "";
    let sentences: BuiltSentence[] = [];
    let hasRealTimings = false;
    let syncNotice = "";
    let captionError = "";

    if (activeYtId) {
      try {
        const oembedRes = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${activeYtId}&format=json`);
        if (oembedRes.ok) {
          const oembedData: any = await oembedRes.json();
          if (oembedData.title) fetchedTitle = oembedData.title;
        }
      } catch (e) {
        console.warn("oEmbed basarisiz:", e);
      }

      try {
        const cues = await fetchYoutubeCues(activeYtId);
        const built = buildSentencesFromCues(cues);
        if (built.length > 0) {
          sentences = built;
          hasRealTimings = true;
        }
      } catch (err: any) {
        captionError = err?.message || String(err);
        console.warn("YoutubeTranscript error:", captionError);
      }
    }

    if (!hasRealTimings) {
      const manualText = ytIdFromInput ? '' : inputTrimmed;
      if (!manualText) {
        return res.status(400).json({
          error: "Bu YouTube videosunun altyazisi (CC) alinamadi. Lutfen 'Ingilizce Metin / Transkript Yapistir' sekmesini secip metni manuel yapistirin.",
          reason: captionError || "bilinmiyor",
        });
      }
      sentences = buildSentencesFromPlainText(manualText);
      syncNotice = "Bu ders elle yapistirilan metinden olusturuldu; otomatik senkronizasyon devre disi.";
    }

    if (sentences.length === 0) {
      return res.status(500).json({ error: "Cumleler ayristirilamadi." });
    }

    for (const s of sentences) {
      if (typeof s.startSec === 'number') s.timestamp = formatTimestamp(s.startSec);
    }

    res.json({
      title: fetchedTitle || "Video Transkripti",
      sentences,
      hasRealTimings,
      syncNotice,
    });
  } catch (error: any) {
    console.error("Error in /api/transcript-sentences:", error);
    res.status(500).json({ error: formatErrorMessage(error, "Transkript alinamadi.") });
  }
});

// 1b. Tek bir cumle grubunu cevirir. Frontend bunu sirayla cagirir.
app.post("/api/translate-batch", async (req, res) => {
  try {
    const { sentences } = req.body;
    if (!Array.isArray(sentences) || sentences.length === 0) {
      return res.status(400).json({ error: "Cevrilecek cumle yok." });
    }

    const ai = getAIClient();
    const translations = await translateChunk(ai, sentences);
    res.json({ translations });
  } catch (error: any) {
    console.error("Error in /api/translate-batch:", error);
    const isQuota = isRateLimitError(error);
    res.status(isQuota ? 429 : 500).json({
      error: isQuota
        ? describeRateLimit(error)
        : formatErrorMessage(error, "Ceviri yapilamadi."),
    });
  }
});

// 1c. Kelime, gramer ve quiz verilerini uretir.
app.post("/api/study-material", async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || !String(text).trim()) {
      return res.status(400).json({ error: "Metin gereklidir." });
    }

    const ai = getAIClient();
    const material = await generateStudyMaterial(ai, String(text));
    res.json({
      vocabulary: material.vocabulary || [],
      grammarRules: material.grammarRules || [],
      quizQuestions: material.quizQuestions || [],
    });
  } catch (error: any) {
    console.error("Error in /api/study-material:", error);
    const isQuota = isRateLimitError(error);
    res.status(isQuota ? 429 : 500).json({
      error: isQuota
        ? describeRateLimit(error)
        : formatErrorMessage(error, "Ogrenme materyali uretilemedi."),
    });
  }
});

// 1d. B2-C1 seviyesinde ifade ve gerçek diyalog kaliplarini ayiklar.
app.post("/api/extract-vocabulary", async (req, res) => {
  try {
    const { text, count } = req.body;
    if (!text || !String(text).trim()) {
      return res.status(400).json({ error: "Metin gereklidir." });
    }

    const target = Math.min(40, Math.max(8, Number(count) || 20));
    const ai = getAIClient();

    const prompt = `Asagidaki Ingilizce konusma metnini incele ve ogrenciye kart olarak calistirilacak ifadeleri ayikla.

METIN:
"${String(text).slice(0, 14000)}"

NE ARIYORUZ (onem sirasiyla):
1. B2-C1 seviyesinde tek kelimeler (A1-B1 seviyesi temel kelimeleri ALMA: go, make, good, people gibi)
2. Phrasal verb'ler (bring up, come across, figure out...)
3. Kalip ifadeler / collocation'lar (make a decision, take responsibility, raise awareness...)
4. Deyimler (idiom)
5. GERCEK DIYALOG KALIPLARI: konusma dilinde gecen, gunluk sohbette dogrudan kullanilabilecek ifadeler
   (to be honest, the thing is, that said, as far as I'm concerned...)

KESIN KURALLAR:
- SADECE metinde GERCEKTEN GECEN ifadeleri al. Uydurma.
- A2 ve altindaki basit kelimeleri alma.
- TAM OLARAK ${target} adet dondur. Metinde bu kadar ileri seviye ifade yoksa,\n  B1 seviyesindeki faydali kaliplarla tamamla. Sayiyi eksik birakma.
- "contextEn" alanina ifadenin metinde gectigi cumleyi AYNEN yaz.
- "level" alani A2, B1, B2, C1 veya C2 olmali; agirlik B2-C1'de olsun.
- "kind" alani: word, phrasal_verb, collocation, idiom veya expression.
- Ceviriler ("back") dogal Turkce olsun, sozluk kalibi degil.`;

    const response = await generateContentWithRetry(ai, {
      contents: prompt,
      jsonHint: '{"items":[{"front":"","back":"","ipa":"","kind":"word","level":"B2","exampleEn":"","exampleTr":"","contextEn":""}]}',
      config: {
        systemInstruction: SYSTEM_INSTRUCTION_COACH,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            items: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  front: { type: Type.STRING },
                  back: { type: Type.STRING },
                  ipa: { type: Type.STRING },
                  kind: { type: Type.STRING },
                  level: { type: Type.STRING },
                  exampleEn: { type: Type.STRING },
                  exampleTr: { type: Type.STRING },
                  contextEn: { type: Type.STRING },
                },
                required: ["front", "back", "kind", "level"],
              },
            },
          },
          required: ["items"],
        },
      },
    });

    let items: any[] = [];
    try {
      const parsed = JSON.parse(response.text || "{}");
      items = Array.isArray(parsed.items) ? parsed.items : [];
    } catch (e) {
      console.warn("[Vocabulary] parse hatasi:", e);
    }

    const allowedKinds = ["word", "phrasal_verb", "collocation", "idiom", "expression"];
    const allowedLevels = ["A2", "B1", "B2", "C1", "C2"];
    const seen = new Set<string>();

    const cleaned = items
      .filter((it) => it && typeof it.front === 'string' && typeof it.back === 'string')
      .map((it) => ({
        front: String(it.front).trim(),
        back: String(it.back).trim(),
        ipa: it.ipa ? String(it.ipa).trim() : undefined,
        kind: allowedKinds.includes(it.kind) ? it.kind : 'word',
        level: allowedLevels.includes(it.level) ? it.level : 'B2',
        exampleEn: it.exampleEn ? String(it.exampleEn).trim() : undefined,
        exampleTr: it.exampleTr ? String(it.exampleTr).trim() : undefined,
        contextEn: it.contextEn ? String(it.contextEn).trim() : undefined,
      }))
      .filter((it) => {
        if (!it.front || !it.back) return false;
        const key = it.front.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, target);

    res.json({ items: cleaned });
  } catch (error: any) {
    console.error("Error in /api/extract-vocabulary:", error);
    const isQuota = isRateLimitError(error);
    res.status(isQuota ? 429 : 500).json({
      error: isQuota ? describeRateLimit(error) : formatErrorMessage(error, "Kelimeler ayiklanamadi."),
    });
  }
});

// 1e. Kullanicinin metinden sectigi tek bir kelime/ifade icin kart bilgisi uretir.
app.post("/api/define-word", async (req, res) => {
  try {
    const { word, context } = req.body;
    const term = String(word || '').trim();

    if (!term) {
      return res.status(400).json({ error: "Kelime veya ifade gereklidir." });
    }
    if (term.length > 120) {
      return res.status(400).json({ error: "Secilen metin cok uzun. Daha kisa bir ifade secin." });
    }

    const ai = getAIClient();

    const prompt = `Bir Ingilizce ogrencisi asagidaki ifadeyi karta eklemek istiyor.

IFADE: "${term}"
${context ? `GECTIGI CUMLE: "${String(context).slice(0, 500)}"` : ''}

Bu ifade icin kart bilgisi uret:
- "front": ifadenin duzeltilmis/normalize edilmis hali. Fiil cekimliyse mastar
  haline getir (running -> run, went -> go). Phrasal verb veya kalip ise oldugu
  gibi birak.
- "back": GECTIGI CUMLEDEKI anlamina gore dogal Turkce karsilik. Sozluk kalibi
  degil, akici bir ceviri. Kelimenin birden fazla anlami varsa bu baglamdakini sec.
- "ipa": telaffuz (IPA)
- "kind": word, phrasal_verb, collocation, idiom veya expression
- "level": A2, B1, B2, C1 veya C2
- "exampleEn": ifadeyi kullanan YENI ve basit bir ornek cumle
- "exampleTr": ornek cumlenin Turkcesi`;

    const response = await generateContentWithRetry(ai, {
      contents: prompt,
      jsonHint: '{"front":"","back":"","ipa":"","kind":"word","level":"B2","exampleEn":"","exampleTr":""}',
      config: {
        systemInstruction: SYSTEM_INSTRUCTION_COACH,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            front: { type: Type.STRING },
            back: { type: Type.STRING },
            ipa: { type: Type.STRING },
            kind: { type: Type.STRING },
            level: { type: Type.STRING },
            exampleEn: { type: Type.STRING },
            exampleTr: { type: Type.STRING },
          },
          required: ["front", "back", "kind", "level"],
        },
      },
    });

    let item: any = {};
    try {
      item = JSON.parse(response.text || "{}");
    } catch (e) {
      console.warn("[DefineWord] parse hatasi:", e);
    }

    const allowedKinds = ["word", "phrasal_verb", "collocation", "idiom", "expression"];
    const allowedLevels = ["A2", "B1", "B2", "C1", "C2"];

    res.json({
      front: String(item.front || term).trim(),
      back: String(item.back || '').trim(),
      ipa: item.ipa ? String(item.ipa).trim() : undefined,
      kind: allowedKinds.includes(item.kind) ? item.kind : 'word',
      level: allowedLevels.includes(item.level) ? item.level : 'B2',
      exampleEn: item.exampleEn ? String(item.exampleEn).trim() : undefined,
      exampleTr: item.exampleTr ? String(item.exampleTr).trim() : undefined,
    });
  } catch (error: any) {
    console.error("Error in /api/define-word:", error);
    const isQuota = isRateLimitError(error);
    res.status(isQuota ? 429 : 500).json({
      error: isQuota ? describeRateLimit(error) : formatErrorMessage(error, "Kelime bilgisi alinamadi."),
    });
  }
});

/* ============================================================
   SUPABASE SENKRONIZASYONU
   ------------------------------------------------------------
   GUVENLIK NOTU: Supabase anahtarlari YALNIZCA sunucuda tutulur;
   tarayiciya hicbir zaman gonderilmez. Istemci kendi "senkron
   kodunu" gonderir, sunucu bunu hash'leyip veri alanini (space)
   belirler. Boylece giris ekrani olmadan da baskasinin verisine
   erisilemez.
   ============================================================ */

import crypto from "crypto";

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

function supabaseReady(): boolean {
  return !!(SUPABASE_URL && SUPABASE_SERVICE_KEY);
}

/**
 * Senkron kodundan veri alani (space) uretir.
 * Kod duz metin olarak saklanmaz; yalnizca hash'i veritabanina gider.
 */
function spaceFromCode(code: string): string {
  const salt = process.env.SYNC_SALT || 'katmanli-ingilizce';
  return crypto.createHash('sha256').update(`${salt}:${code}`).digest('hex').slice(0, 32);
}

function readSyncCode(req: any): string | null {
  const code = String(req.body?.syncCode || req.query?.code || '').trim();
  if (code.length < 6) return null;
  return code;
}

async function supabaseFetch(path: string, init: any = {}): Promise<any> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Supabase ${res.status}: ${body.slice(0, 300)}`);
  }

  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// Senkronun kullanilabilir olup olmadigini bildirir
app.get("/api/sync/status", (_req, res) => {
  res.json({ enabled: supabaseReady() });
});

// Degisiklikleri gonder (son yazan kazanir)
app.post("/api/sync/push", async (req, res) => {
  try {
    if (!supabaseReady()) {
      return res.status(503).json({ error: "Senkronizasyon yapilandirilmamis." });
    }

    const code = readSyncCode(req);
    if (!code) {
      return res.status(400).json({ error: "Senkron kodu en az 6 karakter olmali." });
    }

    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    if (items.length === 0) return res.json({ pushed: 0, serverTime: new Date().toISOString() });
    if (items.length > 500) {
      return res.status(400).json({ error: "Tek seferde en fazla 500 kayit gonderilebilir." });
    }

    const space = spaceFromCode(code);
    const rows = items.map((it: any) => ({
      space,
      key: String(it.key),
      value: it.value ?? {},
      deleted: !!it.deleted,
      updated_at: new Date().toISOString(),
    }));

    await supabaseFetch('sync_kv?on_conflict=space,key', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(rows),
    });

    res.json({ pushed: rows.length, serverTime: new Date().toISOString() });
  } catch (error: any) {
    console.error("Error in /api/sync/push:", error);
    res.status(500).json({ error: formatErrorMessage(error, "Veriler gonderilemedi.") });
  }
});

// Belirtilen tarihten sonraki degisiklikleri cek
app.post("/api/sync/pull", async (req, res) => {
  try {
    if (!supabaseReady()) {
      return res.status(503).json({ error: "Senkronizasyon yapilandirilmamis." });
    }

    const code = readSyncCode(req);
    if (!code) {
      return res.status(400).json({ error: "Senkron kodu en az 6 karakter olmali." });
    }

    const space = spaceFromCode(code);
    const since = req.body?.since ? new Date(req.body.since).toISOString() : '1970-01-01T00:00:00Z';

    const rows = await supabaseFetch(
      `sync_kv?space=eq.${encodeURIComponent(space)}&updated_at=gt.${encodeURIComponent(since)}&select=key,value,deleted,updated_at&order=updated_at.asc&limit=2000`
    );

    res.json({
      items: rows || [],
      serverTime: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Error in /api/sync/pull:", error);
    res.status(500).json({ error: formatErrorMessage(error, "Veriler alinamadi.") });
  }
});

// Ses kaydi yukle (base64). Kayitlar kisa oldugu icin tek parcada gonderiliyor.
app.post("/api/sync/upload-audio", async (req, res) => {
  try {
    if (!supabaseReady()) {
      return res.status(503).json({ error: "Senkronizasyon yapilandirilmamis." });
    }

    const code = readSyncCode(req);
    if (!code) return res.status(400).json({ error: "Senkron kodu gerekli." });

    const { path, dataBase64 } = req.body || {};
    if (!path || !dataBase64) {
      return res.status(400).json({ error: "Dosya yolu ve veri gerekli." });
    }

    const buffer = Buffer.from(String(dataBase64), 'base64');
    if (buffer.length > 4 * 1024 * 1024) {
      return res.status(413).json({ error: "Ses kaydi cok buyuk (en fazla 4 MB)." });
    }

    const space = spaceFromCode(code);
    const safePath = `${space}/${String(path).replace(/[^a-zA-Z0-9._/-]/g, '_')}`;

    const upRes = await fetch(`${SUPABASE_URL}/storage/v1/object/recordings/${safePath}`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'audio/webm',
        'x-upsert': 'true',
      },
      body: buffer,
    });

    if (!upRes.ok) {
      const body = await upRes.text();
      throw new Error(`Storage ${upRes.status}: ${body.slice(0, 200)}`);
    }

    res.json({ ok: true, path: safePath });
  } catch (error: any) {
    console.error("Error in /api/sync/upload-audio:", error);
    res.status(500).json({ error: formatErrorMessage(error, "Ses kaydi yuklenemedi.") });
  }
});

// Ses kaydi indir
app.post("/api/sync/download-audio", async (req, res) => {
  try {
    if (!supabaseReady()) {
      return res.status(503).json({ error: "Senkronizasyon yapilandirilmamis." });
    }

    const code = readSyncCode(req);
    if (!code) return res.status(400).json({ error: "Senkron kodu gerekli." });

    const { path } = req.body || {};
    if (!path) return res.status(400).json({ error: "Dosya yolu gerekli." });

    const space = spaceFromCode(code);
    const safePath = `${space}/${String(path).replace(/[^a-zA-Z0-9._/-]/g, '_')}`;

    const dlRes = await fetch(`${SUPABASE_URL}/storage/v1/object/recordings/${safePath}`, {
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      },
    });

    if (!dlRes.ok) {
      return res.status(404).json({ error: "Kayit bulunamadi." });
    }

    const buffer = Buffer.from(await dlRes.arrayBuffer());
    res.json({ dataBase64: buffer.toString('base64') });
  } catch (error: any) {
    console.error("Error in /api/sync/download-audio:", error);
    res.status(500).json({ error: formatErrorMessage(error, "Ses kaydi indirilemedi.") });
  }
});

// 2. Phonetic & Grammar Analysis (Katman 2)
app.post("/api/analyze-phonetics-grammar", async (req, res) => {
  try {
    const { transcriptSentences } = req.body;
    const ai = getAIClient();

    const fullText = Array.isArray(transcriptSentences)
      ? transcriptSentences.map((s: any) => s.en).join(" ")
      : String(transcriptSentences);

    const prompt = `Katman 2: Fonetik ve Gramer Analizi (Aktif Dinleme & Sesli Okuma Destek)
Aşağıdaki metni incele:
"${fullText}"

Lütfen şu analizleri yapıp JSON döndür:
1. B2/C1 seviyesinde geçen 5-8 kritik kelime/phrasal verb, IPA okunuşları, Türkçe anlamı ve telaffuz ipucu.
2. Metinde veya ilgili seviyede geçen 3 kilit gramer yapısını (örneğin Passive Voice, Would, Relative Clauses veya Metindeki Önemli Yapılar) "Genelden Özele" mantığıyla açıkla. Her kural için Günlük Hayattan 3 farklı İngilizce örnek cümle ve Türkçe anlamlarını ver.`;

    const response = await generateContentWithRetry(ai, {
      contents: prompt,
      jsonHint: '{"vocabulary":[{"word":"","type":"","ipa":"","meaningTr":"","pronunciationNote":"","exampleSentence":""}],"grammarRules":[{"topic":"","explanationTr":"","examples":[{"en":"","tr":""}]}]}',
      config: {
        systemInstruction: SYSTEM_INSTRUCTION_COACH,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            vocabulary: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  word: { type: Type.STRING },
                  type: { type: Type.STRING },
                  ipa: { type: Type.STRING },
                  meaningTr: { type: Type.STRING },
                  pronunciationNote: { type: Type.STRING },
                  exampleSentence: { type: Type.STRING }
                },
                required: ["word", "meaningTr", "pronunciationNote"]
              }
            },
            grammarRules: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  topic: { type: Type.STRING },
                  explanationTr: { type: Type.STRING },
                  examples: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        en: { type: Type.STRING },
                        tr: { type: Type.STRING }
                      },
                      required: ["en", "tr"]
                    }
                  }
                },
                required: ["topic", "explanationTr", "examples"]
              }
            }
          },
          required: ["vocabulary", "grammarRules"]
        }
      }
    });

    res.json(JSON.parse(response.text || "{}"));
  } catch (error: any) {
    console.error("Error in /api/analyze-phonetics-grammar:", error);
    const isQuota = error?.status === "RESOURCE_EXHAUSTED" || error?.code === 429 || JSON.stringify(error).includes("429");
    const statusCode = isQuota ? 429 : 500;
    const msg = isQuota
      ? describeRateLimit(error)
      : formatErrorMessage(error, "Gramer analizi oluşturulurken hata oluştu.");
    res.status(statusCode).json({ error: msg });
  }
});

// 3. Generate Comprehension Quiz (Katman 3)
app.post("/api/generate-quiz", async (req, res) => {
  try {
    const { transcriptText } = req.body;
    const ai = getAIClient();

    const prompt = `Katman 3: Anlama Kontrolü (Altyazısız İzleme & Dinleme Sonrası Test)
Metne dayalı 5 adet İngilizce soru oluştur. Soruların 3 tanesi Çoktan Seçmeli (Multiple Choice - 4 şık), 2 tanesi Açık Uçlu (Open-ended) olsun.
Metin: "${transcriptText}"

JSON Formatı:
{
  "questions": [
    {
      "id": 1,
      "type": "multiple_choice",
      "question": "English question text",
      "options": ["A) ...", "B) ...", "C) ...", "D) ..."],
      "correctOptionIndex": 0,
      "explanationTr": "Neden A şıkkı doğru açıklaması"
    },
    {
      "id": 4,
      "type": "open_ended",
      "question": "English open question text",
      "sampleAnswerEn": "Ideal answer",
      "explanationTr": "Cevapta aranacak anahtar noktalar"
    }
  ]
}`;

    const response = await generateContentWithRetry(ai, {
      contents: prompt,
      jsonHint: '{"quizQuestions":[{"id":1,"type":"multiple_choice","question":"","options":["","","",""],"correctOptionIndex":0,"sampleAnswerEn":"","explanationTr":""}]}',
      config: {
        systemInstruction: SYSTEM_INSTRUCTION_COACH,
        responseMimeType: "application/json"
      }
    });

    const parsedQuiz = JSON.parse(response.text || "{}");
    const quizList = parsedQuiz.quizQuestions || parsedQuiz.questions || [];
    // App.tsx "quizQuestions" okuyor, prompt "questions" uretiyordu.
    // Arka planda uretilen quiz bu yuzden bos kaliyordu; iki anahtari da donduruyoruz.
    res.json({ quizQuestions: quizList, questions: quizList });
  } catch (error: any) {
    console.error("Error in /api/generate-quiz:", error);
    const isQuota = error?.status === "RESOURCE_EXHAUSTED" || error?.code === 429 || JSON.stringify(error).includes("429");
    const statusCode = isQuota ? 429 : 500;
    const msg = isQuota
      ? describeRateLimit(error)
      : formatErrorMessage(error, "Quiz oluşturulamadı.");
    res.status(statusCode).json({ error: msg });
  }
});

// 4. Writing Evaluation (Katman 4)
app.post("/api/evaluate-writing", async (req, res) => {
  try {
    const { userText, topicContext } = req.body;
    if (!userText || !userText.trim()) {
      return res.status(400).json({ error: "Yazı metni boş olamaz." });
    }

    const ai = getAIClient();
    const prompt = `4. KATMAN: İngilizce Özet ve Yorum Değerlendirmesi
Konu Bağlamı: ${topicContext || "General Video Context"}
Kullanıcının İngilizce Özeti ve Yorumu:
"${userText}"

Lütfen kullanıcı metnini dikkatle incele ve JSON formatında geri bildirim sağla:
1. "grammarCorrections": Hatalı cümlelerin doğrusu, düzeltme sebebi ("Genelden Özele" gramer kuralı).
2. "naturalPhrasing": Cümlelerin bir 'native speaker' gibi daha doğal söylenebileceği alternatif öneriler.
3. "generalFeedback": Akışı bozmadan motivasyon ve bağlamsal değerlendirme (Türkçe).`;

    const response = await generateContentWithRetry(ai, {
      contents: prompt,
      jsonHint: '{"grammarCorrections":[{"original":"","corrected":"","explanationTr":""}],"naturalPhrasing":[{"original":"","nativeSuggestion":"","whyBetterTr":""}],"generalFeedback":""}',
      config: {
        systemInstruction: SYSTEM_INSTRUCTION_COACH,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            grammarCorrections: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  original: { type: Type.STRING },
                  corrected: { type: Type.STRING },
                  explanationTr: { type: Type.STRING }
                },
                required: ["original", "corrected", "explanationTr"]
              }
            },
            naturalPhrasing: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  original: { type: Type.STRING },
                  nativeSuggestion: { type: Type.STRING },
                  whyBetterTr: { type: Type.STRING }
                },
                required: ["original", "nativeSuggestion", "whyBetterTr"]
              }
            },
            generalFeedback: { type: Type.STRING }
          },
          required: ["grammarCorrections", "naturalPhrasing", "generalFeedback"]
        }
      }
    });

    res.json(JSON.parse(response.text || "{}"));
  } catch (error: any) {
    console.error("Error in /api/evaluate-writing:", error);
    const isQuota = error?.status === "RESOURCE_EXHAUSTED" || error?.code === 429 || JSON.stringify(error).includes("429");
    const statusCode = isQuota ? 429 : 500;
    const msg = isQuota
      ? describeRateLimit(error)
      : formatErrorMessage(error, "Yazı değerlendirilemedi.");
    res.status(statusCode).json({ error: msg });
  }
});

// 5. Speaking Simulation (Katman 5)
app.post("/api/speaking-chat", async (req, res) => {
  try {
    const { currentStep, userResponse, conversationHistory, topicContext } = req.body;
    const ai = getAIClient();

    const prompt = `5. KATMAN: Konuşma ve Sesli Anlatım Simülasyonu
Video Konusu: ${topicContext}
Şu anki Adım: ${currentStep} (1, 2 veya 3. soru adımı).
Önceki Konuşma Geçmişi: ${JSON.stringify(conversationHistory || [])}
Kullanıcının Son Yanıtı: "${userResponse || ""}"

Kurallar:
- Video konusuna dayalı, kullanıcının kendi düşüncelerini ifade edebileceği sırayla 3 farklı soru soracağız.
- Eğer kullanıcı henüz ilk adımdaysa (currentStep = 1 ve userResponse yoksa), doğrudan 1. soruyu sor.
- Eğer kullanıcı bir yanıt verdiyse:
  1) Yanıtı için motive edici, kısa ve samimi bir geri bildirim ver (akıcılığa odaklan, gramer takıntısı yapma).
  2) Eğer henüz 3 soru tamamlanmadıysa (örn. 1. yanıt verildi -> 2. soruya geç, 2. yanıt verildi -> 3. soruya geç).
  3) Eğer 3. yanıt verildiyse, genel harika bir kapanış değerlendirmesi ve tebrik mesajı ver.
- Her seferinde TEK BIR soru sor veya kapanış mesajı ver.

JSON Formatı:
{
  "feedback": "Kullanıcının yanıtına kısa motive edici değerlendirme (varsa)",
  "nextQuestion": "İngilizce soru metni (varsa)",
  "nextQuestionTr": "Sorunun Türkçe açıklaması/ipucu",
  "step": 1 | 2 | 3 | "completed",
  "isCompleted": boolean
}`;

    const response = await generateContentWithRetry(ai, {
      contents: prompt,
      jsonHint: '{"feedback":"","nextQuestion":"","nextQuestionTr":"","step":1,"isCompleted":false}',
      config: {
        systemInstruction: SYSTEM_INSTRUCTION_COACH,
        responseMimeType: "application/json"
      }
    });

    res.json(JSON.parse(response.text || "{}"));
  } catch (error: any) {
    console.error("Error in /api/speaking-chat:", error);
    const isQuota = error?.status === "RESOURCE_EXHAUSTED" || error?.code === 429 || JSON.stringify(error).includes("429");
    const statusCode = isQuota ? 429 : 500;
    const msg = isQuota
      ? describeRateLimit(error)
      : formatErrorMessage(error, "Konuşma simülasyonunda hata oluştu.");
    res.status(statusCode).json({ error: msg });
  }
});

// Quick AI Grammar Assistant Drawer Endpoint
app.post("/api/ask-grammar-coach", async (req, res) => {
  try {
    const { question, context } = req.body;
    const ai = getAIClient();

    const prompt = `Bağlam: "${context || ""}"
Kullanıcı Sorusu: "${question}"

"Genelden Özele" gramer yaklaşımıyla açıkla:
1. Sadece soruyla doğrudan ilgili gramer kuralını karmaşaya girmeden özetle.
2. Günlük hayattan 3 anlaşılır İngilizce örnek cümle ve Türkçe karşılıklarını ver.
3. Motive edici ve samimi bir dil kullan.`;

    const response = await generateContentWithRetry(ai, {
      contents: prompt,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION_COACH
      }
    });

    res.json({ answer: response.text });
  } catch (error: any) {
    console.error("Error in /api/ask-grammar-coach:", error);
    const isQuota = error?.status === "RESOURCE_EXHAUSTED" || error?.code === 429 || JSON.stringify(error).includes("429");
    const statusCode = isQuota ? 429 : 500;
    const msg = isQuota
      ? describeRateLimit(error)
      : formatErrorMessage(error, "Gramer koçu yanıt veremedi.");
    res.status(statusCode).json({ error: msg });
  }
});

// Netlify Functions ortaminda Express uygulamasi disaridan sarmalanir;
// kendi portunu dinlemez ve statik dosyalari kendisi servis etmez.
export { app };

async function startServer() {
  // Serve Vite dev server or static dist
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

// AI Studio / Cloud Run / yerel gelistirmede sunucuyu ayaga kaldir.
// Netlify Functions altinda calisirken bu blok atlanir.
if (!process.env.NETLIFY && !process.env.LAMBDA_TASK_ROOT) {
  startServer();
}
