/**
 * Core session component.
 * Two modes:
 *   Conversation — student-led Q&A with the avatar
 *   Lecture      — avatar delivers a scripted lecture verbatim; pauses for questions
 */
import React, { useState, useCallback } from 'react'
import { startConversation, endConversation, generateLectureScript } from '../api/client.js'

const isMobile = /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent)

export default function AvatarSession({ onSessionChange }) {
  const [mode, setMode]                   = useState('conversation') // 'conversation' | 'lecture'
  const [topic, setTopic]                 = useState('')
  const [duration, setDuration]           = useState(6)
  const [script, setScript]               = useState('')
  const [generatingScript, setGenerating] = useState(false)
  const [conversationId, setConversationId] = useState(null)
  const [conversationUrl, setConversationUrl] = useState(null)
  const [loading, setLoading]             = useState(false)
  const [error, setError]                 = useState(null)

  // ── Generate lecture script (pre-session) ──────────────────────────────
  const handleGenerateScript = useCallback(async () => {
    if (!topic.trim()) return setError('Enter a topic first.')
    setError(null)
    setGenerating(true)
    try {
      const data = await generateLectureScript(topic, duration)
      setScript(data.script)
    } catch (e) {
      setError(e.message)
    } finally {
      setGenerating(false)
    }
  }, [topic, duration])

  // ── Start session (conversation or lecture) ────────────────────────────
  const handleStart = useCallback(async () => {
    if (!topic.trim()) return setError('Enter a topic to start the session.')
    if (mode === 'lecture' && !script.trim()) return setError('Generate a lecture script first.')
    setLoading(true)
    setError(null)
    try {
      const data = await startConversation(topic, mode === 'lecture' ? script : null)
      const cid  = data.conversation_id || data.id
      const url  = data.conversation_url
      if (!url) throw new Error('No conversation URL returned.')
      setConversationId(cid)
      setConversationUrl(url)
      onSessionChange?.(cid)
      if (isMobile) window.open(url, '_blank', 'noopener')
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [topic, mode, script, onSessionChange])

  // ── End session ─────────────────────────────────────────────────────────
  const handleEnd = useCallback(async () => {
    if (conversationId) await endConversation(conversationId)
    setConversationId(null)
    setConversationUrl(null)
    setScript('')
    onSessionChange?.(null)
  }, [conversationId, onSessionChange])

  // ── Active session (desktop iframe / mobile link) ──────────────────────
  if (conversationUrl) {
    if (isMobile) {
      return (
        <div style={s.center}>
          <div style={s.card}>
            <div style={s.modeBadge(mode)}>{mode === 'lecture' ? '📖 Lecture Mode' : '💬 Conversation Mode'}</div>
            <h2 style={s.title}>Session Active</h2>
            <p style={s.sub}>Topic: <strong>{topic}</strong></p>
            <p style={s.sub}>Tap below to open your session. Allow microphone access when prompted.</p>
            <a href={conversationUrl} target="_blank" rel="noopener noreferrer" style={s.joinBtn}>
              Open Session
            </a>
            {mode === 'lecture' && (
              <details style={{ marginTop: 16 }}>
                <summary style={{ cursor: 'pointer', color: '#7c3aed', fontWeight: 600, fontSize: 13 }}>
                  View Lecture Script
                </summary>
                <pre style={s.scriptText}>{script}</pre>
              </details>
            )}
            <button onClick={handleEnd} style={{ ...s.btn, background: '#dc2626', marginTop: 16, width: '100%' }}>
              End Session
            </button>
          </div>
        </div>
      )
    }

    return (
      <div style={s.sessionWrap}>
        <iframe
          src={conversationUrl}
          allow="camera; microphone; autoplay; display-capture"
          style={s.iframe}
          title="Digital Twin Session"
        />
        <div style={s.bar}>
          <div style={s.modeBadge(mode)}>{mode === 'lecture' ? '📖 Lecture' : '💬 Conversation'}</div>
          <span style={s.topicTag}>Topic: {topic}</span>
          {mode === 'lecture' && (
            <details style={{ flex: 1 }}>
              <summary style={{ cursor: 'pointer', color: '#a78bfa', fontSize: 13, fontWeight: 600 }}>
                Lecture Script ▾
              </summary>
              <pre style={{ ...s.scriptText, maxHeight: 160, overflowY: 'auto', marginTop: 8 }}>{script}</pre>
            </details>
          )}
          <button onClick={handleEnd} style={{ ...s.btn, background: '#dc2626', marginLeft: 'auto' }}>
            End Session
          </button>
        </div>
      </div>
    )
  }

  // ── Start screen ────────────────────────────────────────────────────────
  return (
    <div style={s.center}>
      <div style={s.card}>
        <h1 style={s.title}>🎓 Digital Twin Teaching Assistant</h1>
        <p style={s.sub}>Professor J Christopher Westland — AI avatar for 1:1 student tutoring</p>

        {/* Mode tabs */}
        <div style={s.tabs}>
          <button
            onClick={() => { setMode('conversation'); setError(null) }}
            style={s.tab(mode === 'conversation')}
          >
            💬 Conversation
          </button>
          <button
            onClick={() => { setMode('lecture'); setError(null) }}
            style={s.tab(mode === 'lecture')}
          >
            📖 Lecture
          </button>
        </div>

        {/* Topic input */}
        <div style={s.form}>
          <label style={s.label}>Topic</label>
          <input
            type="text"
            value={topic}
            onChange={e => setTopic(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && mode === 'conversation' && handleStart()}
            placeholder={mode === 'lecture' ? 'e.g. Introduction to Derivatives' : 'e.g. Derivatives, Chapter 4 Accounting…'}
            style={s.input}
            autoFocus
          />

          {/* Lecture-only controls */}
          {mode === 'lecture' && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
                <label style={s.label}>Duration</label>
                <select
                  value={duration}
                  onChange={e => setDuration(Number(e.target.value))}
                  style={{ ...s.input, flex: 'none', width: 110, padding: '8px 10px' }}
                >
                  {[3, 5, 6, 10, 15, 20].map(d => (
                    <option key={d} value={d}>{d} minutes</option>
                  ))}
                </select>
                <button
                  onClick={handleGenerateScript}
                  disabled={generatingScript || !topic.trim()}
                  style={{ ...s.btn, background: '#7c3aed', flex: 1 }}
                >
                  {generatingScript ? '⏳ Generating…' : '✍️ Generate Script'}
                </button>
              </div>

              {script && (
                <>
                  <label style={{ ...s.label, marginTop: 8 }}>
                    Lecture Script <span style={{ color: '#888', fontWeight: 400 }}>(editable — avatar will deliver this verbatim)</span>
                  </label>
                  <textarea
                    value={script}
                    onChange={e => setScript(e.target.value)}
                    rows={10}
                    style={{ ...s.input, fontFamily: 'monospace', fontSize: 13, lineHeight: 1.6, resize: 'vertical' }}
                  />
                  <p style={s.hint}>
                    💡 The avatar will deliver this script, pause for any student questions, then say <em>"Returning to the lecture…"</em> and continue.
                  </p>
                </>
              )}
            </>
          )}

          {error && <div style={s.err}>{error}</div>}

          <button
            onClick={handleStart}
            disabled={loading || !topic.trim() || (mode === 'lecture' && !script.trim())}
            style={s.startBtn}
          >
            {loading
              ? '⏳ Starting…'
              : mode === 'lecture'
                ? (script ? '▶ Start Lecture' : '✍️ Generate script above first')
                : '▶ Start Session'}
          </button>
        </div>

        <p style={s.hint}>
          💡 Upload course notes first via the <strong>Knowledge Base</strong> button above to power the lecture script generator.
        </p>
      </div>
    </div>
  )
}

const s = {
  center:      { display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: 24 },
  card:        { background: '#1a1d2e', borderRadius: 16, padding: 40, width: 'min(600px,100%)', border: '1px solid #333' },
  title:       { fontSize: 24, fontWeight: 700, marginBottom: 6, textAlign: 'center' },
  sub:         { color: '#888', textAlign: 'center', marginBottom: 20, lineHeight: 1.6, fontSize: 14 },
  tabs:        { display: 'flex', gap: 0, marginBottom: 24, borderRadius: 10, overflow: 'hidden', border: '1px solid #333' },
  tab: active  => ({ flex: 1, padding: '10px 0', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 14,
                      background: active ? '#2563eb' : '#0f1117', color: active ? '#fff' : '#888',
                      transition: 'background 0.2s' }),
  modeBadge: m => ({ display: 'inline-block', padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600, marginBottom: 10,
                      background: m === 'lecture' ? '#3b1f6e' : '#1e2a4a', color: m === 'lecture' ? '#a78bfa' : '#60a5fa' }),
  form:        { display: 'flex', flexDirection: 'column', gap: 10 },
  label:       { fontSize: 13, color: '#aaa', marginBottom: 2 },
  input:       { background: '#0f1117', border: '1px solid #444', borderRadius: 8, padding: '10px 14px', color: '#fff', fontSize: 14, outline: 'none', width: '100%', boxSizing: 'border-box' },
  err:         { background: '#5c2020', borderRadius: 6, padding: '8px 12px', fontSize: 13, color: '#fff' },
  startBtn:    { padding: 14, background: '#2563eb', color: '#fff', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: 'pointer', marginTop: 4, opacity: 1 },
  btn:         { padding: '8px 18px', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 },
  hint:        { marginTop: 16, color: '#666', fontSize: 12, textAlign: 'center', lineHeight: 1.6 },
  sessionWrap: { display: 'flex', flexDirection: 'column', height: '100vh', background: '#0f1117' },
  iframe:      { flex: 1, border: 'none', width: '100%' },
  bar:         { display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 16px', background: '#1a1d2e', borderTop: '1px solid #333', flexWrap: 'wrap' },
  topicTag:    { color: '#e8eaf0', fontSize: 13, fontWeight: 600, alignSelf: 'center' },
  joinBtn:     { display: 'block', padding: '13px 24px', background: '#2563eb', color: '#fff', borderRadius: 10, fontSize: 15, fontWeight: 700, textDecoration: 'none', textAlign: 'center', marginTop: 8 },
  scriptText:  { whiteSpace: 'pre-wrap', fontSize: 12, color: '#ccc', lineHeight: 1.6, margin: 0 },
}
