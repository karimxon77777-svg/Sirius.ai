import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  CheckCircle2,
  Download,
  Menu,
  Moon,
  SlidersHorizontal,
  Sun,
  WifiOff,
} from 'lucide-react';
import { ChatPanel } from './components/ChatPanel.tsx';
import { InstallAppModal } from './components/InstallAppModal.tsx';
import { SettingsModal } from './components/SettingsModal.tsx';
import { Sidebar } from './components/Sidebar.tsx';
import { useOnlineStatus } from './hooks/useOnlineStatus.ts';
import { usePWAInstall } from './hooks/usePWAInstall.ts';
import { useVoiceAssistant } from './hooks/useVoiceAssistant.ts';
import {
  commitConversationAndMessage,
  deleteConversationInFirestore,
  renameConversationInFirestore,
  signInWithGoogle,
  signOutUser,
  subscribeAuth,
  subscribeConversations,
  subscribeMessages,
  syncUserProfile,
  testFirestoreConnection,
  updateUserSettingsInFirestore,
} from './lib/firebase.ts';
import {
  DEFAULT_USER_SETTINGS,
  type ChatMessage,
  type Conversation,
  type UserSettings,
  type VoiceName,
} from './types.ts';
import {
  createValidId,
  deriveConversationTitle,
  formatConversationMarkdown,
  parseAssistantResponse,
  sanitizeSources,
  sanitizeUserSettings,
  truncateText,
} from './utils/chatHelpers.ts';

const SETTINGS_STORAGE_KEY = 'sirius_settings_v1';
const GUEST_CONVS_KEY = 'sirius_guest_conversations_v1';
const GUEST_MSGS_KEY = 'sirius_guest_messages_v1';

function loadStoredSettings(): UserSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_USER_SETTINGS;
    return sanitizeUserSettings(JSON.parse(raw));
  } catch {
    return DEFAULT_USER_SETTINGS;
  }
}

function loadGuestConversations(): Conversation[] {
  try {
    const raw = localStorage.getItem(GUEST_CONVS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function loadGuestMessages(): Record<string, ChatMessage[]> {
  try {
    const raw = localStorage.getItem(GUEST_MSGS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authBusy, setAuthBusy] = useState(false);

  const [settings, setSettings] = useState<UserSettings>(loadStoredSettings);
  const [guestConversations, setGuestConversations] = useState<Conversation[]>(loadGuestConversations);
  const [guestMessagesByConv, setGuestMessagesByConv] = useState<Record<string, ChatMessage[]>>(loadGuestMessages);

  const [cloudConversations, setCloudConversations] = useState<Conversation[]>([]);
  const [cloudMessages, setCloudMessages] = useState<ChatMessage[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(() => {
    const existing = loadGuestConversations();
    return existing.length > 0 ? existing[0].id : null;
  });

  const [streamingText, setStreamingText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const [isSidebarOpenMobile, setIsSidebarOpenMobile] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isInstallModalOpen, setIsInstallModalOpen] = useState(false);

  const chatAbortRef = useRef<AbortController | null>(null);

  const isOnline = useOnlineStatus();
  const { canInstall, isInstalled, isIOS, promptInstall } = usePWAInstall();
  const isInIframe = typeof window !== 'undefined' && window.self !== window.top;

  const conversations = user ? cloudConversations : guestConversations;
  const activeMessages = useMemo(() => {
    if (!activeConversationId) return [];
    return user ? cloudMessages : guestMessagesByConv[activeConversationId] ?? [];
  }, [activeConversationId, cloudMessages, guestMessagesByConv, user]);

  // Sync HTML .dark class and theme-color meta tag
  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute('content', settings.theme === 'dark' ? '#09090d' : '#f8fafc');
    }
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Storage quota ignored
    }
  }, [settings]);

  // Persist guest conversations & messages
  useEffect(() => {
    if (user) return;
    try {
      localStorage.setItem(GUEST_CONVS_KEY, JSON.stringify(guestConversations));
      localStorage.setItem(GUEST_MSGS_KEY, JSON.stringify(guestMessagesByConv));
    } catch {
      // Ignore quota errors
    }
  }, [guestConversations, guestMessagesByConv, user]);

  // Firebase connectivity probe & Auth listener
  useEffect(() => {
    void testFirestoreConnection();

    const unsub = subscribeAuth(async (firebaseUser) => {
      setUser(firebaseUser);
      if (!firebaseUser) {
        setCloudConversations([]);
        setCloudMessages([]);
        return;
      }

      try {
        const syncedProfile = await syncUserProfile(firebaseUser, loadStoredSettings());
        setSettings({
          theme: syncedProfile.theme,
          voiceName: syncedProfile.voiceName,
          autoSpeak: syncedProfile.autoSpeak,
          model: syncedProfile.model,
          searchGrounding: syncedProfile.searchGrounding,
        });
      } catch (err) {
        console.error('Profile sync failed:', err);
        setErrorBanner('Profil sozlamalarini sinxronlashda xatolik yuz berdi.');
      }
    });

    return () => unsub();
  }, []);

  // Firestore real-time conversations subscription
  useEffect(() => {
    if (!user) return;
    const unsub = subscribeConversations(
      user.uid,
      (items) => {
        setCloudConversations(items);
        setActiveConversationId((prev) => {
          if (prev && items.some((c) => c.id === prev)) {
            return prev;
          }
          return items[0]?.id ?? null;
        });
      },
      () => {
        setErrorBanner('Suhbatlar ro‘yxatini yuklashda xatolik yuz berdi.');
      }
    );
    return () => unsub();
  }, [user]);

  // Firestore real-time messages subscription
  useEffect(() => {
    if (!user || !activeConversationId) {
      setCloudMessages([]);
      return;
    }
    const unsub = subscribeMessages(
      user.uid,
      activeConversationId,
      (msgs) => {
        setCloudMessages(msgs);
      },
      () => {
        setErrorBanner('Xabarlarni yuklashda xatolik yuz berdi.');
      }
    );
    return () => unsub();
  }, [activeConversationId, user]);

  const sendMessageRef = useRef<(text: string) => Promise<void>>(async () => {});

  const {
    isRecording,
    isTranscribing,
    isSpeaking,
    isSynthesizingSpeech,
    speakingMessageId,
    startRecording,
    stopRecording,
    speakText,
    stopSpeaking,
  } = useVoiceAssistant({
    onTranscriptReady: (transcript) => {
      void sendMessageRef.current(transcript);
    },
    onError: (msg) => {
      setErrorBanner(msg);
    },
  });

  const handleUpdateSettings = useCallback(
    (partial: Partial<UserSettings>) => {
      setSettings((prev) => {
        const next = sanitizeUserSettings({ ...prev, ...partial });
        if (user) {
          void updateUserSettingsInFirestore(user, next).catch((err) => {
            console.error('Settings sync failed:', err);
          });
        }
        return next;
      });
    },
    [user]
  );

  const handleNewConversation = useCallback(() => {
    chatAbortRef.current?.abort();
    stopSpeaking();
    setIsGenerating(false);
    setStreamingText('');
    setActiveConversationId(null);
    setErrorBanner(null);
  }, [stopSpeaking]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        handleNewConversation();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleNewConversation]);

  const handleSendMessage = useCallback(
    async (rawPrompt: string) => {
      const prompt = rawPrompt.trim();
      if (!prompt || isGenerating) {
        return;
      }

      if (!isOnline) {
        setErrorBanner('Internet aloqasi uzilgan. Savol yuborish uchun tarmoqqa ulaning.');
        return;
      }

      setErrorBanner(null);
      stopSpeaking();

      const ownerId = user?.uid ?? 'guest';
      const existingConv = activeConversationId
        ? conversations.find((c) => c.id === activeConversationId) ?? null
        : null;
      const isNewConv = !existingConv;
      const convId = existingConv ? existingConv.id : createValidId('conv');
      const convTitle = existingConv ? existingConv.title : deriveConversationTitle(prompt);
      const baseCount = existingConv ? existingConv.messageCount : activeMessages.length;

      const userMsgId = createValidId('msg');
      const now = Date.now();

      const userMsg: ChatMessage = {
        id: userMsgId,
        ownerId,
        conversationId: convId,
        role: 'user',
        text: prompt,
        createdAtMs: now,
      };

      const historyForApi = activeMessages.map((m) => ({
        role: m.role,
        text: m.text,
      }));

      setActiveConversationId(convId);

      if (user) {
        try {
          await commitConversationAndMessage({
            uid: user.uid,
            conversation: {
              id: convId,
              title: convTitle,
              lastMessagePreview: truncateText(prompt, 300),
              messageCount: baseCount + 1,
              isNew: isNewConv,
            },
            message: {
              id: userMsgId,
              role: 'user',
              text: prompt,
            },
          });
        } catch (err) {
          console.error('Failed to persist user message:', err);
          setErrorBanner('Xabarni ma’lumotlar bazasiga saqlashda xatolik.');
          return;
        }
      } else {
        setGuestConversations((prev) => {
          const updated: Conversation = {
            id: convId,
            ownerId: 'guest',
            title: convTitle,
            lastMessagePreview: truncateText(prompt, 300),
            messageCount: baseCount + 1,
            createdAtMs: existingConv?.createdAtMs ?? now,
            updatedAtMs: now,
          };
          return [updated, ...prev.filter((c) => c.id !== convId)];
        });
        setGuestMessagesByConv((prev) => ({
          ...prev,
          [convId]: [...(prev[convId] ?? []), userMsg],
        }));
      }

      const controller = new AbortController();
      chatAbortRef.current = controller;
      setIsGenerating(true);
      setStreamingText('');

      try {
        const resp = await fetch('/api/chat/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt,
            history: historyForApi,
            model: settings.model,
            searchGrounding: settings.searchGrounding,
          }),
          signal: controller.signal,
        });

        if (!resp.ok || !resp.body) {
          let errMsg = 'AI javobini olishda xatolik yuz berdi.';
          try {
            const errJson = await resp.json();
            if (errJson?.error) errMsg = errJson.error;
          } catch {
            // Non-JSON error
          }
          throw new Error(errMsg);
        }

        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let sseBuffer = '';
        let accumulatedRaw = '';
        let donePayload: {
          text?: string;
          funFact?: string;
          sources?: ChatMessage['sources'];
          model?: string;
        } | null = null;

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          sseBuffer += decoder.decode(value, { stream: true });
          const events = sseBuffer.split('\n\n');
          sseBuffer = events.pop() ?? '';

          for (const rawEvent of events) {
            const lines = rawEvent.split('\n');
            for (const line of lines) {
              if (!line.startsWith('data: ')) continue;
              const jsonStr = line.slice(6).trim();
              if (!jsonStr) continue;
              try {
                const evt = JSON.parse(jsonStr);
                if (evt.type === 'chunk' && typeof evt.delta === 'string') {
                  accumulatedRaw += evt.delta;
                  setStreamingText(parseAssistantResponse(accumulatedRaw).text);
                } else if (evt.type === 'done') {
                  donePayload = evt;
                } else if (evt.type === 'error') {
                  throw new Error(evt.message || 'AI oqim xatoligi.');
                }
              } catch (parseErr) {
                if (parseErr instanceof Error && !/JSON/i.test(parseErr.message)) {
                  throw parseErr;
                }
              }
            }
          }
        }

        const fallbackParsed = parseAssistantResponse(accumulatedRaw);
        const finalText = (donePayload?.text || fallbackParsed.text || '').trim();
        if (!finalText) {
          throw new Error('AI bo‘sh javob qaytardi.');
        }

        const finalFunFact = donePayload?.funFact || fallbackParsed.funFact;
        const finalSources = sanitizeSources(donePayload?.sources ?? []);
        const finalModel = donePayload?.model || settings.model;

        const assistantMsgId = createValidId('msg');
        const finishedAt = Date.now();

        const assistantMsg: ChatMessage = {
          id: assistantMsgId,
          ownerId,
          conversationId: convId,
          role: 'assistant',
          text: finalText,
          funFact: finalFunFact,
          sources: finalSources.length > 0 ? finalSources : undefined,
          model: finalModel,
          createdAtMs: finishedAt,
        };

        if (user) {
          await commitConversationAndMessage({
            uid: user.uid,
            conversation: {
              id: convId,
              title: convTitle,
              lastMessagePreview: truncateText(finalText, 300),
              messageCount: baseCount + 2,
              isNew: false,
            },
            message: {
              id: assistantMsgId,
              role: 'assistant',
              text: finalText,
              funFact: finalFunFact,
              sources: finalSources,
              model: finalModel,
            },
          });
        } else {
          setGuestConversations((prev) =>
            prev.map((c) =>
              c.id === convId
                ? {
                    ...c,
                    lastMessagePreview: truncateText(finalText, 300),
                    messageCount: baseCount + 2,
                    updatedAtMs: finishedAt,
                  }
                : c
            )
          );
          setGuestMessagesByConv((prev) => ({
            ...prev,
            [convId]: [...(prev[convId] ?? []), assistantMsg],
          }));
        }

        setStreamingText('');
        setIsGenerating(false);

        if (settings.autoSpeak) {
          void speakText(finalText, settings.voiceName, assistantMsgId);
        }
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') {
          setStreamingText('');
          setIsGenerating(false);
          return;
        }
        console.error('Chat streaming error:', err);
        setStreamingText('');
        setIsGenerating(false);
        setErrorBanner(err instanceof Error ? err.message : 'Javob olishda xatolik.');
      }
    },
    [
      activeConversationId,
      activeMessages,
      conversations,
      isGenerating,
      isOnline,
      settings.autoSpeak,
      settings.model,
      settings.searchGrounding,
      settings.voiceName,
      speakText,
      stopSpeaking,
      user,
    ]
  );

  sendMessageRef.current = handleSendMessage;

  const handleStopGeneration = () => {
    chatAbortRef.current?.abort();
    setIsGenerating(false);
    setStreamingText('');
  };

  const handleRegenerateLast = async () => {
    if (isGenerating || activeMessages.length === 0) return;
    const lastUser = [...activeMessages].reverse().find((m) => m.role === 'user');
    if (lastUser) {
      await handleSendMessage(lastUser.text);
    }
  };

  const handleRenameConversation = async (conv: Conversation, newTitle: string) => {
    if (user) {
      try {
        await renameConversationInFirestore(user.uid, conv, newTitle);
      } catch {
        setErrorBanner('Suhbat nomini yangilashda xatolik.');
      }
    } else {
      setGuestConversations((prev) =>
        prev.map((c) => (c.id === conv.id ? { ...c, title: newTitle, updatedAtMs: Date.now() } : c))
      );
    }
  };

  const handleDeleteConversation = async (id: string) => {
    if (activeConversationId === id) {
      handleNewConversation();
    }
    if (user) {
      try {
        await deleteConversationInFirestore(user.uid, id);
      } catch {
        setErrorBanner('Suhbatni o‘chirishda xatolik.');
      }
    } else {
      setGuestConversations((prev) => prev.filter((c) => c.id !== id));
      setGuestMessagesByConv((prev) => {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      });
    }
  };

  const handleExportConversation = (id: string) => {
    const conv = conversations.find((c) => c.id === id);
    if (!conv) return;
    const msgs =
      id === activeConversationId
        ? activeMessages
        : !user
        ? guestMessagesByConv[id] ?? []
        : [];
    const md = formatConversationMarkdown(conv, msgs);
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${conv.title.toLowerCase().replace(/[^a-z0-9_-]+/g, '-') || 'suhbat'}.md`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const handleSignIn = async () => {
    setAuthBusy(true);
    setErrorBanner(null);
    try {
      await signInWithGoogle();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!/popup-closed-by-user/i.test(msg)) {
        setErrorBanner('Google hisobiga kirishda xatolik yuz berdi.');
      }
    } finally {
      setAuthBusy(false);
    }
  };

  const handleSignOut = async () => {
    setAuthBusy(true);
    try {
      stopSpeaking();
      await signOutUser();
      setActiveConversationId(null);
    } catch {
      setErrorBanner('Hisobdan chiqishda xatolik.');
    } finally {
      setAuthBusy(false);
    }
  };

  const handleToggleRecord = () => {
    if (isRecording) {
      stopRecording();
    } else {
      void startRecording();
    }
  };

  const handleTestVoice = async (voice: VoiceName) => {
    await speakText(
      `Salom! Men Sirius AI yordamchisingizman. Hozir ${voice} ovozida gapiryapman.`,
      voice,
      null
    );
  };

  const handleHeaderInstallClick = async () => {
    if (canInstall) {
      const accepted = await promptInstall();
      if (accepted) return;
    }
    setIsInstallModalOpen(true);
  };

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-slate-50 text-slate-900 dark:bg-[#09090d] dark:text-slate-100">
      {/* Offline banner */}
      {!isOnline && (
        <div
          role="status"
          className="bg-amber-500 text-zinc-950 text-xs font-semibold px-4 py-1.5 flex items-center justify-center gap-2 shrink-0"
        >
          <WifiOff className="w-3.5 h-3.5 shrink-0" />
          Oflayn rejim: avvalgi suhbatlarni ko‘rish mumkin, yangi so‘rovlar uchun internet kerak.
        </div>
      )}

      {/* Top 3-zone header */}
      <header className="h-14 px-3 sm:px-5 border-b border-slate-200 dark:border-zinc-800/90 bg-white dark:bg-[#0c0d12] flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={() => setIsSidebarOpenMobile(true)}
            aria-label="Suhbatlar panelini ochish"
            className="lg:hidden w-10 h-10 inline-flex items-center justify-center rounded-xl border border-slate-200 dark:border-zinc-800 text-slate-700 dark:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 cursor-pointer shrink-0"
          >
            <Menu className="w-5 h-5" />
          </button>

          <img
            src="/icon.svg"
            alt="Sirius AI logotipi"
            className="w-8 h-8 rounded-lg shrink-0"
          />

          <div className="min-w-0">
            <div className="font-display font-bold text-base tracking-tight leading-none text-slate-900 dark:text-white whitespace-nowrap">
              Sirius <span className="text-amber-500">AI</span>
            </div>
            <div className="hidden sm:block text-[11px] text-slate-600 dark:text-zinc-400 truncate mt-0.5">
              Ovozli va Matnli Yordamchi
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {isInstalled ? (
            <span className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 px-3 py-2 text-xs font-medium whitespace-nowrap">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">Ilova o‘rnatilgan</span>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => void handleHeaderInstallClick()}
              aria-label="Ilovani yuklab olish"
              className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold px-3 py-2 text-xs transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <Download className="w-4 h-4 shrink-0" />
              <span className="sm:hidden">Yuklash</span>
              <span className="hidden sm:inline">Ilovani yuklash</span>
            </button>
          )}

          <button
            type="button"
            onClick={() =>
              handleUpdateSettings({
                theme: settings.theme === 'dark' ? 'light' : 'dark',
              })
            }
            aria-label={
              settings.theme === 'dark'
                ? 'Kunduzgi rejimga o‘tish'
                : 'Tungi rejimga o‘tish'
            }
            className="w-10 h-10 inline-flex items-center justify-center rounded-xl border border-slate-200 dark:border-zinc-800 text-slate-700 dark:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer shrink-0"
          >
            {settings.theme === 'dark' ? (
              <Sun className="w-4 h-4 text-amber-400" />
            ) : (
              <Moon className="w-4 h-4 text-slate-700" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setIsSettingsOpen(true)}
            aria-label="Sozlamalarni ochish"
            className="w-10 h-10 inline-flex items-center justify-center rounded-xl border border-slate-200 dark:border-zinc-800 text-slate-700 dark:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer shrink-0"
          >
            <SlidersHorizontal className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Workspace */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        <Sidebar
          conversations={conversations}
          activeConversationId={activeConversationId}
          user={user}
          authBusy={authBusy}
          canInstallPwa={canInstall}
          isOpenMobile={isSidebarOpenMobile}
          onCloseMobile={() => setIsSidebarOpenMobile(false)}
          onNewConversation={handleNewConversation}
          onSelectConversation={(id) => {
            stopSpeaking();
            setActiveConversationId(id);
            setErrorBanner(null);
          }}
          onRenameConversation={handleRenameConversation}
          onDeleteConversation={handleDeleteConversation}
          onExportConversation={handleExportConversation}
          onSignIn={handleSignIn}
          onSignOut={handleSignOut}
          onInstallPwa={handleHeaderInstallClick}
        />

        <main className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden">
          <ChatPanel
            messages={activeMessages}
            streamingText={streamingText}
            isGenerating={isGenerating}
            isRecording={isRecording}
            isTranscribing={isTranscribing}
            isSpeaking={isSpeaking}
            isSynthesizingSpeech={isSynthesizingSpeech}
            speakingMessageId={speakingMessageId}
            settings={settings}
            errorBanner={errorBanner}
            onDismissError={() => setErrorBanner(null)}
            onSendMessage={handleSendMessage}
            onStopGeneration={handleStopGeneration}
            onRegenerateLast={handleRegenerateLast}
            onToggleRecord={handleToggleRecord}
            onSpeakMessage={(msg) => {
              void speakText(msg.text, settings.voiceName, msg.id);
            }}
            onStopSpeaking={stopSpeaking}
          />
        </main>
      </div>

      <SettingsModal
        isOpen={isSettingsOpen}
        settings={settings}
        onClose={() => setIsSettingsOpen(false)}
        onUpdateSettings={handleUpdateSettings}
        onTestVoice={handleTestVoice}
      />

      <InstallAppModal
        isOpen={isInstallModalOpen}
        canNativeInstall={canInstall}
        isIOS={isIOS}
        isInIframe={isInIframe}
        onClose={() => setIsInstallModalOpen(false)}
        onTriggerNativeInstall={async () => {
          const accepted = await promptInstall();
          if (accepted) {
            setIsInstallModalOpen(false);
          }
        }}
      />
    </div>
  );
}
