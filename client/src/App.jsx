import React, { useState, useEffect } from 'react';
import { useItems } from './hooks/useItems.js';
import { NoteForm } from './components/NoteForm.jsx';
import { UrlForm } from './components/UrlForm.jsx';
import { ItemList } from './components/ItemList.jsx';
import { QueryPanel } from './components/QueryPanel.jsx';
import { checkHealth } from './services/api.js';
import { Inbox, FileText, Globe } from 'lucide-react';

export function App() {
  const { items, loading, isPolling, refresh, removeItem, addItem } = useItems();
  const [activeTab, setActiveTab] = useState('note'); // 'note' | 'url'
  const [serverInfo, setServerInfo] = useState(null);

  useEffect(() => {
    checkHealth()
      .then((data) => setServerInfo(data))
      .catch(() => setServerInfo({ status: 'offline' }));
  }, []);

  return (
    <div className="app-layout">
      {/* Top Header */}
      <header className="app-header">
        <div className="header-container">
          <div className="brand">
            <div className="brand-icon">
              <Inbox size={22} />
            </div>
            <div>
              <h1 className="brand-title">AI Knowledge Inbox</h1>
              <p className="brand-subtitle">Production-grade RAG with local embeddings & cited LLM synthesis</p>
            </div>
          </div>

          <div className="header-meta">
            {serverInfo?.status === 'healthy' ? (
              <div className="server-status online">
                <span className="status-dot"></span>
                <span>Groq + MiniLM (384-dim)</span>
              </div>
            ) : (
              <div className="server-status connecting">
                <span className="status-dot"></span>
                <span>Connecting to backend...</span>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Two-Pane Container */}
      <main className="main-content">
        <div className="two-pane-grid">
          {/* Left Column: Ingestion & Knowledge Items */}
          <section className="pane pane-left">
            <div className="card ingest-card">
              <div className="tab-nav">
                <button
                  type="button"
                  className={`tab-btn ${activeTab === 'note' ? 'active' : ''}`}
                  onClick={() => setActiveTab('note')}
                >
                  <FileText size={16} />
                  <span>Add Note</span>
                </button>
                <button
                  type="button"
                  className={`tab-btn ${activeTab === 'url' ? 'active' : ''}`}
                  onClick={() => setActiveTab('url')}
                >
                  <Globe size={16} />
                  <span>Add URL</span>
                </button>
              </div>

              <div className="tab-content">
                {activeTab === 'note' ? (
                  <NoteForm onItemAdded={addItem} />
                ) : (
                  <UrlForm onItemAdded={addItem} />
                )}
              </div>
            </div>

            <div className="card items-card">
              <ItemList
                items={items}
                loading={loading}
                isPolling={isPolling}
                onRefresh={refresh}
                onDelete={removeItem}
              />
            </div>
          </section>

          {/* Right Column: Query & RAG Grounding */}
          <section className="pane pane-right">
            <div className="card query-card">
              <QueryPanel />
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

export default App;
