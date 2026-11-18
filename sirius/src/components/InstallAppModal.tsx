import { useEffect } from 'react';
import { Download, ExternalLink, Share, Smartphone, X } from 'lucide-react';

interface InstallAppModalProps {
  isOpen: boolean;
  canNativeInstall: boolean;
  isIOS: boolean;
  isInIframe: boolean;
  onClose: () => void;
  onTriggerNativeInstall: () => Promise<void>;
}

export function InstallAppModal({
  isOpen,
  canNativeInstall,
  isIOS,
  isInIframe,
  onClose,
  onTriggerNativeInstall,
}: InstallAppModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="install-app-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65"
    >
      <div onClick={onClose} aria-hidden="true" className="fixed inset-0" />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#111218] text-slate-900 dark:text-slate-100 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-zinc-800">
          <div className="flex items-center gap-2.5">
            <img src="/icon.svg" alt="Sirius AI" className="w-8 h-8 rounded-lg" />
            <div>
              <h2 id="install-app-modal-title" className="font-display text-base font-bold text-slate-900 dark:text-white">
                Sirius AI ilovasini o‘rnatish
              </h2>
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                Qurilmangizga alohida ilova sifatida yuklang
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Oynani yopish"
            className="w-9 h-9 inline-flex items-center justify-center rounded-xl border border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 text-sm text-slate-700 dark:text-zinc-300">
          {canNativeInstall ? (
            <button
              type="button"
              onClick={() => void onTriggerNativeInstall()}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold px-4 py-3 transition-colors cursor-pointer"
            >
              <Download className="w-4 h-4" />
              Hozir ilova sifatida o‘rnatish
            </button>
          ) : isInIframe ? (
            <div className="space-y-3">
              <p className="text-xs leading-relaxed text-slate-600 dark:text-zinc-400">
                Ilovani qurilmaga o‘rnatish uchun avval uni alohida brauzer oynasida oching — shunda brauzerning o‘rnatish tugmasi faollashadi.
              </p>
              <a
                href={window.location.href}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold px-4 py-3 transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
                Yangi oynada ochib o‘rnatish
              </a>
            </div>
          ) : isIOS ? (
            <div className="rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900 p-4 space-y-2.5 text-xs">
              <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <Share className="w-4 h-4 text-amber-500" />
                iPhone / iPad (Safari) orqali o‘rnatish:
              </div>
              <ol className="list-decimal list-inside space-y-1.5 text-slate-600 dark:text-zinc-300">
                <li>Pastki paneldagi <strong>Ulashish (Share)</strong> tugmasini bosing.</li>
                <li>Ro‘yxatdan <strong>“Add to Home Screen”</strong> (Bosh ekranga qo‘shish) ni tanlang.</li>
                <li>Yuqoridagi <strong>Add</strong> tugmasini bosing.</li>
              </ol>
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900 p-4 space-y-2.5 text-xs">
              <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-amber-500" />
                Brauzer orqali ilova sifatida yuklash:
              </div>
              <ol className="list-decimal list-inside space-y-1.5 text-slate-600 dark:text-zinc-300">
                <li>Brauzer manzil satri o‘ng tomonidagi <strong>O‘rnatish (Install)</strong> belgisini bosing.</li>
                <li>Yoki brauzer menyusidan (<strong>⋮</strong>) <strong>“Ilovani o‘rnatish” / “Install Sirius AI”</strong> bandini tanlang.</li>
              </ol>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
