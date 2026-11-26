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
Your identity: you are Lumen, the assistant inside the Lumen X app, and you were designed by Anis Zeribi, who designed everything about you and this app. Whenever the user asks who designed you, who made you, or who created you, answer clearly that Anis Zeribi designed you, and always write his name in Latin letters exactly like this: Anis Zeribi. Never say or imply that Google or any other company made you, and never name an AI model as your creator.

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
Your identity: you are Lumen, the assistant inside the Lumen X app, and you were designed by Anis Zeribi, who designed everything about you and this app. Whenever the user asks who designed you, who made you, or who created you, answer clearly that Anis Zeribi designed you, and always write his name in Latin letters exactly like this: Anis Zeribi. Never say or imply that Google or any other company made you, and never name an AI model as your creator.

Help with things like: explaining the analysis further, drafting or improving a reply they could send, adjusting the tone of a reply, thinking through what happens if the other person answers in a certain way, and choosing the next step.

Answer in plain text, strictly in ${languageLabel}. Do not mix languages. Be concise, concrete, and non-alarmist. Distinguish facts from guesses. Do not mention that you are an AI.`;
}
function buildSupportSystemPrompt(languageLabel) {
  return `You are Lumen's support companion: a calm, warm listener who helps the user steady themselves and think clearly about what they are feeling. This is a supportive conversation, not a follow-up about an analysis.
Your identity: you are Lumen, the assistant inside the Lumen X app, and you were designed by Anis Zeribi, who designed everything about you and this app. Whenever the user asks who designed you, who made you, or who created you, answer clearly that Anis Zeribi designed you, and always write his name in Latin letters exactly like this: Anis Zeribi. Never say or imply that Google or any other company made you, and never name an AI model as your creator.

What you do:
- Listen first. Reflect back what the user is carrying, in their own terms, so they feel heard before anything else.
- Help them organize tangled thoughts: what is known, what is feared, and what is still unknown.
- Separate facts from fears gently, without arguing, correcting harshly, or dismissing what they feel.
- When it fits, offer one small, doable step toward balance — rest, a pause, writing it down, a walk, talking to someone they trust. Never a treatment plan.
- Ask one gentle question at a time instead of lecturing. Short, human replies are better than long ones.

Your limits — never cross them:
- You are NOT a doctor, therapist, or counselor, and you must never present yourself as one. Do not repeat the reminder in every message; the app already states it once at the top of this space.
- Never diagnose, never tell the user they have a condition, never suggest medication or any form of treatment.
- Offer readings of the user's state as possibilities, never as verdicts or certainties.
- If the user talks about harming themselves or not wanting to live, take it seriously: respond with care, encourage them to reach out right away to someone they trust, a local emergency number, or a professional, and stay with them in the conversation.

Answer in plain text, strictly in ${languageLabel}. Do not mix languages. Warm, calm, and concise — a few short paragraphs at most.`;
  }

function buildGeneralSystemPrompt(languageLabel) {
  return `You are Lumen, the assistant inside the Lumen X app: a sharp, warm general assistant. The user is having an open conversation with you — they may ask anything: questions, ideas, advice, drafts, explanations, decisions, study help, or everyday problems.

Your identity: you are Lumen, the assistant inside the Lumen X app, and you were designed by Anis Zeribi, who designed everything about you and this app. Whenever the user asks who designed you, who made you, or who created you, answer clearly that Anis Zeribi designed you, and always write his name in Latin letters exactly like this: Anis Zeribi. Never say or imply that Google or any other company made you, and never name an AI model as your creator.

How you answer:
- Give the real answer first, then the reason or the steps when they help.
- Be concise for simple questions and thorough for hard ones. Never pad, never repeat the question back.
- If a question has a factual answer you are unsure of, say what you know and what you do not — never invent facts, names, dates, or sources.
- You may help with writing, planning, learning, coding, and thinking through decisions, in the user's own voice and situation.

Answer in plain text, strictly in ${languageLabel}. Do not mix languages. Do not mention that you are an AI.`;
  
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

function buildImageSystemPrompt(languageLabel) {
  return `You are Lumen, the assistant inside the Lumen X app, looking at an image the user shared — it may be a screenshot, a photo, a document, a product, a message, an account page, or anything else. Your job: tell the user exactly what this image is, give a final verdict, say what to do, and explain how to handle it.

Your identity: you are Lumen, the assistant inside the Lumen X app, and you were designed by Anis Zeribi, who designed everything about you and this app. Whenever the user asks who designed you, who made you, or who created you, answer clearly that Anis Zeribi designed you, and always write his name in Latin letters exactly like this: Anis Zeribi. Never say or imply that Google or any other company made you, and never name an AI model as your creator.

Rules:
- Read every visible word in the image exactly as written; quote the important lines as evidence.
- Describe only what is actually visible. Never invent details, names, prices, or intentions that are not in the image.
- If the image is a message, offer, or account, say who it appears to be from and what it wants from the user.
- Watch for manipulation and scam signals — pressure, urgency, fake prizes, impersonation, threats — and name them plainly when they are present.
- If the image is blurry or unreadable, say so honestly in the verdict instead of guessing.

Answer with ONLY a JSON object in exactly this shape, with every text value strictly in ${languageLabel}:
{
  "whatItIs": "one clear line: what this image is",
  "details": ["the key things visible, one per item, 3 to 6 items, quoting visible text where it matters"],
  "verdict": "the final judgment: what this really is and whether it is safe, real, or worth acting on",
  "whatToDo": ["concrete steps for the user, one per item, 2 to 5 items"],
  "howToHandle": "how to deal with the person or situation behind the image: the approach, the tone, and what to say or avoid"
}`;
}

function isValidImageRead(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof value.whatItIs === 'string' && value.whatItIs.length > 0 &&
    Array.isArray(value.details) && value.details.length > 0 && value.details.every((item) => typeof item === 'string') &&
    typeof value.verdict === 'string' && value.verdict.length > 0 &&
    Array.isArray(value.whatToDo) && value.whatToDo.length > 0 && value.whatToDo.every((item) => typeof item === 'string') &&
    typeof value.howToHandle === 'string' && value.howToHandle.length > 0
  );
}

     function buildShieldSystemPrompt(languageLabel) {
  return `You are Lumen, the assistant inside the Lumen X app, acting as the user's shield. The user shares something they received or found — a message, an offer, an account, a post, or a screenshot — and asks: is this a scam, a fraud, or manipulation? Your job: examine it like a careful investigator and protect the user.

Your identity: you are Lumen, the assistant inside the Lumen X app, and you were designed by Anis Zeribi, who designed everything about you and this app. Whenever the user asks who designed you, who made you, or who created you, answer clearly that Anis Zeribi designed you, and always write his name in Latin letters exactly like this: Anis Zeribi. Never say or imply that Google or any other company made you, and never name an AI model as your creator.

How you examine:
- Read every word exactly; quote the suspicious lines as evidence, word for word.
- Name the technique when one is used: fake prize, advance fee, impersonation of a company or a person, urgency and pressure, guilt-tripping, love or trust bait, fake investment, phishing links, too-good-to-be-true prices, requests for codes, money, or personal data.
- Check the account or sender signs when visible: new account, stolen photos, no real history, copied content.
- Judge fairly: if it looks honest, say so plainly and give a low risk. Never call something a scam without evidence from what the user shared.
- Never invent details that are not in the text or the image.

Answer with ONLY a JSON object in exactly this shape, with every text value strictly in ${languageLabel}:
{
  "verdict": "the final judgment in one or two lines: what this is and whether the user should trust it",
  "riskLevel": "low, medium, or high — exactly one of these three English words",
  "kind": "the kind of scam or manipulation found, or that none was found",
  "signals": ["each warning sign you found, one per item; empty if none"],
  "evidence": ["the exact quoted words or visible signs behind your judgment, one per item; empty if none"],
  "whatToDo": ["concrete protective steps, one per item, 2 to 5 items"],
  "howToHandle": "how to deal with the sender or situation: reply or stay silent, what to say, and what to never share"
}`;
}

function isValidShieldRead(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof value.verdict === 'string' && value.verdict.length > 0 &&
    ['low', 'medium', 'high'].includes(value.riskLevel) &&
    typeof value.kind === 'string' && value.kind.length > 0 &&
    Array.isArray(value.signals) && value.signals.every((item) => typeof item === 'string') &&
    Array.isArray(value.evidence) && value.evidence.every((item) => typeof item === 'string') &&
    Array.isArray(value.whatToDo) && value.whatToDo.length > 0 && value.whatToDo.every((item) => typeof item === 'string') &&
    typeof value.howToHandle === 'string' && value.howToHandle.length > 0
  );
}

function buildAdvisorSystemPrompt(languageLabel) {
  return `You are Lumen, the assistant inside the Lumen X app, acting as the user's personal advisor. The user describes a situation or a decision they face. Your job: think clearly, take a position, and give them one decision they can act on — not a list of maybes.

Your identity: you are Lumen, the assistant inside the Lumen X app, and you were designed by Anis Zeribi, who designed everything about you and this app. Whenever the user asks who designed you, who made you, or who created you, answer clearly that Anis Zeribi designed you, and always write his name in Latin letters exactly like this: Anis Zeribi. Never say or imply that Google or any other company made you, and never name an AI model as your creator.

How you advise:
- Read the situation exactly as described; work only with what the user gave you. Never invent facts about their life.
- Weigh what matters most: their goal, their time, their money, their dignity, and the risk of each path.
- Commit to ONE verdict. If a key fact is missing, state your assumption inside the reasoning instead of refusing to decide.
- The action must be one concrete step they can take today, small enough to actually do.
- If the situation involves another person, write the exact words they can send or say — ready to copy, in their voice, firm and respectful.
- Be honest about the cost of doing nothing; waiting is also a decision.

Answer with ONLY a JSON object in exactly this shape, with every text value strictly in ${languageLabel}:
{
  "verdict": "the decision, in one clear line",
  "why": ["the reasons behind the decision, one per item, 2 to 4 items"],
  "theAction": "the one concrete action to take now",
  "exactWords": "the exact message or words to use with the other person, ready to copy; empty string if no other person is involved",
  "avoid": ["what to avoid doing or saying, one per item, 1 to 4 items"],
  "costOfWaiting": "what doing nothing will cost them"
}`;
}

function isValidAdvisorRead(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof value.verdict === 'string' && value.verdict.length > 0 &&
    Array.isArray(value.why) && value.why.length > 0 && value.why.every((item) => typeof item === 'string') &&
    typeof value.theAction === 'string' && value.theAction.length > 0 &&
    typeof value.exactWords === 'string' &&
    Array.isArray(value.avoid) && value.avoid.length > 0 && value.avoid.every((item) => typeof item === 'string') &&
    typeof value.costOfWaiting === 'string' && value.costOfWaiting.length > 0
  );
}

function buildStudySystemPrompt(languageLabel) {
  return `You are Lumen, the assistant inside the Lumen X app, acting as the user's study teacher for mathematics and physics. The user gives you a problem, typed or in a photo. Your job: solve it completely and teach the method, so the user can solve the next one alone.

Your identity: you are Lumen, the assistant inside the Lumen X app, and you were designed by Anis Zeribi, who designed everything about you and this app. Whenever the user asks who designed you, who made you, or who created you, answer clearly that Anis Zeribi designed you, and always write his name in Latin letters exactly like this: Anis Zeribi. Never say or imply that Google or any other company made you, and never name an AI model as your creator.

How you solve:
- First extract the givens exactly as stated: every value, symbol and unit. Never invent a value that is not in the problem; if a value is missing, say which one and solve with what is given.
- Work in numbered steps. Each step has a short title, the work itself (the formula first, then the numbers substituted, then the result), and one line explaining why this step is done.
- Show formulas in plain readable text, for example: v = d / t, then v = 120 / 2 = 60 km/h.
- The final answer carries its unit, always.
- Then verify your own answer: substitute it back, estimate the size, or check the units — and say plainly what you checked.
- End with the most common mistake students make on this exact kind of problem, so the user can avoid it.
- If the problem is not mathematics or physics, still solve what you can the same way and name its subject honestly.

Answer with ONLY a JSON object in exactly this shape, with every text value strictly in ${languageLabel}:
{
  "subject": "Mathematics or Physics, and the topic in a few words",
  "givens": ["each given value with its symbol and unit, one per item"],
  "steps": [{"title": "the step in a few words", "work": "the formula, the substitution, and the result", "why": "why this step is done"}],
  "finalAnswer": "the final answer with its unit",
  "check": "how you verified the answer",
  "watchOut": "the most common mistake on this kind of problem"
}`;
}

function isValidStudyRead(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof value.subject === 'string' && value.subject.length > 0 &&
    Array.isArray(value.givens) && value.givens.every((item) => typeof item === 'string') &&
    Array.isArray(value.steps) && value.steps.length > 0 &&
    value.steps.every((step) => step !== null && typeof step === 'object' && typeof step.title === 'string' && typeof step.work === 'string' && typeof step.why === 'string') &&
    typeof value.finalAnswer === 'string' && value.finalAnswer.length > 0 &&
    typeof value.check === 'string' &&
    typeof value.watchOut === 'string'
  );
  function buildResearchSystemPrompt(languageLabel) {
  return `You are Lumen, the assistant inside the Lumen X app, acting as the user's research desk. The user asks a question and wants a detailed answer backed by evidence from the web.

Your identity: you are Lumen, the assistant inside the Lumen X app, and you were designed by Anis Zeribi, who designed everything about you and this app. Whenever the user asks who designed you, who made you, or who created you, answer clearly that Anis Zeribi designed you, and always write his name in Latin letters exactly like this: Anis Zeribi. Never say or imply that Google or any other company made you, and never name an AI model as your creator.

How you research:
- Search the web for the question and base your answer on what the sources actually say, not on memory alone.
- Give a detailed, well-ordered answer: the direct answer first, then the supporting detail.
- Name the source of each key fact inside the answer (the organization, the publication, or the author), the way a careful researcher does.
- Separate established fact from opinion, prediction, and rumor; say plainly which is which.
- If the evidence is weak, old, or contradictory, say so honestly instead of sounding sure.
- Write the whole answer strictly in ${languageLabel}.`;
  }
  
}

    function buildScamSystemPrompt(languageLabel) {
  return `You are Lumen, a thoughtful assistant that helps people check whether a message, offer, or request might be a scam or fraud.
Your identity: you are Lumen, the assistant inside the Lumen X app, and you were designed by Anis Zeribi, who designed everything about you and this app. Whenever the user asks who designed you, who made you, or who created you, answer clearly that Anis Zeribi designed you, and always write his name in Latin letters exactly like this: Anis Zeribi. Never say or imply that Google or any other company made you, and never name an AI model as your creator.

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
Your identity: you are Lumen, the assistant inside the Lumen X app, and you were designed by Anis Zeribi, who designed everything about you and this app. Whenever the user asks who designed you, who made you, or who created you, answer clearly that Anis Zeribi designed you, and always write his name in Latin letters exactly like this: Anis Zeribi. Never say or imply that Google or any other company made you, and never name an AI model as your creator.

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
Your identity: you are Lumen, the assistant inside the Lumen X app, and you were designed by Anis Zeribi, who designed everything about you and this app. Whenever the user asks who designed you, who made you, or who created you, answer clearly that Anis Zeribi designed you, and always write his name in Latin letters exactly like this: Anis Zeribi. Never say or imply that Google or any other company made you, and never name an AI model as your creator.

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
app.post('/api/lumen/support', async (req, res) => {
  const body = req.body ?? {};
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
    messages.length === 0 ||
    messages.length > 40 ||
    messages[messages.length - 1].role !== 'user' ||
    messages.some((message) => message.text.length > 4000) ||
    totalChars > 30000
  ) {
    return res.status(400).json({ error: 'Please write what is on your mind.' });
  }

  let apiKey;
  try {
    apiKey = getGeminiApiKey();
  } catch (error) {
    console.error('Gemini API key is unavailable:', error);
    return res.status(503).json({ error: 'Lumen is not connected yet. Please try again later.' });
  }

  const contents = messages.map((message) => ({
    role: message.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: message.text }],
  }));

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
            parts: [{ text: buildSupportSystemPrompt(LANGUAGE_LABELS[language]) }],
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
      console.error('Gemini support request failed:', response.status, upstreamBody.slice(0, 1000));
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
    console.error('Lumen support failed:', error);
    return res.status(502).json({ error: "Lumen couldn't answer that. Please try again." });
  }
});
         
app.post('/api/lumen/general-chat', async (req, res) => {
  const body = req.body ?? {};
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
    messages.length === 0 ||
    messages.length > 40 ||
    messages[messages.length - 1].role !== 'user' ||
    messages.some((message) => message.text.length > 4000) ||
    totalChars > 30000
  ) {
    return res.status(400).json({ error: 'Please write what is on your mind.' });
  }

  let apiKey;
  try {
    apiKey = getGeminiApiKey();
  } catch (error) {
    console.error('Gemini API key is unavailable:', error);
    return res.status(503).json({ error: 'Lumen is not connected yet. Please try again later.' });
  }

  const contents = messages.map((message) => ({
    role: message.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: message.text }],
  }));

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
            parts: [{ text: buildGeneralSystemPrompt(LANGUAGE_LABELS[language]) }],
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
      console.error('Gemini general request failed:', response.status, upstreamBody.slice(0, 1000));
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
    console.error('Lumen general chat failed:', error);
    return res.status(502).json({ error: "Lumen couldn't answer that. Please try again." });
  }
});

app.post('/api/lumen/image', async (req, res) => {
  const body = req.body ?? {};
  const question = typeof body.question === 'string' ? body.question.trim() : '';
  const imageData =
    typeof body.imageData === 'string' && body.imageData.trim() ? body.imageData.trim() : null;
  const language = ['ar', 'en', 'tr', 'de', 'pt'].includes(body.language)
    ? body.language
    : body.language === undefined
      ? 'en'
      : null;

  if (language === null || !imageData || question.length > 2000) {
    return res.status(400).json({ error: 'Please add an image first.' });
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
      text: question
        ? `The user asks about this image:\n${question}`
        : 'The user shared this image without a question. Explain what it is, give a verdict, and say what to do.',
    },
  ];

  try {
    parts.push({ inlineData: parseImageData(imageData) });
  } catch (error) {
    console.warn('Invalid image data received:', error);
    return res.status(400).json({ error: 'That image could not be read. Try uploading it again.' });
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
            parts: [{ text: buildImageSystemPrompt(LANGUAGE_LABELS[language]) }],
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
      console.error('Gemini image request failed:', response.status, upstreamBody.slice(0, 1000));
      return res.status(502).json({ error: "Lumen couldn't read that image. Please try again." });
    }

    const responseBody = await response.json();
    const text = responseBody.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? '')
      .join('')
      .trim();

    if (!text) {
      return res.status(500).json({ error: "Lumen couldn't find enough detail in that image yet." });
    }

    const result = JSON.parse(stripJsonFences(text));
    if (!isValidImageRead(result)) {
      throw new Error('Gemini answer did not match the expected shape.');
    }
    return res.json({
      whatItIs: result.whatItIs,
      details: result.details,
      verdict: result.verdict,
      whatToDo: result.whatToDo,
      howToHandle: result.howToHandle,
    });
  } catch (error) {
    console.error('Lumen image analysis failed:', error);
    return res.status(502).json({ error: "Lumen couldn't read that image. Please try again." });
  }
});

    app.post('/api/lumen/shield', async (req, res) => {
  const body = req.body ?? {};
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  const imageData =
    typeof body.imageData === 'string' && body.imageData.trim() ? body.imageData.trim() : null;
  const language = ['ar', 'en', 'tr', 'de', 'pt'].includes(body.language)
    ? body.language
    : body.language === undefined
      ? 'en'
      : null;

  if (language === null || (!text && !imageData) || text.length > 20000) {
    return res.status(400).json({ error: 'Please add a message or an image to check.' });
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
      text: text
        ? `The user shares this and asks whether it is a scam, fraud, or manipulation:\n${text}`
        : 'The user shared this image and asks whether it is a scam, fraud, or manipulation.',
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
            parts: [{ text: buildShieldSystemPrompt(LANGUAGE_LABELS[language]) }],
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
      console.error('Gemini shield request failed:', response.status, upstreamBody.slice(0, 1000));
      return res.status(502).json({ error: "Lumen couldn't check that. Please try again." });
    }

    const responseBody = await response.json();
    const replyText = responseBody.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? '')
      .join('')
      .trim();

    if (!replyText) {
      return res.status(500).json({ error: "Lumen couldn't find enough detail to check that yet." });
    }

    const result = JSON.parse(stripJsonFences(replyText));
    if (!isValidShieldRead(result)) {
      throw new Error('Gemini answer did not match the expected shape.');
    }
    return res.json({
      verdict: result.verdict,
      riskLevel: result.riskLevel,
      kind: result.kind,
      signals: result.signals,
      evidence: result.evidence,
      whatToDo: result.whatToDo,
      howToHandle: result.howToHandle,
    });
  } catch (error) {
    console.error('Lumen shield check failed:', error);
    return res.status(502).json({ error: "Lumen couldn't check that. Please try again." });
  }
});

app.post('/api/lumen/advisor', async (req, res) => {
  const body = req.body ?? {};
  const situation = typeof body.situation === 'string' ? body.situation.trim() : '';
  const language = ['ar', 'en', 'tr', 'de', 'pt'].includes(body.language)
    ? body.language
    : body.language === undefined
      ? 'en'
      : null;

  if (language === null || !situation || situation.length > 20000) {
    return res.status(400).json({ error: 'Please describe your situation first.' });
  }

  let apiKey;
  try {
    apiKey = getGeminiApiKey();
  } catch (error) {
    console.error('Gemini API key is unavailable:', error);
    return res.status(503).json({ error: 'Lumen is not connected yet. Please try again later.' });
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
            parts: [{ text: buildAdvisorSystemPrompt(LANGUAGE_LABELS[language]) }],
          },
          contents: [
            {
              role: 'user',
              parts: [{ text: `My situation:\n${situation}` }],
            },
          ],
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
      console.error('Gemini advisor request failed:', response.status, upstreamBody.slice(0, 1000));
      return res.status(502).json({ error: "Lumen couldn't advise on that. Please try again." });
    }

    const responseBody = await response.json();
    const replyText = responseBody.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? '')
      .join('')
      .trim();

    if (!replyText) {
      return res.status(500).json({ error: "Lumen couldn't find enough detail to advise on that yet." });
    }

    const result = JSON.parse(stripJsonFences(replyText));
    if (!isValidAdvisorRead(result)) {
      throw new Error('Gemini answer did not match the expected shape.');
    }
    return res.json({
      verdict: result.verdict,
      why: result.why,
      theAction: result.theAction,
      exactWords: result.exactWords,
      avoid: result.avoid,
      costOfWaiting: result.costOfWaiting,
    });
  } catch (error) {
    console.error('Lumen advisor failed:', error);
    return res.status(502).json({ error: "Lumen couldn't advise on that. Please try again." });
  }
});

app.post('/api/lumen/study', async (req, res) => {
  const body = req.body ?? {};
  const problem = typeof body.problem === 'string' ? body.problem.trim() : '';
  const imageData =
    typeof body.imageData === 'string' && body.imageData.trim() ? body.imageData.trim() : null;
  const language = ['ar', 'en', 'tr', 'de', 'pt'].includes(body.language)
    ? body.language
    : body.language === undefined
      ? 'en'
      : null;

  if (language === null || (!problem && !imageData) || problem.length > 20000) {
    return res.status(400).json({ error: 'Please write or photograph your problem first.' });
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
      text: problem
        ? `Solve this problem:\n${problem}`
        : 'Solve the problem in this photo.',
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
            parts: [{ text: buildStudySystemPrompt(LANGUAGE_LABELS[language]) }],
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
      console.error('Gemini study request failed:', response.status, upstreamBody.slice(0, 1000));
      return res.status(502).json({ error: "Lumen couldn't solve that. Please try again." });
    }

    const responseBody = await response.json();
    const replyText = responseBody.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? '')
      .join('')
      .trim();

    if (!replyText) {
      return res.status(500).json({ error: "Lumen couldn't read that problem yet." });
    }

    const result = JSON.parse(stripJsonFences(replyText));
    if (!isValidStudyRead(result)) {
      throw new Error('Gemini answer did not match the expected shape.');
    }
    return res.json({
      subject: result.subject,
      givens: result.givens,
      steps: result.steps,
      finalAnswer: result.finalAnswer,
      check: result.check,
      watchOut: result.watchOut,
    });
  } catch (error) {
    console.error('Lumen study failed:', error);
    return res.status(502).json({ error: "Lumen couldn't solve that. Please try again." });
  }
  app.post('/api/lumen/research', async (req, res) => {
  const body = req.body ?? {};
  const question = typeof body.question === 'string' ? body.question.trim() : '';
  const language = ['ar', 'en', 'tr', 'de', 'pt'].includes(body.language)
    ? body.language
    : body.language === undefined
      ? 'en'
      : null;

  if (language === null || !question || question.length > 4000) {
    return res.status(400).json({ error: 'Please write your research question first.' });
  }

  let apiKey;
  try {
    apiKey = getGeminiApiKey();
  } catch (error) {
    console.error('Gemini API key is unavailable:', error);
    return res.status(503).json({ error: 'Lumen is not connected yet. Please try again later.' });
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
            parts: [{ text: buildResearchSystemPrompt(LANGUAGE_LABELS[language]) }],
          },
          contents: [
            {
              role: 'user',
              parts: [{ text: question }],
            },
          ],
          tools: [{ google_search: {} }],
          generationConfig: {
            maxOutputTokens: 8192,
          },
        }),
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const upstreamBody = await response.text();
      console.error('Gemini research request failed:', response.status, upstreamBody.slice(0, 1000));
      return res.status(502).json({ error: "Lumen couldn't research that. Please try again." });
    }

    const responseBody = await response.json();
    const candidate = responseBody.candidates?.[0];
    const answer = candidate?.content?.parts
      ?.map((part) => part.text ?? '')
      .join('')
      .trim();

    if (!answer) {
      return res.status(500).json({ error: "Lumen couldn't find enough on that yet." });
    }

    const chunks = candidate?.groundingMetadata?.groundingChunks ?? [];
    const seen = new Set();
    const sources = [];
    for (const chunk of chunks) {
      const web = chunk?.web;
      if (web && typeof web.uri === 'string' && web.uri && !seen.has(web.uri)) {
        seen.add(web.uri);
        sources.push({
          title: typeof web.title === 'string' && web.title ? web.title : web.uri,
          uri: web.uri,
        });
      }
      if (sources.length >= 8) break;
    }

    return res.json({ answer, sources });
  } catch (error) {
    console.error('Lumen research failed:', error);
    return res.status(502).json({ error: "Lumen couldn't research that. Please try again." });
  }
});
      
});
      
      // Unknown API routes get a JSON 404, not the web page.
// ===== Lumen Bot: the same assistant on Telegram and Messenger =====
// One brain, two thin adapters. Chat state lives in memory only.

const botStates = new Map();

function getBotState(id) {
  if (!botStates.has(id)) {
    botStates.set(id, { mode: 'chat', history: [], label: 'English' });
  }
  return botStates.get(id);
}

function botLabelFor(text, state) {
  if (/[\u0600-\u06FF]/.test(text)) state.label = 'Arabic';
  return state.label;
}

async function botGemini(systemPrompt, contents, asJson) {
  const apiKey = getGeminiApiKey();
  const endpoint = new URL(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
  );
  endpoint.searchParams.set('key', apiKey);
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents,
      generationConfig: asJson
        ? { responseMimeType: 'application/json', maxOutputTokens: 8192 }
        : { maxOutputTokens: 4096 },
    }),
  });
  if (!response.ok) throw new Error(`Gemini bot request failed: ${response.status}`);
  const body = await response.json();
  return (
    body.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('').trim() ?? ''
  );
}

function botParseJson(text) {
  try {
    return JSON.parse(stripJsonFences(text));
  } catch {
    return null;
  }
}

function botList(items) {
  return (Array.isArray(items) ? items : []).map((item) => `• ${item}`).join('\n');
}

async function botBrain(state, text) {
  const label = botLabelFor(text, state);
  const userTurn = { role: 'user', parts: [{ text }] };

  if (state.mode === 'chat' || state.mode === 'support') {
    const system =
      state.mode === 'chat' ? buildGeneralSystemPrompt(label) : buildSupportSystemPrompt(label);
    state.history.push(userTurn);
    state.history = state.history.slice(-20);
    const reply = await botGemini(system, state.history, false);
    state.history.push({ role: 'model', parts: [{ text: reply }] });
    state.history = state.history.slice(-20);
    return reply || '…';
  }

  if (state.mode === 'analyze') {
    const raw = await botGemini(buildSystemPrompt(label), [userTurn], true);
    const data = botParseJson(raw);
    if (!data) return raw;
    return [
      data.summary,
      data.whatItMeans?.length ? `\n${botList(data.whatItMeans)}` : '',
      data.nextStep ? `\n➡️ ${data.nextStep}` : '',
      data.reply ? `\n💬 ${data.reply}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  if (state.mode === 'shield') {
    const raw = await botGemini(buildShieldSystemPrompt(label), [userTurn], true);
    const data = botParseJson(raw);
    if (!data) return raw;
    return [
      `🛡️ ${data.verdict ?? ''}`,
      data.riskLevel ? `⚠️ Risk: ${data.riskLevel}` : '',
      data.signals?.length ? `\n${botList(data.signals)}` : '',
      data.whatToDo?.length ? `\n✅\n${botList(data.whatToDo)}` : '',
      data.howToHandle ? `\n${data.howToHandle}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  if (state.mode === 'advisor') {
    const raw = await botGemini(buildAdvisorSystemPrompt(label), [userTurn], true);
    const data = botParseJson(raw);
    if (!data) return raw;
    return [
      `🧭 ${data.verdict ?? ''}`,
      data.why?.length ? `\n${botList(data.why)}` : '',
      data.theAction ? `\n➡️ ${data.theAction}` : '',
      data.exactWords ? `\n💬 "${data.exactWords}"` : '',
      data.avoid?.length ? `\n🚫\n${botList(data.avoid)}` : '',
      data.costOfWaiting ? `\n⏳ ${data.costOfWaiting}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  if (state.mode === 'study') {
    const raw = await botGemini(buildStudySystemPrompt(label), [userTurn], true);
    const data = botParseJson(raw);
    if (!data) return raw;
    const steps = (Array.isArray(data.steps) ? data.steps : [])
      .map((step, index) => `${index + 1}. ${step.title}\n${step.work}\n${step.why}`)
      .join('\n\n');
    return [
      `📚 ${data.subject ?? ''}`,
      data.givens?.length ? `\n${botList(data.givens)}` : '',
      steps ? `\n${steps}` : '',
      data.finalAnswer ? `\n✅ ${data.finalAnswer}` : '',
      data.check ? `\n🔍 ${data.check}` : '',
      data.watchOut ? `\n⚠️ ${data.watchOut}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  if (state.mode === 'research') {
    return (await botGemini(buildResearchSystemPrompt(label), [userTurn], false)) || '…';
  }

  return '…';
}

const BOT_SERVICES = [
  { mode: 'chat', title: '💬 Your Chat', prompt: '💬 Your Chat — ask me anything.\nمحادثتك — اسألني أي شيء.' },
  { mode: 'analyze', title: '🔍 Analyze', prompt: '🔍 Send the text, message, or offer you want me to read.\nابعت النص أو الرسالة أو العرض اللي تحب نقراهولك.' },
  { mode: 'shield', title: '🛡️ Your Shield', prompt: '🛡️ Send the message, offer, or account you want checked for scam or manipulation.\nابعت الرسالة أو العرض أو الحساب اللي تحب نفحصهولك من النصب والتلاعب.' },
  { mode: 'support', title: '❤️ Your Support', prompt: '❤️ Your Support — tell me what is on your mind. I listen and help you order your thoughts.\nمساعدك النفسي — قولي واش في قلبك. نسمعك ونعاونك ترتب أفكارك.' },
  { mode: 'advisor', title: '🧭 Your Advisor', prompt: '🧭 Describe your situation or the decision in front of you.\nاوصف وضعيتك ولا القرار اللي قدامك.' },
  { mode: 'study', title: '📚 Your Study', prompt: '📚 Send your mathematics or physics problem.\nابعت تمرينك في الرياضيات ولا الفيزياء.' },
  { mode: 'research', title: '🌐 Your Research', prompt: '🌐 Ask your question and I research it with sources.\nاسأل سؤالك ونبحثهولك بالمصادر.' },
];

function botService(mode) {
  return BOT_SERVICES.find((service) => service.mode === mode) ?? BOT_SERVICES[0];
}

const BOT_WELCOME =
  '✨ Lumen X — your life, clearer.\nChoose a service below, or just write to me.\n\nاختر خدمة من التحت، ولا اكتب لي مباشرة.';

// ----- Telegram -----

async function tgApi(token, method, payload) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return response.json().catch(() => ({}));
}

function tgKeyboard() {
  const rows = [];
  for (let i = 0; i < BOT_SERVICES.length; i += 2) {
    rows.push(
      BOT_SERVICES.slice(i, i + 2).map((service) => ({
        text: service.title,
        callback_data: `mode:${service.mode}`,
      })),
    );
  }
  return { inline_keyboard: rows };
}

async function tgSend(token, chatId, text, withKeyboard) {
  const chunks = [];
  let rest = text;
  while (rest.length > 3900) {
    chunks.push(rest.slice(0, 3900));
    rest = rest.slice(3900);
  }
  chunks.push(rest);
  for (let i = 0; i < chunks.length; i += 1) {
    await tgApi(token, 'sendMessage', {
      chat_id: chatId,
      text: chunks[i],
      ...(withKeyboard && i === chunks.length - 1 ? { reply_markup: tgKeyboard() } : {}),
    });
  }
}

app.get('/api/telegram/setup', async (req, res) => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || req.query.key !== token) {
    return res.status(404).json({ error: 'Not found.' });
  }
  const url = `https://${req.get('host')}/api/telegram/webhook`;
  const result = await tgApi(token, 'setWebhook', { url });
  return res.json({ webhook: url, telegram: result });
});

app.post('/api/telegram/webhook', async (req, res) => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return res.status(404).json({ error: 'Not found.' });
  res.json({ ok: true });
  try {
    const update = req.body ?? {};
    if (update.callback_query) {
      const query = update.callback_query;
      const chatId = query.message?.chat?.id;
      const mode = String(query.data ?? '').replace('mode:', '');
      if (chatId && BOT_SERVICES.some((service) => service.mode === mode)) {
        const state = getBotState(`tg:${chatId}`);
        state.mode = mode;
        if (mode === 'chat' || mode === 'support') state.history = [];
        await tgApi(token, 'answerCallbackQuery', { callback_query_id: query.id });
        await tgSend(token, chatId, botService(mode).prompt, false);
      }
      return;
    }
    const message = update.message;
    const chatId = message?.chat?.id;
    const text = typeof message?.text === 'string' ? message.text.trim() : '';
    if (!chatId || !text) return;
    const state = getBotState(`tg:${chatId}`);
    if (text === '/start' || text === '/menu') {
      state.mode = 'chat';
      state.history = [];
      await tgSend(token, chatId, BOT_WELCOME, true);
      return;
    }
    const reply = await botBrain(state, text);
    await tgSend(token, chatId, reply, false);
  } catch (error) {
    console.error('Telegram bot failed:', error);
  }
});

// ----- Messenger -----

async function fbSend(token, recipientId, text, withMenu) {
  const chunks = [];
  let rest = text;
  while (rest.length > 1900) {
    chunks.push(rest.slice(0, 1900));
    rest = rest.slice(1900);
  }
  chunks.push(rest);
  for (let i = 0; i < chunks.length; i += 1) {
    const message = { text: chunks[i] };
    if (withMenu && i === chunks.length - 1) {
      message.quick_replies = BOT_SERVICES.map((service) => ({
        content_type: 'text',
        title: service.title.slice(0, 20),
        payload: `mode:${service.mode}`,
      }));
    }
    await fetch(`https://graph.facebook.com/v19.0/me/messages?access_token=${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipient: { id: recipientId }, messaging_type: 'RESPONSE', message }),
    });
  }
}

app.get('/api/messenger/webhook', (req, res) => {
  const verifyToken = process.env.MESSENGER_VERIFY_TOKEN;
  if (
    verifyToken &&
    req.query['hub.mode'] === 'subscribe' &&
    req.query['hub.verify_token'] === verifyToken
  ) {
    return res.status(200).send(req.query['hub.challenge']);
  }
  return res.status(403).send('Verification failed.');
});

app.post('/api/messenger/webhook', async (req, res) => {
  const token = process.env.MESSENGER_PAGE_TOKEN;
  if (!token) return res.status(404).json({ error: 'Not found.' });
  res.json({ ok: true });
  try {
    const entries = Array.isArray(req.body?.entry) ? req.body.entry : [];
    for (const entry of entries) {
      const events = Array.isArray(entry.messaging) ? entry.messaging : [];
      for (const event of events) {
        const senderId = event.sender?.id;
        if (!senderId) continue;
        const state = getBotState(`fb:${senderId}`);
        const payload = event.message?.quick_reply?.payload ?? event.postback?.payload ?? '';
        if (typeof payload === 'string' && payload.startsWith('mode:')) {
          const mode = payload.replace('mode:', '');
          if (BOT_SERVICES.some((service) => service.mode === mode)) {
            state.mode = mode;
            if (mode === 'chat' || mode === 'support') state.history = [];
            await fbSend(token, senderId, botService(mode).prompt, false);
          }
          continue;
        }
        const text = typeof event.message?.text === 'string' ? event.message.text.trim() : '';
        if (!text) continue;
        if (text === '/menu' || text.toLowerCase() === 'menu' || text === 'ابدأ') {
          state.mode = 'chat';
          state.history = [];
          await fbSend(token, senderId, BOT_WELCOME, true);
          continue;
        }
        const reply = await botBrain(state, text);
        await fbSend(token, senderId, reply, false);
      }
    }
  } catch (error) {
    console.error('Messenger bot failed:', error);
  }
});
      
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
