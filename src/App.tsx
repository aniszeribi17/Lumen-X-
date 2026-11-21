import { type ChangeEvent, type FormEvent, useRef, useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  CircleAlert,
  Clipboard,
  Eye,
  ImagePlus,
  Languages,
  Lightbulb,
  MessageSquareText,
  Paperclip,
  RefreshCw,
  ScanEye,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { analyzeInput, type LumenAnalysis, type LumenLanguage } from './api';
import { prepareImageForAnalysis } from './image';

// Lumen X — one page: paste something unclear, get a clear read.
// The whole screen lives in this file, in four small pieces at the bottom:
// EmptyState, LoadingState, ErrorState, AnalysisResult.

export default function App() {
  // The app has a single page. Anything else is a simple "not found".
  if (window.location.pathname !== '/') return <NotFound />;
  return <Home />;
}

function Home() {
  const [prompt, setPrompt] = useState('');
  const [imageData, setImageData] = useState<string | null>(null);
  const [imageName, setImageName] = useState('');
  const [language, setLanguage] = useState<LumenLanguage>('en');
  const [analysisLanguage, setAnalysisLanguage] = useState<LumenLanguage>('en');
  const [analysis, setAnalysis] = useState<LumenAnalysis | null>(null);
  const [view, setView] = useState<'empty' | 'result' | 'error'>('empty');
  const [errorMessage, setErrorMessage] = useState('');
  const [copied, setCopied] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isImageProcessing, setIsImageProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Counts requests so a slow, older answer can never overwrite a newer one.
  const requestIdRef = useRef(0);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void submitAnalysis();
  };

  const submitAnalysis = async () => {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt && !imageData) {
      setView('error');
      setErrorMessage('Add a message, paragraph, or image so Lumen has something to look at.');
      return;
    }
    if (isImageProcessing || isAnalyzing) return;
    setCopied(false);
    setAnalysisLanguage(language);
    setView('empty');
    setIsAnalyzing(true);
    const requestId = ++requestIdRef.current;
    try {
      const result = await analyzeInput({ prompt: trimmedPrompt, imageData, language });
      if (requestId !== requestIdRef.current) return; // a reset or newer request won
      setAnalysis(result);
      setView('result');
      setErrorMessage('');
    } catch (error) {
      if (requestId !== requestIdRef.current) return;
      setView('error');
      setErrorMessage(error instanceof Error && error.message ? error.message : 'Lumen could not complete that read. Check your connection and try again.');
    } finally {
      if (requestId === requestIdRef.current) setIsAnalyzing(false);
    }
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setView('error');
      setErrorMessage('That file is not an image. Try a PNG, JPG, or WEBP.');
      return;
    }
    setIsImageProcessing(true);
    try {
      const compressedImage = await prepareImageForAnalysis(file);
      setImageData(compressedImage);
      setImageName(file.name);
      setView(analysis ? 'result' : 'empty');
      setErrorMessage('');
    } catch {
      setView('error');
      setErrorMessage('That image could not be prepared. Try a JPG, PNG, or WEBP under 10 MB.');
    } finally {
      setIsImageProcessing(false);
    }
  };

  const removeImage = () => {
    setImageData(null);
    setImageName('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const copyReply = async () => {
    if (!analysis?.reply) return;
    try {
      await navigator.clipboard.writeText(analysis.reply);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  const resetWorkspace = () => {
    requestIdRef.current += 1; // ignore any answer still on its way
    setIsAnalyzing(false);
    setPrompt('');
    removeImage();
    setAnalysis(null);
    setView('empty');
    setErrorMessage('');
    setCopied(false);
  };

  return (
    <main className="lumen-shell min-h-[100dvh] w-full">
      <div className="lumen-orbit -right-48 top-20 hidden lg:block" aria-hidden="true" />
      <div className="relative z-[1] mx-auto flex min-h-[100dvh] w-full max-w-[1480px] gap-4 px-4 py-4 sm:px-6 lg:gap-6 lg:px-8 lg:py-6">
        <aside className="lumen-rail hidden w-[76px] shrink-0 flex-col items-center justify-between rounded-[22px] py-5 lg:flex">
          <div className="flex flex-col items-center gap-9">
            <button type="button" onClick={resetWorkspace} data-testid="button-lumen-home" className="brand-mark group grid h-11 w-11 place-items-center rounded-[15px] transition-transform duration-200 hover:-rotate-3 active:scale-95" aria-label="Start a new Lumen analysis">
              <ScanEye className="h-5 w-5" strokeWidth={1.7} />
            </button>
            <div className="flex flex-col items-center gap-5 text-muted-foreground">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary" title="Analysis workspace">
                <ScanSearch className="h-[17px] w-[17px]" strokeWidth={1.6} />
              </span>
              <span className="grid h-8 w-8 place-items-center rounded-lg transition-colors hover:bg-secondary hover:text-foreground" title="Private workspace">
                <ShieldCheck className="h-[17px] w-[17px]" strokeWidth={1.6} />
              </span>
            </div>
          </div>
          <div className="flex flex-col items-center gap-2">
            <span className="status-dot h-2 w-2 rounded-full bg-primary pulse-soft" />
            <span className="font-mono-label text-[8px] uppercase tracking-[.18em] text-muted-foreground [writing-mode:vertical-rl]">online</span>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="appear flex items-center justify-between border-b border-border/70 pb-4 lg:pb-5">
            <button type="button" onClick={resetWorkspace} data-testid="button-lumen-home-mobile" className="group flex items-center gap-3 text-left lg:pointer-events-none" aria-label="Start a new Lumen analysis">
              <span className="brand-mark grid h-9 w-9 place-items-center rounded-xl lg:hidden">
                <ScanEye className="h-[17px] w-[17px]" strokeWidth={1.7} />
              </span>
              <span>
                <span className="block font-display text-[1.18rem] font-semibold leading-none tracking-[-0.045em] text-foreground">lumen <span className="text-primary">x</span></span>
                <span className="mt-1 block font-mono-label text-[8px] uppercase tracking-[.21em] text-muted-foreground">private cognitive lens</span>
              </span>
            </button>
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="hidden items-center gap-2 text-[10px] uppercase tracking-[.14em] text-muted-foreground sm:flex">
                <span className="status-dot h-1.5 w-1.5 rounded-full bg-primary" />
                <span>Signal clear</span>
              </div>
              <label className="flex items-center gap-2 rounded-lg border border-border/90 bg-card/50 px-2.5 py-2 text-[10px] font-semibold text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground">
                <Languages className="h-3.5 w-3.5 text-accent" strokeWidth={1.7} />
                <span className="sr-only">Language</span>
                <select value={language} onChange={(event) => setLanguage(event.target.value as LumenLanguage)} aria-label="Language" data-testid="select-language" className="cursor-pointer appearance-none bg-transparent text-[11px] font-semibold text-foreground outline-none">
                  <option value="en">English</option>
                  <option value="ar">العربية</option>
<option value="tr">Türkçe</option>
<option value="de">Deutsch</option>

                </select>
              </label>
            </div>
          </header>

          <section className="mx-auto grid w-full max-w-[1260px] flex-1 items-start gap-9 pb-5 pt-10 sm:pt-14 lg:grid-cols-[minmax(280px,.72fr)_minmax(500px,1.28fr)] lg:gap-x-20 lg:gap-y-10 lg:pb-10 lg:pt-20">
            <div className="appear appear-delay-1 max-w-[480px]">
              <div className="mb-6 flex items-center gap-3">
                <span className="font-mono-label text-[9px] uppercase tracking-[.24em] text-primary">L / 01 — Read the room</span>
                <span className="signal-line h-px w-12" />
              </div>
              <h1 className="font-display text-balance text-[3.15rem] font-semibold leading-[.93] tracking-[-.068em] text-foreground sm:text-[4.5rem] lg:text-[5.1rem]">
                Turn<br />
                <span className="text-primary">uncertainty</span><br />
                into signal.
              </h1>
              <p className="mt-7 max-w-[390px] text-[14px] leading-7 text-muted-foreground sm:text-[15px]">
                A private second pair of eyes for the message, screenshot, or situation you cannot quite place.
              </p>
              <div className="mt-9 hidden border-t border-border/70 pt-5 md:block">
                <div className="flex items-center gap-3">
                  <div className="flex -space-x-1.5" aria-hidden="true">
                    <span className="grid h-7 w-7 place-items-center rounded-full border border-background bg-primary text-[10px] font-bold text-primary-foreground">01</span>
                    <span className="grid h-7 w-7 place-items-center rounded-full border border-background bg-accent text-[10px] font-bold text-accent-foreground">02</span>
                    <span className="grid h-7 w-7 place-items-center rounded-full border border-background bg-secondary text-[10px] font-bold text-foreground">03</span>
                  </div>
                  <p className="font-mono-label text-[10px] uppercase leading-5 tracking-[.12em] text-muted-foreground">See the signal<br />choose your move</p>
                </div>
              </div>
            </div>

            <div className="appear appear-delay-2 w-full">
              <form onSubmit={handleSubmit} className="luminous-panel rounded-[22px] p-2 sm:p-3">
                <div className="input-frame rounded-[16px] p-4 sm:p-5">
                  <div className="flex items-center justify-between">
                    <label htmlFor="lumen-prompt" className="font-mono-label text-[9px] uppercase tracking-[.2em] text-muted-foreground">Input / raw context</label>
                    <div className="flex items-center gap-2 text-[9px] uppercase tracking-[.12em] text-muted-foreground">
                      <Sparkles className="h-3.5 w-3.5 text-primary" strokeWidth={1.6} />
                      <span className="hidden sm:inline">Lumen engine</span>
                    </div>
                  </div>
                  <textarea
                    id="lumen-prompt"
                    value={prompt}
                    onChange={(event) => setPrompt(event.target.value)}
                    data-testid="input-lumen-prompt"
                    placeholder="Paste the message. Describe what feels off. Ask what to do next."
                    className="mt-5 min-h-[160px] w-full resize-none bg-transparent text-[15px] leading-7 text-foreground outline-none placeholder:text-muted-foreground/55 sm:min-h-[190px] sm:text-[16px]"
                    maxLength={12000}
                  />
                  {imageData && (
                    <div className="appear mt-3 flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/[.06] p-2.5">
                      <img src={imageData} alt="Attached reference" data-testid="img-attached-reference" className="h-12 w-12 rounded-lg border border-border object-cover" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold text-foreground">{imageName || 'Attached image'}</p>
                        <p className="mt-1 font-mono-label text-[9px] uppercase tracking-[.1em] text-primary/75">Reference loaded</p>
                      </div>
                      <button type="button" onClick={removeImage} data-testid="button-remove-image" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Remove attached image">
                        <Trash2 className="h-4 w-4" strokeWidth={1.7} />
                      </button>
                    </div>
                  )}
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border/70 pt-3">
                    <div className="flex items-center gap-2">
                      <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={handleFileChange} className="hidden" data-testid="input-image-file" />
                      <button type="button" onClick={() => fileInputRef.current?.click()} data-testid="button-attach-image" className="group flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        <ImagePlus className="h-4 w-4 text-accent transition-transform group-hover:-rotate-6" strokeWidth={1.7} />
                        <span className="hidden sm:inline">Attach image</span>
                      </button>
                      <span className="font-mono-label text-[9px] tracking-[.05em] text-muted-foreground/60">{prompt.length.toLocaleString()} / 12,000</span>
                    </div>
                    <button type="submit" disabled={isAnalyzing || isImageProcessing} data-testid="button-analyze" className="group flex h-11 items-center gap-2 rounded-lg bg-primary px-4 text-xs font-bold uppercase tracking-[.04em] text-primary-foreground shadow-[0_10px_25px_-15px_hsl(73_100%_62%/.8)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-primary/90 active:translate-y-0 active:scale-[.98] disabled:cursor-wait disabled:opacity-65">
                      {isImageProcessing ? (
                        <>
                          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
                          Preparing
                        </>
                      ) : isAnalyzing ? (
                        <>
                          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
                          Reading
                        </>
                      ) : (
                        <>
                          Read this
                          <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" strokeWidth={2} />
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </form>
              <p className="mt-3 flex items-center gap-2 text-[10px] leading-5 text-muted-foreground/70">
                <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-accent" strokeWidth={1.6} />
                Private by design. Lumen reads the context, not your mind.
              </p>
            </div>

            <div className="appear appear-delay-3 lg:col-start-2">
              {isAnalyzing && <LoadingState />}
              {!isAnalyzing && view === 'error' && <ErrorState message={errorMessage} onRetry={() => void submitAnalysis()} />}
              {!isAnalyzing && view === 'result' && analysis && <AnalysisResult analysis={analysis} language={analysisLanguage} copied={copied} onCopy={copyReply} />}
              {!isAnalyzing && view === 'empty' && !analysis && <EmptyState />}
            </div>
          </section>

          <footer className="flex items-center justify-between border-t border-border/65 py-4 text-[9px] uppercase tracking-[.18em] text-muted-foreground/65">
            <span className="flex items-center gap-2"><Paperclip className="h-3 w-3" /> A clear read, one moment at a time</span>
            <span className="font-mono-label text-primary/80">L X / 01</span>
          </footer>
        </div>
      </div>
    </main>
  );
}

function EmptyState() {
  return (
    <div className="luminous-panel rounded-[20px] p-5 sm:p-7" data-testid="status-empty">
      <div className="flex items-start gap-4">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-primary/20 bg-primary/[.08] text-primary">
          <Lightbulb className="h-[18px] w-[18px]" strokeWidth={1.6} />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono-label text-[9px] uppercase tracking-[.2em] text-primary">Ready when you are</span>
            <span className="h-1 w-1 rounded-full bg-accent" />
          </div>
          <p className="mt-3 font-display text-[1.45rem] font-semibold leading-tight tracking-[-.04em] text-foreground">Bring the unclear thing.</p>
          <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">Lumen will separate the signal from the noise, then give you a grounded next move.</p>
        </div>
      </div>
      <div className="mt-7 grid gap-2.5 sm:grid-cols-3">
        {['A message I cannot place', 'A screenshot with too much going on', 'A paragraph I need to answer'].map((item, index) => (
          <div key={item} data-testid={`text-example-${index + 1}`} className="rounded-xl border border-border/70 bg-background/35 px-3 py-3.5 text-xs leading-5 text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground">
            <span className="mb-3 block font-mono-label text-[9px] text-accent">0{index + 1}</span>
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="luminous-panel relative overflow-hidden rounded-[20px] p-5 sm:p-7" aria-live="polite" data-testid="status-analyzing">
      <div className="absolute left-0 top-0 h-px w-1/3 signal-line scan-line" aria-hidden="true" />
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl border border-primary/20 bg-primary/[.08] text-primary">
          <ScanEye className="h-[17px] w-[17px] pulse-soft" strokeWidth={1.7} />
        </div>
        <div>
          <p className="font-display text-xl font-semibold tracking-[-.03em] text-foreground">Lumen is looking closer</p>
          <p className="mt-1 font-mono-label text-[9px] uppercase tracking-[.14em] text-muted-foreground">Finding the useful thread...</p>
        </div>
      </div>
      <div className="mt-8 space-y-3.5" aria-hidden="true">
        <div className="h-2 w-[82%] animate-pulse rounded-full bg-muted" />
        <div className="h-2 w-[94%] animate-pulse rounded-full bg-muted" />
        <div className="h-2 w-[66%] animate-pulse rounded-full bg-muted" />
        <div className="mt-7 h-20 animate-pulse rounded-xl border border-border/60 bg-muted/50" />
      </div>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-[20px] border border-destructive/25 bg-destructive/[.06] p-5 sm:p-7" role="alert" data-testid="status-analysis-error">
      <div className="flex items-start gap-4">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-destructive/20 bg-destructive/10 text-destructive">
          <CircleAlert className="h-[18px] w-[18px]" strokeWidth={1.7} />
        </div>
        <div>
          <p className="font-display text-[1.45rem] font-semibold leading-tight tracking-[-.04em] text-foreground">That read got interrupted.</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{message}</p>
          <button type="button" onClick={onRetry} data-testid="button-retry-analysis" className="mt-5 inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-xs font-semibold text-foreground transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:text-primary active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.8} />
            Try again
          </button>
        </div>
      </div>
    </div>
  );
}

function AnalysisResult({
  analysis,
  language,
  copied,
  onCopy,
}: {
  analysis: LumenAnalysis;
  language: LumenLanguage;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="space-y-3" dir={language === 'ar' ? 'rtl' : 'ltr'} data-language={language} data-testid="container-analysis-result">
      <article className="result-summary relative overflow-hidden rounded-[20px] border border-primary/25 p-5 sm:p-7">
        <div className="absolute right-5 top-5 h-14 w-14 rounded-full border border-primary/25" aria-hidden="true" />
        <div className="absolute right-8 top-8 h-8 w-8 rounded-full border border-accent/30" aria-hidden="true" />
        <div className="relative flex items-center justify-between gap-3">
          <span className="font-mono-label text-[9px] uppercase tracking-[.2em] text-primary">Lumen read / short version</span>
          <span className="flex items-center gap-2 font-mono-label text-[9px] uppercase tracking-[.14em] text-muted-foreground"><span className="status-dot h-1.5 w-1.5 rounded-full bg-primary" /> Clear</span>
        </div>
        <p className="relative mt-6 max-w-[620px] font-display text-[1.65rem] font-semibold leading-[1.15] tracking-[-.045em] text-foreground sm:text-[2rem]" data-testid="text-analysis-summary">{analysis.summary}</p>
      </article>

      <div className="grid gap-3 sm:grid-cols-2">
        <article className="luminous-panel rounded-[18px] p-5 sm:p-6">
          <div className="flex items-center gap-2 text-accent">
            <Eye className="h-4 w-4" strokeWidth={1.7} />
            <h2 className="font-mono-label text-[9px] uppercase tracking-[.18em]">What it means</h2>
          </div>
          <ul className="mt-5 space-y-3" data-testid="list-what-it-means">
            {analysis.whatItMeans.map((meaning, index) => (
              <li key={`${meaning}-${index}`} className="flex gap-3 text-sm leading-6 text-foreground">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                <span>{meaning}</span>
              </li>
            ))}
          </ul>
        </article>
        <article className="luminous-panel rounded-[18px] p-5 sm:p-6">
          <div className="flex items-center gap-2 text-accent">
            <ArrowRight className="h-4 w-4" strokeWidth={1.7} />
            <h2 className="font-mono-label text-[9px] uppercase tracking-[.18em]">Your next move</h2>
          </div>
          <p className="mt-5 text-sm leading-6 text-foreground" data-testid="text-analysis-next-step">{analysis.nextStep}</p>
        </article>
      </div>

      <article className="rounded-[18px] border border-accent/25 bg-accent/[.07] p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-accent">
            <MessageSquareText className="h-4 w-4" strokeWidth={1.7} />
            <h2 className="font-mono-label text-[9px] uppercase tracking-[.18em]">Words you can send</h2>
          </div>
          <span className="rounded-md border border-accent/30 bg-background/30 px-2.5 py-1.5 font-mono-label text-[9px] uppercase tracking-[.12em] text-accent" data-testid="text-reply-tone">{analysis.replyTone}</span>
        </div>
        <p className="mt-5 text-[15px] leading-7 text-foreground" data-testid="text-analysis-reply">{analysis.reply}</p>
        <button type="button" onClick={onCopy} data-testid="button-copy-reply" className="mt-5 inline-flex items-center gap-2 rounded-lg bg-foreground px-4 py-2.5 text-xs font-bold text-background transition-all hover:-translate-y-0.5 hover:bg-foreground/90 active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {copied ? <Check className="h-3.5 w-3.5" strokeWidth={2.2} /> : <Clipboard className="h-3.5 w-3.5" strokeWidth={1.8} />}
          {copied ? 'Copied to clipboard' : 'Copy reply'}
        </button>
      </article>
    </div>
  );
}

function NotFound() {
  return (
    <main className="lumen-shell grid min-h-[100dvh] w-full place-items-center px-4">
      <div className="luminous-panel max-w-md rounded-[20px] p-7 text-center">
        <p className="font-mono-label text-[9px] uppercase tracking-[.2em] text-primary">L X / 404</p>
        <p className="mt-4 font-display text-3xl font-semibold tracking-[-.04em] text-foreground">Nothing to read here.</p>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">This page does not exist. The lens only has one view — the reading room.</p>
        <a href="/" className="mt-6 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-xs font-bold uppercase tracking-[.04em] text-primary-foreground transition-all hover:-translate-y-0.5 hover:bg-primary/90">
          Back to Lumen
          <ArrowUpRight className="h-4 w-4" strokeWidth={2} />
        </a>
      </div>
    </main>
  );
}
