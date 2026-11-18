import { initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import {
  Timestamp,
  collection,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  getFirestore,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import type { ChatMessage, Conversation, UserProfile, UserSettings } from '../types.ts';
import {
  buildFirestoreConversationPayload,
  buildFirestoreMessagePayload,
  buildFirestoreUserProfilePayload,
  sanitizeSources,
  sanitizeUserSettings,
} from '../utils/chatHelpers.ts';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: Array<{
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }>;
  };
}

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData.map((provider) => ({
          providerId: provider.providerId,
          displayName: provider.displayName,
          email: provider.email,
          photoUrl: provider.photoURL,
        })) ?? [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testFirestoreConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Firebase Firestore offline: check firebase-applet-config.json');
      return false;
    }
    return true;
  }
}

function toMillis(ts: unknown): number {
  if (ts instanceof Timestamp) {
    return ts.toMillis();
  }
  if (typeof ts === 'object' && ts !== null && 'toMillis' in ts) {
    return (ts as { toMillis: () => number }).toMillis();
  }
  return Date.now();
}

export function subscribeAuth(callback: (user: User | null) => void): Unsubscribe {
  return onAuthStateChanged(auth, callback);
}

export async function signInWithGoogle(): Promise<User> {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

export async function signOutUser(): Promise<void> {
  await signOut(auth);
}

export async function syncUserProfile(
  user: User,
  fallbackSettings: UserSettings
): Promise<UserProfile> {
  const path = `users/${user.uid}`;
  const userRef = doc(db, 'users', user.uid);
  try {
    const snap = await getDoc(userRef);
    if (!snap.exists()) {
      const payload = buildFirestoreUserProfilePayload({
        uid: user.uid,
        displayName: user.displayName ?? undefined,
        email: user.email ?? undefined,
        photoURL: user.photoURL ?? undefined,
        ...sanitizeUserSettings(fallbackSettings),
      });
      await setDoc(userRef, {
        ...payload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return {
        uid: user.uid,
        displayName: user.displayName ?? undefined,
        email: user.email ?? undefined,
        photoURL: user.photoURL ?? undefined,
        ...sanitizeUserSettings(fallbackSettings),
      };
    }

    const data = snap.data();
    const settings = sanitizeUserSettings({
      theme: data.theme,
      voiceName: data.voiceName,
      autoSpeak: data.autoSpeak,
      model: data.model,
      searchGrounding: data.searchGrounding,
    });

    const profile: UserProfile = {
      uid: user.uid,
      displayName: typeof data.displayName === 'string' ? data.displayName : user.displayName ?? undefined,
      email: typeof data.email === 'string' ? data.email : user.email ?? undefined,
      photoURL: typeof data.photoURL === 'string' ? data.photoURL : user.photoURL ?? undefined,
      ...settings,
    };

    const metadataChanged =
      (user.displayName && user.displayName !== data.displayName) ||
      (user.email && user.email !== data.email) ||
      (user.photoURL && user.photoURL !== data.photoURL);

    if (metadataChanged) {
      const updatePayload = buildFirestoreUserProfilePayload(profile);
      await updateDoc(userRef, {
        ...updatePayload,
        updatedAt: serverTimestamp(),
      });
    }

    return profile;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function updateUserSettingsInFirestore(
  user: User,
  settings: UserSettings
): Promise<void> {
  const path = `users/${user.uid}`;
  try {
    const payload = buildFirestoreUserProfilePayload({
      uid: user.uid,
      displayName: user.displayName ?? undefined,
      email: user.email ?? undefined,
      photoURL: user.photoURL ?? undefined,
      ...sanitizeUserSettings(settings),
    });
    await updateDoc(doc(db, 'users', user.uid), {
      ...payload,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export function subscribeConversations(
  uid: string,
  onData: (conversations: Conversation[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const path = `users/${uid}/conversations`;
  const q = query(collection(db, 'users', uid, 'conversations'), where('ownerId', '==', uid));
  return onSnapshot(
    q,
    (snapshot) => {
      const items: Conversation[] = snapshot.docs.map((docSnap) => {
        const d = docSnap.data();
        return {
          id: docSnap.id,
          ownerId: String(d.ownerId ?? uid),
          title: String(d.title ?? 'Yangi suhbat'),
          lastMessagePreview: String(d.lastMessagePreview ?? ''),
          messageCount: Number(d.messageCount ?? 0),
          createdAtMs: toMillis(d.createdAt),
          updatedAtMs: toMillis(d.updatedAt),
        };
      });
      items.sort((a, b) => b.updatedAtMs - a.updatedAtMs);
      onData(items);
    },
    (error) => {
      console.error('subscribeConversations error:', path, error);
      onError(error);
    }
  );
}

export function subscribeMessages(
  uid: string,
  conversationId: string,
  onData: (messages: ChatMessage[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const path = `users/${uid}/conversations/${conversationId}/messages`;
  const q = query(
    collection(db, 'users', uid, 'conversations', conversationId, 'messages'),
    where('ownerId', '==', uid)
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const items: ChatMessage[] = snapshot.docs.map((docSnap) => {
        const d = docSnap.data();
        return {
          id: docSnap.id,
          ownerId: String(d.ownerId ?? uid),
          conversationId: String(d.conversationId ?? conversationId),
          role: d.role === 'user' ? 'user' : 'assistant',
          text: String(d.text ?? ''),
          funFact: typeof d.funFact === 'string' && d.funFact ? d.funFact : undefined,
          sources: Array.isArray(d.sources) ? sanitizeSources(d.sources) : undefined,
          model: typeof d.model === 'string' && d.model ? d.model : undefined,
          createdAtMs: toMillis(d.createdAt),
        };
      });
      items.sort((a, b) => a.createdAtMs - b.createdAtMs);
      onData(items);
    },
    (error) => {
      console.error('subscribeMessages error:', path, error);
      onError(error);
    }
  );
}

export async function commitConversationAndMessage(params: {
  uid: string;
  conversation: {
    id: string;
    title: string;
    lastMessagePreview: string;
    messageCount: number;
    isNew: boolean;
  };
  message: {
    id: string;
    role: 'user' | 'assistant';
    text: string;
    funFact?: string;
    sources?: ChatMessage['sources'];
    model?: string;
  };
}): Promise<void> {
  const { uid, conversation, message } = params;
  const convPath = `users/${uid}/conversations/${conversation.id}`;
  const convRef = doc(db, 'users', uid, 'conversations', conversation.id);
  const msgRef = doc(db, 'users', uid, 'conversations', conversation.id, 'messages', message.id);

  try {
    const batch = writeBatch(db);
    const convPayload = buildFirestoreConversationPayload({
      id: conversation.id,
      ownerId: uid,
      title: conversation.title,
      lastMessagePreview: conversation.lastMessagePreview,
      messageCount: conversation.messageCount,
    });

    if (conversation.isNew) {
      batch.set(convRef, {
        ...convPayload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      batch.update(convRef, {
        title: convPayload.title,
        lastMessagePreview: convPayload.lastMessagePreview,
        messageCount: convPayload.messageCount,
        updatedAt: serverTimestamp(),
      });
    }

    const msgPayload = buildFirestoreMessagePayload({
      id: message.id,
      ownerId: uid,
      conversationId: conversation.id,
      role: message.role,
      text: message.text,
      funFact: message.funFact,
      sources: message.sources,
      model: message.model,
    });

    batch.set(msgRef, {
      ...msgPayload,
      createdAt: serverTimestamp(),
    });

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, convPath);
  }
}

export async function renameConversationInFirestore(
  uid: string,
  conversation: Conversation,
  newTitle: string
): Promise<void> {
  const path = `users/${uid}/conversations/${conversation.id}`;
  try {
    const payload = buildFirestoreConversationPayload({
      id: conversation.id,
      ownerId: uid,
      title: newTitle,
      lastMessagePreview: conversation.lastMessagePreview,
      messageCount: conversation.messageCount,
    });
    await updateDoc(doc(db, 'users', uid, 'conversations', conversation.id), {
      title: payload.title,
      lastMessagePreview: payload.lastMessagePreview,
      messageCount: payload.messageCount,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteConversationInFirestore(
  uid: string,
  conversationId: string
): Promise<void> {
  const path = `users/${uid}/conversations/${conversationId}`;
  try {
    const messagesQuery = query(
      collection(db, 'users', uid, 'conversations', conversationId, 'messages'),
      where('ownerId', '==', uid)
    );
    const messagesSnap = await getDocs(messagesQuery);

    const docs = messagesSnap.docs;
    for (let i = 0; i < docs.length; i += 400) {
      const batch = writeBatch(db);
      for (const msgDoc of docs.slice(i, i + 400)) {
        batch.delete(msgDoc.ref);
      }
      await batch.commit();
    }

    const finalBatch = writeBatch(db);
    finalBatch.delete(doc(db, 'users', uid, 'conversations', conversationId));
    await finalBatch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}
