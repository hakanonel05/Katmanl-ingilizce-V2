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
async function fetchYoutubeCues(videoId: string): Promise<Cue[]> {
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

// Robust Gemini generation with multi-model fallback and rate limit retries
async function generateContentWithRetry(
  ai: GoogleGenAI,
  params: {
    contents: any;
    config?: any;
    primaryModel?: string;
  }
) {
  const models = [
    params.primaryModel || "gemini-2.5-flash",
    "gemini-2.5-pro",
    "gemini-2.0-flash",
  ];

  let lastError: any = null;

  for (const modelName of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents: params.contents,
          config: params.config,
        });
        return response;
      } catch (err: any) {
        lastError = err;
        const errStr = (err?.message || "") + JSON.stringify(err);
        const isRateLimit =
          err?.status === "RESOURCE_EXHAUSTED" ||
          err?.code === 429 ||
          errStr.includes("429") ||
          errStr.includes("RESOURCE_EXHAUSTED") ||
          errStr.includes("quota");

        if (isRateLimit) {
          console.warn(`[Gemini API] Model ${modelName} attempt ${attempt + 1} rate limited (429). Waiting 2s...`);
          await new Promise((resolve) => setTimeout(resolve, 2000));
        } else {
          console.warn(`[Gemini API] Model ${modelName} error:`, err?.message || err);
          break; // Try next fallback model
        }
      }
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
 * Cumleleri PARCA PARCA cevirir. Boylece uzun videolarda JSON kesilmez,
 * model cumleleri yeniden bolemez ve id eslesmesi sayesinde zaman damgalari korunur.
 */
async function translateSentencesInBatches(
  ai: GoogleGenAI,
  sentences: BuiltSentence[]
): Promise<Record<number, string>> {
  const BATCH_SIZE = 30;
  const translations: Record<number, string> = {};

  for (let i = 0; i < sentences.length; i += BATCH_SIZE) {
    const chunk = sentences.slice(i, i + BATCH_SIZE);
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
      console.warn(`[Translate] ${i}-${i + BATCH_SIZE} araligi parse edilemedi:`, e);
    }
  }

  return translations;
}

/** Kelime, gramer ve quiz verilerini tek cagrida uretir. */
async function generateStudyMaterial(ai: GoogleGenAI, fullText: string) {
  const prompt = `Asagidaki Ingilizce konusma metnini incele ve ogrenme materyali uret.

METIN:
"${fullText.slice(0, 14000)}"

TALIMATLAR:
1. "vocabulary": Metinde gecen 6-10 kritik B2/C1 kelime/phrasal verb, IPA okunusu, Turkce anlami, telaffuz ipucu ve ornek cumle.
2. "grammarRules": Metinde tespit edilen gramer yapilarini "Genelden Ozele" mantigiyla Turkce acikla. Her yapi icin 5-10 ornek cumle ve Turkce karsiliklari.
3. "quizQuestions": Metni test eden 5 Ingilizce soru. 3 tanesi coktan secmeli (4 sikli "options", "correctOptionIndex" 0-3, "explanationTr"), 2 tanesi acik uclu ("sampleAnswerEn", "explanationTr").`;

  const response = await generateContentWithRetry(ai, {
    contents: prompt,
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
        console.warn("YoutubeTranscript error:", err?.message || err);
      }
    }

    // Altyazi cekilemediyse elle yapistirilan metne dus
    if (!hasRealTimings) {
      const manualText = ytIdFromInput ? '' : inputTrimmed;
      if (!manualText) {
        return res.status(400).json({
          error: "Bu YouTube videosunun altyazisi (CC) bulunamadi veya erisime kapali. Lutfen 'Ingilizce Metin / Transkript Yapistir' sekmesini secip videonun linkini ve transkriptini manuel yapistirarak ders olusturun."
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

    const ai = getGeminiClient();
    const fullText = sentences.map((s) => s.en).join(' ');

    const [translations, material] = await Promise.all([
      translateSentencesInBatches(ai, sentences),
      generateStudyMaterial(ai, fullText),
    ]);

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
      ? "Yapay zeka istek limitine (Rate Limit) ulasildi. Lutfen 30 saniye sonra tekrar deneyin."
      : formatErrorMessage(error, "Transkript islenirken hata olustu.");
    res.status(statusCode).json({ error: msg });
  }
});

// 2. Phonetic & Grammar Analysis (Katman 2)
app.post("/api/analyze-phonetics-grammar", async (req, res) => {
  try {
    const { transcriptSentences } = req.body;
    const ai = getGeminiClient();

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
      ? "Yapay zeka istek limitine (Rate Limit) ulaşıldı. Lütfen 30 saniye sonra tekrar deneyin."
      : formatErrorMessage(error, "Gramer analizi oluşturulurken hata oluştu.");
    res.status(statusCode).json({ error: msg });
  }
});

// 3. Generate Comprehension Quiz (Katman 3)
app.post("/api/generate-quiz", async (req, res) => {
  try {
    const { transcriptText } = req.body;
    const ai = getGeminiClient();

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
      ? "Yapay zeka istek limitine (Rate Limit) ulaşıldı. Lütfen 30 saniye sonra tekrar deneyin."
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

    const ai = getGeminiClient();
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
      ? "Yapay zeka istek limitine (Rate Limit) ulaşıldı. Lütfen 30 saniye sonra tekrar deneyin."
      : formatErrorMessage(error, "Yazı değerlendirilemedi.");
    res.status(statusCode).json({ error: msg });
  }
});

// 5. Speaking Simulation (Katman 5)
app.post("/api/speaking-chat", async (req, res) => {
  try {
    const { currentStep, userResponse, conversationHistory, topicContext } = req.body;
    const ai = getGeminiClient();

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
      ? "Yapay zeka istek limitine (Rate Limit) ulaşıldı. Lütfen 30 saniye sonra tekrar deneyin."
      : formatErrorMessage(error, "Konuşma simülasyonunda hata oluştu.");
    res.status(statusCode).json({ error: msg });
  }
});

// Quick AI Grammar Assistant Drawer Endpoint
app.post("/api/ask-grammar-coach", async (req, res) => {
  try {
    const { question, context } = req.body;
    const ai = getGeminiClient();

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
      ? "Yapay zeka istek limitine (Rate Limit) ulaşıldı. Lütfen 30 saniye sonra tekrar deneyin."
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
