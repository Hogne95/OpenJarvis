import type { Conversation, ModelInfo, SavingsData } from '../../types';
import { ConversationList } from './ConversationList';
import { ModelSelector } from './ModelSelector';
import { SavingsPanel } from './SavingsPanel';

interface SidebarProps {
  isOpen: boolean;
  conversations: Conversation[];
  activeId: string | null;
  models: ModelInfo[];
  selectedModel: string;
  savings: SavingsData | null;
  localModel?: string;
  onSelectModel: (model: string) => void;
  onNewChat: () => void;
  onSelectConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void;
}

export function Sidebar({
  isOpen,
  conversations,
  activeId,
  models,
  selectedModel,
  savings,
  localModel,
  onSelectModel,
  onNewChat,
  onSelectConversation,
  onDeleteConversation,
}: SidebarProps) {
  return (
    <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
      <div className="sidebar-header">
        <h1>OpenJarvis</h1>
        <button className="new-chat-btn" onClick={onNewChat}>
          + New Chat
        </button>
      </div>
      <ModelSelector
        models={models}
        selected={selectedModel}
        onSelect={onSelectModel}
      />
      <ConversationList
        conversations={conversations}
        activeId={activeId}
        onSelect={onSelectConversation}
        onDelete={onDeleteConversation}
      />
      <SavingsPanel savings={savings} localModel={localModel} />
    </aside>
  );
}
