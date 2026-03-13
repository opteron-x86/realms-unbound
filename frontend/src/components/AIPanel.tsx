import { useState, useRef, useEffect, type KeyboardEvent } from 'react';
import { Send, X, Copy, ArrowDownToLine, Loader2, Trash2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import * as api from '../api';
import type { ChatMessage } from '../types';

interface Props {
  entityId: string | null;
  entityName: string | undefined;
  onClose: () => void;
  onInsert: (text: string) => void;
}

const QUICK_PROMPTS = [
  'Brainstorm ideas for this entity',
  'What conflicts or tensions could arise?',
  'Suggest connections to other parts of the world',
  'Help me expand the cultural details',
  'What would a traveler notice first?',
  'Suggest names for related entities',
  'Check this for consistency issues',
];

export default function AIPanel({ entityId, entityName, onClose, onInsert }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [includeRelated, setIncludeRelated] = useState(true);
  const messagesEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async (text: string) => {
    if (!text?.trim()) return;

    setMessages(prev => [...prev, { role: 'user', text: text.trim() }]);
    setInput('');
    setLoading(true);

    try {
      const res = await api.aiChat({
        message: text.trim(),
        entity_id: entityId,
        include_related: includeRelated,
      });
      setMessages(prev => [...prev, { role: 'assistant', text: res.reply }]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setMessages(prev => [...prev, { role: 'error', text: msg }]);
    }
    setLoading(false);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
  };

  return (
    <div className="ai-panel">
      <div className="ai-panel-header">
        <h2>⚡ AI Assistant</h2>
        <div style={{ display: 'flex', gap: 4 }}>
          <button className="icon-btn" onClick={() => setMessages([])} title="Clear chat">
            <Trash2 size={14} />
          </button>
          <button className="icon-btn" onClick={onClose} title="Close">
            <X size={14} />
          </button>
        </div>
      </div>

      {entityId && (
        <div className="ai-context-note">
          Context: <strong>{entityName || 'Selected entity'}</strong>
          <label style={{ marginLeft: 10, cursor: 'pointer', fontSize: 11 }}>
            <input
              type="checkbox"
              checked={includeRelated}
              onChange={e => setIncludeRelated(e.target.checked)}
              style={{ marginRight: 4 }}
            />
            Include related entities
          </label>
        </div>
      )}

      <div className="ai-messages">
        {messages.length === 0 && (
          <div style={{ padding: 8 }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
              {entityId
                ? 'Ask questions or get help with the current entity. The AI has context about this entity and its relationships.'
                : 'Select an entity for context-aware assistance, or ask general worldbuilding questions.'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
              Quick prompts:
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {QUICK_PROMPTS.map((p, i) => (
                <button
                  key={i}
                  onClick={() => sendMessage(p)}
                  style={{
                    fontSize: 11, padding: '4px 8px',
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 12,
                    color: 'var(--text-secondary)',
                  }}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`ai-message ${msg.role}`}>
            {msg.role === 'assistant' ? (
              <>
                <ReactMarkdown>{msg.text}</ReactMarkdown>
                <div style={{
                  display: 'flex', gap: 4, marginTop: 8,
                  borderTop: '1px solid var(--border)', paddingTop: 6,
                }}>
                  <button
                    className="ghost"
                    style={{ fontSize: 11, padding: '2px 6px' }}
                    onClick={() => copyToClipboard(msg.text)}
                    title="Copy to clipboard"
                  >
                    <Copy size={12} /> Copy
                  </button>
                  {entityId && (
                    <button
                      className="ghost"
                      style={{ fontSize: 11, padding: '2px 6px' }}
                      onClick={() => onInsert(msg.text)}
                      title="Append to entity content"
                    >
                      <ArrowDownToLine size={12} /> Insert
                    </button>
                  )}
                </div>
              </>
            ) : msg.role === 'error' ? (
              <span>⚠ {msg.text}</span>
            ) : (
              <span>{msg.text}</span>
            )}
          </div>
        ))}

        {loading && (
          <div className="ai-message assistant" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Loader2 size={14} className="spinning" />
            <span style={{ color: 'var(--text-muted)' }}>Thinking...</span>
          </div>
        )}

        <div ref={messagesEnd} />
      </div>

      <div className="ai-input-area">
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask the AI anything... (Enter to send, Shift+Enter for newline)"
          rows={2}
        />
        <button
          className="primary"
          onClick={() => sendMessage(input)}
          disabled={!input.trim() || loading}
          style={{ alignSelf: 'flex-end' }}
        >
          <Send size={14} />
        </button>
      </div>
    </div>
  );
}
