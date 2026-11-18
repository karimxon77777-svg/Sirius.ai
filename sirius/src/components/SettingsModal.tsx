import { useEffect, useState } from 'react';
import { Globe, Moon, Sun, Volume2, X } from 'lucide-react';
import {
  MODEL_OPTIONS,
  VOICE_OPTIONS,
  type UserSettings,
  type VoiceName,
} from '../types.ts';

interface SettingsModalProps {
  isOpen: boolean;
  settings: UserSettings;
  onClose: () => void;
  onUpdateSettings: (partial: Partial<UserSettings>) => void;
  onTestVoice: (voice: VoiceName) => Promise<void>;
}

export function SettingsModal({
  isOpen,
  settings,
  onClose,
  onUpdateSettings,
  onTestVoice,
}: SettingsModalProps) {
  const [testingVoice, setTestingVoice] = useState<VoiceName | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  const handleVoicePreview = async (voice: VoiceName) => {
    setTestingVoice(voice);
    try {
      await onTestVoice(voice);
    } finally {
      setTestingVoice(null);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65"
    >
      <div
        onClick={onClose}
        aria-hidden="true"
        className="fixed inset-0"
      />
      <div className="relative z-10 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#111218] text-slate-900 dark:text-slate-100 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-zinc-800">
          <div>
            <h2 id="settings-modal-title" className="font-display text-lg font-bold">
              Sozlamalar
            </h2>
            <p className="text-xs text-slate-500 dark:text-zinc-400">
              Model, ovoz ohangi va ko‘rinishni moslashtiring
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Sozlamalarni yopish"
            className="w-9 h-9 inline-flex items-center justify-center rounded-xl border border-slate-200 dark:border-zinc-800 text-slate-500 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-6">
          {/* Theme Selection */}
          <section className="space-y-2.5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-zinc-400">
              Mavzu
            </h3>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => onUpdateSettings({ theme: 'dark' })}
                className={`flex items-center justify-center gap-2 rounded-xl border px-3.5 py-2.5 text-sm font-medium transition-colors cursor-pointer ${
                  settings.theme === 'dark'
                    ? 'border-amber-500 bg-amber-500/15 text-amber-700 dark:text-amber-300'
                    : 'border-slate-200 dark:border-zinc-800 text-slate-800 dark:text-zinc-200 hover:bg-slate-50 dark:hover:bg-zinc-900'
                }`}
              >
                <Moon className="w-4 h-4" />
                Tungi rejim
              </button>
              <button
                type="button"
                onClick={() => onUpdateSettings({ theme: 'light' })}
                className={`flex items-center justify-center gap-2 rounded-xl border px-3.5 py-2.5 text-sm font-medium transition-colors cursor-pointer ${
                  settings.theme === 'light'
                    ? 'border-amber-500 bg-amber-500/15 text-amber-700 dark:text-amber-300'
                    : 'border-slate-200 dark:border-zinc-800 text-slate-800 dark:text-zinc-200 hover:bg-slate-50 dark:hover:bg-zinc-900'
                }`}
              >
                <Sun className="w-4 h-4" />
                Kunduzgi rejim
              </button>
            </div>
          </section>

          {/* Gemini Model Selection */}
          <section className="space-y-2.5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-zinc-400">
              AI Model
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {MODEL_OPTIONS.map((item) => {
                const selected = settings.model === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onUpdateSettings({ model: item.id })}
                    className={`text-left rounded-xl border p-3 transition-colors cursor-pointer ${
                      selected
                        ? 'border-amber-500 bg-amber-500/12'
                        : 'border-slate-200 dark:border-zinc-800 hover:bg-slate-50 dark:hover:bg-zinc-900'
                    }`}
                  >
                    <div className="text-sm font-semibold text-slate-900 dark:text-zinc-100">
                      {item.label}
                    </div>
                    <div className="mt-1 text-xs text-slate-600 dark:text-zinc-400 leading-relaxed">
                      {item.summary}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Voice Selection */}
          <section className="space-y-2.5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-zinc-400">
              Ovozli yordamchi ohangi
            </h3>
            <div className="space-y-2">
              {VOICE_OPTIONS.map((voice) => {
                const selected = settings.voiceName === voice.id;
                const isTesting = testingVoice === voice.id;
                return (
                  <div
                    key={voice.id}
                    className={`flex items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 transition-colors ${
                      selected
                        ? 'border-amber-500 bg-amber-500/10'
                        : 'border-slate-200 dark:border-zinc-800'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => onUpdateSettings({ voiceName: voice.id })}
                      className="flex-1 text-left cursor-pointer"
                    >
                      <div className="text-sm font-semibold text-slate-900 dark:text-zinc-100">{voice.label}</div>
                      <div className="text-xs text-slate-600 dark:text-zinc-400">{voice.tone}</div>
                    </button>

                    <button
                      type="button"
                      onClick={() => void handleVoicePreview(voice.id)}
                      disabled={testingVoice !== null}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 bg-slate-100 dark:bg-zinc-900 hover:bg-slate-200 dark:hover:bg-zinc-800 text-slate-800 dark:text-zinc-100 px-2.5 py-1.5 text-xs font-medium cursor-pointer whitespace-nowrap disabled:opacity-60"
                    >
                      <Volume2 className="w-3.5 h-3.5 text-amber-500" />
                      {isTesting ? 'Ijro...' : 'Sinash'}
                    </button>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Toggles */}
          <section className="space-y-2.5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-zinc-400">
              Imkoniyatlar
            </h3>

            <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 dark:border-zinc-800 px-3.5 py-3 cursor-pointer">
              <div>
                <div className="text-sm font-medium text-slate-900 dark:text-zinc-100">Javoblarni avtomatik o‘qish</div>
                <div className="text-xs text-slate-600 dark:text-zinc-400">
                  Har bir javob yakunlanganda ovozli ijro boshlanadi
                </div>
              </div>
              <input
                type="checkbox"
                checked={settings.autoSpeak}
                onChange={(e) => onUpdateSettings({ autoSpeak: e.target.checked })}
                className="w-4 h-4 accent-amber-500 cursor-pointer"
              />
            </label>

            <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 dark:border-zinc-800 px-3.5 py-3 cursor-pointer">
              <div className="flex items-start gap-2.5">
                <Globe className="w-4 h-4 text-sky-500 mt-0.5 shrink-0" />
                <div>
                  <div className="text-sm font-medium text-slate-900 dark:text-zinc-100">Google Qidiruv bilan boyitish</div>
                  <div className="text-xs text-slate-600 dark:text-zinc-400">
                    Yoqilganda dolzarb faktlarni vebdan qidiradi (biroz ko‘proq vaqt oladi)
                  </div>
                </div>
              </div>
              <input
                type="checkbox"
                checked={settings.searchGrounding}
                onChange={(e) => onUpdateSettings({ searchGrounding: e.target.checked })}
                className="w-4 h-4 accent-amber-500 cursor-pointer"
              />
            </label>
          </section>

          {/* Keyboard Shortcuts */}
          <section className="rounded-xl bg-slate-100 dark:bg-zinc-900/90 border border-slate-200 dark:border-zinc-800 px-3.5 py-3 text-xs text-slate-600 dark:text-zinc-400 space-y-1">
            <div className="font-semibold text-slate-800 dark:text-zinc-200 mb-1">
              Tezkor tugmalar
            </div>
            <div className="flex justify-between">
              <span>Xabar yuborish</span>
              <span className="font-mono">Enter</span>
            </div>
            <div className="flex justify-between">
              <span>Yangi qator</span>
              <span className="font-mono">Shift + Enter</span>
            </div>
            <div className="flex justify-between">
              <span>Yangi suhbat</span>
              <span className="font-mono">Ctrl / Cmd + K</span>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
