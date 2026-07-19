/**
 * @file AiChat.tsx
 * @description Interactive AI Assistant chat terminal. Supports starting new threads, viewing conversation history, managing threads, and rendering assistant markdown responses.
 */

import React, { useState, useEffect, useRef } from 'react';
import { useLanguage } from '../LanguageContext';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata?: {
    sql_queries?: string[];
    reasoning_steps?: string[];
  };
  created_at: string;
  is_generating?: boolean;
}

interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

interface AiChatProps {
  isFullPage?: boolean;
}

interface CopySqlButtonProps {
  text: string;
  label: string;
}

const CopySqlButton: React.FC<CopySqlButtonProps> = ({ text, label }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button className={`ai-copy-sql-btn ${copied ? 'copied' : ''}`} onClick={handleCopy}>
      {copied ? 'Copied ✓' : label}
    </button>
  );
};

export const AiChat: React.FC<AiChatProps> = ({ isFullPage = false }) => {
  const { t } = useLanguage();
  const [isOpen, setIsOpen] = useState(isFullPage);
  const [showHistory, setShowHistory] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Synchronize isOpen state and auto-fetch conversations list for full-page mode
  useEffect(() => {
    if (isFullPage) {
      setIsOpen(true);
      fetchConversations();
    }
  }, [isFullPage]);

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
                      <th key={`th-${idx}`} style={{ padding: '8px 12px', fontWeight: 'bold', color: '#1e293b', whiteSpace: 'nowrap' }}>{parseInline(h)}</th>
                    ))}
                  </tr>
                </thead>
              )}
              <tbody>
                {rows.map((row, rIdx) => (
                  <tr key={`tr-${rIdx}`} style={{ borderBottom: '1px solid #e2e8f0', backgroundColor: rIdx % 2 === 0 ? '#ffffff' : '#f8fafc' }}>
                    {row.map((cell, cIdx) => (
                      <td key={`td-${cIdx}`} style={{ padding: '8px 12px', color: '#334155', whiteSpace: 'nowrap' }}>{parseInline(cell)}</td>
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
    
    // Add placeholder assistant message that we will stream into
    const assistantMessageId = `assist-${Date.now()}`;
    const tempAssistantMsg: Message = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      metadata: {
        sql_queries: [],
        reasoning_steps: []
      },
      created_at: new Date().toISOString(),
      is_generating: true,
    };

    setMessages(prev => [...prev, tempUserMsg, tempAssistantMsg]);

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmed,
          conversation_id: activeConversationId,
        }),
      });

      if (res.ok && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.trim()) continue;

            try {
              const data = JSON.parse(line);
              if (data.type === 'reasoning_step') {
                setMessages(prev => prev.map(msg => {
                  if (msg.id === assistantMessageId) {
                    const steps = msg.metadata?.reasoning_steps || [];
                    if (!steps.includes(data.content)) {
                      return {
                        ...msg,
                        metadata: {
                          ...msg.metadata,
                          reasoning_steps: [...steps, data.content]
                        }
                      };
                    }
                  }
                  return msg;
                }));
              } else if (data.type === 'sql_query') {
                setMessages(prev => prev.map(msg => {
                  if (msg.id === assistantMessageId) {
                    const queries = msg.metadata?.sql_queries || [];
                    if (!queries.includes(data.content)) {
                      return {
                        ...msg,
                        metadata: {
                          ...msg.metadata,
                          sql_queries: [...queries, data.content]
                        }
                      };
                    }
                  }
                  return msg;
                }));
              } else if (data.type === 'final_result') {
                setMessages(prev => prev.map(msg => {
                  if (msg.id === assistantMessageId) {
                    return {
                      ...msg,
                      content: data.response,
                      metadata: {
                        sql_queries: data.sql_queries || msg.metadata?.sql_queries,
                        reasoning_steps: data.reasoning_steps || msg.metadata?.reasoning_steps
                      }
                    };
                  }
                  return msg;
                }));
              } else if (data.type === 'complete') {
                setActiveConversationId(data.conversation_id);
                setMessages(prev => prev.map(msg => {
                  if (msg.id === assistantMessageId) {
                    return {
                      ...msg,
                      id: data.message.id,
                      content: data.message.content,
                      metadata: data.message.metadata,
                      created_at: data.message.created_at,
                      is_generating: false
                    };
                  }
                  return msg;
                }));
              } else if (data.type === 'error') {
                setMessages(prev => prev.map(msg => {
                  if (msg.id === assistantMessageId) {
                    return {
                      ...msg,
                      content: data.error,
                      is_generating: false
                    };
                  }
                  return msg;
                }));
              }
            } catch (err) {
              // Ignore line parse errors
            }
          }
        }
      } else {
        setMessages(prev => prev.map(msg => {
          if (msg.id === assistantMessageId) {
            return {
              ...msg,
              content: t('Sorry, something went wrong. Please try again.'),
              is_generating: false
            };
          }
          return msg;
        }));
      }
    } catch (err) {
      setMessages(prev => prev.map(msg => {
        if (msg.id === assistantMessageId) {
          return {
            ...msg,
            content: t('Network error. Please check your connection.'),
            is_generating: false
          };
        }
        return msg;
      }));
    } finally {
      setLoading(false);
      setMessages(prev => prev.map(msg => {
        if (msg.id === assistantMessageId) {
          return {
            ...msg,
            is_generating: false
          };
        }
        return msg;
      }));
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
      {/* Floating Chat Button (Miniature overlay mode only) */}
      {!isFullPage && (
        <button
          id="ai-chat-toggle"
          className={`ai-chat-fab ${isOpen ? 'active' : ''}`}
          onClick={toggleChat}
          title={t('AI Assistant')}
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
      )}

      {/* Chat Panel */}
      {isOpen && (
        <div className={`ai-chat-panel ${isFullPage ? 'full-page' : ''}`}>
          {isFullPage ? (
            <div className="ai-chat-fullpage-layout">
              {/* Sidebar */}
              <div className="ai-chat-sidebar">
                <div className="ai-sidebar-header">
                  <h3>📂 {t('Chat History')}</h3>
                  <button className="ai-new-chat-btn" onClick={startNewConversation} title={t('New Chat')}>
                    ➕ {t('New')}
                  </button>
                </div>
                {conversations.length === 0 ? (
                  <div className="ai-history-empty">{t('No conversations yet')}</div>
                ) : (
                  <div className="ai-history-list">
                    {conversations.map(conv => (
                      <div
                        key={conv.id}
                        className={`ai-history-item ${activeConversationId === conv.id ? 'active' : ''}`}
                        onClick={() => loadConversation(conv.id)}
                      >
                        <span className="ai-history-title">{conv.title || t('Untitled')}</span>
                        <div className="ai-history-meta">
                          <span>{formatTime(conv.updated_at)}</span>
                          <button
                            className="ai-history-delete"
                            onClick={e => { e.stopPropagation(); deleteConversation(conv.id); }}
                            title={t('Delete')}
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Chat Main Workspace */}
              <div className="ai-chat-main-container">
                {/* Header */}
                <div className="ai-chat-header">
                  <div className="ai-chat-header-left">
                    <div className="ai-chat-avatar">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                        <polygon points="12 11 9 13 10 9 7 7 11 7 12 3 13 7 17 7 14 9 15 13"></polygon>
                      </svg>
                    </div>
                    <div>
                      <span className="ai-chat-title">{t('KSP AI Assistant')}</span>
                      <span className="ai-chat-status">
                        <span className="status-dot online" style={{ backgroundColor: '#10b981' }}></span>
                        {t('Online')}
                      </span>
                    </div>
                  </div>
                  <div className="ai-chat-header-actions">
                    {activeConversationId && (
                      <button
                        className="ai-header-btn"
                        onClick={() => {
                          setShowPreviewModal(true);
                        }}
                        title={t('Export PDF')}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                          <polyline points="14 2 14 8 20 8"></polyline>
                          <line x1="16" y1="13" x2="8" y2="13"></line>
                          <line x1="16" y1="17" x2="8" y2="17"></line>
                          <polyline points="10 9 9 9 8 9"></polyline>
                        </svg>
                      </button>
                    )}
                  </div>
                </div>

                {/* Messages Area */}
                <div className="ai-chat-messages">
                  {messages.length === 0 && (
                    <div className="ai-chat-welcome">
                      <div className="ai-welcome-icon">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                        </svg>
                      </div>
                      <h4>{t('KSP AI Assistant')}</h4>
                      <p>{t('Ask questions about cases, datasets, policies, or get your daily briefing.')}</p>
                      <div className="ai-welcome-chips">
                        <button className="ai-chip" onClick={() => { setInput("What's my briefing for today?"); }}>
                          {t('📋 Today\'s Briefing')}
                        </button>
                        <button className="ai-chip" onClick={() => { setInput('Show recent updates'); }}>
                          {t('📊 Recent Updates')}
                        </button>
                        <button className="ai-chip" onClick={() => { setInput('Help me with a query'); }}>
                          {t('🔍 Query Help')}
                        </button>
                      </div>
                    </div>
                  )}
                  {messages.map(msg => (
                    <div key={msg.id} className={`ai-message ${msg.role}`}>
                      {msg.role === 'assistant' && (
                        <div className="ai-msg-avatar">
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                            <polygon points="12 11 9 13 10 9 7 7 11 7 12 3 13 7 17 7 14 9 15 13"></polygon>
                          </svg>
                        </div>
                      )}
                      <div className="ai-msg-bubble">
                        {msg.is_generating ? (
                          <div className="ai-thinking-container">
                            <div className="ai-thinking-header-loading">
                              <div className="ai-thinking-spinner"></div>
                              <span className="ai-thinking-title-text">{t('AI Database Agent is thinking...')}</span>
                            </div>
                            {msg.metadata?.reasoning_steps && msg.metadata.reasoning_steps.length > 0 && (
                              <div className="ai-thinking-steps-list" style={{ marginTop: '10px' }}>
                                <div className="ai-timeline">
                                  {msg.metadata.reasoning_steps.map((step, idx) => (
                                    <div key={idx} className="ai-timeline-step fade-in-step">
                                      <span className="ai-step-bullet">•</span>
                                      <span className="ai-step-text">{step}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            {msg.metadata?.sql_queries && msg.metadata.sql_queries.length > 0 && (
                              <div className="ai-thinking-queries-list" style={{ marginTop: '8px' }}>
                                <div className="ai-sql-container">
                                  <pre className="ai-sql-block mini">
                                    <code>{msg.metadata.sql_queries[msg.metadata.sql_queries.length - 1]}</code>
                                  </pre>
                                  <CopySqlButton text={msg.metadata.sql_queries[msg.metadata.sql_queries.length - 1]} label={t('Copy SQL')} />
                                </div>
                              </div>
                            )}
                          </div>
                        ) : (
                          <>
                            <div className="ai-msg-content">{parseMarkdown(msg.content)}</div>
                            {msg.role === 'assistant' && msg.metadata && (msg.metadata.sql_queries?.length || msg.metadata.reasoning_steps?.length) ? (
                              <details className="ai-evidence-accordion">
                                <summary className="ai-evidence-header">
                                  <span>🔎 {t('Evidence Trail & Reasoning Path')}</span>
                                </summary>
                                <div className="ai-evidence-body">
                                  {msg.metadata.reasoning_steps && msg.metadata.reasoning_steps.length > 0 && (
                                    <div className="ai-reasoning-section">
                                      <div className="ai-section-title">🧠 {t('Agent Reasoning Steps')}</div>
                                      <div className="ai-timeline">
                                        {msg.metadata.reasoning_steps.map((step, idx) => (
                                          <div key={idx} className="ai-timeline-step">
                                            <span className="ai-step-bullet">•</span>
                                            <span className="ai-step-text">{step}</span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                  {msg.metadata.sql_queries && msg.metadata.sql_queries.length > 0 && (
                                    <div className="ai-sql-section" style={{ marginTop: '12px' }}>
                                      <div className="ai-section-title">💻 {t('Database Queries Executed')}</div>
                                      {msg.metadata.sql_queries.map((query, idx) => (
                                        <div key={idx} className="ai-sql-container" style={{ marginBottom: '8px' }}>
                                          <pre className="ai-sql-block">
                                            <code>{query}</code>
                                          </pre>
                                          <CopySqlButton text={query} label={t('Copy SQL')} />
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </details>
                            ) : null}
                          </>
                        )}
                        <span className="ai-msg-time">{formatTime(msg.created_at)}</span>
                      </div>
                    </div>
                  ))}
                  {loading && messages.length > 0 && !messages[messages.length - 1].is_generating && (
                    <div className="ai-message assistant">
                      <div className="ai-msg-avatar">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                          <polygon points="12 11 9 13 10 9 7 7 11 7 12 3 13 7 17 7 14 9 15 13"></polygon>
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
                    placeholder={t('Ask the KSP AI Assistant...')}
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
                    title={t('Send Message')}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="22" y1="2" x2="11" y2="13"></line>
                      <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            // Popup float mode
            <>
              <div className="ai-chat-header">
                <div className="ai-chat-header-left">
                  <div className="ai-chat-avatar">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                      <polygon points="12 11 9 13 10 9 7 7 11 7 12 3 13 7 17 7 14 9 15 13"></polygon>
                    </svg>
                  </div>
                  <div>
                    <span className="ai-chat-title">{t('KSP AI Assistant')}</span>
                    <span className="ai-chat-status">
                      <span className="status-dot online" style={{ backgroundColor: '#10b981' }}></span>
                      {t('Online')}
                    </span>
                  </div>
                </div>
                <div className="ai-chat-header-actions">
                  {activeConversationId && (
                    <button
                      className="ai-header-btn"
                      onClick={() => setShowPreviewModal(true)}
                      title={t('Export PDF')}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                        <line x1="16" y1="13" x2="8" y2="13"></line>
                        <line x1="16" y1="17" x2="8" y2="17"></line>
                        <polyline points="10 9 9 9 8 9"></polyline>
                      </svg>
                    </button>
                  )}
                  <button
                    className="ai-header-btn"
                    onClick={() => { setShowHistory(!showHistory); if (!showHistory) fetchConversations(); }}
                    title={t('Chat History')}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10"></circle>
                      <polyline points="12 6 12 12 16 14"></polyline>
                    </svg>
                  </button>
                  <button className="ai-header-btn" onClick={startNewConversation} title={t('New Chat')}>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="12" y1="5" x2="12" y2="19"></line>
                      <line x1="5" y1="12" x2="19" y2="12"></line>
                    </svg>
                  </button>
                </div>
              </div>

              {showHistory && (
                <div className="ai-chat-history">
                  <div className="ai-history-header">
                    <span>{t('Conversations')}</span>
                    <button className="ai-header-btn small" onClick={() => setShowHistory(false)}>
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                      </svg>
                    </button>
                  </div>
                  {conversations.length === 0 ? (
                    <div className="ai-history-empty">{t('No conversations yet')}</div>
                  ) : (
                    <div className="ai-history-list">
                      {conversations.map(conv => (
                        <div
                          key={conv.id}
                          className={`ai-history-item ${activeConversationId === conv.id ? 'active' : ''}`}
                          onClick={() => { loadConversation(conv.id); setShowHistory(false); }}
                        >
                          <span className="ai-history-title">{conv.title || t('Untitled')}</span>
                          <div className="ai-history-meta">
                            <span>{formatTime(conv.updated_at)}</span>
                            <button
                              className="ai-history-delete"
                              onClick={e => { e.stopPropagation(); deleteConversation(conv.id); }}
                              title={t('Delete')}
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

              <div className="ai-chat-messages">
                {messages.length === 0 && (
                  <div className="ai-chat-welcome">
                    <div className="ai-welcome-icon">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                      </svg>
                    </div>
                    <h4>{t('KSP AI Assistant')}</h4>
                    <p>{t('Ask questions about cases, datasets, policies, or get your daily briefing.')}</p>
                    <div className="ai-welcome-chips">
                      <button className="ai-chip" onClick={() => { setInput("What's my briefing for today?"); }}>
                        {t('📋 Today\'s Briefing')}
                      </button>
                      <button className="ai-chip" onClick={() => { setInput('Show recent updates'); }}>
                        {t('📊 Recent Updates')}
                      </button>
                      <button className="ai-chip" onClick={() => { setInput('Help me with a query'); }}>
                        {t('🔍 Query Help')}
                      </button>
                    </div>
                  </div>
                )}
                {messages.map(msg => (
                  <div key={msg.id} className={`ai-message ${msg.role}`}>
                    {msg.role === 'assistant' && (
                      <div className="ai-msg-avatar">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                          <polygon points="12 11 9 13 10 9 7 7 11 7 12 3 13 7 17 7 14 9 15 13"></polygon>
                        </svg>
                      </div>
                    )}
                    <div className="ai-msg-bubble">
                      {msg.is_generating ? (
                        <div className="ai-thinking-container">
                          <div className="ai-thinking-header-loading">
                            <div className="ai-thinking-spinner"></div>
                            <span className="ai-thinking-title-text">{t('AI Database Agent is thinking...')}</span>
                          </div>
                          {msg.metadata?.reasoning_steps && msg.metadata.reasoning_steps.length > 0 && (
                            <div className="ai-thinking-steps-list" style={{ marginTop: '10px' }}>
                              <div className="ai-timeline">
                                {msg.metadata.reasoning_steps.map((step, idx) => (
                                  <div key={idx} className="ai-timeline-step fade-in-step">
                                    <span className="ai-step-bullet">•</span>
                                    <span className="ai-step-text">{step}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {msg.metadata?.sql_queries && msg.metadata.sql_queries.length > 0 && (
                            <div className="ai-thinking-queries-list" style={{ marginTop: '8px' }}>
                              <div className="ai-sql-container">
                                <pre className="ai-sql-block mini">
                                  <code>{msg.metadata.sql_queries[msg.metadata.sql_queries.length - 1]}</code>
                                </pre>
                                <CopySqlButton text={msg.metadata.sql_queries[msg.metadata.sql_queries.length - 1]} label={t('Copy SQL')} />
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <>
                          <div className="ai-msg-content">{parseMarkdown(msg.content)}</div>
                          {msg.role === 'assistant' && msg.metadata && (msg.metadata.sql_queries?.length || msg.metadata.reasoning_steps?.length) ? (
                            <details className="ai-evidence-accordion">
                              <summary className="ai-evidence-header">
                                <span>🔎 {t('Evidence Trail & Reasoning Path')}</span>
                              </summary>
                              <div className="ai-evidence-body">
                                {msg.metadata.reasoning_steps && msg.metadata.reasoning_steps.length > 0 && (
                                  <div className="ai-reasoning-section">
                                    <div className="ai-section-title">🧠 {t('Agent Reasoning Steps')}</div>
                                    <div className="ai-timeline">
                                      {msg.metadata.reasoning_steps.map((step, idx) => (
                                        <div key={idx} className="ai-timeline-step">
                                          <span className="ai-step-bullet">•</span>
                                          <span className="ai-step-text">{step}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                {msg.metadata.sql_queries && msg.metadata.sql_queries.length > 0 && (
                                  <div className="ai-sql-section" style={{ marginTop: '12px' }}>
                                    <div className="ai-section-title">💻 {t('Database Queries Executed')}</div>
                                    {msg.metadata.sql_queries.map((query, idx) => (
                                      <div key={idx} className="ai-sql-container" style={{ marginBottom: '8px' }}>
                                        <pre className="ai-sql-block">
                                          <code>{query}</code>
                                        </pre>
                                        <CopySqlButton text={query} label={t('Copy SQL')} />
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </details>
                          ) : null}
                        </>
                      )}
                      <span className="ai-msg-time">{formatTime(msg.created_at)}</span>
                    </div>
                  </div>
                ))}
                {loading && messages.length > 0 && !messages[messages.length - 1].is_generating && (
                  <div className="ai-message assistant">
                    <div className="ai-msg-avatar">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                        <polygon points="12 11 9 13 10 9 7 7 11 7 12 3 13 7 17 7 14 9 15 13"></polygon>
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

              <div className="ai-chat-input-area">
                <textarea
                  ref={inputRef}
                  className="ai-chat-input"
                  placeholder={t('Ask the KSP AI Assistant...')}
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
                  title={t('Send Message')}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13"></line>
                    <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                  </svg>
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* PDF Preview & Download Confirmation Modal */}
      {showPreviewModal && activeConversationId && (
        <div className="ai-modal-backdrop" onClick={() => setShowPreviewModal(false)}>
          <div className="ai-preview-modal" onClick={e => e.stopPropagation()}>
            <div className="ai-modal-header">
              <h3>📋 {t('Report Export Preview')}</h3>
              <button className="ai-modal-close" onClick={() => setShowPreviewModal(false)} title={t('Close Preview')}>
                ×
              </button>
            </div>
            <div className="ai-modal-body">
              <iframe
                className="ai-pdf-preview-frame"
                src={`/api/ai/conversations/${activeConversationId}/pdf?preview=true`}
                title="PDF Preview"
              />
            </div>
            <div className="ai-modal-footer">
              <button className="ai-btn-secondary" onClick={() => setShowPreviewModal(false)}>
                {t('Cancel')}
              </button>
              <button
                className="ai-btn-primary"
                onClick={() => {
                  window.location.href = `/api/ai/conversations/${activeConversationId}/pdf`;
                  setShowPreviewModal(false);
                }}
              >
                {t('Confirm & Download')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default AiChat;
