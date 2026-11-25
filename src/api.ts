// The contract between the browser and our server.
// These shapes mirror the original Lumen X API exactly — do not rename fields.

export type LumenLanguage = 'ar' | 'en' | 'tr' | 'de' | 'pt';
export type LumenMode = 'read' | 'scam' | 'conversation';



export interface LumenAnalysisInput {
  /** The message / paragraph the user cannot place. May be empty if an image is attached. */
  prompt: string;
  /** Attached screenshot as a data URL, or null. */
  imageData: string | null;
  /** Language the analysis should be written in. */
  language: LumenLanguage;
  mode: LumenMode;
    /** Ask for the detailed explanation with evidence. */
  deep?: boolean;
}

export interface LumenDeepPoint {
  title: string;
  detail: string;
  /** Exact quote from the user's text, or empty when there is none. */
  evidence: string;
}

export interface LumenDeepDive {
  overview: string;
  points: LumenDeepPoint[];
  senderTone: string;
  hiddenMeanings: string[];
  hardWords: { word: string; meaning: string }[];
  ambiguities: string[];
}


export interface LumenAnalysis {
  /** The short version: one clear read of the situation. */
  summary: string;
  /** Bullet points: what is really being said, intent, undertone, risks. */
  whatItMeans: string[];
  /** One grounded action the user can take now. */
  nextStep: string;
  /** Words the user can copy and send. */
  reply: string;
    replyOptions: { tone: string; text: string }[];
  risk?: { level: 'low' | 'medium' | 'high'; signals: string[] };
    deep?: LumenDeepDive;
  /** Short label for the reply's tone, e.g. "Calm and direct". */
  replyTone: string;
}
async function fetchWithRetry(url: string, init: RequestInit, attempts = 3): Promise<Response> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await fetch(url, init);
      if (response.status !== 502 && response.status !== 503) return response;
      lastError = new Error(`Request failed with status ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    if (attempt < attempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, 900 * (attempt + 1)));
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Request failed.');
}

/** Send the input to our server and return the analysis. Throws an Error with a readable message on failure. */
export async function analyzeInput(input: LumenAnalysisInput): Promise<LumenAnalysis> {
  const response = await fetchWithRetry
    ('/api/lumen/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    // The server reports problems as { "error": "..." } — show that text to the user.
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error || 'Lumen could not complete that read. Check your connection and try again.');
  }

  return (await response.json()) as LumenAnalysis;
}
export interface LumenChatMessage {
  role: 'user' | 'assistant';
  text: string;
}

export interface LumenChatInput {
  prompt: string;
  analysis: LumenAnalysis;
  messages: LumenChatMessage[];
  language: LumenLanguage;
}

export async function chatFollowUp(input: LumenChatInput): Promise<string> {
  const response = await fetchWithRetry
    ('/api/lumen/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error || 'Lumen could not answer that. Check your connection and try again.');
  }

  const body = (await response.json()) as { reply?: string };
  if (!body.reply) {
    throw new Error('Lumen could not answer that yet.');
  }
  return body.reply;
}

export interface LumenSupportInput {
  messages: LumenChatMessage[];
  language: LumenLanguage;
}

/** A supportive conversation with Lumen — listening and balance, not a diagnosis. */
export async function supportChat(input: LumenSupportInput): Promise<string> {
  const response = await fetchWithRetry('/api/lumen/support', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error || 'Lumen could not answer that. Check your connection and try again.');
  }

  const body = (await response.json()) as { reply?: string };
  if (!body.reply) {
    throw new Error('Lumen could not answer that yet.');
  }
  return body.reply;
}


export interface LumenGeneralInput {
  messages: LumenChatMessage[];
  language: LumenLanguage;
}

/** A general conversation with Lumen — ask anything. */
export async function generalChat(input: LumenGeneralInput): Promise<string> {
  const response = await fetchWithRetry('/api/lumen/general-chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error || 'Lumen could not answer that. Check your connection and try again.');
  }

  const body = (await response.json()) as { reply?: string };
  if (!body.reply) {
    throw new Error('Lumen could not answer that yet.');
  }
  return body.reply;
}

export interface LumenImageRead {
  whatItIs: string;
  details: string[];
  verdict: string;
  whatToDo: string[];
  howToHandle: string;
}

export interface LumenImageInput {
  imageData: string;
  question: string;
  language: LumenLanguage;
}

/** A dedicated read of one image: what it is, the verdict, what to do, how to handle it. */
export async function analyzeImage(input: LumenImageInput): Promise<LumenImageRead> {
  const response = await fetchWithRetry('/api/lumen/image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error || 'Lumen could not read that image. Check your connection and try again.');
  }

  const body = (await response.json()) as LumenImageRead;
  if (!body || typeof body.whatItIs !== 'string' || typeof body.verdict !== 'string') {
    throw new Error('Lumen could not read that image yet.');
  }
  return body;
}


export interface LumenShieldRead {
  verdict: string;
  riskLevel: 'low' | 'medium' | 'high';
  kind: string;
  signals: string[];
  evidence: string[];
  whatToDo: string[];
  howToHandle: string;
}

export interface LumenShieldInput {
  text: string;
  imageData: string | null;
  language: LumenLanguage;
}

/** Scam, fraud and manipulation check for a message, an offer, an account, or a screenshot. */
export async function checkShield(input: LumenShieldInput): Promise<LumenShieldRead> {
  const response = await fetchWithRetry('/api/lumen/shield', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error || 'Lumen could not check that. Check your connection and try again.');
  }

  const body = (await response.json()) as LumenShieldRead;
  if (!body || typeof body.verdict !== 'string' || typeof body.riskLevel !== 'string') {
    throw new Error('Lumen could not check that yet.');
  }
  return body;
}

