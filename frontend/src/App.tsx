import { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar/Sidebar';
import { ChatArea } from './components/Chat/ChatArea';
import { useConversations } from './hooks/useConversations';
import { useModels } from './hooks/useModels';
import { useSavings } from './hooks/useSavings';
import { useChat } from './hooks/useChat';
import { useServerInfo } from './hooks/useServerInfo';

export default function App() {
  const { models } = useModels();
  const { savings, refresh: refreshSavings } = useSavings();
  const serverInfo = useServerInfo();
  const {
    conversations,
    activeId,
    activeConversation,
    createConversation,
    selectConversation,
    removeConversation,
    reload: reloadConversations,
  } = useConversations();

  const [selectedModel, setSelectedModel] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Set default model
  useEffect(() => {
    if (!selectedModel && models.length > 0) {
      setSelectedModel(models[0].id);
    }
  }, [models, selectedModel]);

  const {
    messages,
    streamState,
    sendMessage,
    stopStreaming,
    reloadMessages,
  } = useChat(activeId, selectedModel);

  // Reload messages when active conversation changes
  useEffect(() => {
    reloadMessages();
  }, [activeId, reloadMessages]);

  const handleNewChat = () => {
    createConversation(selectedModel || 'default');
    reloadMessages();
  };

  const handleSendMessage = async (content: string) => {
    if (!activeId) {
      createConversation(selectedModel || 'default');
      // Need to wait a tick for state to update
      setTimeout(async () => {
        reloadConversations();
        await sendMessage(content);
        reloadConversations();
        refreshSavings();
      }, 0);
      return;
    }
    await sendMessage(content);
    reloadConversations();
    refreshSavings();
  };

  return (
    <div className="app">
      <button
        className="sidebar-toggle"
        onClick={() => setSidebarOpen(!sidebarOpen)}
        aria-label="Toggle sidebar"
      >
        {sidebarOpen ? '\u2715' : '\u2630'}
      </button>
      <Sidebar
        isOpen={sidebarOpen}
        conversations={conversations}
        activeId={activeId}
        models={models}
        selectedModel={selectedModel}
        savings={savings}
        localModel={serverInfo?.model}
        onSelectModel={setSelectedModel}
        onNewChat={handleNewChat}
        onSelectConversation={(id) => {
          selectConversation(id);
        }}
        onDeleteConversation={removeConversation}
      />
      <ChatArea
        messages={messages}
        streamState={streamState}
        onSendMessage={handleSendMessage}
        onStopStreaming={stopStreaming}
        activeConversation={activeConversation}
        serverInfo={serverInfo}
      />
    </div>
  );
}
