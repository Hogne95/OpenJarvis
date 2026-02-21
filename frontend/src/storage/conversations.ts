import type { Conversation, ConversationStore, ChatMessage } from '../types';

const STORAGE_KEY = 'openjarvis-conversations';

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function loadStore(): ConversationStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { version: 1, conversations: {}, activeId: null };
    const parsed = JSON.parse(raw);
    if (parsed.version === 1) return parsed;
    return { version: 1, conversations: {}, activeId: null };
  } catch {
    return { version: 1, conversations: {}, activeId: null };
  }
}

function saveStore(store: ConversationStore): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export function getConversations(): Conversation[] {
  const store = loadStore();
  return Object.values(store.conversations).sort(
    (a, b) => b.updatedAt - a.updatedAt,
  );
}

export function getActiveId(): string | null {
  return loadStore().activeId;
}

export function setActiveId(id: string | null): void {
  const store = loadStore();
  store.activeId = id;
  saveStore(store);
}

export function getConversation(id: string): Conversation | null {
  const store = loadStore();
  return store.conversations[id] || null;
}

export function createConversation(model: string): Conversation {
  const store = loadStore();
  const conv: Conversation = {
    id: generateId(),
    title: 'New chat',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    model,
    messages: [],
  };
  store.conversations[conv.id] = conv;
  store.activeId = conv.id;
  saveStore(store);
  return conv;
}

export function addMessage(
  conversationId: string,
  message: ChatMessage,
): void {
  const store = loadStore();
  const conv = store.conversations[conversationId];
  if (!conv) return;
  conv.messages.push(message);
  conv.updatedAt = Date.now();
  // Update title from first user message
  if (message.role === 'user' && conv.title === 'New chat') {
    conv.title = message.content.slice(0, 50) + (message.content.length > 50 ? '...' : '');
  }
  saveStore(store);
}

export function updateLastAssistantMessage(
  conversationId: string,
  content: string,
  toolCalls?: ChatMessage['toolCalls'],
  usage?: ChatMessage['usage'],
): void {
  const store = loadStore();
  const conv = store.conversations[conversationId];
  if (!conv) return;
  const lastMsg = conv.messages[conv.messages.length - 1];
  if (lastMsg && lastMsg.role === 'assistant') {
    lastMsg.content = content;
    if (toolCalls) lastMsg.toolCalls = toolCalls;
    if (usage) lastMsg.usage = usage;
    conv.updatedAt = Date.now();
    saveStore(store);
  }
}

export function deleteConversation(id: string): void {
  const store = loadStore();
  delete store.conversations[id];
  if (store.activeId === id) {
    const remaining = Object.keys(store.conversations);
    store.activeId = remaining.length > 0 ? remaining[0] : null;
  }
  saveStore(store);
}

export function generateMessageId(): string {
  return generateId();
}
