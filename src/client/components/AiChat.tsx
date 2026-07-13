import React, { useState, useEffect, useRef } from 'react';
import { useLanguage } from '../LanguageContext';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at: string;
}

interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export const AiChat: React.FC = () => {
  const { t } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Custom markdown inline parser (converts **text** to bold elements)
  const parseInline = (text: string) => {
    const parts = text.split(/\*\*([^*]+)\*\*/g);
    return parts.map((part, idx) => {
      if (idx % 2 === 1) {
        return <strong key={idx} style={{ fontWeight: 700 }}>{part}</strong>;
      }
      return part;
    });
  };

  // Custom markdown block parser (converts markdown block headers, lists, tables, paragraphs to React JSX)
  const parseMarkdown = (markdown: string) => {
    if (!markdown) return null;
    
    const lines = markdown.split('\n');
    const elements: React.ReactNode[] = [];
    let listItems: string[] = [];
    let inList = false;

    const flushList = (keyIndex: number) => {
      if (listItems.length > 0) {
        elements.push(
          <ul key={`ul-${keyIndex}`} style={{ paddingLeft: '20px', margin: '8px 0', listStyleType: 'square' }}>
            {listItems.map((item, idx) => (
              <li key={`li-${keyIndex}-${idx}`} style={{ fontSize: '0.9rem', marginBottom: '4px' }}>{parseInline(item)}</li>
            ))}
          </ul>
        );
        listItems = [];
      }
    };

    let tableRows: string[][] = [];
    let inTable = false;

    const flushTable = (keyIndex: number) => {
      if (tableRows.length > 0) {
        const hasHeaders = tableRows.length > 1; // Simplistic header check
        const headers = hasHeaders ? tableRows[0] : [];
        const rows = hasHeaders ? tableRows.slice(1) : tableRows;

        elements.push(
          <div key={`table-wrapper-${keyIndex}`} style={{ overflowX: 'auto', margin: '12px 0', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left' }}>
              {hasHeaders && (
                <thead>
                  <tr style={{ backgroundColor: '#f1f5f9', borderBottom: '2px solid #e2e8f0' }}>
                    {headers.map((h, idx) => (
                      <th key={`th-${idx}`} style={{ padding: '8px 12px', fontWeight: 'bold', color: '#1e293b' }}>{parseInline(h)}</th>
                    ))}
                  </tr>
                </thead>
              )}
              <tbody>
                {rows.map((row, rIdx) => (
                  <tr key={`tr-${rIdx}`} style={{ borderBottom: '1px solid #e2e8f0', backgroundColor: rIdx % 2 === 0 ? '#ffffff' : '#f8fafc' }}>
                    {row.map((cell, cIdx) => (
                      <td key={`td-${cIdx}`} style={{ padding: '8px 12px', color: '#334155' }}>{parseInline(cell)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
        tableRows = [];
      }
    };

    lines.forEach((line, index) => {
      const trimmed = line.trim();
      
      // Table row check: starts and ends with |
      if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
        if (inList) {
          flushList(index);
          inList = false;
        }
        inTable = true;
        
        // Skip separator line (e.g., |---|---|)
        if (trimmed.includes('---')) {
          return;
        }

        const cells = trimmed.split('|').map(c => c.trim()).filter((c, idx, arr) => idx > 0 && idx < arr.length - 1);
        tableRows.push(cells);
      } else {
        if (inTable) {
          flushTable(index);
          inTable = false;
        }

        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
          inList = true;
          listItems.push(trimmed.substring(2));
        } else {
          if (inList) {
            flushList(index);
            inList = false;
          }

          if (trimmed.startsWith('#### ')) {
            elements.push(<h4 key={index} style={{ fontSize: '0.95rem', fontWeight: 'bold', margin: '12px 0 6px 0' }}>{parseInline(trimmed.substring(5))}</h4>);
          } else if (trimmed.startsWith('### ')) {
            elements.push(<h3 key={index} style={{ fontSize: '1.05rem', fontWeight: 'bold', margin: '14px 0 8px 0' }}>{parseInline(trimmed.substring(4))}</h3>);
          } else if (trimmed.startsWith('## ')) {
            elements.push(<h2 key={index} style={{ fontSize: '1.15rem', fontWeight: 'bold', margin: '16px 0 10px 0' }}>{parseInline(trimmed.substring(3))}</h2>);
          } else if (trimmed.startsWith('# ')) {
            elements.push(<h1 key={index} style={{ fontSize: '1.25rem', fontWeight: 'bold', margin: '18px 0 12px 0' }}>{parseInline(trimmed.substring(2))}</h1>);
          } else if (trimmed === '---') {
            elements.push(<hr key={index} style={{ border: 0, height: '1px', background: '#e2e8f0', margin: '16px 0' }} />);
          } else if (trimmed.length > 0) {
            elements.push(<p key={index} style={{ marginBottom: '8px', fontSize: '0.9rem', lineHeight: '1.4' }}>{parseInline(trimmed)}</p>);
          }
        }
      }
    });

    if (inList) {
      flushList(lines.length);
    }
    if (inTable) {
      flushTable(lines.length);
    }

    return elements;
  };

  // Scroll to bottom when messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-focus input when chat opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Fetch conversations list
  const fetchConversations = async () => {
    try {
      const res = await fetch('/api/ai/conversations');
      if (res.ok) {
        const data = await res.json();
        setConversations(data.conversations || []);
      }
    } catch (err) {
      console.error('Failed to fetch conversations:', err);
    }
  };

  // Load a specific conversation's messages
  const loadConversation = async (convId: string) => {
    try {
      const res = await fetch(`/api/ai/conversations/${convId}`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
        setActiveConversationId(convId);
        setShowHistory(false);
      }
    } catch (err) {
      console.error('Failed to load conversation:', err);
    }
  };

  // Delete a conversation
  const deleteConversation = async (convId: string) => {
    try {
      await fetch(`/api/ai/conversations/${convId}`, { method: 'DELETE' });
      setConversations(prev => prev.filter(c => c.id !== convId));
      if (activeConversationId === convId) {
        setActiveConversationId(null);
        setMessages([]);
      }
    } catch (err) {
      console.error('Failed to delete conversation:', err);
    }
  };

  // Start a new conversation
  const startNewConversation = () => {
    setActiveConversationId(null);
    setMessages([]);
    setShowHistory(false);
    inputRef.current?.focus();
  };

  // Send a message
  const sendMessage = async () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    setInput('');
    setLoading(true);

    // Optimistic: add user message
    const tempUserMsg: Message = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: trimmed,
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, tempUserMsg]);

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmed,
          conversation_id: activeConversationId,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setActiveConversationId(data.conversation_id);
        setMessages(prev => [...prev, data.message]);
      } else {
        setMessages(prev => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            role: 'assistant',
            content: 'Sorry, something went wrong. Please try again.',
            created_at: new Date().toISOString(),
          },
        ]);
      }
    } catch (err) {
      setMessages(prev => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'assistant',
          content: 'Network error. Please check your connection.',
          created_at: new Date().toISOString(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const toggleChat = () => {
    setIsOpen(prev => !prev);
    if (!isOpen) {
      fetchConversations();
    }
  };

  const formatTime = (isoStr: string) => {
    try {
      return new Date(isoStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  return (
    <>
      {/* Floating Chat Button */}
      <button
        id="ai-chat-toggle"
        className={`ai-chat-fab ${isOpen ? 'active' : ''}`}
        onClick={toggleChat}
        title="AI Assistant"
      >
        {isOpen ? (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            <circle cx="9" cy="10" r="1" fill="currentColor"></circle>
            <circle cx="12" cy="10" r="1" fill="currentColor"></circle>
            <circle cx="15" cy="10" r="1" fill="currentColor"></circle>
          </svg>
        )}
      </button>

      {/* Chat Panel */}
      {isOpen && (
        <div className="ai-chat-panel">
          {/* Header */}
          <div className="ai-chat-header">
            <div className="ai-chat-header-left">
              <div className="ai-chat-avatar">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2a4 4 0 0 1 4 4v2a4 4 0 0 1-8 0V6a4 4 0 0 1 4-4z"></path>
                  <rect x="9" y="12" width="6" height="5" rx="1"></rect>
                  <path d="M5 20a7 7 0 0 1 14 0"></path>
                </svg>
              </div>
              <div>
                <span className="ai-chat-title">KSP AI Assistant</span>
                <span className="ai-chat-status">
                  <span className="status-dot online" style={{ backgroundColor: '#10b981' }}></span>
                  {t('Online')}
                </span>
              </div>
            </div>
            <div className="ai-chat-header-actions">
              <button
                className="ai-header-btn"
                onClick={() => { setShowHistory(!showHistory); if (!showHistory) fetchConversations(); }}
                title="Chat History"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"></circle>
                  <polyline points="12 6 12 12 16 14"></polyline>
                </svg>
              </button>
              <button className="ai-header-btn" onClick={startNewConversation} title="New Chat">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
              </button>
            </div>
          </div>

          {/* Conversation History Sidebar */}
          {showHistory && (
            <div className="ai-chat-history">
              <div className="ai-history-header">
                <span>Conversations</span>
                <button className="ai-header-btn small" onClick={() => setShowHistory(false)}>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              </div>
              {conversations.length === 0 ? (
                <div className="ai-history-empty">No conversations yet</div>
              ) : (
                <div className="ai-history-list">
                  {conversations.map(conv => (
                    <div
                      key={conv.id}
                      className={`ai-history-item ${activeConversationId === conv.id ? 'active' : ''}`}
                      onClick={() => loadConversation(conv.id)}
                    >
                      <span className="ai-history-title">{conv.title || 'Untitled'}</span>
                      <div className="ai-history-meta">
                        <span>{formatTime(conv.updated_at)}</span>
                        <button
                          className="ai-history-delete"
                          onClick={e => { e.stopPropagation(); deleteConversation(conv.id); }}
                          title="Delete"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Messages Area */}
          <div className="ai-chat-messages">
            {messages.length === 0 && (
              <div className="ai-chat-welcome">
                <div className="ai-welcome-icon">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                  </svg>
                </div>
                <h4>KSP AI Assistant</h4>
                <p>Ask questions about cases, datasets, policies, or get your daily briefing.</p>
                <div className="ai-welcome-chips">
                  <button className="ai-chip" onClick={() => { setInput("What's my briefing for today?"); }}>
                    📋 Today's Briefing
                  </button>
                  <button className="ai-chip" onClick={() => { setInput('Show recent updates'); }}>
                    📊 Recent Updates
                  </button>
                  <button className="ai-chip" onClick={() => { setInput('Help me with a query'); }}>
                    🔍 Query Help
                  </button>
                </div>
              </div>
            )}
            {messages.map(msg => (
              <div key={msg.id} className={`ai-message ${msg.role}`}>
                {msg.role === 'assistant' && (
                  <div className="ai-msg-avatar">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="3"></circle>
                      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"></path>
                    </svg>
                  </div>
                )}
                <div className="ai-msg-bubble">
                  <div className="ai-msg-content">{parseMarkdown(msg.content)}</div>
                  <span className="ai-msg-time">{formatTime(msg.created_at)}</span>
                </div>
              </div>
            ))}
            {loading && (
              <div className="ai-message assistant">
                <div className="ai-msg-avatar">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3"></circle>
                    <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"></path>
                  </svg>
                </div>
                <div className="ai-msg-bubble">
                  <div className="ai-typing">
                    <span></span><span></span><span></span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="ai-chat-input-area">
            <textarea
              ref={inputRef}
              className="ai-chat-input"
              placeholder="Ask the KSP AI Assistant..."
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              disabled={loading}
            />
            <button
              className="ai-send-btn"
              onClick={sendMessage}
              disabled={!input.trim() || loading}
              title="Send Message"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"></line>
                <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
              </svg>
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default AiChat;
