import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Check,
  Copy,
  ExternalLink,
  Lightbulb,
  Mic,
  RotateCcw,
  Send,
  Sparkles,
  Square,
  Volume2,
} from 'lucide-react';
import type { ChatMessage, UserSettings } from '../types.ts';

interface ChatPanelProps {
  messages: ChatMessage[];
  streamingText: string;
  isGenerating: boolean;
  isRecording: boolean;
  isTranscribing: boolean;
  isSpeaking: boolean;
  isSynthesizingSpeech: boolean;
  speakingMessageId: string | null;
  settings: UserSettings;
  errorBanner: string | null;
  onDismissError: () => void;
  onSendMessage: (text: string) => Promise<void>;
  onStopGeneration: () => void;
  onRegenerateLast: () => Promise<void>;
  onToggleRecord: () => void;
  onSpeakMessage: (message: ChatMessage) => void;
  onStopSpeaking: () => void;
}

const STARTER_PROMPTS: ReadonlyArray<{ title: string; prompt: string }> = [
  {
    title: 'O‘zbekistondagi startaplar',
    prompt: 'Bugungi kunda O‘zbekistonda sun’iy intellekt va IT startap ekotizimi qanday rivojlanmoqda?',
  },
  {
    title: 'Dasturlash maslahati',
    prompt: 'TypeScript va React loyihasida holatni boshqarish bo‘yicha 5 ta eng muhim amaliy tavsiya ber.',
  },
  {
    title: 'Samarqand tarixi',
    prompt: 'Mirzo Ulug‘bek rasadxonasi va uning jahon ilm-faniga qo‘shgan hissasi haqida qisqacha so‘zlab ber.',
  },
  {
    title: 'Kunlik o‘qish rejasi',
    prompt: 'Kundalik 45 daqiqada ingliz tilini samarali o‘rganish uchun amaliy hafta rejasini tuzib ber.',
  },
];

function renderInlineFormatting(text: string): ReactNode[] {
  const tokens = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\(https?:\/\/[^)]+\))/g);
  return tokens.map((token, idx) => {
    if (token.startsWith('`') && token.endsWith('`') && token.length >= 2) {
      return (
        <code
          key={idx}
          className="font-mono text-[0.85em] px-1.5 py-0.5 rounded bg-slate-200/80 dark:bg-zinc-800 text-amber-700 dark:text-amber-300"
        >
          {token.slice(1, -1)}
        </code>
      );
    }
    if (token.startsWith('**') && token.endsWith('**') && token.length >= 4) {
      return (
        <strong key={idx} className="font-semibold text-slate-950 dark:text-white">
          {token.slice(2, -2)}
        </strong>
      );
    }
    const linkMatch = token.match(/^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/);
    if (linkMatch) {
      return (
        <a
          key={idx}
          href={linkMatch[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="underline decoration-amber-500/60 hover:text-amber-500 transition-colors"
        >
          {linkMatch[1]}
        </a>
      );
    }
    return <Fragment key={idx}>{token}</Fragment>;
  });
}

function FormattedMarkdown({ content }: { content: string }) {
  const [copiedCodeIdx, setCopiedCodeIdx] = useState<number | null>(null);
  const blocks = content.split(/(```[\s\S]*?```)/g);

  const handleCopyCode = async (code: string, idx: number) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCodeIdx(idx);
      setTimeout(() => setCopiedCodeIdx(null), 1600);
    } catch {
      // Clipboard unavailable
    }
  };

  return (
    <div className="space-y-2.5 text-[14.5px] leading-relaxed break-words">
      {blocks.map((block, blockIdx) => {
        if (block.startsWith('```') && block.endsWith('```')) {
          const inner = block.slice(3, -3);
          const firstNewline = inner.indexOf('\n');
          const lang = firstNewline >= 0 ? inner.slice(0, firstNewline).trim() : '';
          const code = firstNewline >= 0 ? inner.slice(firstNewline + 1) : inner;

          return (
            <div
              key={blockIdx}
              className="rounded-xl overflow-hidden border border-slate-200 dark:border-zinc-800 bg-slate-900 dark:bg-[#090a0f] text-slate-100"
            >
              <div className="flex items-center justify-between px-3 py-1.5 border-b border-zinc-800 text-[11px] font-mono text-zinc-400">
                <span>{lang || 'kod'}</span>
                <button
                  type="button"
                  onClick={() => void handleCopyCode(code, blockIdx)}
                  className="inline-flex items-center gap-1 hover:text-white cursor-pointer"
                >
                  {copiedCodeIdx === blockIdx ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-400" />
                      Nusxalandi
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      Nusxalash
                    </>
                  )}
                </button>
              </div>
              <pre className="p-3 overflow-x-auto text-xs font-mono leading-relaxed">
                <code>{code}</code>
              </pre>
            </div>
          );
        }

        const lines = block.split('\n');
        return (
          <div key={blockIdx} className="space-y-1.5">
            {lines.map((line, lineIdx) => {
              const trimmed = line.trim();
              if (!trimmed) {
                return <div key={lineIdx} className="h-1" />;
              }
              if (trimmed.startsWith('### ')) {
                return (
                  <h4 key={lineIdx} className="font-display font-bold text-base text-slate-900 dark:text-white pt-1">
                    {renderInlineFormatting(trimmed.slice(4))}
                  </h4>
                );
              }
              if (trimmed.startsWith('## ') || trimmed.startsWith('# ')) {
                const body = trimmed.replace(/^#{1,3}\s+/, '');
                return (
                  <h3 key={lineIdx} className="font-display font-bold text-[17px] text-slate-900 dark:text-white pt-1">
                    {renderInlineFormatting(body)}
                  </h3>
                );
              }
              if (/^[-*•]\s+/.test(trimmed)) {
                return (
                  <div key={lineIdx} className="flex items-start gap-2 pl-1 text-slate-800 dark:text-zinc-100">
                    <span className="text-amber-500 mt-1 text-xs">•</span>
                    <span className="flex-1">
                      {renderInlineFormatting(trimmed.replace(/^[-*•]\s+/, ''))}
                    </span>
                  </div>
                );
              }
              const orderedMatch = trimmed.match(/^(\d+\.)\s+(.+)$/);
              if (orderedMatch) {
                return (
                  <div key={lineIdx} className="flex items-start gap-2 pl-1 text-slate-800 dark:text-zinc-100">
                    <span className="font-mono text-xs text-amber-500 mt-1 shrink-0">
                      {orderedMatch[1]}
                    </span>
                    <span className="flex-1">{renderInlineFormatting(orderedMatch[2])}</span>
                  </div>
                );
              }
              return (
                <p key={lineIdx} className="text-slate-800 dark:text-zinc-100">
                  {renderInlineFormatting(line)}
                </p>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

export function ChatPanel({
  messages,
  streamingText,
  isGenerating,
  isRecording,
  isTranscribing,
  isSpeaking,
  isSynthesizingSpeech,
  speakingMessageId,
  settings,
  errorBanner,
  onDismissError,
  onSendMessage,
  onStopGeneration,
  onRegenerateLast,
  onToggleRecord,
  onSpeakMessage,
  onStopSpeaking,
}: ChatPanelProps) {
  const [input, setInput] = useState('');
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const scrollEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, streamingText, isGenerating]);

  const adjustTextareaHeight = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 150)}px`;
  };

  const handleSubmit = async () => {
    const trimmed = input.trim();
    if (!trimmed || isGenerating) {
      return;
    }
    setInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    await onSendMessage(trimmed);
  };

  const handleCopyMessage = async (msg: ChatMessage) => {
    try {
      await navigator.clipboard.writeText(msg.text);
      setCopiedMessageId(msg.id);
      setTimeout(() => setCopiedMessageId(null), 1600);
    } catch {
      // Clipboard unavailable
    }
  };

  const hasConversationMessages = messages.length > 0 || Boolean(streamingText);

  return (
    <div className="flex-1 h-full min-h-0 flex flex-col bg-slate-50 dark:bg-[#09090d] text-slate-900 dark:text-slate-100">
      {/* Error Alert Banner */}
      {errorBanner && (
        <div
          role="alert"
          className="mx-4 mt-3 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs text-rose-700 dark:text-rose-300"
        >
          <span>{errorBanner}</span>
          <button
            type="button"
            onClick={onDismissError}
            className="font-semibold underline hover:opacity-80 cursor-pointer shrink-0"
          >
            Yopish
          </button>
        </div>
      )}

      {/* Messages Viewport */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5">
        {!hasConversationMessages ? (
          <div className="h-full max-w-2xl mx-auto flex flex-col justify-center py-6">
            <div className="mb-6">
              <div className="inline-flex items-center gap-2 text-xs font-medium text-amber-600 dark:text-amber-400 mb-2">
                <Sparkles className="w-4 h-4" />
                <span>Sirius AI · Tezkor ovozli va matnli suhbat</span>
              </div>
              <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
                Bugun sizga qanday yordam bera olaman?
              </h1>
              <p className="mt-2 text-sm text-slate-600 dark:text-zinc-400 leading-relaxed">
                Savolingizni yozing yoki mikrofon tugmasini bosib ovoz orqali murojaat qiling.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {STARTER_PROMPTS.map((item) => (
                <button
                  key={item.title}
                  type="button"
                  onClick={() => void onSendMessage(item.prompt)}
                  className="text-left rounded-2xl border border-slate-200 dark:border-zinc-800/90 bg-white dark:bg-[#111218] hover:border-amber-500/60 p-4 transition-colors cursor-pointer"
                >
                  <div className="text-sm font-semibold text-slate-900 dark:text-zinc-100">
                    {item.title}
                  </div>
                  <div className="mt-1 text-xs text-slate-600 dark:text-zinc-400 line-clamp-2 leading-relaxed">
                    {item.prompt}
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto space-y-5">
            {messages.map((msg, idx) => {
              const isUser = msg.role === 'user';
              const isLastAssistant = !isUser && idx === messages.length - 1;
              const isThisSpeaking = speakingMessageId === msg.id && (isSpeaking || isSynthesizingSpeech);

              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`max-w-[92%] sm:max-w-[84%] rounded-2xl px-4 py-3 ${
                      isUser
                        ? 'bg-amber-500 text-zinc-950 font-medium shadow-sm'
                        : 'bg-white dark:bg-[#12131a] border border-slate-200 dark:border-zinc-800/90 text-slate-900 dark:text-zinc-100 shadow-sm'
                    }`}
                  >
                    {isUser ? (
                      <p className="text-[14.5px] leading-relaxed whitespace-pre-wrap break-words">
                        {msg.text}
                      </p>
                    ) : (
                      <>
                        <FormattedMarkdown content={msg.text} />

                        {msg.funFact && (
                          <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/8 px-3.5 py-2.5 text-xs text-slate-700 dark:text-amber-100/90 flex items-start gap-2.5">
                            <Lightbulb className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                            <div>
                              <span className="font-semibold text-amber-700 dark:text-amber-300">
                                Qiziqarli fakt:{' '}
                              </span>
                              <span>{msg.funFact}</span>
                            </div>
                          </div>
                        )}

                        {msg.sources && msg.sources.length > 0 && (
                          <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-zinc-800/80">
                            <div className="text-[11px] font-semibold text-slate-500 dark:text-zinc-400 mb-1.5">
                              Tekshirilgan manbalar
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {msg.sources.map((src) => (
                                <a
                                  key={src.uri}
                                  href={src.uri}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900 hover:border-amber-500/50 px-2.5 py-1 text-[11px] text-slate-700 dark:text-zinc-300 transition-colors max-w-[230px]"
                                >
                                  <span className="truncate">{src.title}</span>
                                  <ExternalLink className="w-3 h-3 shrink-0 opacity-70" />
                                </a>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {/* Message Action Controls */}
                  {!isUser && (
                    <div className="mt-1.5 flex items-center gap-1 px-1">
                      <button
                        type="button"
                        onClick={() => void handleCopyMessage(msg)}
                        aria-label="Javobni nusxalash"
                        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 hover:bg-slate-200/60 dark:hover:bg-zinc-800/80 cursor-pointer whitespace-nowrap"
                      >
                        {copiedMessageId === msg.id ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-500" />
                            Nusxalandi
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            Nusxalash
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          isThisSpeaking ? onStopSpeaking() : onSpeakMessage(msg)
                        }
                        aria-label={isThisSpeaking ? 'Ovozli ijroni to‘xtatish' : 'Javobni tinglash'}
                        className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] cursor-pointer whitespace-nowrap ${
                          isThisSpeaking
                            ? 'bg-amber-500/15 text-amber-600 dark:text-amber-300 font-semibold'
                            : 'text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 hover:bg-slate-200/60 dark:hover:bg-zinc-800/80'
                        }`}
                      >
                        {isThisSpeaking ? (
                          <>
                            <Square className="w-3 h-3 fill-current" />
                            {isSynthesizingSpeech ? 'Tayyorlanmoqda...' : 'To‘xtatish'}
                          </>
                        ) : (
                          <>
                            <Volume2 className="w-3.5 h-3.5" />
                            Tinglash
                          </>
                        )}
                      </button>

                      {isLastAssistant && !isGenerating && (
                        <button
                          type="button"
                          onClick={() => void onRegenerateLast()}
                          aria-label="Javobni qayta yaratish"
                          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 hover:bg-slate-200/60 dark:hover:bg-zinc-800/80 cursor-pointer whitespace-nowrap"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          Qayta yaratish
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Live Streaming Bubble */}
            {(isGenerating || streamingText) && (
              <div className="flex flex-col items-start">
                <div className="max-w-[92%] sm:max-w-[84%] rounded-2xl px-4 py-3 bg-white dark:bg-[#12131a] border border-amber-500/40 text-slate-900 dark:text-zinc-100 shadow-sm">
                  {streamingText ? (
                    <FormattedMarkdown content={streamingText} />
                  ) : (
                    <div className="text-sm text-slate-600 dark:text-zinc-400">
                      Sirius AI javob tayyorlamoqda...
                    </div>
                  )}
                </div>
              </div>
            )}

            <div ref={scrollEndRef} />
          </div>
        )}
      </div>

      {/* Bottom Composer */}
      <div className="px-4 sm:px-6 pb-4 pt-2 border-t border-slate-200/80 dark:border-zinc-800/80 bg-white/95 dark:bg-[#0c0d12]">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-end gap-2 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-[#13141c] px-3 py-2 focus-within:border-amber-500 transition-colors">
            <button
              type="button"
              onClick={onToggleRecord}
              disabled={isTranscribing || isGenerating}
              aria-label={isRecording ? 'Ovoz yozishni to‘xtatish' : 'Ovoz orqali so‘rash'}
              title={isRecording ? 'Yozishni to‘xtatish' : 'Ovoz bilan gapiring'}
              className={`w-10 h-10 inline-flex items-center justify-center rounded-xl transition-colors cursor-pointer shrink-0 disabled:opacity-50 ${
                isRecording
                  ? 'bg-rose-500 text-white hover:bg-rose-600'
                  : 'text-slate-600 dark:text-zinc-300 hover:bg-slate-200 dark:hover:bg-zinc-800'
              }`}
            >
              {isRecording ? <Square className="w-4 h-4 fill-current" /> : <Mic className="w-4 h-4" />}
            </button>

            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                adjustTextareaHeight();
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void handleSubmit();
                }
              }}
              placeholder={
                isRecording
                  ? 'Gapiring... to‘xtatish uchun mikrofon tugmasini bosing'
                  : isTranscribing
                  ? 'Ovozingiz matnga o‘girilmoqda...'
                  : 'Savolingizni yozing...'
              }
              aria-label="Xabar matni"
              disabled={isTranscribing}
              className="flex-1 bg-transparent resize-none py-2 text-sm text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:outline-none max-h-[150px]"
            />

            {isGenerating ? (
              <button
                type="button"
                onClick={onStopGeneration}
                aria-label="Javob yaratishni to‘xtatish"
                className="w-10 h-10 inline-flex items-center justify-center rounded-xl bg-slate-900 dark:bg-zinc-100 text-white dark:text-zinc-950 hover:opacity-90 cursor-pointer shrink-0"
              >
                <Square className="w-4 h-4 fill-current" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void handleSubmit()}
                disabled={!input.trim() || isTranscribing}
                aria-label="Xabar yuborish"
                className="w-10 h-10 inline-flex items-center justify-center rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 transition-colors cursor-pointer shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Send className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Unboxed status summary below input */}
          <div className="mt-2 flex items-center justify-between text-[11px] text-slate-600 dark:text-zinc-400 px-1">
            <div className="truncate">
              <span>{settings.model === 'gemini-4-hydrogen' ? 'Sirius Chuqur' : 'Sirius Tezkor'}</span>
              <span className="mx-1.5">·</span>
              <span>Ovoz: {settings.voiceName}</span>
              {settings.searchGrounding && (
                <>
                  <span className="mx-1.5">·</span>
                  <span>Google Qidiruv faol</span>
                </>
              )}
            </div>
            <span className="hidden sm:inline shrink-0">Enter — yuborish</span>
          </div>
        </div>
      </div>
    </div>
  );
}
