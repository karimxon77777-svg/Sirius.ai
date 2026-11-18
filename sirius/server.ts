import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import {
  parseAssistantResponse,
  sanitizeSources,
  stripMarkdownForSpeech,
} from './src/utils/chatHelpers.ts';
import type { GeminiModel, VoiceName } from './src/types.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const ALLOWED_MODELS = new Set<GeminiModel>(['gemini-4-hydrogen', 'gemini-3.1-flash-lite']);
const ALLOWED_VOICES = new Set<VoiceName>(['Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr']);

const SYSTEM_INSTRUCTION = `Siz Sirius AI — foydalanuvchiga o‘zbek tilida (yoki foydalanuvchi murojaat qilgan tilda) tezkor, aniq, samimiy va amaliy yordam beradigan aqlli ovozli va matnli yordamchisiz.

Qoidalar:
1. Javoblarni lo‘nda, ravon va tushunarli tuzing. Kerakli joylarda qisqa ro‘yxatlardan foydalaning.
2. Texnik, ilmiy, tarixiy yoki amaliy savollarda aniq faktlarga tayaning; bilmagan narsangizni taxmin qilib to‘qib chiqarmang.
3. Agar javob mavzusiga mos, haqiqatan qiziqarli va foydali qo‘shimcha ma’lumot bo‘lsa, javobning eng oxirida alohida qatordan quyidagi formatda bitta qisqa fakt yozing:
[QIZIQARLI_FAKT]: <1-2 gapdan iborat qiziqarli fakt>
Oddiy salomlashish yoki juda qisqa javoblarda bu tegni yozish shart emas.`;

interface IncomingChatTurn {
  role: 'user' | 'assistant';
  text: string;
}

function createGenAIClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    apiVersion: 'v1beta',
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function normalizeModel(requested: unknown): GeminiModel {
  if (typeof requested === 'string' && ALLOWED_MODELS.has(requested as GeminiModel)) {
    return requested as GeminiModel;
  }
  return 'gemini-3.1-flash-lite';
}

function normalizeVoice(requested: unknown): VoiceName {
  if (typeof requested === 'string' && ALLOWED_VOICES.has(requested as VoiceName)) {
    return requested as VoiceName;
  }
  return 'Kore';
}

function buildGeminiContents(history: IncomingChatTurn[], prompt: string) {
  const turns = history
    .filter((m) => m && typeof m.text === 'string' && m.text.trim().length > 0)
    .slice(-18)
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.text.trim().slice(0, 12000) }],
    }));

  const trimmedPrompt = prompt.trim().slice(0, 12000);
  const lastTurn = turns[turns.length - 1];
  if (!lastTurn || lastTurn.role !== 'user' || lastTurn.parts[0].text !== trimmedPrompt) {
    turns.push({
      role: 'user',
      parts: [{ text: trimmedPrompt }],
    });
  }

  return turns;
}

function isTransientError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /429|503|rate limit|temporarily|overloaded|unavailable|ECONNRESET/i.test(msg);
}

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 1): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries && isTransientError(err)) {
        const delayMs = 300 * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

function extractErrorMessage(err: unknown): { status: number; message: string } {
  const raw = err instanceof Error ? err.message : String(err);
  if (/API key|GEMINI_API_KEY|UNAUTHENTICATED|401/i.test(raw)) {
    return {
      status: 503,
      message: 'Gemini API kaliti yaroqsiz yoki sozlanmagan.',
    };
  }
  if (/429|quota|RESOURCE_EXHAUSTED/i.test(raw)) {
    return {
      status: 429,
      message: 'So‘rovlar limiti vaqtincha to‘ldi. Birozdan so‘ng qayta urinib ko‘ring.',
    };
  }
  if (/400|INVALID_ARGUMENT|NOT_FOUND|404/i.test(raw)) {
    return {
      status: 400,
      message: `So‘rov parametrlarida xatolik: ${raw.slice(0, 180)}`,
    };
  }
  return {
    status: 500,
    message: 'AI javobini olishda server xatoligi yuz berdi. Iltimos, qayta urinib ko‘ring.',
  };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '16mb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      ok: true,
      hasApiKey: Boolean(process.env.GEMINI_API_KEY?.trim()),
    });
  });

  app.post('/api/chat', async (req: Request, res: Response) => {
    try {
      const ai = createGenAIClient();
      if (!ai) {
        res.status(503).json({
          error: 'GEMINI_API_KEY muhit o‘zgaruvchisi serverda sozlanmagan.',
        });
        return;
      }

      const { prompt, history = [], model, searchGrounding = false } = req.body ?? {};
      if (typeof prompt !== 'string' || !prompt.trim()) {
        res.status(400).json({ error: 'So‘rov matni bo‘sh bo‘lmasligi kerak.' });
        return;
      }

      const selectedModel = normalizeModel(model);
      const contents = buildGeminiContents(Array.isArray(history) ? history : [], prompt);
      const useSearch = Boolean(searchGrounding);

      const runGenerate = (enableSearch: boolean) =>
        withRetry(() =>
          ai.models.generateContent({
            model: selectedModel,
            contents,
            config: {
              systemInstruction: SYSTEM_INSTRUCTION,
              thinkingConfig: {
                thinkingLevel:
                  selectedModel === 'gemini-4-hydrogen'
                    ? ThinkingLevel.LOW
                    : ThinkingLevel.MINIMAL,
              },
              ...(enableSearch ? { tools: [{ googleSearch: {} }] } : {}),
            },
          })
        );

      let response;
      try {
        response = await runGenerate(useSearch);
      } catch (err) {
        if (useSearch && /429|quota|RESOURCE_EXHAUSTED/i.test(err instanceof Error ? err.message : String(err))) {
          response = await runGenerate(false);
        } else {
          throw err;
        }
      }

      const rawText = response.text ?? '';
      const parsed = parseAssistantResponse(rawText);
      const sources = sanitizeSources(
        response.candidates?.[0]?.groundingMetadata?.groundingChunks
      );

      res.json({
        text: parsed.text || 'Kechirasiz, javob shakllantirilmadi.',
        funFact: parsed.funFact,
        sources,
        model: selectedModel,
      });
    } catch (err) {
      console.error('[/api/chat] error:', err);
      const { status, message } = extractErrorMessage(err);
      res.status(status).json({ error: message });
    }
  });

  app.post('/api/chat/stream', async (req: Request, res: Response) => {
    const ai = createGenAIClient();
    if (!ai) {
      res.status(503).json({
        error: 'GEMINI_API_KEY muhit o‘zgaruvchisi serverda sozlanmagan.',
      });
      return;
    }

    const { prompt, history = [], model, searchGrounding = false } = req.body ?? {};
    if (typeof prompt !== 'string' || !prompt.trim()) {
      res.status(400).json({ error: 'So‘rov matni bo‘sh bo‘lmasligi kerak.' });
      return;
    }

    const selectedModel = normalizeModel(model);
    const contents = buildGeminiContents(Array.isArray(history) ? history : [], prompt);
    const useSearch = Boolean(searchGrounding);

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
    res.write(': connected\n\n');

    let closed = false;
    res.on('close', () => {
      if (!res.writableEnded) {
        closed = true;
      }
    });

    const sendEvent = (payload: Record<string, unknown>) => {
      if (!closed) {
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
      }
    };

    try {
      const openStream = (enableSearch: boolean) =>
        withRetry(() =>
          ai.models.generateContentStream({
            model: selectedModel,
            contents,
            config: {
              systemInstruction: SYSTEM_INSTRUCTION,
              thinkingConfig: {
                thinkingLevel:
                  selectedModel === 'gemini-4-hydrogen'
                    ? ThinkingLevel.LOW
                    : ThinkingLevel.MINIMAL,
              },
              ...(enableSearch ? { tools: [{ googleSearch: {} }] } : {}),
            },
          })
        );

      let stream;
      try {
        stream = await openStream(useSearch);
      } catch (err) {
        if (useSearch && /429|quota|RESOURCE_EXHAUSTED/i.test(err instanceof Error ? err.message : String(err))) {
          stream = await openStream(false);
        } else {
          throw err;
        }
      }

      let accumulated = '';
      let groundingChunks: unknown = [];

      for await (const chunk of stream) {
        if (closed) {
          break;
        }
        const delta = chunk.text ?? '';
        if (delta) {
          accumulated += delta;
          sendEvent({ type: 'chunk', delta });
        }
        const maybeChunks = chunk.candidates?.[0]?.groundingMetadata?.groundingChunks;
        if (Array.isArray(maybeChunks) && maybeChunks.length > 0) {
          groundingChunks = maybeChunks;
        }
      }

      if (!closed) {
        const parsed = parseAssistantResponse(accumulated);
        const sources = sanitizeSources(groundingChunks);
        sendEvent({
          type: 'done',
          text: parsed.text || 'Kechirasiz, javob shakllantirilmadi.',
          funFact: parsed.funFact,
          sources,
          model: selectedModel,
        });
        res.end();
      }
    } catch (err) {
      console.error('[/api/chat/stream] error:', err);
      const { message } = extractErrorMessage(err);
      sendEvent({ type: 'error', message });
      if (!closed) {
        res.end();
      }
    }
  });

  app.post('/api/tts', async (req: Request, res: Response) => {
    try {
      const ai = createGenAIClient();
      if (!ai) {
        res.status(503).json({
          error: 'GEMINI_API_KEY muhit o‘zgaruvchisi serverda sozlanmagan.',
        });
        return;
      }

      const { text, voiceName } = req.body ?? {};
      if (typeof text !== 'string' || !text.trim()) {
        res.status(400).json({ error: 'Ovozga aylantirish uchun matn kiritilmadi.' });
        return;
      }

      const cleanSpeech = stripMarkdownForSpeech(text);
      if (!cleanSpeech) {
        res.status(400).json({ error: 'Ovozga aylantirish uchun yaroqli matn topilmadi.' });
        return;
      }

      const selectedVoice = normalizeVoice(voiceName);

      const response = await withRetry(() =>
        ai.models.generateContent({
          model: 'gemini-3.8-flash-lite-tts',
          contents: [
            {
              role: 'user',
              parts: [{ text: cleanSpeech }],
            },
          ],
          config: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: selectedVoice,
                },
              },
            },
          },
        })
      );

      const inlineData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData;
      if (!inlineData?.data) {
        res.status(502).json({ error: 'TTS audio ma’lumoti qaytmadi.' });
        return;
      }

      res.json({
        audioBase64: inlineData.data,
        mimeType: inlineData.mimeType || 'audio/wav',
      });
    } catch (err) {
      console.error('[/api/tts] error:', err);
      const { status, message } = extractErrorMessage(err);
      res.status(status).json({ error: message });
    }
  });

  app.post('/api/transcribe', async (req: Request, res: Response) => {
    try {
      const ai = createGenAIClient();
      if (!ai) {
        res.status(503).json({
          error: 'GEMINI_API_KEY muhit o‘zgaruvchisi serverda sozlanmagan.',
        });
        return;
      }

      const { audioBase64, mimeType = 'audio/webm' } = req.body ?? {};
      if (typeof audioBase64 !== 'string' || !audioBase64.trim()) {
        res.status(400).json({ error: 'Audio ma’lumot yuborilmadi.' });
        return;
      }

      const safeMime =
        typeof mimeType === 'string' && mimeType.startsWith('audio/')
          ? mimeType.split(';')[0].trim()
          : 'audio/webm';

      const response = await withRetry(() =>
        ai.models.generateContent({
          model: 'gemini-3.5-transcribe',
          contents: [
            {
              role: 'user',
              parts: [
                {
                  inlineData: {
                    data: audioBase64,
                    mimeType: safeMime,
                  },
                },
                {
                  text: "Ushbu audiodagi nutqni so‘zma-so‘z, imlo qoidalariga amal qilgan holda matnga o‘giring. Asosan o‘zbek tilida bo‘lsa o‘zbek lotin alifbosida yozing. Faqat transkripsiya matnini qaytaring, ortiqcha izoh qo‘shmang.",
                },
              ],
            },
          ],
        })
      );

      const transcribed = (response.text ?? '').trim();
      res.json({ text: transcribed });
    } catch (err) {
      console.error('[/api/transcribe] error:', err);
      const { status, message } = extractErrorMessage(err);
      res.status(status).json({ error: message });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`qarsildoq.ai server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
