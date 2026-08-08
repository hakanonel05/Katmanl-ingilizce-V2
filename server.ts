import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
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

// 1. Extract / Process Bilingual Transcript (Katman 1)
app.post("/api/extract-transcript", async (req, res) => {
  try {
    const { videoInput, youtubeUrl } = req.body;
    if (!videoInput || !videoInput.trim()) {
      return res.status(400).json({ error: "Video linki veya metin gereklidir." });
    }

    const inputTrimmed = videoInput.trim();
    let ytId = extractYouTubeId(inputTrimmed);
    const providedYtId = youtubeUrl ? extractYouTubeId(youtubeUrl.trim()) : '';

    let rawText = inputTrimmed;
    let fetchedTitle = "";

    // If a separate youtubeUrl was provided alongside manual text
    const activeYtId = ytId || providedYtId;

    if (activeYtId) {
      // Fetch title via oEmbed
      try {
        const oembedRes = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${activeYtId}&format=json`);
        if (oembedRes.ok) {
          const oembedData: any = await oembedRes.json();
          if (oembedData.title) {
            fetchedTitle = oembedData.title;
          }
        }
      } catch (e) {
        console.warn("Could not fetch YouTube title via oEmbed:", e);
      }
    }

    // Only fetch YouTube transcript if user provided ONLY a YouTube URL (ytId exists on inputTrimmed and no separate manual text)
    if (ytId && (!youtubeUrl || !youtubeUrl.trim())) {
      try {
        const transcriptItems = await YoutubeTranscript.fetchTranscript(ytId);
        if (transcriptItems && transcriptItems.length > 0) {
          const formattedTranscript = transcriptItems.map((item: any) => {
            const totalSecs = Math.floor(item.offset || 0);
            const m = Math.floor(totalSecs / 60).toString().padStart(2, '0');
            const s = Math.floor(totalSecs % 60).toString().padStart(2, '0');
            return `[${m}:${s}] ${item.text}`;
          }).join("\n");
          rawText = formattedTranscript;
        } else {
          return res.status(400).json({
            error: "Bu YouTube videosunun altyazı metni otomatik çekilemedi. Lütfen 'İngilizce Metin / Transkript Yapıştır' seçeneğini kullanarak videonun İngilizce metnini manuel yapıştırın ve üstteki YouTube link alanına video linkini ekleyin."
          });
        }
      } catch (err: any) {
        console.error("YoutubeTranscript error:", err?.message || err);
        return res.status(400).json({
          error: "Bu YouTube videosunun altyazısı (CC) bulunamadı veya erişime kapalı. Lütfen 'İngilizce Metin / Transkript Yapıştır' sekmesini seçip videonun linkini ve transkriptini manuel yapıştırarak ders oluşturun."
        });
      }
    }

    const ai = getGeminiClient();
    const prompt = `Sen Katmanlı Çalışma (Layered Learning) metodolojisinde uzman İngilizce öğretmenisin.
Aşağıda verilen GERÇEK konuşma metnini/transkriptini incele ve ilk 3 katman için tüm verileri TEK SEFERDE eksiksiz oluştur.

GERÇEK METİN (Varsa [mm:ss] şeklinde YouTube altyazı zaman damgaları içerir):
"${rawText.slice(0, 10000)}"

TALİMATLAR:
1. KATMAN (Çift Dilli Metin):
- Metindeki İngilizce cümleleri bozmadan, konuşma akışındaki gibi anlamlı cümle parçalarına ayır ("sentences").
- Her cümlenin başladığı anı temsil eden GERÇEK zaman damgasını ("timestamp", örn: "00:00", "00:07", "00:18", "00:32", "01:05") ekle. Metinde [mm:ss] zaman damgaları varsa BİREBİR veya en yakın gerçek cümlenin başlama zamanını kullan. Eğer zaman damgası yoksa konuşma hızına göre ortalama (her 6-10 saniyede bir) gerçekçi zaman damgaları hesapla.
- Her İngilizce cümlenin karşısına doğal, akıcı Türkçe çevirisini yaz.
- Metindeki sırayı %100 koru.

2. KATMAN (Fonetik ve Gramer Analizi):
- "vocabulary": Metinde geçen 6-10 kritik B2/C1 kelime/phrasal verb, IPA okunuşları, Türkçe anlamı, telaffuz ipucu ve örnek cümle.
- "grammarRules": Metinde tespit edilen gramer/dil yapılarını "Genelden Özele" mantığıyla Türkçe açıkla. ÖNEMLİ: Gramer konusunda metinde geçen ve günlük hayatta kullanılan TÜM ilgili örnek cümleleri getir (sadece 3 tane ile sınırlama, o yapıya uyan 5-10 tüm örnek cümleleri kapsayıcı şekilde listele).

3. KATMAN (Anlama Kontrolü / Quiz):
- "quizQuestions": Metnin ana hatlarını ve detaylarını test eden 5 İngilizce soru hazırla.
- 3 tanesi Multiple Choice (Çoktan Seçmeli: 4 şıklı "options", "correctOptionIndex" 0-3 arası, "explanationTr"), 2 tanesi Open-ended (Açık uçlu: "sampleAnswerEn", "explanationTr").

Başlık: Metne/videoya uygun kısa ve öz bir başlık ("title": "${fetchedTitle || 'Video Transkripti'}").`;

    const response = await generateContentWithRetry(ai, {
      contents: prompt,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION_COACH,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            sentences: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.INTEGER },
                  timestamp: { type: Type.STRING },
                  en: { type: Type.STRING },
                  tr: { type: Type.STRING }
                },
                required: ["id", "en", "tr"]
              }
            },
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
                  options: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING }
                  },
                  correctOptionIndex: { type: Type.INTEGER },
                  sampleAnswerEn: { type: Type.STRING },
                  explanationTr: { type: Type.STRING }
                },
                required: ["id", "type", "question", "explanationTr"]
              }
            }
          },
          required: ["title", "sentences", "vocabulary", "grammarRules", "quizQuestions"]
        }
      }
    });

    const data = JSON.parse(response.text || "{}");
    if (!data.sentences || data.sentences.length === 0) {
      return res.status(500).json({ error: "Cümleler ayrıştırılamadı." });
    }

    res.json(data);
  } catch (error: any) {
    console.error("Error in /api/extract-transcript:", error);
    const isQuota = error?.status === "RESOURCE_EXHAUSTED" || error?.code === 429 || JSON.stringify(error).includes("429");
    const statusCode = isQuota ? 429 : 500;
    const msg = isQuota 
      ? "Yapay zeka istek limitine (Rate Limit) ulaşıldı. Lütfen 30 saniye sonra tekrar deneyin."
      : formatErrorMessage(error, "Transkript işlenirken hata oluştu.");
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

    res.json(JSON.parse(response.text || "{}"));
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

async function startServer() {
  // Serve Vite dev server or static dist
  if (process.env.NODE_ENV !== "production") {
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

startServer();
