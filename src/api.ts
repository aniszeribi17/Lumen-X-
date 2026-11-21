// The contract between the browser and our server.
// These shapes mirror the original Lumen X API exactly — do not rename fields.

export type LumenLanguage = 'ar' | 'en' | 'tr' | 'de' | 'pt';



export interface LumenAnalysisInput {
  /** The message / paragraph the user cannot place. May be empty if an image is attached. */
  prompt: string;
  /** Attached screenshot as a data URL, or null. */
  imageData: string | null;
  /** Language the analysis should be written in. */
  language: LumenLanguage;
  mode: LumenMode;
  

export interface LumenAnalysis {
  /** The short version: one clear read of the situation. */
  summary: string;
  /** Bullet points: what is really being said, intent, undertone, risks. */
  whatItMeans: string[];
  /** One grounded action the user can take now. */
  nextStep: string;
  /** Words the user can copy and send. */
  reply: string;
  /** Short label for the reply's tone, e.g. "Calm and direct". */
  replyTone: string;
}

/** Send the input to our server and return the analysis. Throws an Error with a readable message on failure. */
export async function analyzeInput(input: LumenAnalysisInput): Promise<LumenAnalysis> {
  const response = await fetch('/api/lumen/analyze', {
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
  const response = await fetch('/api/lumen/chat', {
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

