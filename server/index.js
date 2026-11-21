// Lumen X server — one small Express app that does three jobs:
//   1. GET  /api/healthz        → { status: "ok" }
//   2. POST /api/lumen/analyze  → asks Google Gemini, returns the analysis JSON
//   3. Serves the built frontend from ../dist (after `npm run build`)
//
// The analyze route is a faithful port of the ORIGINAL Lumen server code
// (recovered from the owner's Replit project on 2026-11-20): same model,
// same system prompt word for word, same error messages. The Gemini key is
// read from the GEMINI_API_KEY environment variable — never written in code.

import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = express();
const PORT = process.env.PORT || 3000;
const GEMINI_MODEL = 'gemini-3.6-flash';
const LANGUAGE_LABELS = { ar: 'Arabic', en: 'English', tr: 'Turkish', de: 'German', pt: 'Portuguese' };


// Attached screenshots arrive as data URLs, which can be a few MB — allow big JSON bodies.
app.use(express.json({ limit: '12mb' }));

// ---------------------------------------------------------------------------
// Helpers ported from the original server
// ---------------------------------------------------------------------------

// Splits a data URL ("data:image/png;base64,....") into mime type + raw
// base64, and checks the base64 is well-formed.
function parseImageData(imageData) {
  const normalized = imageData.trim();
  const dataUrlMatch = normalized.match(/^data:(image\/(?:png|jpe?g|webp));base64,(.+)$/is);

  const mimeType =
    dataUrlMatch?.[1]?.toLowerCase().replace('image/jpg', 'image/jpeg') ?? 'image/jpeg';
  const data = (dataUrlMatch?.[2] ?? normalized).replace(/\s/g, '');

  if (!data || !/^[a-z\d+/]+={0,2}$/i.test(data) || data.length % 4 === 1) {
    throw new Error('Image data must be valid base64.');
  }

  return { mimeType, data };
}

// The model is told to answer with pure JSON, but if it wraps the answer in
// ```json fences anyway, strip them before parsing.
function stripJsonFences(value) {
  return value
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function getGeminiApiKey() {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured.');
  }
  return apiKey;
}

// The original system prompt, verbatim. ${languageLabel} is the only
// substitution: the whole answer must come back in the chosen language.
function buildSystemPrompt(languageLabel) {
  return `You are Lumen, a thoughtful assistant that helps people understand confusing messages, screens, documents, and everyday situations.

Return ONLY valid JSON with this exact shape:
{
  "summary": "one clear sentence that says what this is about",
  "whatItMeans": ["2 to 4 short bullets explaining the important meaning in plain language"],
  "nextStep": "the single most useful thing the user should do next",
  "reply": "a natural, appropriate message the user could send if a reply makes sense; if not, say why in a gentle sentence",
  "replyTone": "a short label such as Warm and clear, Professional, or Brief and direct"
}

The entire response's user-facing values — including summary, every whatItMeans bullet, nextStep, reply, and replyTone — MUST be written strictly in ${languageLabel}. Do not mix languages or translate only some fields. Keep the JSON property names exactly as shown above.
Be concise, concrete, and non-alarmist. Distinguish facts from guesses. Do not mention that you are an AI.`;
}

// Checks the model's answer has exactly the shape the frontend displays
// (the original used a zod schema for this; same checks, written out).
function isValidAnalysis(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof value.summary === 'string' &&
    Array.isArray(value.whatItMeans) &&
    value.whatItMeans.every((item) => typeof item === 'string') &&
    typeof value.nextStep === 'string' &&
    typeof value.reply === 'string' &&
    typeof value.replyTone === 'string'
  );
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

app.get('/api/healthz', (req, res) => {
  res.json({ status: 'ok' });
});

app.post('/api/lumen/analyze', async (req, res) => {
  const body = req.body ?? {};
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  const imageData =
    typeof body.imageData === 'string' && body.imageData.trim() ? body.imageData.trim() : null;
  const language = ['ar', 'en', 'tr', 'de', 'pt'].includes(body.language) ? body.language : body.language === undefined ? 'en' : null;



  if (language === null || prompt.length > 12000 || (!prompt && !imageData)) {
    return res.status(400).json({ error: 'Please add some text or a supported image.' });
  }

  let apiKey;
  try {
    apiKey = getGeminiApiKey();
  } catch (error) {
    console.error('Gemini API key is unavailable:', error);
    return res.status(503).json({ error: 'Lumen is not connected yet. Please try again later.' });
  }

  const parts = [
    {
      text: prompt
        ? `The user said:
${prompt}`
        : 'The user provided an image without additional text. Explain what is visible and what they should do next.',
    },
  ];

  if (imageData) {
    try {
      parts.push({ inlineData: parseImageData(imageData) });
    } catch (error) {
      console.warn('Invalid image data received:', error);
      return res.status(400).json({ error: 'That image could not be read. Try uploading it again.' });
    }
  }

  try {
    const endpoint = new URL(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
    );
    endpoint.searchParams.set('key', apiKey);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);

    let response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: buildSystemPrompt(LANGUAGE_LABELS[language]) }],
          },
          contents: [{ role: 'user', parts }],
          generationConfig: {
            responseMimeType: 'application/json',
            maxOutputTokens: 8192,
          },
        }),
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const upstreamBody = await response.text();
      console.error('Gemini analysis request failed:', response.status, upstreamBody.slice(0, 1000));
      return res.status(502).json({ error: "Lumen couldn't finish that read. Please try again." });
    }

    const responseBody = await response.json();
    const text = responseBody.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? '')
      .join('')
      .trim();

    if (!text) {
      return res.status(500).json({ error: "Lumen couldn't find enough detail to explain that yet." });
    }

    const result = JSON.parse(stripJsonFences(text));
    if (!isValidAnalysis(result)) {
      throw new Error('Gemini answer did not match the expected shape.');
    }
    return res.json({
      summary: result.summary,
      whatItMeans: result.whatItMeans,
      nextStep: result.nextStep,
      reply: result.reply,
      replyTone: result.replyTone,
    });
  } catch (error) {
    console.error('Lumen analysis failed:', error);
    return res.status(502).json({ error: "Lumen couldn't finish that read. Please try again." });
  }
});

// Unknown API routes get a JSON 404, not the web page.
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Not found.' });
});

// ---------------------------------------------------------------------------
// Static frontend (production). In development, Vite serves the frontend
// itself and proxies /api here — see vite.config.ts.
// ---------------------------------------------------------------------------

const distDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
app.use(express.static(distDir));
// Single-page app fallback: every non-API route returns the app page.
app.get('*', (req, res) => {
  res.sendFile(path.join(distDir, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Lumen X server listening on port ${PORT}`);
});
