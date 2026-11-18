import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFirestoreConversationPayload,
  buildFirestoreMessagePayload,
  buildFirestoreUserProfilePayload,
  createValidId,
  deriveConversationTitle,
  formatConversationMarkdown,
  isValidFirestoreId,
  parseAssistantResponse,
  sanitizeSources,
  sanitizeUserSettings,
  stripMarkdownForSpeech,
} from './chatHelpers.ts';

test('createValidId generates Firestore-compliant IDs', () => {
  const convId = createValidId('conv');
  const msgId = createValidId('msg');
  assert.ok(convId.startsWith('conv_'));
  assert.ok(msgId.startsWith('msg_'));
  assert.equal(isValidFirestoreId(convId), true);
  assert.equal(isValidFirestoreId(msgId), true);
  assert.equal(isValidFirestoreId('bad/id'), false);
  assert.equal(isValidFirestoreId(''), false);
});

test('parseAssistantResponse extracts optional funFact cleanly', () => {
  const raw = 'Toshkent O‘zbekistonning poytaxti va eng yirik shahridir.\n\n[QIZIQARLI_FAKT]: Toshkent metrosi Markaziy Osiyodagi eng birinchi metropoliten hisoblanadi.';
  const parsed = parseAssistantResponse(raw);
  assert.equal(parsed.text, 'Toshkent O‘zbekistonning poytaxti va eng yirik shahridir.');
  assert.equal(
    parsed.funFact,
    'Toshkent metrosi Markaziy Osiyodagi eng birinchi metropoliten hisoblanadi.'
  );

  const plain = parseAssistantResponse('Oddiy javob matni.');
  assert.equal(plain.text, 'Oddiy javob matni.');
  assert.equal(plain.funFact, undefined);
});

test('sanitizeSources filters invalid URLs, deduplicates, and caps at 10 items', () => {
  const chunks = [
    { web: { uri: 'https://example.com/a', title: 'Example A' } },
    { web: { uri: 'https://example.com/a', title: 'Duplicate A' } },
    { web: { uri: 'javascript:alert(1)', title: 'Bad URL' } },
    ...Array.from({ length: 12 }, (_, i) => ({
      web: { uri: `https://site${i}.uz/page`, title: `Site ${i}` },
    })),
  ];

  const sanitized = sanitizeSources(chunks);
  assert.equal(sanitized.length, 10);
  assert.equal(sanitized[0].uri, 'https://example.com/a');
  assert.equal(sanitized[0].title, 'Example A');
  assert.ok(sanitized.every((s) => s.uri.startsWith('https://')));
});

test('stripMarkdownForSpeech removes markdown syntax and funFact trailer', () => {
  const input =
    '## Salom\nBu **muhim** [havola](https://example.com) va `kod`.\n\n[QIZIQARLI_FAKT]: Yashirin fakt.';
  const speech = stripMarkdownForSpeech(input);
  assert.equal(speech, 'Salom Bu muhim havola va kod.');
});

test('Firestore payload builders strictly enforce schema bounds and omit undefined fields', () => {
  const profilePayload = buildFirestoreUserProfilePayload({
    uid: 'user_123',
    theme: 'light',
    voiceName: 'Zephyr',
    autoSpeak: true,
    model: 'gemini-3.1-flash-lite',
    searchGrounding: false,
    displayName: '  Alisher  ',
  });
  assert.equal(profilePayload.uid, 'user_123');
  assert.equal('email' in profilePayload, false);
  assert.equal('photoURL' in profilePayload, false);

  const convPayload = buildFirestoreConversationPayload({
    id: 'conv_1',
    ownerId: 'user_123',
    title: 'A'.repeat(250),
    lastMessagePreview: 'B'.repeat(400),
    messageCount: 15000,
  });
  assert.ok(convPayload.title.length <= 160);
  assert.ok(convPayload.lastMessagePreview.length <= 300);
  assert.equal(convPayload.messageCount, 10000);

  const msgPayload = buildFirestoreMessagePayload({
    id: 'msg_1',
    ownerId: 'user_123',
    conversationId: 'conv_1',
    role: 'assistant',
    text: 'Salom!',
    funFact: undefined,
    sources: [],
    model: 'gemini-4-hydrogen',
  });
  assert.equal('funFact' in msgPayload, false);
  assert.equal('sources' in msgPayload, false);
  assert.equal(msgPayload.model, 'gemini-4-hydrogen');
});

test('sanitizeUserSettings falls back safely on invalid values', () => {
  const sanitized = sanitizeUserSettings({
    theme: 'neon' as never,
    voiceName: 'Unknown' as never,
    model: 'bad-model' as never,
    autoSpeak: true,
  });
  assert.equal(sanitized.theme, 'dark');
  assert.equal(sanitized.voiceName, 'Kore');
  assert.equal(sanitized.model, 'gemini-3.1-flash-lite');
  assert.equal(sanitized.autoSpeak, true);
  assert.equal(sanitized.searchGrounding, false);
});

test('deriveConversationTitle and formatConversationMarkdown handle Uzbek prompts', () => {
  assert.equal(deriveConversationTitle('   '), 'Yangi suhbat');
  assert.equal(deriveConversationTitle('Samarqand tarixi haqida gapirib ber'), 'Samarqand tarixi haqida gapirib ber');

  const md = formatConversationMarkdown(
    { title: 'Test suhbat', updatedAtMs: 1700000000000 },
    [
      {
        id: 'm1',
        ownerId: 'guest',
        conversationId: 'c1',
        role: 'user',
        text: 'Salom!',
        createdAtMs: 1700000000000,
      },
      {
        id: 'm2',
        ownerId: 'guest',
        conversationId: 'c1',
        role: 'assistant',
        text: 'Vaalaykum assalom!',
        funFact: 'Salomlashish madaniyati',
        sources: [{ title: 'Wiki', uri: 'https://uz.wikipedia.org' }],
        createdAtMs: 1700000001000,
      },
    ]
  );
  assert.ok(md.includes('# Test suhbat'));
  assert.ok(md.includes('Qiziqarli fakt: Salomlashish madaniyati'));
  assert.ok(md.includes('[Wiki](https://uz.wikipedia.org)'));
});
