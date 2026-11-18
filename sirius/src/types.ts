export type ThemeMode = 'dark' | 'light';

export type VoiceName = 'Puck' | 'Charon' | 'Kore' | 'Fenrir' | 'Zephyr';

export type GeminiModel = 'gemini-4-hydrogen' | 'gemini-3.1-flash-lite';

export interface GroundSource {
  title: string;
  uri: string;
}

export interface ChatMessage {
  id: string;
  ownerId: string;
  conversationId: string;
  role: 'user' | 'assistant';
  text: string;
  funFact?: string;
  sources?: GroundSource[];
  model?: GeminiModel | string;
  createdAtMs: number;
}

export interface Conversation {
  id: string;
  ownerId: string;
  title: string;
  lastMessagePreview: string;
  messageCount: number;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface UserSettings {
  theme: ThemeMode;
  voiceName: VoiceName;
  autoSpeak: boolean;
  model: GeminiModel;
  searchGrounding: boolean;
}

export interface UserProfile extends UserSettings {
  uid: string;
  displayName?: string;
  email?: string;
  photoURL?: string;
}

export const DEFAULT_USER_SETTINGS: UserSettings = {
  theme: 'dark',
  voiceName: 'Kore',
  autoSpeak: false,
  model: 'gemini-3.1-flash-lite',
  searchGrounding: false,
};

export const VOICE_OPTIONS: ReadonlyArray<{
  id: VoiceName;
  label: string;
  tone: string;
}> = [
  { id: 'Kore', label: 'Kore', tone: 'Yumshoq va iliq ohang' },
  { id: 'Puck', label: 'Puck', tone: 'Jonli va chaqqon ohang' },
  { id: 'Charon', label: 'Charon', tone: 'Chuqur va vazmin ohang' },
  { id: 'Fenrir', label: 'Fenrir', tone: 'Qat’iy va ravon ohang' },
  { id: 'Zephyr', label: 'Zephyr', tone: 'Yengil va tiniq ohang' },
];

export const MODEL_OPTIONS: ReadonlyArray<{
  id: GeminiModel;
  label: string;
  summary: string;
}> = [
  {
    id: 'gemini-3.1-flash-lite',
    label: 'Sirius Tezkor',
    summary: '1 soniyada tezkor va aniq javoblar (tavsiya etiladi)',
  },
  {
    id: 'gemini-4-hydrogen',
    label: 'Sirius Chuqur',
    summary: 'Murakkab mantiqiy tahlil va batafsil izohlar uchun',
  },
];
