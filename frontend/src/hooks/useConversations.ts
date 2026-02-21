import { useState, useCallback } from 'react';
import type { Conversation } from '../types';
import * as storage from '../storage/conversations';

export function useConversations() {
  const [conversations, setConversations] = useState<Conversation[]>(
    storage.getConversations,
  );
  const [activeId, setActiveIdState] = useState<string | null>(
    storage.getActiveId,
  );

  const reload = useCallback(() => {
    setConversations(storage.getConversations());
    setActiveIdState(storage.getActiveId());
  }, []);

  const createConversation = useCallback((model: string) => {
    const conv = storage.createConversation(model);
    setConversations(storage.getConversations());
    setActiveIdState(conv.id);
    return conv;
  }, []);

  const selectConversation = useCallback((id: string) => {
    storage.setActiveId(id);
    setActiveIdState(id);
  }, []);

  const removeConversation = useCallback((id: string) => {
    storage.deleteConversation(id);
    setConversations(storage.getConversations());
    setActiveIdState(storage.getActiveId());
  }, []);

  const activeConversation = activeId
    ? storage.getConversation(activeId)
    : null;

  return {
    conversations,
    activeId,
    activeConversation,
    createConversation,
    selectConversation,
    removeConversation,
    reload,
  };
}
