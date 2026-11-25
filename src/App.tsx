import { type ChangeEvent, type FormEvent, useRef, useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Copy,
    Compass,
    GraduationCap,
    Search,
  CircleAlert,
  Clipboard,
  Eye,
    Heart,
    History,
  ImagePlus,
  Languages,
  Lightbulb,
    Mic,
  MessageSquareText,
  MoreHorizontal,
  Paperclip,
  RefreshCw,
  ScanEye,
    Share2,
  ShieldAlert,
  ScanSearch,
    X,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  ThumbsDown,
  ThumbsUp,
    Volume2,
  VolumeX,
    ScrollText,
} from 'lucide-react';
import { analyzeInput, chatFollowUp, adviseMe, solveStudy, researchTopic,
         analyzeImage, checkShield, generalChat
       , supportChat, type

        LumenAnalysis, type LumenChatMessage, type LumenImageRead, type LumenAdvisorRead, type LumenStudyRead, type LumenResearchResult,
        type LumenLanguage, type LumenShieldRead

        , type LumenMode } from './api';

import { prepareImageForAnalysis } from './image';

// Lumen X — one page: paste something unclear, get a clear read.
// The whole screen lives in this file, in four small pieces at the bottom:
// EmptyState, LoadingState, ErrorState, AnalysisResult.
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
}

interface SpeechRecognitionEventLike {
  results?: { [index: number]: { [index: number]: { transcript?: string } } };
}

interface SavedRead {
  id: number;
  prompt: string;
  analysis: LumenAnalysis;
  language: LumenLanguage;
  mode: LumenMode;
  at: string;
}


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
    const [mode, setMode] = useState<LumenMode>('read');
  const [isListening, setIsListening] = useState(false);
  const [isRewriting, setIsRewriting] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [history, setHistory] = useState<SavedRead[]>(() => {
    try {
      const raw = window.localStorage.getItem('lumen-x-history');
      const parsed = raw ? (JSON.parse(raw) as SavedRead[]) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
    const [voiceKind, setVoiceKind] = useState<'female' | 'male'>('female');
  const [isSpeaking, setIsSpeaking] = useState(false);
    const [lastInput, setLastInput] = useState<{ prompt: string; imageData: string | null } | null>(null);
  const [deepResult, setDeepResult] = useState<NonNullable<LumenAnalysis['deep']> | null>(null);
  const [isDeepening, setIsDeepening] = useState(false);
  const [analysisPrompt, setAnalysisPrompt] = useState('');
  const [chatMessages, setChatMessages] = useState<LumenChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatError, setChatError] = useState('');
  const [isChatting, setIsChatting] = useState(false);
    const [supportOpen, setSupportOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [feedback, setFeedback] = useState<'up' | 'down' | null>(null);
  const [supportMessages, setSupportMessages] = useState<LumenChatMessage[]>([]);
  const [supportInput, setSupportInput] = useState('');
  const [supportError, setSupportError] = useState('');
  const [isSupporting, setIsSupporting] = useState(false);
    const [talkOpen, setTalkOpen] = useState(false);
  const [talkMessages, setTalkMessages] = useState<LumenChatMessage[]>([]);
  const [talkInput, setTalkInput] = useState('');
  const [talkError, setTalkError] = useState('');
  const [isTalking, setIsTalking] = useState(false);
  const talkRequestIdRef = useRef(0);
    const [imageDoorOpen, setImageDoorOpen] = useState(false);
  const [doorImageData, setDoorImageData] = useState<string | null>(null);
  const [doorImageName, setDoorImageName] = useState('');
  const [doorQuestion, setDoorQuestion] = useState('');
  const [doorResult, setDoorResult] = useState<LumenImageRead | null>(null);
  const [doorError, setDoorError] = useState('');
  const [isDoorReading, setIsDoorReading] = useState(false);
  const [isDoorImageProcessing, setIsDoorImageProcessing] = useState(false);
    const [shieldOpen, setShieldOpen] = useState(false);
  const [shieldText, setShieldText] = useState('');
  const [shieldImageData, setShieldImageData] = useState<string | null>(null);
  const [shieldImageName, setShieldImageName] = useState('');
  const [shieldResult, setShieldResult] = useState<LumenShieldRead | null>(null);
  const [shieldError, setShieldError] = useState('');
  const [isShieldReading, setIsShieldReading] = useState(false);
  const [isShieldImageProcessing, setIsShieldImageProcessing] = useState(false);
    const [advisorOpen, setAdvisorOpen] = useState(false);
  const [advisorSituation, setAdvisorSituation] = useState('');
  const [advisorResult, setAdvisorResult] = useState<LumenAdvisorRead | null>(null);
  const [advisorError, setAdvisorError] = useState('');
  const [isAdvising, setIsAdvising] = useState(false);
    const [studyOpen, setStudyOpen] = useState(false);
  const [studyProblem, setStudyProblem] = useState('');
  const [studyImageData, setStudyImageData] = useState<string | null>(null);
  const [studyImageName, setStudyImageName] = useState('');
  const [studyResult, setStudyResult] = useState<LumenStudyRead | null>(null);
  const [studyError, setStudyError] = useState('');
  const [isSolving, setIsSolving] = useState(false);
  const [isStudyImageProcessing, setIsStudyImageProcessing] = useState(false);
    const [researchOpen, setResearchOpen] = useState(false);
  const [researchQuestion, setResearchQuestion] = useState('');
  const [researchResult, setResearchResult] = useState<LumenResearchResult | null>(null);
  const [researchError, setResearchError] = useState('');
  const [isResearching, setIsResearching] = useState(false);
  
  
  
  
  
      
  const chatRequestIdRef = useRef(0);
    const supportRequestIdRef = useRef(0);
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
    chatRequestIdRef.current += 1;
    setChatMessages([]);
    setChatInput('');
    setChatError('');
    setIsChatting(false);
    setAnalysisLanguage(language);
    setView('empty');
    setIsAnalyzing(true);
    const requestId = ++requestIdRef.current;
    try {
            const result = await analyzeInput({ prompt: trimmedPrompt, imageData, language, mode });
      if (requestId !== requestIdRef.current) return; // a reset or newer request won
      setAnalysisPrompt(trimmedPrompt);
      setAnalysis(result);
            setLastInput({ prompt: trimmedPrompt, imageData });
      setDeepResult(null);
            setHistory((previous) => {
        const next = [
          { id: Date.now(), prompt: trimmedPrompt, analysis: result, language, mode, at: new Date().toISOString() },
          ...previous,
        ].slice(0, 20);
        try {
          window.localStorage.setItem('lumen-x-history', JSON.stringify(next));
        } catch {
        }
        return next;
      });
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
    const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  const speechRecognitionAvailable =
    typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }
    const RecognitionCtor =
      (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike }).SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike }).webkitSpeechRecognition;
    if (!RecognitionCtor) return;
    const recognition = new RecognitionCtor();
    recognitionRef.current = recognition;
    const langByLanguage: Record<LumenLanguage, string> = {
      ar: 'ar-DZ',
      en: 'en-US',
      tr: 'tr-TR',
      de: 'de-DE',
      pt: 'pt-PT',
    };
    recognition.lang = langByLanguage[language];
    recognition.interimResults = false;
    recognition.onresult = (event: SpeechRecognitionEventLike) => {
      const transcript = event.results?.[0]?.[0]?.transcript?.trim();
      if (transcript) {
        setPrompt((previous) => (previous.trim() ? `${previous.trim()} ${transcript}` : transcript));
      }
    };
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);
    setIsListening(true);
    recognition.start();
  };

  const rewriteReply = async (toneInstruction: string) => {
    if (!analysis || isRewriting) return;
    setIsRewriting(true);
    try {
      const reply = await chatFollowUp({
        prompt: analysisPrompt,
        analysis,
        messages: [
          {
            role: 'user',
            text: `Rewrite the suggested reply in this tone: ${toneInstruction}. Return only the rewritten reply text, nothing else.`,
          },
        ],
        language: analysisLanguage,
      });
      setAnalysis({ ...analysis, reply });
    } catch {
    } finally {
      setIsRewriting(false);
    }
  };

  const shareAnalysis = async () => {
    if (!analysis) return;
    const text = `${analysis.summary}\n\n${analysis.reply}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Lumen X', text });
        return;
      } catch {
        return;
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      setShareCopied(true);
      window.setTimeout(() => setShareCopied(false), 1800);
    } catch {
      setShareCopied(false);
    }
  };

  const restoreRead = (entry: SavedRead) => {
    chatRequestIdRef.current += 1;
    setChatMessages([]);
    setChatInput('');
    setChatError('');
    setIsChatting(false);
    setAnalysisPrompt(entry.prompt);
    setAnalysis(entry.analysis);
        setLastInput(entry.prompt ? { prompt: entry.prompt, imageData: null } : null);
    setDeepResult(null);
    setAnalysisLanguage(entry.language);
    setLanguage(entry.language);
    setMode(entry.mode);
    setView('result');
    setErrorMessage('');
  };

  const deleteRead = (id: number) => {
    setHistory((previous) => {
      const next = previous.filter((entry) => entry.id !== id);
      try {
        window.localStorage.setItem('lumen-x-history', JSON.stringify(next));
      } catch {
      }
      return next;
    });
  };

        const speakAnalysis = () => {
    if (!analysis) return;
    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(`${analysis.summary}. ${analysis.reply}`);
    const langByLanguage: Record<LumenLanguage, string> = {
      ar: 'ar',
      en: 'en',
      tr: 'tr',
      de: 'de',
      pt: 'pt',
    };
    const prefix = langByLanguage[analysisLanguage];
    utterance.lang = prefix;
    const voices = window.speechSynthesis
      .getVoices()
      .filter((voice) => voice.lang.toLowerCase().startsWith(prefix));
    const femaleHints = ['female', 'woman', 'zira', 'samantha', 'kate', 'serena', 'moira', 'fiona', 'amelie', 'anna', 'katja', 'luciana', 'filiz'];
    const maleHints = ['male', 'man', 'david', 'daniel', 'george', 'arthur', 'thomas', 'pavel', 'emre', 'jorge'];
    const hints = voiceKind === 'female' ? femaleHints : maleHints;
    const picked =
      voices.find((voice) => hints.some((hint) => voice.name.toLowerCase().includes(hint))) ??
      (voiceKind === 'female' ? voices[0] : voices[1] ?? voices[0]);
    if (picked) utterance.voice = picked;
    utterance.pitch = voiceKind === 'female' ? 1.1 : 0.85;
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    setIsSpeaking(true);
    window.speechSynthesis.speak(utterance);
  };

          const explainDeep = async () => {
    if (!analysis || !lastInput || isDeepening) return;
    setIsDeepening(true);
    setErrorMessage('');
    try {
      const result = await analyzeInput({ prompt: lastInput.prompt, imageData: lastInput.imageData, language, mode, deep: true });
      if (result.deep) {
        setDeepResult(result.deep);
      } else {
        setErrorMessage('Lumen could not prepare the detailed explanation. Try again.');
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Lumen could not prepare the detailed explanation.');
    } finally {
      setIsDeepening(false);
    }
  };

  const sendChat = async () => {
    const text = chatInput.trim();
    if (!text || !analysis || isChatting) return;
    const nextMessages: LumenChatMessage[] = [...chatMessages, { role: 'user', text }];
    setChatMessages(nextMessages);
    setChatInput('');
    setChatError('');
    setIsChatting(true);
    const chatRequestId = ++chatRequestIdRef.current;
    try {
      const reply = await chatFollowUp({
        prompt: analysisPrompt,
        analysis,
        messages: nextMessages,
        language: analysisLanguage,
      });
      if (chatRequestId !== chatRequestIdRef.current) return;
      setChatMessages([...nextMessages, { role: 'assistant', text: reply }]);
    } catch (error) {
      if (chatRequestId !== chatRequestIdRef.current) return;
      setChatError(error instanceof Error && error.message ? error.message : 'Lumen could not answer that. Check your connection and try again.');
    } finally {
      if (chatRequestId === chatRequestIdRef.current) setIsChatting(false);
    }
  };
  
  const sendSupport = async () => {
    const text = supportInput.trim();
    if (!text || isSupporting) return;
    const nextMessages: LumenChatMessage[] = [...supportMessages, { role: 'user', text }];
    setSupportMessages(nextMessages);
    setSupportInput('');
    setSupportError('');
    setIsSupporting(true);
    const supportRequestId = ++supportRequestIdRef.current;
    try {
      const reply = await supportChat({ messages: nextMessages, language });
      if (supportRequestId !== supportRequestIdRef.current) return;
      setSupportMessages([...nextMessages, { role: 'assistant', text: reply }]);
    } catch (error) {
      if (supportRequestId !== supportRequestIdRef.current) return;
      setSupportError(error instanceof Error && error.message ? error.message : 'Lumen could not answer that. Check your connection and try again.');
    } finally {
      if (supportRequestId === supportRequestIdRef.current) setIsSupporting(false);
    }
  };
  
  const sendTalk = async () => {
    const text = talkInput.trim();
    if (!text || isTalking) return;
    const nextMessages: LumenChatMessage[] = [...talkMessages, { role: 'user', text }];
    setTalkMessages(nextMessages);
    setTalkInput('');
    setTalkError('');
    setIsTalking(true);
    const talkRequestId = ++talkRequestIdRef.current;
    try {
      const reply = await generalChat({ messages: nextMessages, language });
      if (talkRequestId !== talkRequestIdRef.current) return;
      setTalkMessages([...nextMessages, { role: 'assistant', text: reply }]);
    } catch (error) {
      if (talkRequestId !== talkRequestIdRef.current) return;
      setTalkError(error instanceof Error && error.message ? error.message : 'Lumen could not answer that. Check your connection and try again.');
    } finally {
      if (talkRequestId === talkRequestIdRef.current) setIsTalking(false);
    }
  };
  
  const handleDoorFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setDoorError('That file is not an image. Try a PNG, JPG, or WEBP.');
      return;
    }
    setIsDoorImageProcessing(true);
    try {
      const prepared = await prepareImageForAnalysis(file);
      setDoorImageData(prepared);
      setDoorImageName(file.name);
      setDoorResult(null);
      setDoorError('');
    } catch {
      setDoorError('That image could not be prepared. Try a JPG, PNG, or WEBP under 10 MB.');
    } finally {
      setIsDoorImageProcessing(false);
    }
  };

  const sendDoorImage = async () => {
    if (!doorImageData || isDoorReading) return;
    setIsDoorReading(true);
    setDoorError('');
    try {
      const result = await analyzeImage({ imageData: doorImageData, question: doorQuestion.trim(), language });
      setDoorResult(result);
    } catch (error) {
      setDoorError(error instanceof Error && error.message ? error.message : 'Lumen could not read that image. Check your connection and try again.');
    } finally {
      setIsDoorReading(false);
    }
  };
  
  const handleShieldFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setShieldError('That file is not an image. Try a PNG, JPG, or WEBP.');
      return;
    }
    setIsShieldImageProcessing(true);
    try {
      const prepared = await prepareImageForAnalysis(file);
      setShieldImageData(prepared);
      setShieldImageName(file.name);
      setShieldResult(null);
      setShieldError('');
    } catch {
      setShieldError('That image could not be prepared. Try a JPG, PNG, or WEBP under 10 MB.');
    } finally {
      setIsShieldImageProcessing(false);
    }
  };

  const sendShield = async () => {
    if ((!shieldText.trim() && !shieldImageData) || isShieldReading) return;
    setIsShieldReading(true);
    setShieldError('');
    try {
      const result = await checkShield({ text: shieldText.trim(), imageData: shieldImageData, language });
      setShieldResult(result);
    } catch (error) {
      setShieldError(error instanceof Error && error.message ? error.message : 'Lumen could not check that. Check your connection and try again.');
    } finally {
      setIsShieldReading(false);
    }
  };
  
  const sendAdvisor = async () => {
    if (!advisorSituation.trim() || isAdvising) return;
    setIsAdvising(true);
    setAdvisorError('');
    try {
      const result = await adviseMe({ situation: advisorSituation.trim(), language });
      setAdvisorResult(result);
    } catch (error) {
      setAdvisorError(error instanceof Error && error.message ? error.message : 'Lumen could not advise on that. Check your connection and try again.');
    } finally {
      setIsAdvising(false);
    }
  };
  
  const handleStudyFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setStudyError('That file is not an image. Try a PNG, JPG, or WEBP.');
      return;
    }
    setIsStudyImageProcessing(true);
    try {
      const prepared = await prepareImageForAnalysis(file);
      setStudyImageData(prepared);
      setStudyImageName(file.name);
      setStudyResult(null);
      setStudyError('');
    } catch {
      setStudyError('That image could not be prepared. Try a JPG, PNG, or WEBP under 10 MB.');
    } finally {
      setIsStudyImageProcessing(false);
    }
  };

  const sendStudy = async () => {
    if ((!studyProblem.trim() && !studyImageData) || isSolving) return;
    setIsSolving(true);
    setStudyError('');
    try {
      const result = await solveStudy({ problem: studyProblem.trim(), imageData: studyImageData, language });
      setStudyResult(result);
    } catch (error) {
      setStudyError(error instanceof Error && error.message ? error.message : 'Lumen could not solve that. Check your connection and try again.');
    } finally {
      setIsSolving(false);
    }
  };
    const sendResearch = async () => {
    if (!researchQuestion.trim() || isResearching) return;
    setIsResearching(true);
    setResearchError('');
    try {
      const result = await researchTopic({ question: researchQuestion.trim(), language });
      setResearchResult(result);
    } catch (error) {
      setResearchError(error instanceof Error && error.message ? error.message : 'Lumen could not research that. Check your connection and try again.');
    } finally {
      setIsResearching(false);
    }
  };
  
  
  
  
  
  
                                              
  const resetWorkspace = () => {
    requestIdRef.current += 1; // ignore any answer still on its way
    setIsAnalyzing(false);
    setPrompt('');
    removeImage();
    setAnalysis(null);
    setAnalysisPrompt('');
    chatRequestIdRef.current += 1;
    setChatMessages([]);
    setChatInput('');
    setChatError('');
    setIsChatting(false);
    setView('empty');
    setErrorMessage('');
    setCopied(false);
  };

  return (
    <main className="lumen-shell min-h-[100dvh] w-full">
      
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
                            <span>By Anis Zeribi</span>
                
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
<option value="pt">Português</option>


                </select>
              </label>
              
            </div>
          </header>

          <section className="mx-auto grid grid-cols-[minmax(0,1fr)] w-full
            max-w-[1260px] flex-1 items-start gap-9 pb-5 pt-10 sm:pt-14 lg:grid-cols-[minmax(280px,.72fr)_minmax(500px,1.28fr)] lg:gap-x-20 lg:gap-y-10 lg:pb-10 lg:pt-20">
            <div className="appear-delay-1 min-w-0 max-w-[480px]
              ">
              <div className="mb-6 flex items-center gap-3">
                <span className="font-mono-label text-[9px] uppercase tracking-[.24em] text-primary">L / 01 — Read the room</span>
                <span className="signal-line h-px w-12" />
              </div>
              <h1 className="font-display text-balance text-[2.5rem]
                font-semibold leading-[.93] tracking-[-.068em] text-foreground sm:text-[4.5rem] lg:text-[5.1rem]">
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
                      <span className="font-mono-label text-[9px] tracking-[.05em] text-muted-foreground/60">{prompt.length.toLocaleString()} / 50,000</span>
                    </div>
                  </div>
                                    <div className="mt-4 flex flex-nowrap gap-1.5" role="group" aria-label="Reading mode">
                    {(
                      [
                        { value: 'read', label: 'Read' },
                        { value: 'scam', label: 'Scam check' },
                        { value: 'conversation', label: 'Conversation' },
                      ] as { value: LumenMode; label: string }[]
                    ).map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setMode(option.value)}
                        data-testid={`button-mode-${option.value}`}
                        aria-pressed={mode === option.value}
                        className={
                          mode === option.value
                            ? 'rounded-lg bg-primary px-2.5 py-1.5 text-[10.5px] font-bold text-primary-foreground transition-colors'
                            : 'rounded-lg border border-border/90 px-2.5 py-1.5 text-[10.5px] font-semibold text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground'
                        }
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                   
                  <textarea
                    id="lumen-prompt"
                    value={prompt}
                    onChange={(event) => setPrompt(event.target.value)}
                    data-testid="input-lumen-prompt"
                    placeholder="Paste the unclear thing here."
                    className="mt-5 min-h-[160px] w-full resize-none bg-transparent text-[15px] leading-7 text-foreground outline-none placeholder:text-muted-foreground/55 sm:min-h-[190px] sm:text-[16px]"
                    maxLength={50000}
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
                  <div className="mt-4 flex items-center justify-between gap-2 border-t border-border/70 pt-3">
                    <div className="flex items-center gap-2">
                      <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={handleFileChange} className="hidden" data-testid="input-image-file" />
                      <button type="button" onClick={() => fileInputRef.current?.click()} data-testid="button-attach-image" className="group flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        <ImagePlus className="h-4 w-4 text-accent transition-transform group-hover:-rotate-6" strokeWidth={1.7} />
                        <span className="hidden sm:inline">Attach image</span>
                      </button>
                                            {speechRecognitionAvailable && (
                        <button type="button" onClick={toggleListening} data-testid="button-voice-input" aria-pressed={isListening} className={isListening ? 'group flex items-center gap-2 rounded-lg bg-destructive/15 px-2 py-1.5 text-xs font-medium text-destructive transition-colors' : 'group flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'}>
                          <Mic className="h-4 w-4 text-accent" strokeWidth={1.7} />
                          <span className="hidden sm:inline">{isListening ? 'Listening...' : 'Speak'}</span>
                        </button>
                      )}
                      
                                            <button type="button" onClick={() => { setSupportOpen((open) => !open); setTalkOpen(false); setImageDoorOpen(false); setShieldOpen(false); setAdvisorOpen(false); setStudyOpen(false); setResearchOpen(false); }}
                                              
                                              
                                              

                                              
                                              data-testid="button-support-composer" aria-pressed={supportOpen} className={supportOpen ? 'group flex items-center gap-2 rounded-lg bg-primary/15 px-2 py-1.5 text-xs font-medium text-foreground transition-colors' : 'group flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'}>
                                              
                        
                        <Heart className="h-4 w-4 text-accent" strokeWidth={1.7} />
                        <span className="hidden sm:inline">Support</span>
                      </button>                      <button type="button" onClick={() => { setTalkOpen((open) => !open); setSupportOpen(false); setImageDoorOpen(false); setShieldOpen(false); setAdvisorOpen(false); setStudyOpen(false); setResearchOpen(false); }}
                                                       
                                                       
                   data-testid="button-talk-composer" aria-pressed={talkOpen} className={talkOpen ? 'group flex items-center gap-2 rounded-lg bg-primary/15 px-2 py-1.5 text-xs font-medium text-foreground transition-colors' : 'group flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'}>
                        <MessageSquareText className="h-4 w-4 text-accent" strokeWidth={1.7} />
                        <span className="hidden sm:inline">Your Chat</span>
                      </button>
                                                                                        <button type="button" onClick={() => { setImageDoorOpen((open) => !open); setTalkOpen(false); setSupportOpen(false); setShieldOpen(false); setAdvisorOpen(false); setStudyOpen(false); setResearchOpen(false); }}
                                                                                          
                                                                                          
                                                                                          
                                              data-testid="button-image-composer" aria-pressed={imageDoorOpen} className={imageDoorOpen ? 'group flex items-center gap-2 rounded-lg bg-primary/15 px-2 py-1.5 text-xs font-medium text-foreground transition-colors' : 'group flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'}>
                        <ScanEye className="h-4 w-4 text-accent" strokeWidth={1.7} />
                        <span className="hidden sm:inline">Your Image</span>
                      </button>
                                            <button type="button" onClick={() => { setShieldOpen((open) => !open); setImageDoorOpen(false); setTalkOpen(false); setSupportOpen(false); setAdvisorOpen(false); setStudyOpen(false); setResearchOpen(false); }}
                                              
                                              
                                              data-testid="button-shield-composer" aria-pressed={shieldOpen} className={shieldOpen ? 'group flex items-center gap-2 rounded-lg bg-primary/15 px-2 py-1.5 text-xs font-medium text-foreground transition-colors' : 'group flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'}>
                        <ShieldAlert className="h-4 w-4 text-accent" strokeWidth={1.7} />
                        <span className="hidden sm:inline">Your Shield</span>
                                                                    </button>
                      <button type="button" onClick={() => { setAdvisorOpen((open) => !open); setShieldOpen(false); setImageDoorOpen(false); setTalkOpen(false); setSupportOpen(false); setStudyOpen(false); }}
                        data-testid="button-advisor-composer" aria-pressed={advisorOpen} className={advisorOpen ? 'group flex items-center gap-2 rounded-lg bg-primary/15 px-2 py-1.5 text-xs font-medium text-foreground transition-colors' : 'group flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'}>
                        <Compass className="h-4 w-4 text-accent" strokeWidth={1.7} />
                        <span className="hidden sm:inline">Your Advisor</span>

                                              </button>
                      <button type="button" onClick={() => { setStudyOpen((open) => !open); setAdvisorOpen(false); setShieldOpen(false); setImageDoorOpen(false); setTalkOpen(false); setSupportOpen(false); setResearchOpen(false); }}
                        data-testid="button-study-composer" aria-pressed={studyOpen} className={studyOpen ? 'group flex items-center gap-2 rounded-lg bg-primary/15 px-2 py-1.5 text-xs font-medium text-foreground transition-colors' : 'group flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'}>
                        <GraduationCap className="h-4 w-4 text-accent" strokeWidth={1.7} />
                        <span className="hidden sm:inline">Your Study</span>
                        
                      </button>
                                            <button type="button" onClick={() => { setResearchOpen((open) => !open); setStudyOpen(false); setAdvisorOpen(false); setShieldOpen(false); setImageDoorOpen(false); setTalkOpen(false); setSupportOpen(false); }} data-testid="button-research-composer" aria-pressed={researchOpen} className={researchOpen ? 'group flex items-center gap-2 rounded-lg bg-primary/15 px-2 py-1.5 text-xs font-medium text-foreground transition-colors' : 'group flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'}>
                        <Search className="h-4 w-4 text-accent" strokeWidth={1.7} />
                        <span className="hidden sm:inline">Your Research</span>
                      </button>
                      
                      
                      
                      

                      
                    </div>
                    <button type="submit" disabled={isAnalyzing || isImageProcessing} data-testid="button-analyze" className="group flex h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-lg bg-primary px-4 text-xs font-bold uppercase tracking-[.04em] text-primary-foreground shadow-[0_10px_25px_-15px_hsl(73_100%_62%/.8)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-primary/90 active:translate-y-0 active:scale-[.98] disabled:cursor-wait disabled:opacity-65">
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

            <div className="appear appear-delay-3 min-w-0 lg:col-start-2
              ">              {supportOpen && (
                  
      
                <div className="mb-3">
                  <SupportChat
                    messages={supportMessages}
                    input={supportInput}
                    onInputChange={setSupportInput}
                    onSend={() => void sendSupport()}
                    isSending={isSupporting}
                    error={supportError}
                    language={language}
                  />
                </div>
              )}
              
                          {talkOpen && (
                <div className="mb-3">
                  <GeneralChat
                    messages={talkMessages}
                    input={talkInput}
                    onInputChange={setTalkInput}
                    onSend={() => void sendTalk()}
                    isSending={isTalking}
                    error={talkError}
                    language={language}
                  />
                </div>
              )}

                           {imageDoorOpen && (
                <div className="mb-3">
                  <ImageDoor
                    imageData={doorImageData}
                    imageName={doorImageName}
                    question={doorQuestion}
                    result={doorResult}
                    error={doorError}
                    isReading={isDoorReading}
                    isProcessing={isDoorImageProcessing}
                    onFileChange={handleDoorFileChange}
                    onQuestionChange={setDoorQuestion}
                    onAnalyze={() => void sendDoorImage()}
                    language={language}
                  />
                </div>
              )}

                                 {shieldOpen && (
                <div className="mb-3">
                  <ShieldDoor
                    text={shieldText}
                    imageData={shieldImageData}
                    imageName={shieldImageName}
                    result={shieldResult}
                    error={shieldError}
                    isReading={isShieldReading}
                    isProcessing={isShieldImageProcessing}
                    onTextChange={setShieldText}
                    onFileChange={handleShieldFileChange}
                    onAnalyze={() => void sendShield()}
                    language={language}
                  />
                </div>
              )}
              
                    {advisorOpen && (
                      <div className="mb-3">
                        <AdvisorDoor
                          situation={advisorSituation}
                          result={advisorResult}
                          error={advisorError}
                          isAdvising={isAdvising}
                          onSituationChange={setAdvisorSituation}
                          onAnalyze={() => void sendAdvisor()}
                          language={language}
                        />
                      </div>
                    )}
              

                                  {studyOpen && (
                      <div className="mb-3">
                        <StudyDoor
                          problem={studyProblem}
                          imageData={studyImageData}
                          imageName={studyImageName}
                          result={studyResult}
                          error={studyError}
                          isSolving={isSolving}
                          isProcessing={isStudyImageProcessing}
                          onProblemChange={setStudyProblem}
                          onFileChange={handleStudyFileChange}
                          onAnalyze={() => void sendStudy()}
                          language={language}
                        />
                      </div>
                    )}
                                  {researchOpen && (
                      <div className="mb-3">
                        <ResearchDoor
                          question={researchQuestion}
                          result={researchResult}
                          error={researchError}
                          isResearching={isResearching}
                          onQuestionChange={setResearchQuestion}
                          onAnalyze={() => void sendResearch()}
                          language={language}
                        />
                      </div>
                    )}
              
              
                    {isAnalyzing && <LoadingState />}
              {!isAnalyzing && view === 'error' && <ErrorState message={errorMessage} onRetry={() => void submitAnalysis()} />}
                            {!isAnalyzing && view === 'result' && analysis && (
                <div className="space-y-3">
                  <AnalysisResult analysis={analysis} language={analysisLanguage} copied={copied} onCopy={copyReply} />
                  <div className="relative flex items-center gap-1 px-1" data-testid="container-answer-actions">
                    <button type="button" onClick={() => void copyReply()} data-testid="button-action-copy" aria-label="Copy reply" className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      {copied ? <Check className="h-4 w-4 text-accent" strokeWidth={2.2} /> : <Copy className="h-4 w-4" strokeWidth={1.8} />}
                    </button>
                    <button type="button" onClick={() => setFeedback((current) => (current === 'up' ? null : 'up'))} data-testid="button-action-like" aria-label="Good answer" aria-pressed={feedback === 'up'} className={feedback === 'up' ? 'grid h-8 w-8 place-items-center rounded-lg bg-secondary text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring' : 'grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'}>
                      <ThumbsUp className="h-4 w-4" strokeWidth={1.8} />
                    </button>
                    <button type="button" onClick={() => setFeedback((current) => (current === 'down' ? null : 'down'))} data-testid="button-action-dislike" aria-label="Bad answer" aria-pressed={feedback === 'down'} className={feedback === 'down' ? 'grid h-8 w-8 place-items-center rounded-lg bg-secondary text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring' : 'grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'}>
                      <ThumbsDown className="h-4 w-4" strokeWidth={1.8} />
                    </button>
                    <button type="button" onClick={speakAnalysis} data-testid="button-action-listen" aria-label={isSpeaking ? 'Stop' : 'Listen'} className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      {isSpeaking ? <VolumeX className="h-4 w-4" strokeWidth={1.8} /> : <Volume2 className="h-4 w-4" strokeWidth={1.8} />}
                    </button>
                    <button type="button" onClick={() => void shareAnalysis()} data-testid="button-action-share" aria-label="Share this read" className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      {shareCopied ? <Check className="h-4 w-4 text-accent" strokeWidth={2.2} /> : <Share2 className="h-4 w-4" strokeWidth={1.8} />}
                    </button>
                    <button type="button" onClick={() => setMenuOpen((open) => !open)} data-testid="button-results-menu" aria-haspopup="menu" aria-expanded={menuOpen} aria-label="More actions" className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      <MoreHorizontal className="h-4 w-4" strokeWidth={1.8} />
                    </button>
                    {menuOpen && (
                      <>
                        <button type="button" aria-hidden="true" tabIndex={-1} onClick={() => setMenuOpen(false)} className="fixed inset-0 z-10 cursor-default" />
                        <div className="absolute bottom-full right-0 z-20 mb-2 w-64 max-w-[calc(100vw-2.5rem)] rounded-2xl border border-border bg-card p-2 shadow-2xl" role="menu">
                          <button type="button" role="menuitem" onClick={() => { setSupportOpen((open) => !open); setMenuOpen(false); }} data-testid="button-support-toggle" aria-pressed={supportOpen} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-xs font-semibold text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                            <Heart className="h-4 w-4 shrink-0 text-accent" strokeWidth={1.7} />
                            Support
                          </button>
                          {view === 'result' && analysis && (
                            <>
                              <div className="my-1.5 h-px bg-border/70" />
                              <div className="flex items-center gap-1.5 px-1.5 py-1">
                                <button type="button" role="menuitem" onClick={() => { speakAnalysis(); setMenuOpen(false); }} data-testid="button-listen" className="inline-flex flex-1 items-center gap-2 rounded-lg bg-foreground px-3 py-2 text-[11px] font-bold text-background transition-colors hover:bg-foreground/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                                  {isSpeaking ? <VolumeX className="h-3.5 w-3.5" strokeWidth={1.8} /> : <Volume2 className="h-3.5 w-3.5" strokeWidth={1.8} />}
                                  {isSpeaking ? 'Stop' : 'Listen'}
                                </button>
                                {(
                                  [
                                    { value: 'female', label: 'Female voice' },
                                    { value: 'male', label: 'Male voice' },
                                  ] as { value: 'female' | 'male'; label: string }[]
                                ).map((option) => (
                                  <button
                                    key={option.value}
                                    type="button"
                                    onClick={() => setVoiceKind(option.value)}
                                    data-testid={`button-voice-${option.value}`}
                                    aria-pressed={voiceKind === option.value}
                                    className={
                                      voiceKind === option.value
                                        ? 'rounded-lg bg-primary px-2.5 py-2 text-[10px] font-bold text-primary-foreground transition-colors'
                                        : 'rounded-lg border border-border/90 px-2.5 py-2 text-[10px] font-semibold text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground'
                                    }
                                  >
                                    {option.label}
                                  </button>
                                ))}
                              </div>
                              <button type="button" role="menuitem" onClick={() => { void shareAnalysis(); setMenuOpen(false); }} data-testid="button-share-analysis" className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-xs font-semibold text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                                {shareCopied ? <Check className="h-4 w-4 shrink-0 text-accent" strokeWidth={2.2} /> : <Share2 className="h-4 w-4 shrink-0 text-accent" strokeWidth={1.8} />}
                                {shareCopied ? 'Copied to clipboard' : 'Share this read'}
                              </button>
                              <button type="button" role="menuitem" disabled={isDeepening || !lastInput} onClick={() => { setMenuOpen(false); void explainDeep(); }} data-testid="button-deep" className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-xs font-semibold text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50">
                                <ScrollText className="h-4 w-4 shrink-0 text-accent" strokeWidth={1.8} />
                                {isDeepening ? 'Preparing...' : 'Detailed explanation'}
                              </button>
                              {analysis.reply && (
                                <>
                                  <div className="my-1.5 h-px bg-border/70" />
                                  <p className="flex items-center gap-2 px-3 pb-1 pt-1.5 font-mono-label text-[9px] uppercase tracking-[.18em] text-muted-foreground">
                                    <RefreshCw className="h-3.5 w-3.5 text-accent" strokeWidth={1.7} />
                                    Reply in another tone
                                  </p>
                                  <div className="flex flex-wrap gap-1.5 px-1.5 pb-1.5">
                                    {[
                                      { label: 'Warmer', instruction: 'warmer and friendlier' },
                                      { label: 'Firmer', instruction: 'firmer and more direct' },
                                      { label: 'Shorter', instruction: 'much shorter and to the point' },
                                      { label: 'Formal', instruction: 'formal and professional' },
                                    ].map((tone) => (
                                      <button
                                        key={tone.label}
                                        type="button"
                                        disabled={isRewriting}
                                        onClick={() => { setMenuOpen(false); void rewriteReply(tone.instruction); }}
                                        data-testid={`button-tone-${tone.label.toLowerCase()}`}
                                        className="rounded-lg border border-border/90 px-2.5 py-1.5 text-[11px] font-semibold text-foreground transition-colors hover:border-primary/40 hover:text-primary disabled:cursor-wait disabled:opacity-60"
                                      >
                                        {tone.label}
                                      </button>
                                    ))}
                                    {isRewriting && <span className="flex items-center text-[11px] text-muted-foreground">Rewriting...</span>}
                                  </div>
                                </>
                              )}
                            </>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                  <FollowUpChat
                    messages={chatMessages}
                    input={chatInput}
                    onInputChange={setChatInput}
                    onSend={() => void sendChat()}
                    isSending={isChatting}
                    error={chatError}
                    language={analysisLanguage}
                  />
                                    {(deepResult || isDeepening) && (
                    <div className="luminous-panel rounded-[18px] p-5 sm:p-6" data-testid="container-deep">
                    <div className="flex items-center gap-2 text-accent">
                      <ScrollText className="h-4 w-4" strokeWidth={1.7} />
                      <h2 className="font-mono-label text-[9px] uppercase tracking-[.18em]">Detailed explanation</h2>
                    </div>
                    {isDeepening && !deepResult && (
                      <p className="mt-4 flex items-center gap-2.5 text-sm text-muted-foreground" aria-live="polite">
                        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
                        Preparing...
                      </p>
                    )}
                    {deepResult && (
                      <div className="mt-4 space-y-5">
                        <p className="text-sm leading-6 text-foreground">{deepResult.overview}</p>
                        <div className="space-y-3">
                          {deepResult.points.map((point, index) => (
                            <div key={index} className="rounded-xl border border-border/70 bg-background/35 px-4 py-3.5">
                              <h3 className="text-sm font-semibold text-foreground">{point.title}</h3>
                              <p className="mt-1 text-sm leading-6 text-muted-foreground">{point.detail}</p>
                              {point.evidence && (
                                <blockquote className="mt-2 border-l-2 border-primary/50 pl-3 text-sm italic leading-6 text-foreground/85">“{point.evidence}”</blockquote>
                              )}
                            </div>
                          ))}
                        </div>
                        <div>
                          <h3 className="font-mono-label text-[9px] uppercase tracking-[.18em] text-accent">Sender tone and intent</h3>
                          <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{deepResult.senderTone}</p>
                        </div>
                        {deepResult.hiddenMeanings.length > 0 && (
                          <div>
                            <h3 className="font-mono-label text-[9px] uppercase tracking-[.18em] text-accent">Between the lines</h3>
                            <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm leading-6 text-muted-foreground">
                              {deepResult.hiddenMeanings.map((item, index) => (
                                <li key={index}>{item}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {deepResult.hardWords.length > 0 && (
                          <div>
                            <h3 className="font-mono-label text-[9px] uppercase tracking-[.18em] text-accent">Hard words</h3>
                            <ul className="mt-1.5 space-y-1 text-sm leading-6 text-muted-foreground">
                              {deepResult.hardWords.map((item, index) => (
                                <li key={index}>
                                  <span className="font-semibold text-foreground">{item.word}</span> — {item.meaning}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {deepResult.ambiguities.length > 0 && (
                          <div>
                            <h3 className="font-mono-label text-[9px] uppercase tracking-[.18em] text-accent">Could mean two things</h3>
                            <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm leading-6 text-muted-foreground">
                              {deepResult.ambiguities.map((item, index) => (
                                <li key={index}>{item}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  )}
                 
                </div>
              )}
      
                            {!isAnalyzing && view === 'empty' && !analysis && (
                <div className="space-y-3">
                  <EmptyState />
                  {history.length > 0 && <HistoryPanel history={history} onRestore={restoreRead} onDelete={deleteRead} />}    
                   
                </div>
              )}
              
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
  
      const [copiedOption, setCopiedOption] = useState<number | null>(null);

  const copyOption = async (text: string, index: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedOption(index);
      window.setTimeout(() => setCopiedOption(null), 1800);
    } catch {
      setCopiedOption(null);
    }
  };
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
      {analysis.risk && (
        <article
          className={
            analysis.risk.level === 'high'
              ? 'rounded-[18px] border border-destructive/40 bg-destructive/[.08] p-5 sm:p-6'
              : analysis.risk.level === 'medium'
                ? 'rounded-[18px] border border-accent/40 bg-accent/[.08] p-5 sm:p-6'
                : 'rounded-[18px] border border-primary/30 bg-primary/[.06] p-5 sm:p-6'
          }
          data-testid="container-risk"
        >
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4" strokeWidth={1.7} />
            <h2 className="font-mono-label text-[9px] uppercase tracking-[.18em]">
              Scam risk / {analysis.risk.level}
            </h2>
          </div>
          <ul className="mt-4 space-y-2.5" data-testid="list-risk-signals">
            {analysis.risk.signals.map((signal, index) => (
              <li key={`${signal}-${index}`} className="flex gap-3 text-sm leading-6 text-foreground">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-70" />
                <span>{signal}</span>
              </li>
            ))}
          </ul>
        </article>
      )}
      
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
            {analysis.replyOptions && analysis.replyOptions.length > 0 && (
        <article className="luminous-panel rounded-[18px] p-5 sm:p-6" data-testid="container-reply-options">
          <div className="flex items-center gap-2 text-accent">
            <MessageSquareText className="h-4 w-4" strokeWidth={1.7} />
            <h2 className="font-mono-label text-[9px] uppercase tracking-[.18em]">More ways to say it</h2>
          </div>
          <div className="mt-5 space-y-3">
            {analysis.replyOptions.map((option, index) => (
              <div key={`${option.tone}-${index}`} className="rounded-xl border border-border/70 bg-background/35 px-4 py-3.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-mono-label text-[9px] uppercase tracking-[.12em] text-accent">{option.tone}</span>
                  <button type="button" onClick={() => void copyOption(option.text, index)} data-testid={`button-copy-option-${index}`} className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-[10px] font-semibold text-foreground transition-colors hover:border-primary/40 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    {copiedOption === index ? <Check className="h-3 w-3" strokeWidth={2.2} /> : <Clipboard className="h-3 w-3" strokeWidth={1.8} />}
                    {copiedOption === index ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <p className="mt-2.5 text-sm leading-6 text-foreground">{option.text}</p>
              </div>
            ))}
          </div>
        </article>
      )}
    </div>
  );
}
function HistoryPanel({
  history,
  onRestore,
  onDelete,
}: {
  history: SavedRead[];
  onRestore: (entry: SavedRead) => void;
  onDelete: (id: number) => void;
}) {
  return (
    <article className="luminous-panel rounded-[20px] p-5 sm:p-7" data-testid="container-history">
      <div className="flex items-center gap-2 text-accent">
        <History className="h-4 w-4" strokeWidth={1.7} />
        <h2 className="font-mono-label text-[9px] uppercase tracking-[.18em]">My past reads</h2>
      </div>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">Saved on this device only. Tap one to reopen it.</p>
      <div className="mt-4 space-y-2">
        {history.map((entry) => (
          <div key={entry.id} className="group flex items-center gap-2 rounded-xl border border-border/70 bg-background/35 px-3.5 py-3 transition-colors hover:border-primary/30">
            <button type="button" onClick={() => onRestore(entry)} data-testid={`button-history-${entry.id}`} className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <span className="block truncate text-sm font-medium text-foreground">{entry.analysis.summary}</span>
              <span className="mt-0.5 block font-mono-label text-[9px] uppercase tracking-[.1em] text-muted-foreground">
                {new Date(entry.at).toLocaleDateString()} / {entry.mode} / {entry.language}
              </span>
            </button>
            <button type="button" onClick={() => onDelete(entry.id)} data-testid={`button-history-delete-${entry.id}`} aria-label="Delete this saved read" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <X className="h-4 w-4" strokeWidth={1.7} />
            </button>
          </div>
        ))}
      </div>
    </article>
  );
}

function FollowUpChat({
  messages,
  input,
  onInputChange,
  onSend,
  isSending,
  error,
  language,
}: {
  messages: LumenChatMessage[];
  input: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
  isSending: boolean;
  error: string;
  language: LumenLanguage;
}) {
  const handleChatSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSend();
  };

  return (
    <article className="luminous-panel rounded-[18px] p-5 sm:p-6" dir={language === 'ar' ? 'rtl' : 'ltr'} data-testid="container-follow-up-chat">
      <div className="flex items-center gap-2 text-accent">
        <MessageSquareText className="h-4 w-4" strokeWidth={1.7} />
        <h2 className="font-mono-label text-[9px] uppercase tracking-[.18em]">Follow-up</h2>
      </div>
      <p dir="ltr" className="mt-3 text-left text-sm leading-6 text-muted-foreground">Ask a follow-up about this read — Lumen remembers the message and the analysis.</p>

      {messages.length > 0 && (
        <div className="mt-5 space-y-2.5" data-testid="list-chat-messages">
          {messages.map((message, index) => (
            <div
              key={`${message.role}-${index}`}
              className={
                message.role === 'user'
                  ? 'rounded-xl border border-primary/20 bg-primary/[.07] px-3.5 py-3 text-sm leading-6 text-foreground'
                  : 'rounded-xl border border-border/70 bg-background/35 px-3.5 py-3 text-sm leading-6 text-foreground'
              }
            >
              <span className="mb-1.5 block font-mono-label text-[8px] uppercase tracking-[.16em] text-muted-foreground">
                {message.role === 'user' ? 'You' : 'Lumen'}
              </span>
              <span className="whitespace-pre-wrap" dir="auto">{message.text}</span>
            </div>
          ))}
          {isSending && (
            <div className="flex items-center gap-2.5 rounded-xl border border-border/70 bg-background/35 px-3.5 py-3 text-sm text-muted-foreground" aria-live="polite">
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
              Lumen is thinking...
            </div>
          )}
        </div>
      )}

      {error && (
        <p className="mt-4 text-sm leading-6 text-destructive" role="alert" data-testid="status-chat-error">{error}</p>
      )}

      <form onSubmit={handleChatSubmit} className="mt-5 flex items-center gap-2">
        <input
          type="text"
          value={input}
          onChange={(event) => onInputChange(event.target.value)}
          data-testid="input-chat-message" dir="ltr"
          placeholder="Ask a follow-up..."
          maxLength={4000}
          className="h-11 min-w-0 flex-1 rounded-lg border border-border/90 bg-background/40 px-3.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/55 focus:border-primary/50"
        />
        <button type="submit" disabled={isSending || !input.trim()} data-testid="button-send-chat" aria-label="Send follow-up question" className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground transition-all duration-200 hover:-translate-y-0.5 hover:bg-primary/90 active:translate-y-0 active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0">
          <Send className="h-4 w-4" strokeWidth={1.9} />
        </button>
      </form>
    </article>
  );
}
const SUPPORT_INTRO: Record<LumenLanguage, string> = {
  ar: 'هذه مساحة هادئة للكلام على ما بداخلك. أنا مساعد دعم داخل التطبيق: أسمعك، وأساعدك ترتب أفكارك وتفرق بين الحقائق والمخاوف، وترجع لتوازنك. أنا لست طبيباً ولا معالجاً، ولا أشخّص ولا أعالج — وإذا كان ما تمر به ثقيلاً أو مستمراً، فالمختص الحقيقي هو الباب الصحيح.',
  en: 'A calm space to talk through what is on your mind. I am a support companion inside this app: I listen, help you organize your thoughts, separate facts from fears, and find your balance again. I am not a doctor or a therapist — I do not diagnose or treat. If what you are carrying feels heavy or lasting, a real professional is the right door.',
  tr: 'Zihnindekileri konuşmak için sakin bir alan. Ben bu uygulamanın içindeki bir destek arkadaşıyım: seni dinlerim, düşüncelerini düzenlemene, gerçekleri korkulardan ayırmana ve dengeni yeniden bulmana yardım ederim. Doktor ya da terapist değilim; tanı koymam, tedavi önermem. Taşıdığın şey ağır ya da kalıcı geliyorsa, doğru kapı gerçek bir uzmandır.',
  de: 'Ein ruhiger Raum, um auszusprechen, was dich beschäftigt. Ich bin ein Begleiter zur Unterstützung in dieser App: Ich höre zu, helfe dir, deine Gedanken zu ordnen, Fakten von Ängsten zu trennen und dein Gleichgewicht wiederzufinden. Ich bin kein Arzt und kein Therapeut — ich stelle keine Diagnosen und behandle nicht. Wenn das, was du trägst, schwer oder anhaltend ist, ist ein echter Fachmann die richtige Tür.',
  pt: 'Um espaço calmo para falar do que vai na sua mente. Sou um companheiro de apoio dentro desta aplicação: ouço-o, ajudo-o a organizar os pensamentos, a separar factos de medos e a reencontrar o equilíbrio. Não sou médico nem terapeuta — não faço diagnósticos nem tratamentos. Se o que carrega parecer pesado ou duradouro, um profissional a sério é a porta certa.',
};

function StudyDoor({
  problem,
  imageData,
  imageName,
  result,
  error,
  isSolving,
  isProcessing,
  onProblemChange,
  onFileChange,
  onAnalyze,
  language,
}: {
  problem: string;
  imageData: string | null;
  imageName: string;
  result: LumenStudyRead | null;
  error: string;
  isSolving: boolean;
  isProcessing: boolean;
  onProblemChange: (value: string) => void;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onAnalyze: () => void;
  language: LumenLanguage;
}) {
  const studyFileRef = useRef<HTMLInputElement>(null);

  return (
    <article className="luminous-panel rounded-[18px] p-5 sm:p-6" dir={language === 'ar' ? 'rtl' : 'ltr'} data-testid="container-study-door">
      <div className="flex items-center gap-2 text-accent">
        <GraduationCap className="h-4 w-4" strokeWidth={1.7} />
        <h2 className="font-mono-label text-[9px] uppercase tracking-[.18em]">Your study</h2>
      </div>
      <p dir="ltr" className="mt-3 text-left text-sm leading-6 text-muted-foreground">Write a mathematics or physics problem, or photograph it. I solve it step by step — formula, substitution, result — then verify my own answer.</p>

      <textarea
        value={problem}
        onChange={(event) => onProblemChange(event.target.value)}
        data-testid="input-study-problem" dir="ltr"
        placeholder="Write your problem here..."
        maxLength={20000}
        rows={4}
        className="mt-5 w-full resize-y rounded-lg border border-border/90 bg-background/40 px-3.5 py-3 text-sm leading-6 text-foreground outline-none transition-colors placeholder:text-muted-foreground/55 focus:border-primary/50"
      />

      <input ref={studyFileRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={onFileChange} className="hidden" data-testid="input-study-image-file" />
      <button type="button" onClick={() => studyFileRef.current?.click()} disabled={isProcessing} data-testid="button-study-choose-image" className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border px-4 py-3 text-sm font-medium text-foreground transition-colors hover:bg-secondary disabled:cursor-wait disabled:opacity-60">
        <ImagePlus className="h-4 w-4 text-accent" strokeWidth={1.7} />
        {isProcessing ? 'Preparing...' : imageName ? imageName : 'Attach a photo of the problem (optional)'}
      </button>

      {imageData && (
        <img src={imageData} alt="The problem you shared" className="mt-4 max-h-64 w-full rounded-xl border border-border/70 object-contain" data-testid="img-study-preview" />
      )}

      <button type="button" onClick={onAnalyze} disabled={(!problem.trim() && !imageData) || isSolving || isProcessing} data-testid="button-study-analyze" className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-xs font-bold uppercase tracking-[.04em] text-primary-foreground transition-all duration-200 hover:-translate-y-0.5 hover:bg-primary/90 active:translate-y-0 active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0">
        {isSolving ? (
          <>
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
            Solving
          </>
        ) : (
          <>
            <GraduationCap className="h-4 w-4" strokeWidth={1.9} />
            Solve it
          </>
        )}
      </button>

      {error && (
        <p className="mt-4 text-sm leading-6 text-destructive" role="alert" data-testid="status-study-error">{error}</p>
      )}

      {result && (
        <div className="mt-5 space-y-3" data-testid="container-study-result">
          <div>
            <h3 className="font-mono-label text-[9px] uppercase tracking-[.18em] text-accent">Subject</h3>
            <p className="mt-1.5 text-sm font-medium leading-6 text-foreground" dir="auto">{result.subject}</p>
          </div>
          {result.givens.length > 0 && (
            <div>
              <h3 className="font-mono-label text-[9px] uppercase tracking-[.18em] text-accent">The givens</h3>
              <ul className="mt-1.5 space-y-1.5">
                {result.givens.map((given, index) => (
                  <li key={index} className="text-sm leading-6 text-muted-foreground" dir="auto">• {given}</li>
                ))}
              </ul>
            </div>
          )}
          <div>
            <h3 className="font-mono-label text-[9px] uppercase tracking-[.18em] text-accent">The steps</h3>
            <ol className="mt-1.5 space-y-3">
              {result.steps.map((step, index) => (
                <li key={index} className="rounded-xl border border-border/70 bg-background/40 px-4 py-3.5">
                  <p className="text-sm font-semibold leading-6 text-foreground" dir="auto">{index + 1}. {step.title}</p>
                  <p className="mt-1 text-sm leading-6 text-foreground" dir="auto">{step.work}</p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground" dir="auto">{step.why}</p>
                </li>
              ))}
            </ol>
          </div>
          <div className="rounded-xl border border-primary/25 bg-primary/[.06] px-4 py-3.5">
            <h3 className="font-mono-label text-[9px] uppercase tracking-[.18em] text-accent">The final answer</h3>
            <p className="mt-1.5 text-sm font-semibold leading-6 text-foreground" dir="auto">{result.finalAnswer}</p>
          </div>
          {result.check && (
            <div>
              <h3 className="font-mono-label text-[9px] uppercase tracking-[.18em] text-accent">How I checked it</h3>
              <p className="mt-1.5 text-sm leading-6 text-muted-foreground" dir="auto">{result.check}</p>
            </div>
          )}
          {result.watchOut && (
            <div>
              <h3 className="font-mono-label text-[9px] uppercase tracking-[.18em] text-accent">Watch out</h3>
              <p className="mt-1.5 text-sm leading-6 text-muted-foreground" dir="auto">{result.watchOut}</p>
            </div>
          )}
        </div>
      )}
    </article>
  );
}


function ResearchDoor({
  question,
  result,
  error,
  isResearching,
  onQuestionChange,
  onAnalyze,
  language,
}: {
  question: string;
  result: LumenResearchResult | null;
  error: string;
  isResearching: boolean;
  onQuestionChange: (value: string) => void;
  onAnalyze: () => void;
  language: LumenLanguage;
}) {
  return (
    <article className="luminous-panel rounded-[18px] p-5 sm:p-6" dir={language === 'ar' ? 'rtl' : 'ltr'} data-testid="container-research-door">
      <div className="flex items-center gap-2 text-accent">
        <Search className="h-4 w-4" strokeWidth={1.7} />
        <h2 className="font-mono-label text-[9px] uppercase tracking-[.18em]">Your research</h2>
      </div>
      <p dir="ltr" className="mt-3 text-left text-sm leading-6 text-muted-foreground">Ask anything and I research it on the web: a detailed answer with the evidence and the sources named, so you can check everything yourself.</p>

      <textarea
        value={question}
        onChange={(event) => onQuestionChange(event.target.value)}
        data-testid="input-research-question" dir="ltr"
        placeholder="What do you want to research?"
        maxLength={4000}
        rows={3}
        className="mt-5 w-full resize-y rounded-lg border border-border/90 bg-background/40 px-3.5 py-3 text-sm leading-6 text-foreground outline-none transition-colors placeholder:text-muted-foreground/55 focus:border-primary/50"
      />

      <button type="button" onClick={onAnalyze} disabled={!question.trim() || isResearching} data-testid="button-research-analyze" className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-xs font-bold uppercase tracking-[.04em] text-primary-foreground transition-all duration-200 hover:-translate-y-0.5 hover:bg-primary/90 active:translate-y-0 active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0">
        {isResearching ? (
          <>
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
            Researching
          </>
        ) : (
          <>
            <Search className="h-4 w-4" strokeWidth={1.9} />
            Research it
          </>
        )}
      </button>

      {error && (
        <p className="mt-4 text-sm leading-6 text-destructive" role="alert" data-testid="status-research-error">{error}</p>
      )}

      {result && (
        <div className="mt-5 space-y-3" data-testid="container-research-result">
          <div>
            <h3 className="font-mono-label text-[9px] uppercase tracking-[.18em] text-accent">The answer</h3>
            <p className="mt-1.5 whitespace-pre-wrap text-sm leading-6 text-foreground" dir="auto">{result.answer}</p>
          </div>
          {result.sources.length > 0 && (
            <div>
              <h3 className="font-mono-label text-[9px] uppercase tracking-[.18em] text-accent">Sources</h3>
              <ul className="mt-1.5 space-y-1.5">
                {result.sources.map((source, index) => (
                  <li key={index} className="text-sm leading-6">
                    <a href={source.uri} target="_blank" rel="noreferrer" className="text-primary underline decoration-primary/40 underline-offset-2 transition-colors hover:decoration-primary" dir="auto">{source.title}</a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </article>
  );
}


function AdvisorDoor({
  situation,
  result,
  error,
  isAdvising,
  onSituationChange,
  onAnalyze,
  language,
}: {
  situation: string;
  result: LumenAdvisorRead | null;
  error: string;
  isAdvising: boolean;
  onSituationChange: (value: string) => void;
  onAnalyze: () => void;
  language: LumenLanguage;
}) {
  return (
    <article className="luminous-panel rounded-[18px] p-5 sm:p-6" dir={language === 'ar' ? 'rtl' : 'ltr'} data-testid="container-advisor-door">
      <div className="flex items-center gap-2 text-accent">
        <Compass className="h-4 w-4" strokeWidth={1.7} />
        <h2 className="font-mono-label text-[9px] uppercase tracking-[.18em]">Your genius advisor</h2>
      </div>
      <p dir="ltr" className="mt-3 text-left text-sm leading-6 text-muted-foreground">Describe your situation or the decision in front of you. I give you one clear verdict, the action to take, and the exact words when someone else is involved.</p>

      <textarea
        value={situation}
        onChange={(event) => onSituationChange(event.target.value)}
        data-testid="input-advisor-situation" dir="ltr"
        placeholder="My situation is..."
        maxLength={20000}
        rows={4}
        className="mt-5 w-full resize-y rounded-lg border border-border/90 bg-background/40 px-3.5 py-3 text-sm leading-6 text-foreground outline-none transition-colors placeholder:text-muted-foreground/55 focus:border-primary/50"
      />

      <button type="button" onClick={onAnalyze} disabled={!situation.trim() || isAdvising} data-testid="button-advisor-analyze" className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-xs font-bold uppercase tracking-[.04em] text-primary-foreground transition-all duration-200 hover:-translate-y-0.5 hover:bg-primary/90 active:translate-y-0 active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0">
        {isAdvising ? (
          <>
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
            Thinking
          </>
        ) : (
          <>
            <Compass className="h-4 w-4" strokeWidth={1.9} />
            Advise me
          </>
        )}
      </button>

      {error && (
        <p className="mt-4 text-sm leading-6 text-destructive" role="alert" data-testid="status-advisor-error">{error}</p>
      )}

      {result && (
        <div className="mt-5 space-y-3" data-testid="container-advisor-result">
          <div className="rounded-xl border border-primary/25 bg-primary/[.06] px-4 py-3.5">
            <h3 className="font-mono-label text-[9px] uppercase tracking-[.18em] text-accent">The verdict</h3>
            <p className="mt-1.5 text-sm font-semibold leading-6 text-foreground" dir="auto">{result.verdict}</p>
          </div>
          <div>
            <h3 className="font-mono-label text-[9px] uppercase tracking-[.18em] text-accent">Why</h3>
            <ul className="mt-1.5 space-y-1.5">
              {result.why.map((reason, index) => (
                <li key={index} className="text-sm leading-6 text-muted-foreground" dir="auto">• {reason}</li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="font-mono-label text-[9px] uppercase tracking-[.18em] text-accent">Your one action</h3>
            <p className="mt-1.5 text-sm font-medium leading-6 text-foreground" dir="auto">{result.theAction}</p>
          </div>
          {result.exactWords && (
            <div>
              <h3 className="font-mono-label text-[9px] uppercase tracking-[.18em] text-accent">Say exactly this</h3>
              <p className="mt-1.5 rounded-lg border border-border/70 bg-background/40 px-3.5 py-3 text-sm leading-6 text-foreground" dir="auto">“{result.exactWords}”</p>
            </div>
          )}
          <div>
            <h3 className="font-mono-label text-[9px] uppercase tracking-[.18em] text-accent">Avoid</h3>
            <ul className="mt-1.5 space-y-1.5">
              {result.avoid.map((item, index) => (
                <li key={index} className="text-sm leading-6 text-muted-foreground" dir="auto">• {item}</li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="font-mono-label text-[9px] uppercase tracking-[.18em] text-accent">If you do nothing</h3>
            <p className="mt-1.5 text-sm leading-6 text-muted-foreground" dir="auto">{result.costOfWaiting}</p>
          </div>
        </div>
      )}
    </article>
  );
}


function ShieldDoor({
  text,
  imageData,
  imageName,
  result,
  error,
  isReading,
  isProcessing,
  onTextChange,
  onFileChange,
  onAnalyze,
  language,
}: {
  text: string;
  imageData: string | null;
  imageName: string;
  result: LumenShieldRead | null;
  error: string;
  isReading: boolean;
  isProcessing: boolean;
  onTextChange: (value: string) => void;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onAnalyze: () => void;
  language: LumenLanguage;
}) {
  const shieldFileRef = useRef<HTMLInputElement>(null);

  return (
    <article className="luminous-panel rounded-[18px] p-5 sm:p-6" dir={language === 'ar' ? 'rtl' : 'ltr'} data-testid="container-shield-door">
      <div className="flex items-center gap-2 text-accent">
        <ShieldAlert className="h-4 w-4" strokeWidth={1.7} />
        <h2 className="font-mono-label text-[9px] uppercase tracking-[.18em]">Your shield</h2>
      </div>
      <p dir="ltr" className="mt-3 text-left text-sm leading-6 text-muted-foreground">Paste any message, offer, or account — or attach a screenshot — and I check it for scam, fraud, and manipulation before you act.</p>

      <textarea
        value={text}
        onChange={(event) => onTextChange(event.target.value)}
        data-testid="input-shield-text" dir="ltr"
        placeholder="Paste the message, offer, or account details here..."
        maxLength={20000}
        rows={4}
        className="mt-5 w-full resize-y rounded-lg border border-border/90 bg-background/40 px-3.5 py-3 text-sm leading-6 text-foreground outline-none transition-colors placeholder:text-muted-foreground/55 focus:border-primary/50"
      />

      <input ref={shieldFileRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={onFileChange} className="hidden" data-testid="input-shield-image-file" />
      <button type="button" onClick={() => shieldFileRef.current?.click()} disabled={isProcessing} data-testid="button-shield-choose-image" className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border px-4 py-3 text-sm font-medium text-foreground transition-colors hover:bg-secondary disabled:cursor-wait disabled:opacity-60">
        <ImagePlus className="h-4 w-4 text-accent" strokeWidth={1.7} />
        {isProcessing ? 'Preparing...' : imageName ? imageName : 'Attach a screenshot (optional)'}
      </button>

      {imageData && (
        <img src={imageData} alt="The screenshot you shared" className="mt-4 max-h-64 w-full rounded-xl border border-border/70 object-contain" data-testid="img-shield-preview" />
      )}

      <button type="button" onClick={onAnalyze} disabled={(!text.trim() && !imageData) || isReading || isProcessing} data-testid="button-shield-analyze" className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-xs font-bold uppercase tracking-[.04em] text-primary-foreground transition-all duration-200 hover:-translate-y-0.5 hover:bg-primary/90 active:translate-y-0 active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0">
        {isReading ? (
          <>
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
            Checking
          </>
        ) : (
          <>
            <ShieldAlert className="h-4 w-4" strokeWidth={1.9} />
            Check this
          </>
        )}
      </button>

      {error && (
        <p className="mt-4 text-sm leading-6 text-destructive" role="alert" data-testid="status-shield-error">{error}</p>
      )}

      {result && (
        <div className="mt-5 space-y-3" data-testid="container-shield-result">
          <div
            className={
              result.riskLevel === 'high'
                ? 'rounded-xl border border-destructive/40 bg-destructive/[.08] px-4 py-3.5'
                : result.riskLevel === 'medium'
                  ? 'rounded-xl border border-accent/40 bg-accent/[.08] px-4 py-3.5'
                  : 'rounded-xl border border-primary/30 bg-primary/[.06] px-4 py-3.5'
            }
          >
            <h3 className="font-mono-label text-[9px] uppercase tracking-[.18em] text-accent">Risk / {result.riskLevel}</h3>
            <p className="mt-1.5 text-sm font-semibold leading-6 text-foreground" dir="auto">{result.verdict}</p>
          </div>
          <div>
            <h3 className="font-mono-label text-[9px] uppercase tracking-[.18em] text-accent">What kind</h3>
            <p className="mt-1.5 text-sm font-medium leading-6 text-foreground" dir="auto">{result.kind}</p>
          </div>
          {result.signals.length > 0 && (
            <div>
              <h3 className="font-mono-label text-[9px] uppercase tracking-[.18em] text-accent">Warning signs</h3>
              <ul className="mt-1.5 space-y-1.5">
                {result.signals.map((signal, index) => (
                  <li key={index} className="text-sm leading-6 text-muted-foreground" dir="auto">• {signal}</li>
                ))}
              </ul>
            </div>
          )}
          {result.evidence.length > 0 && (
            <div>
              <h3 className="font-mono-label text-[9px] uppercase tracking-[.18em] text-accent">Evidence</h3>
              <ul className="mt-1.5 space-y-1.5">
                {result.evidence.map((item, index) => (
                  <li key={index} className="text-sm leading-6 text-muted-foreground" dir="auto">“{item}”</li>
                ))}
              </ul>
            </div>
          )}
          <div>
            <h3 className="font-mono-label text-[9px] uppercase tracking-[.18em] text-accent">What to do</h3>
            <ul className="mt-1.5 space-y-1.5">
              {result.whatToDo.map((step, index) => (
                <li key={index} className="text-sm leading-6 text-muted-foreground" dir="auto">{index + 1}. {step}</li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="font-mono-label text-[9px] uppercase tracking-[.18em] text-accent">How to handle it</h3>
            <p className="mt-1.5 text-sm leading-6 text-muted-foreground" dir="auto">{result.howToHandle}</p>
          </div>
        </div>
      )}
    </article>
  );
}

      function ImageDoor({
  imageData,
  imageName,
  question,
  result,
  error,
  isReading,
  isProcessing,
  onFileChange,
  onQuestionChange,
  onAnalyze,
  language,
}: {
  imageData: string | null;
  imageName: string;
  question: string;
  result: LumenImageRead | null;
  error: string;
  isReading: boolean;
  isProcessing: boolean;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onQuestionChange: (value: string) => void;
  onAnalyze: () => void;
  language: LumenLanguage;
}) {
  const doorFileRef = useRef<HTMLInputElement>(null);

  return (
    <article className="luminous-panel rounded-[18px] p-5 sm:p-6" dir={language === 'ar' ? 'rtl' : 'ltr'} data-testid="container-image-door">
      <div className="flex items-center gap-2 text-accent">
        <ScanEye className="h-4 w-4" strokeWidth={1.7} />
        <h2 className="font-mono-label text-[9px] uppercase tracking-[.18em]">Your image</h2>
      </div>
      <p dir="ltr" className="mt-3 text-left text-sm leading-6 text-muted-foreground">Bring any image — a screenshot, an offer, a document, a product. I tell you what it is, give you the final verdict, and show you how to handle it.</p>

      <input ref={doorFileRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={onFileChange} className="hidden" data-testid="input-door-image-file" />
      <button type="button" onClick={() => doorFileRef.current?.click()} disabled={isProcessing} data-testid="button-door-choose-image" className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border px-4 py-3.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary disabled:cursor-wait disabled:opacity-60">
        <ImagePlus className="h-4 w-4 text-accent" strokeWidth={1.7} />
        {isProcessing ? 'Preparing...' : imageName ? imageName : 'Choose an image'}
      </button>

      {imageData && (
        <img src={imageData} alt="The image you shared" className="mt-4 max-h-64 w-full rounded-xl border border-border/70 object-contain" data-testid="img-door-preview" />
      )}

      <input
        type="text"
        value={question}
        onChange={(event) => onQuestionChange(event.target.value)}
        data-testid="input-door-question" dir="ltr"
        placeholder="Anything specific? (optional)"
        maxLength={2000}
        className="mt-4 h-11 w-full rounded-lg border border-border/90 bg-background/40 px-3.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/55 focus:border-primary/50"
      />

      <button type="button" onClick={onAnalyze} disabled={!imageData || isReading || isProcessing} data-testid="button-door-analyze" className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-xs font-bold uppercase tracking-[.04em] text-primary-foreground transition-all duration-200 hover:-translate-y-0.5 hover:bg-primary/90 active:translate-y-0 active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0">
        {isReading ? (
          <>
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
            Reading
          </>
        ) : (
          <>
            <ScanEye className="h-4 w-4" strokeWidth={1.9} />
            Read this image
          </>
        )}
      </button>

      {error && (
        <p className="mt-4 text-sm leading-6 text-destructive" role="alert" data-testid="status-door-error">{error}</p>
      )}

      {result && (
        <div className="mt-5 space-y-3" data-testid="container-door-result">
          <div>
            <h3 className="font-mono-label text-[9px] uppercase tracking-[.18em] text-accent">What it is</h3>
            <p className="mt-1.5 text-sm font-medium leading-6 text-foreground" dir="auto">{result.whatItIs}</p>
          </div>
          <div>
            <h3 className="font-mono-label text-[9px] uppercase tracking-[.18em] text-accent">Details</h3>
            <ul className="mt-1.5 space-y-1.5">
              {result.details.map((detail, index) => (
                <li key={index} className="text-sm leading-6 text-muted-foreground" dir="auto">• {detail}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl border border-primary/25 bg-primary/[.06] px-4 py-3.5">
            <h3 className="font-mono-label text-[9px] uppercase tracking-[.18em] text-accent">The verdict</h3>
            <p className="mt-1.5 text-sm font-semibold leading-6 text-foreground" dir="auto">{result.verdict}</p>
          </div>
          <div>
            <h3 className="font-mono-label text-[9px] uppercase tracking-[.18em] text-accent">What to do</h3>
            <ul className="mt-1.5 space-y-1.5">
              {result.whatToDo.map((step, index) => (
                <li key={index} className="text-sm leading-6 text-muted-foreground" dir="auto">{index + 1}. {step}</li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="font-mono-label text-[9px] uppercase tracking-[.18em] text-accent">How to handle it</h3>
            <p className="mt-1.5 text-sm leading-6 text-muted-foreground" dir="auto">{result.howToHandle}</p>
          </div>
        </div>
      )}
    </article>
  );
}

function GeneralChat({
  messages,
  input,
  onInputChange,
  onSend,
  isSending,
  error,
  language,
}: {
  messages: LumenChatMessage[];
  input: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
  isSending: boolean;
  error: string;
  language: LumenLanguage;
}) {
  const handleTalkSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSend();
  };

  return (
    <article className="luminous-panel rounded-[18px] p-5 sm:p-6" dir={language === 'ar' ? 'rtl' : 'ltr'} data-testid="container-general-chat">
      <div className="flex items-center gap-2 text-accent">
        <MessageSquareText className="h-4 w-4" strokeWidth={1.7} />
        <h2 className="font-mono-label text-[9px] uppercase tracking-[.18em]">Your chat</h2>
      </div>
      <p dir="ltr" className="mt-3 text-left text-sm leading-6 text-muted-foreground">Ask me anything — a question, an idea, a draft, a decision. I answer here, in your language.</p>

      {messages.length > 0 && (
        <div className="mt-5 space-y-2.5" data-testid="list-talk-messages">
          {messages.map((message, index) => (
            <div
              key={`${message.role}-${index}`}
              className={
                message.role === 'user'
                  ? 'rounded-xl border border-primary/20 bg-primary/[.07] px-3.5 py-3 text-sm leading-6 text-foreground'
                  : 'rounded-xl border border-border/70 bg-background/35 px-3.5 py-3 text-sm leading-6 text-foreground'
              }
            >
              <span className="mb-1.5 block font-mono-label text-[8px] uppercase tracking-[.16em] text-muted-foreground">
                {message.role === 'user' ? 'You' : 'Lumen'}
              </span>
              <span className="whitespace-pre-wrap" dir="auto">{message.text}</span>
            </div>
          ))}
          {isSending && (
            <div className="flex items-center gap-2.5 rounded-xl border border-border/70 bg-background/35 px-3.5 py-3 text-sm text-muted-foreground" aria-live="polite">
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
              Lumen is thinking...
            </div>
          )}
        </div>
      )}

      {error && (
        <p className="mt-4 text-sm leading-6 text-destructive" role="alert" data-testid="status-talk-error">{error}</p>
      )}

      <form onSubmit={handleTalkSubmit} className="mt-5 flex items-center gap-2">
        <input
          type="text"
          value={input}
          onChange={(event) => onInputChange(event.target.value)}
          data-testid="input-talk-message" dir="ltr"
          placeholder="Ask anything..."
          maxLength={4000}
          className="h-11 min-w-0 flex-1 rounded-lg border border-border/90 bg-background/40 px-3.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/55 focus:border-primary/50"
        />
        <button type="submit" disabled={isSending || !input.trim()} data-testid="button-send-talk" aria-label="Send message" className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground transition-all duration-200 hover:-translate-y-0.5 hover:bg-primary/90 active:translate-y-0 active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0">
          <Send className="h-4 w-4" strokeWidth={1.9} />
        </button>
      </form>
    </article>
  );
}

                function SupportChat({
  messages,
  input,
  onInputChange,
  onSend,
  isSending,
  error,
  language,
}: {
  messages: LumenChatMessage[];
  input: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
  isSending: boolean;
  error: string;
  language: LumenLanguage;
}) {
  const handleSupportSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSend();
  };

  return (
    <article className="luminous-panel rounded-[18px] p-5 sm:p-6" dir={language === 'ar' ? 'rtl' : 'ltr'} data-testid="container-support-chat">
      <div className="flex items-center gap-2 text-accent">
        <Heart className="h-4 w-4" strokeWidth={1.7} />
        <h2 className="font-mono-label text-[9px] uppercase tracking-[.18em]">A calmer space</h2>
      </div>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">{SUPPORT_INTRO[language]}</p>

      {messages.length > 0 && (
        <div className="mt-5 space-y-2.5" data-testid="list-support-messages">
          {messages.map((message, index) => (
            <div
              key={`${message.role}-${index}`}
              className={
                message.role === 'user'
                  ? 'rounded-xl border border-primary/20 bg-primary/[.07] px-3.5 py-3 text-sm leading-6 text-foreground'
                  : 'rounded-xl border border-border/70 bg-background/35 px-3.5 py-3 text-sm leading-6 text-foreground'
              }
            >
              <span className="mb-1.5 block font-mono-label text-[8px] uppercase tracking-[.16em] text-muted-foreground">
                {message.role === 'user' ? 'You' : 'Lumen'}
              </span>
              <span className="whitespace-pre-wrap" dir="auto">{message.text}</span>
            </div>
          ))}
          {isSending && (
            <div className="flex items-center gap-2.5 rounded-xl border border-border/70 bg-background/35 px-3.5 py-3 text-sm text-muted-foreground" aria-live="polite">
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
              Lumen is listening...
            </div>
          )}
        </div>
      )}

      {error && (
        <p className="mt-4 text-sm leading-6 text-destructive" role="alert" data-testid="status-support-error">{error}</p>
      )}

      <form onSubmit={handleSupportSubmit} className="mt-5 flex items-center gap-2">
        <input
          type="text"
          value={input}
          onChange={(event) => onInputChange(event.target.value)}
          data-testid="input-support-message" dir="ltr"
          placeholder="Say what is on your mind..."
          maxLength={4000}
          className="h-11 min-w-0 flex-1 rounded-lg border border-border/90 bg-background/40 px-3.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/55 focus:border-primary/50"
        />
        <button type="submit" disabled={isSending || !input.trim()} data-testid="button-send-support" aria-label="Send to support" className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground transition-all duration-200 hover:-translate-y-0.5 hover:bg-primary/90 active:translate-y-0 active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0">
          <Send className="h-4 w-4" strokeWidth={1.9} />
        </button>
      </form>
    </article>
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
