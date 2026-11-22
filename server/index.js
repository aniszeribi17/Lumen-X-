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
 "replyOptions": [{"tone": "Safe and polite", "text": "one alternative reply in that tone"}, {"tone": "Direct", "text": "one alternative reply in that tone"}, {"tone": "Warm", "text": "one alternative reply in that tone"}]
,"replyTone": "a short label such as Warm and clear, Professional, or Brief and direct"
}

The entire response's user-facing values — including summary, every whatItMeans bullet, nextStep, reply, and replyTone — MUST be written strictly in ${languageLabel}. Do not mix languages or translate only some fields. Keep the JSON property names exactly as shown above.
Be concise, concrete, and non-alarmist. Distinguish facts from guesses. Do not mention that you are an AI.`;
}
function buildChatSystemPrompt(languageLabel) {
  return `You are Lumen, a thoughtful assistant that helps people understand confusing messages, screens, documents, and everyday situations.

You already gave the user an analysis of something they shared. They are now asking follow-up questions about that same situation. The first exchange of this conversation gives you their original input and your earlier analysis — treat both as the shared context for everything that follows.

Help with things like: explaining the analysis further, drafting or improving a reply they could send, adjusting the tone of a reply, thinking through what happens if the other person answers in a certain way, and choosing the next step.

Answer in plain text, strictly in ${languageLabel}. Do not mix languages. Be concise, concrete, and non-alarmist. Distinguish facts from guesses. Do not mention that you are an AI.`;
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
function validReplyOptions(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((option) => option !== null && typeof option === 'object' && typeof option.tone === 'string' && typeof option.text === 'string')
    .slice(0, 3)
    .map((option) => ({ tone: option.tone, text: option.text }));
}

function isValidRisk(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    ['low', 'medium', 'high'].includes(value.level) &&
    Array.isArray(value.signals) &&
    value.signals.every((item) => typeof item === 'string')
  );
}

function buildScamSystemPrompt(languageLabel) {
  return `You are Lumen, a thoughtful assistant that helps people check whether a message, offer, or request might be a scam or fraud.

Return ONLY valid JSON with this exact shape:
{
  "summary": "one clear sentence with the verdict: is this likely a scam, likely safe, or unclear",
  "whatItMeans": ["2 to 4 short bullets explaining the important signs in plain language"],
  "nextStep": "the single safest thing the user should do next",
  "reply": "a safe message the user could send if a reply makes sense; if replying is unsafe, say why in a gentle sentence",
  "replyTone": "a short label such as Careful and firm",
  "replyOptions": [{"tone": "Safe and polite", "text": "one alternative reply in that tone"}, {"tone": "Direct", "text": "one alternative reply in that tone"}, {"tone": "Warm", "text": "one alternative reply in that tone"}],
  "risk": {"level": "low, medium, or high", "signals": ["2 to 5 short red flags or reassuring signs you found"]}
}

The entire response's user-facing values — including summary, every whatItMeans bullet, nextStep, reply, replyTone, every replyOptions text, and every risk signal — MUST be written strictly in ${languageLabel}. Do not mix languages. Keep the JSON property names exactly as shown above.
Judge by concrete signals: urgency pressure, requests for money, gift cards, codes or passwords, strange links, sender mismatches, too-good-to-be-true offers, threats. Never advise the user to send money, share a code or password, or click a suspicious link. Be concise, concrete, and non-alarmist. Distinguish facts from guesses. Do not mention that you are an AI.`;
}

function buildConversationSystemPrompt(languageLabel) {
  return `You are Lumen, a thoughtful assistant that helps people understand a conversation between two people: what each side wants, how the tone shifts, and what is really going on under the words.

Return ONLY valid JSON with this exact shape:
{
  "summary": "one clear sentence that says what this conversation is really about",
  "whatItMeans": ["2 to 4 short bullets: what each person seems to want, the tone shift, and any tension or warmth underneath"],
  "nextStep": "the single most useful thing the user should do next",
  "reply": "a natural, appropriate next message the user could send",
  "replyTone": "a short label such as Warm and clear, Professional, or Brief and direct",
  "replyOptions": [{"tone": "Safe and polite", "text": "one alternative reply in that tone"}, {"tone": "Direct", "text": "one alternative reply in that tone"}, {"tone": "Warm", "text": "one alternative reply in that tone"}]
}

The entire response's user-facing values — including summary, every whatItMeans bullet, nextStep, reply, replyTone, and every replyOptions text — MUST be written strictly in ${languageLabel}. Do not mix languages. Keep the JSON property names exactly as shown above.
Be concise, concrete, and non-alarmist. Distinguish facts from guesses. Do not mention that you are an AI.`;
}
function buildDeepSystemPrompt(languageLabel) {
  return `You are Lumen, a thoughtful assistant that helps people understand confusing messages, screens, documents, and everyday situations. This time the user asked for a DETAILED explanation: everything about the message, broken down point by point, with evidence.

Return ONLY valid JSON with this exact shape:
{
  "summary": "one clear sentence that says what this is about",
  "whatItMeans": ["2 to 4 short bullets explaining the important meaning in plain language"],
  "nextStep": "the single most useful thing the user should do next",
  "reply": "a natural, appropriate message the user could send if a reply makes sense; if not, say why in a gentle sentence",
  "replyOptions": [{"tone": "Safe and polite", "text": "one alternative reply in that tone"}, {"tone": "Direct", "text": "one alternative reply in that tone"}, {"tone": "Warm", "text": "one alternative reply in that tone"}],
  "replyTone": "a short label such as Warm and clear, Professional, or Brief and direct",
  "deep": {
    "overview": "a full plain-language explanation of the whole message, 3 to 6 sentences, no jargon",
    "points": [{"title": "a short label for one part of the message", "detail": "what this part means and why it matters", "evidence": "the exact words from the user's text that support this, copied word for word; empty string if there is no direct quote"}],
    "senderTone": "the sender's tone and likely intent, in one or two sentences",
    "hiddenMeanings": ["things implied but not said directly; empty array if there are none"],
    "hardWords": [{"word": "a difficult word or phrase from the text", "meaning": "what it means in simple words"}],
    "ambiguities": ["places where the message could honestly mean two different things; empty array if there are none"]
  }
}

Rules for the deep section:
- Cover the message point by point: 3 to 6 points, in the order they appear in the message.
- Evidence MUST be copied word for word from the user's text. Never invent, shorten, or rephrase a quote. If a point has no direct quote, use an empty string.
- hardWords: only include words a normal reader might not know; if there are none, use an empty array.
- The entire response's user-facing values MUST be written strictly in ${languageLabel}. Do not mix languages. Keep the JSON property names exactly as shown above.
Be concrete and non-alarmist. Distinguish facts from guesses. Do not mention that you are an AI.`;
}

function validDeep(value) {
  if (value === null || typeof value !== 'object') return null;
  if (typeof value.overview !== 'string' || typeof value.senderTone !== 'string') return null;
  if (!Array.isArray(value.points)) return null;
  const points = value.points
    .filter((point) => point !== null && typeof point === 'object' && typeof point.title === 'string' && typeof point.detail === 'string')
    .slice(0, 6)
    .map((point) => ({ title: point.title, detail: point.detail, evidence: typeof point.evidence === 'string' ? point.evidence : '' }));
  if (points.length === 0) return null;
  const strings = (list) => (Array.isArray(list) ? list.filter((item) => typeof item === 'string').slice(0, 6) : []);
  const hardWords = Array.isArray(value.hardWords)
    ? value.hardWords
        .filter((item) => item !== null && typeof item === 'object' && typeof item.word === 'string' && typeof item.meaning === 'string')
        .slice(0, 8)
        .map((item) => ({ word: item.word, meaning: item.meaning }))
    : [];
  return {
    overview: value.overview,
    points,
    senderTone: value.senderTone,
    hiddenMeanings: strings(value.hiddenMeanings),
    hardWords,
    ambiguities: strings(value.ambiguities),
  };
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
  const mode = ['read', 'scam', 'conversation'].includes(body.mode) ? body.mode : 'read';
    const deep = body.deep === true;
  


  if (language === null || prompt.length > 50000 || (!prompt && !imageData)) {
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
                        parts: [
              {
                text:
                  mode === 'scam'
                    ? buildScamSystemPrompt(LANGUAGE_LABELS[language])
                    : mode === 'conversation'
                      ? buildConversationSystemPrompt(LANGUAGE_LABELS[language])
                                            : deep ? buildDeepSystemPrompt(LANGUAGE_LABELS[language]) : buildSystemPrompt(LANGUAGE_LABELS[language]),
                
              },
            ],
            
          },
          contents: [{ role: 'user', parts }],
          generationConfig: {
            responseMimeType: 'application/json',
                        maxOutputTokens: deep ? 16384 : 8192,
         
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

          replyOptions: validReplyOptions(result.replyOptions),
      ...(mode === 'scam' && isValidRisk(result.risk) ? { risk: result.risk } : {}),
            ...(deep && validDeep(result.deep) ? { deep: validDeep(result.deep) } : {}),
       
    });
  } catch (error) {
    console.error('Lumen analysis failed:', error);
    return res.status(502).json({ error: "Lumen couldn't finish that read. Please try again." });
  }
});
app.post('/api/lumen/chat', async (req, res) => {
  const body = req.body ?? {};
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  const language = ['ar', 'en', 'tr', 'de', 'pt'].includes(body.language)
    ? body.language
    : body.language === undefined
      ? 'en'
      : null;

  const rawMessages = Array.isArray(body.messages) ? body.messages : [];
  const messages = rawMessages
    .filter(
      (message) =>
        message !== null &&
        typeof message === 'object' &&
        (message.role === 'user' || message.role === 'assistant') &&
        typeof message.text === 'string' &&
        message.text.trim().length > 0,
    )
    .map((message) => ({ role: message.role, text: message.text.trim() }));
  const totalChars = messages.reduce((sum, message) => sum + message.text.length, 0);

  if (
    language === null ||
    !isValidAnalysis(body.analysis) ||
    prompt.length > 50000 ||
    messages.length === 0 ||
    messages.length > 40 ||
    messages[messages.length - 1].role !== 'user' ||
    messages.some((message) => message.text.length > 4000) ||
    totalChars > 30000
  ) {
    return res.status(400).json({ error: 'Please ask a follow-up question about the analysis.' });
  }

  let apiKey;
  try {
    apiKey = getGeminiApiKey();
  } catch (error) {
    console.error('Gemini API key is unavailable:', error);
    return res.status(503).json({ error: 'Lumen is not connected yet. Please try again later.' });
  }

  const contents = [
    {
      role: 'user',
      parts: [
        {
          text: `Here is the original input I asked you to read:
${prompt || '(I shared an image without additional text.)'}

Your earlier analysis of it was:
${JSON.stringify(body.analysis)}`,
        },
      ],
    },
    {
      role: 'model',
      parts: [{ text: 'Understood — I have the original input and my earlier analysis. Ask me anything about it.' }],
    },
    ...messages.map((message) => ({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: message.text }],
    })),
  ];

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
            parts: [{ text: buildChatSystemPrompt(LANGUAGE_LABELS[language]) }],
          },
          contents,
          generationConfig: {
            maxOutputTokens: 2048,
          },
        }),
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const upstreamBody = await response.text();
      console.error('Gemini chat request failed:', response.status, upstreamBody.slice(0, 1000));
      return res.status(502).json({ error: "Lumen couldn't answer that. Please try again." });
    }

    const responseBody = await response.json();
    const text = responseBody.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? '')
      .join('')
      .trim();

    if (!text) {
      return res.status(500).json({ error: "Lumen couldn't find an answer for that yet." });
    }

    return res.json({ reply: text });
  } catch (error) {
    console.error('Lumen chat failed:', error);
    return res.status(502).json({ error: "Lumen couldn't answer that. Please try again." });
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
