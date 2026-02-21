import type { Conversation } from '../../types';

interface ConversationListProps {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}

export function ConversationList({
  conversations,
  activeId,
  onSelect,
  onDelete,
}: ConversationListProps) {
  return (
    <div className="conversation-list">
      {conversations.length === 0 && (
        <div style={{ padding: '16px', color: 'var(--color-text-secondary)', fontSize: '13px', textAlign: 'center' }}>
          No conversations yet
        </div>
      )}
      {conversations.map((conv) => (
        <div
          key={conv.id}
          className={`conversation-item ${conv.id === activeId ? 'active' : ''}`}
          onClick={() => onSelect(conv.id)}
        >
          <span className="conv-title">{conv.title}</span>
          <button
            className="conv-delete"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(conv.id);
            }}
            aria-label="Delete conversation"
          >
            &times;
          </button>
        </div>
      ))}
    </div>
  );
}
