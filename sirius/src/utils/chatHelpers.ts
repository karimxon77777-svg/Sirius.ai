import type {
  ChatMessage,
  Conversation,
  GeminiModel,
  GroundSource,
  ThemeMode,
  UserProfile,
  UserSettings,
  VoiceName,
} from '../types.ts';

const VALID_ID_REGEX = /^[a-zA-Z0-9_-]+$/;
const VALID_THEMES = new Set<ThemeMode>(['dark', 'light']);
const VALID_VOICES = new Set<VoiceName>(['Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr']);
const VALID_MODELS = new Set<GeminiModel>(['gemini-4-hydrogen', 'gemini-3.1-flash-lite']);

export function isValidFirestoreId(id: string): boolean {
  return typeof id === 'string' && id.length > 0 && id.length <= 128 && VALID_ID_REGEX.test(id);
}

export function createValidId(prefix: 'conv' | 'msg' = 'msg'): string {
  const safePrefix = VALID_ID_REGEX.test(prefix) ? prefix : 'id';
  const timePart = Date.now().toString(36);
  const randPart = Math.random().toString(36).slice(2, 8);
  return `${safePrefix}_${timePart}_${randPart}`.slice(0, 128);
}

export function truncateText(input: string, maxLength: number): string {
  const normalized = input.trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  if (maxLength <= 3) {
    return normalized.slice(0, maxLength);
  }
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

export function parseAssistantResponse(rawText: string): {
  text: string;
  funFact?: string;
} {
  const normalized = (rawText ?? '').replace(/\r\n/g, '\n').trim();
  if (!normalized) {
    return { text: '' };
  }

  const factRegex = /(?:^|\n{1,2})\s*(?:\*\*|__)?\[?\s*QIZIQARLI[_\s-]*FAKT\s*\]?(?:\*\*|__)?\s*:\s*([\s\S]+)$/i;
  const match = normalized.match(factRegex);
  if (!match) {
    return { text: normalized };
  }

  const body = normalized.slice(0, match.index).trim();
  const rawFact = match[1]
    .replace(/^\s*[-–—*]+\s*/, '')
    .replace(/\n+/g, ' ')
    .trim();

  if (!rawFact) {
    return { text: body || normalized };
  }

  return {
    text: body || normalized,
    funFact: truncateText(rawFact, 1000),
  };
}

export interface RawGroundingChunk {
  web?: {
    uri?: unknown;
    title?: unknown;
  };
}

export function sanitizeSources(chunks: unknown): GroundSource[] {
  if (!Array.isArray(chunks)) {
    return [];
  }

  const seen = new Set<string>();
  const result: GroundSource[] = [];

  for (const item of chunks) {
    if (result.length >= 10) {
      break;
    }
    const candidate = item as RawGroundingChunk & { uri?: unknown; title?: unknown };
    const rawUri = candidate?.web?.uri ?? candidate?.uri;
    const rawTitle = candidate?.web?.title ?? candidate?.title;

    if (typeof rawUri !== 'string') {
      continue;
    }
    const trimmedUri = rawUri.trim();
    if (!/^https?:\/\//i.test(trimmedUri)) {
      continue;
    }
    const boundedUri = trimmedUri.slice(0, 1000);
    if (seen.has(boundedUri)) {
      continue;
    }
    seen.add(boundedUri);

    let fallbackTitle = 'Manba';
    try {
      fallbackTitle = new URL(boundedUri).hostname.replace(/^www\./, '') || 'Manba';
    } catch {
      fallbackTitle = 'Manba';
    }

    const cleanTitle =
      typeof rawTitle === 'string' && rawTitle.trim().length > 0
        ? truncateText(rawTitle.replace(/\s+/g, ' '), 200)
        : truncateText(fallbackTitle, 200);

    result.push({
      title: cleanTitle,
      uri: boundedUri,
    });
  }

  return result;
}

export function stripMarkdownForSpeech(text: string): string {
  const withoutFact = parseAssistantResponse(text).text;
  return withoutFact
    .replace(/```[\s\S]*?```/g, ' kod bloki. ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_~>-]{1,3}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 3200);
}

export function deriveConversationTitle(firstPrompt: string): string {
  const cleaned = firstPrompt
    .replace(/\s+/g, ' ')
    .replace(/[`*_#]/g, '')
    .trim();
  if (!cleaned) {
    return 'Yangi suhbat';
  }
  return truncateText(cleaned, 64);
}

export function sanitizeUserSettings(input: Partial<UserSettings> | undefined): UserSettings {
  const theme: ThemeMode = input?.theme && VALID_THEMES.has(input.theme) ? input.theme : 'dark';
  const voiceName: VoiceName =
    input?.voiceName && VALID_VOICES.has(input.voiceName) ? input.voiceName : 'Kore';
  const model: GeminiModel =
    input?.model && VALID_MODELS.has(input.model) ? input.model : 'gemini-3.1-flash-lite';

  return {
    theme,
    voiceName,
    autoSpeak: Boolean(input?.autoSpeak),
    model,
    searchGrounding: input?.searchGrounding !== undefined ? Boolean(input.searchGrounding) : false,
  };
}

export function buildFirestoreUserProfilePayload(
  profile: Partial<UserProfile> & { uid: string }
): Record<string, unknown> {
  const settings = sanitizeUserSettings(profile);
  const payload: Record<string, unknown> = {
    uid: profile.uid.slice(0, 128),
    theme: settings.theme,
    voiceName: settings.voiceName,
    autoSpeak: settings.autoSpeak,
    model: settings.model,
    searchGrounding: settings.searchGrounding,
  };

  if (typeof profile.displayName === 'string' && profile.displayName.trim()) {
    payload.displayName = profile.displayName.trim().slice(0, 120);
  }
  if (typeof profile.email === 'string' && profile.email.trim()) {
    payload.email = profile.email.trim().slice(0, 200);
  }
  if (typeof profile.photoURL === 'string' && profile.photoURL.trim()) {
    payload.photoURL = profile.photoURL.trim().slice(0, 500);
  }

  return payload;
}

export function buildFirestoreConversationPayload(input: {
  id: string;
  ownerId: string;
  title: string;
  lastMessagePreview: string;
  messageCount: number;
}): {
  id: string;
  ownerId: string;
  title: string;
  lastMessagePreview: string;
  messageCount: number;
} {
  const safeTitle = truncateText(input.title || 'Yangi suhbat', 160) || 'Yangi suhbat';
  const safePreview = truncateText(input.lastMessagePreview || '', 300);
  const safeCount = Math.max(0, Math.min(10000, Math.trunc(input.messageCount || 0)));

  return {
    id: input.id.slice(0, 128),
    ownerId: input.ownerId.slice(0, 128),
    title: safeTitle,
    lastMessagePreview: safePreview,
    messageCount: safeCount,
  };
}

export function buildFirestoreMessagePayload(input: {
  id: string;
  ownerId: string;
  conversationId: string;
  role: 'user' | 'assistant';
  text: string;
  funFact?: string;
  sources?: GroundSource[];
  model?: string;
}): Record<string, unknown> {
  const safeText = input.text.trim().slice(0, 20000) || ' ';
  const payload: Record<string, unknown> = {
    id: input.id.slice(0, 128),
    ownerId: input.ownerId.slice(0, 128),
    conversationId: input.conversationId.slice(0, 128),
    role: input.role === 'user' ? 'user' : 'assistant',
    text: safeText,
  };

  if (typeof input.funFact === 'string' && input.funFact.trim().length > 0) {
    payload.funFact = input.funFact.trim().slice(0, 1000);
  }

  if (Array.isArray(input.sources) && input.sources.length > 0) {
    const cleanSources = sanitizeSources(input.sources);
    if (cleanSources.length > 0) {
      payload.sources = cleanSources;
    }
  }

  if (typeof input.model === 'string' && input.model.trim().length > 0) {
    payload.model = input.model.trim().slice(0, 40);
  }

  return payload;
}

export function formatConversationMarkdown(
  conversation: Pick<Conversation, 'title' | 'updatedAtMs'>,
  messages: ReadonlyArray<ChatMessage>
): string {
  const lines: string[] = [
    `# ${conversation.title}`,
    '',
    `Eksport qilingan vaqt: ${new Date(conversation.updatedAtMs || Date.now()).toLocaleString('uz-UZ')}`,
    '',
    '---',
    '',
  ];

  for (const msg of messages) {
    const author = msg.role === 'user' ? 'Siz' : 'Sirius AI';
    lines.push(`### ${author}`);
    lines.push('');
    lines.push(msg.text);
    if (msg.funFact) {
      lines.push('');
      lines.push(`> Qiziqarli fakt: ${msg.funFact}`);
    }
    if (msg.sources && msg.sources.length > 0) {
      lines.push('');
      lines.push('Manbalar:');
      for (const src of msg.sources) {
        lines.push(`- [${src.title}](${src.uri})`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}
