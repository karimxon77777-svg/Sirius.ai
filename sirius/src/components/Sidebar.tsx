import { useState } from 'react';
import type { User } from 'firebase/auth';
import {
  Check,
  Download,
  LogIn,
  LogOut,
  MessageSquare,
  Pencil,
  Plus,
  Search,
  Smartphone,
  Trash2,
  X,
} from 'lucide-react';
import type { Conversation } from '../types.ts';

interface SidebarProps {
  conversations: Conversation[];
  activeConversationId: string | null;
  user: User | null;
  authBusy: boolean;
  canInstallPwa: boolean;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
  onNewConversation: () => void;
  onSelectConversation: (id: string) => void;
  onRenameConversation: (conv: Conversation, newTitle: string) => Promise<void>;
  onDeleteConversation: (id: string) => Promise<void>;
  onExportConversation: (id: string) => void;
  onSignIn: () => Promise<void>;
  onSignOut: () => Promise<void>;
  onInstallPwa: () => Promise<void>;
}

function formatRelativeDate(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60_000) return 'Hozir';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} daq oldin`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} soat oldin`;
  return new Date(ms).toLocaleDateString('uz-UZ', { day: 'numeric', month: 'short' });
}

export function Sidebar({
  conversations,
  activeConversationId,
  user,
  authBusy,
  canInstallPwa,
  isOpenMobile,
  onCloseMobile,
  onNewConversation,
  onSelectConversation,
  onRenameConversation,
  onDeleteConversation,
  onExportConversation,
  onSignIn,
  onSignOut,
  onInstallPwa,
}: SidebarProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filtered = normalizedQuery
    ? conversations.filter(
        (c) =>
          c.title.toLowerCase().includes(normalizedQuery) ||
          c.lastMessagePreview.toLowerCase().includes(normalizedQuery)
      )
    : conversations;

  const commitRename = async (conv: Conversation) => {
    const trimmed = editingTitle.trim();
    setEditingId(null);
    if (!trimmed || trimmed === conv.title) {
      return;
    }
    await onRenameConversation(conv, trimmed);
  };

  const sidebarContent = (
    <aside
      aria-label="Suhbatlar tarixi"
      className="h-full w-72 flex flex-col bg-white dark:bg-[#0e0f14] border-r border-slate-200 dark:border-zinc-800/90 text-slate-900 dark:text-slate-100"
    >
      {/* Top Action Header */}
      <div className="p-3.5 border-b border-slate-200 dark:border-zinc-800/80 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => {
              onNewConversation();
              onCloseMobile();
            }}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold text-sm px-3.5 py-2.5 transition-colors cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-4 h-4 shrink-0" />
            Yangi suhbat
          </button>

          <button
            type="button"
            onClick={onCloseMobile}
            aria-label="Yon panelni yopish"
            className="lg:hidden w-10 h-10 inline-flex items-center justify-center rounded-xl border border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 dark:text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Suhbatlardan qidirish..."
            aria-label="Suhbatlardan qidirish"
            className="w-full rounded-xl bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 pl-9 pr-3 py-2 text-xs text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-amber-500"
          />
        </div>
      </div>

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto p-2.5 space-y-1">
        {filtered.length === 0 ? (
          <div className="px-3 py-8 text-center">
            <MessageSquare className="w-6 h-6 text-slate-300 dark:text-zinc-700 mx-auto mb-2" />
            <p className="text-xs text-slate-500 dark:text-zinc-500">
              {normalizedQuery ? 'Mos suhbat topilmadi' : 'Hali suhbatlar yo‘q'}
            </p>
          </div>
        ) : (
          filtered.map((conv) => {
            const isActive = conv.id === activeConversationId;
            const isEditing = editingId === conv.id;
            const isConfirmingDelete = confirmDeleteId === conv.id;

            return (
              <div
                key={conv.id}
                className={`group rounded-xl transition-colors border ${
                  isActive
                    ? 'bg-amber-500/10 dark:bg-amber-500/12 border-amber-500/35'
                    : 'border-transparent hover:bg-slate-100 dark:hover:bg-zinc-900/80'
                }`}
              >
                {isEditing ? (
                  <div className="p-2 flex items-center gap-1.5">
                    <input
                      type="text"
                      value={editingTitle}
                      onChange={(e) => setEditingTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          void commitRename(conv);
                        } else if (e.key === 'Escape') {
                          setEditingId(null);
                        }
                      }}
                      autoFocus
                      aria-label="Suhbat nomini tahrirlash"
                      className="flex-1 min-w-0 rounded-lg bg-white dark:bg-zinc-950 border border-amber-500 px-2.5 py-1.5 text-xs text-slate-900 dark:text-zinc-100 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => void commitRename(conv)}
                      aria-label="Nomni saqlash"
                      className="w-8 h-8 inline-flex items-center justify-center rounded-lg bg-amber-500 text-zinc-950 cursor-pointer shrink-0"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="p-2.5 flex items-start justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        onSelectConversation(conv.id);
                        onCloseMobile();
                      }}
                      className="flex-1 min-w-0 text-left cursor-pointer"
                    >
                      <div className="text-[13px] font-semibold text-slate-900 dark:text-zinc-100 truncate">
                        {conv.title}
                      </div>
                      <div className="mt-0.5 text-[11px] text-slate-500 dark:text-zinc-400 truncate">
                        {conv.lastMessagePreview || 'Yangi suhbat'}
                      </div>
                      <div className="mt-1 text-[10px] text-slate-400 dark:text-zinc-500">
                        {formatRelativeDate(conv.updatedAtMs)} · {conv.messageCount} xabar
                      </div>
                    </button>

                    <div className="flex items-center gap-0.5 shrink-0">
                      {isConfirmingDelete ? (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setConfirmDeleteId(null);
                              void onDeleteConversation(conv.id);
                            }}
                            aria-label="O‘chirishni tasdiqlash"
                            className="w-7 h-7 inline-flex items-center justify-center rounded-lg bg-rose-500 text-white cursor-pointer"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            aria-label="Bekor qilish"
                            className="w-7 h-7 inline-flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-200 dark:hover:bg-zinc-800 cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => onExportConversation(conv.id)}
                            title="Markdown yuklab olish"
                            aria-label={`${conv.title} suhbatini yuklab olish`}
                            className="w-7 h-7 inline-flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-zinc-100 hover:bg-slate-200/70 dark:hover:bg-zinc-800 opacity-75 group-hover:opacity-100 cursor-pointer"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(conv.id);
                              setEditingTitle(conv.title);
                              setConfirmDeleteId(null);
                            }}
                            title="Nomini o‘zgartirish"
                            aria-label={`${conv.title} nomini o‘zgartirish`}
                            className="w-7 h-7 inline-flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-zinc-100 hover:bg-slate-200/70 dark:hover:bg-zinc-800 opacity-75 group-hover:opacity-100 cursor-pointer"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(conv.id)}
                            title="Suhbatni o‘chirish"
                            aria-label={`${conv.title} suhbatini o‘chirish`}
                            className="w-7 h-7 inline-flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 opacity-75 group-hover:opacity-100 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Bottom Footer: PWA Install + Account */}
      <div className="p-3 border-t border-slate-200 dark:border-zinc-800/80 space-y-2.5">
        {canInstallPwa && (
          <button
            type="button"
            onClick={() => void onInstallPwa()}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 text-xs font-semibold px-3 py-2 transition-colors cursor-pointer whitespace-nowrap"
          >
            <Smartphone className="w-4 h-4 shrink-0" />
            Ilovani o‘rnatish
          </button>
        )}

        {user ? (
          <div className="flex items-center justify-between gap-2.5 rounded-xl bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 p-2.5">
            <div className="flex items-center gap-2.5 min-w-0">
              {user.photoURL ? (
                <img
                  src={user.photoURL}
                  alt={user.displayName || 'Profil'}
                  referrerPolicy="no-referrer"
                  className="w-8 h-8 rounded-lg object-cover shrink-0"
                />
              ) : (
                <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center text-xs font-bold shrink-0">
                  {(user.displayName || user.email || 'S').slice(0, 1).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <div className="text-xs font-semibold text-slate-900 dark:text-zinc-100 truncate">
                  {user.displayName || 'Foydalanuvchi'}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-zinc-400 truncate">
                  {user.email || 'Bulutli sinxronizatsiya'}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => void onSignOut()}
              disabled={authBusy}
              title="Chiqish"
              aria-label="Hisobdan chiqish"
              className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-slate-500 dark:text-zinc-400 hover:text-rose-500 hover:bg-rose-500/10 cursor-pointer shrink-0"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => void onSignIn()}
            disabled={authBusy}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-100 dark:bg-zinc-900 hover:bg-slate-200/70 dark:hover:bg-zinc-800 text-slate-800 dark:text-zinc-100 text-xs font-semibold px-3 py-2.5 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-60"
          >
            <LogIn className="w-4 h-4 shrink-0 text-amber-500" />
            {authBusy ? 'Kirilmoqda...' : 'Google bilan sinxronlash'}
          </button>
        )}
      </div>
    </aside>
  );

  return (
    <>
      {/* Desktop persistent sidebar */}
      <div className="hidden lg:block h-full shrink-0">{sidebarContent}</div>

      {/* Mobile slide-over drawer */}
      {isOpenMobile && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div
            onClick={onCloseMobile}
            aria-hidden="true"
            className="fixed inset-0 bg-black/60"
          />
          <div className="relative z-10 h-full max-w-[85vw]">{sidebarContent}</div>
        </div>
      )}
    </>
  );
}
