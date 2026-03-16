/**
 * Core session component.
 * - Starts a Tavus CVI conversation
 * - Embeds the Tavus conversation URL in an iframe
 * - Triggers lecture script generation
 */
import React, { useState, useCallback, useMemo } from 'react'
import { startConversation, endConversation, generateLectureScript } from '../api/client.js'

const isMobile = /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent)

export default function AvatarSession({ sessionId, onSessionChange }) {
  const [conversationId, setConversationId]   = useState(null)
  const [conversationUrl, setConversationUrl] = useState(null)
  const [topic, setTopic]                     = useState('')
  const [loading, setLoading]                 = useState(false)
  const [error, setError]                     = useState(null)
  const [lectureScript, setLectureScript]     = useState(null)
  const [generating, setGenerating]           = useState(false)

  const handleStart = useCallback(async () => {
    if (!topic.trim()) return setError('Enter a topic to start the session.')
    setLoading(true)
    setError(null)
    try {
      const data = await startConversation(topic)
      const cid  = data.conversation_id || data.id
      const url  = data.conversation_url
      if (!url) throw new Error('No conversation URL returned. Check Tavus configuration.')
      setConversationId(cid)
      setConversationUrl(url)
      onSessionChange?.(cid)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [topic, onSessionChange])

  const handleEnd = useCallback(async () => {
    if (conversationId) await endConversation(conversationId)
    setConversationId(null)
    setConversationUrl(null)
    setLectureScript(null)
    onSessionChange?.(null)
  }, [conversationId, onSessionChange])

  const handleLecture = useCallback(async () => {
    if (!conversationId) return
    setGenerating(true)
    try {
      const data = await generateLectureScript(conversationId, topic, 6)
      setLectureScript(data.script)
    } catch (e) {
      setError(e.message)
    } finally {
      setGenerating(false)
    }
  }, [conversationId, topic])

  // Active session view — mobile opens new tab, desktop embeds iframe
  if (conversationUrl) {
    if (isMobile) {
      return (
        <div style={styles.mobileContainer}>
          <div style={styles.card}>
            <h2 style={styles.title}>Session Active</h2>
            <p style={styles.subtitle}>Topic: <strong>{topic}</strong></p>
            <p style={styles.subtitle}>
              Tap the button below to open your digital twin session. Allow microphone access when prompted.
            </p>
            <a href={conversationUrl} target="_blank" rel="noopener noreferrer" style={styles.joinBtn}>
              Open Session
            </a>
            <div style={{ display:'flex', gap:10, marginTop:16, justifyContent:'center' }}>
              <button onClick={handleLecture} disabled={generating} style={{ ...styles.btn, background:'#7c3aed' }}>
                {generating ? 'Generating…' : 'Generate Lecture'}
              </button>
              <button onClick={handleEnd} style={{ ...styles.btn, background:'#dc2626' }}>
                End Session
              </button>
            </div>
            {lectureScript && (
              <details style={{ ...styles.scriptBox, marginTop:16 }}>
                <summary style={{ cursor:'pointer', color:'#7c3aed', fontWeight:600 }}>Lecture Script</summary>
                <pre style={styles.scriptText}>{lectureScript}</pre>
              </details>
            )}
          </div>
        </div>
      )
    }

    return (
      <div style={styles.sessionContainer}>
        <iframe
          src={conversationUrl}
          allow="camera; microphone; autoplay; display-capture"
          style={styles.iframe}
          title="Digital Twin Session"
        />
        <div style={styles.controls}>
          <span style={styles.topicBadge}>Topic: {topic}</span>
          <button
            onClick={handleLecture}
            disabled={generating}
            style={{ ...styles.btn, background: '#7c3aed' }}
          >
            {generating ? 'Generating…' : 'Start Lecture'}
          </button>
          <button onClick={handleEnd} style={{ ...styles.btn, background: '#dc2626' }}>
            End Session
          </button>
        </div>
        {lectureScript && (
          <details style={styles.scriptBox}>
            <summary style={{ cursor: 'pointer', color: '#7c3aed', fontWeight: 600 }}>
              Generated Lecture Script
            </summary>
            <pre style={styles.scriptText}>{lectureScript}</pre>
          </details>
        )}
      </div>
    )
  }

  // Session start view
  return (
    <div style={styles.startContainer}>
      <div style={styles.card}>
        <h1 style={styles.title}>🎓 Digital Twin Teaching Assistant</h1>
        <p style={styles.subtitle}>
          Your AI professor avatar — delivers lectures, answers questions,
          and adapts to how you're feeling.
        </p>
        <div style={styles.form}>
          <label style={styles.label}>What topic would you like to study?</label>
          <input
            type="text"
            value={topic}
            onChange={e => setTopic(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleStart()}
            placeholder="e.g. Calculus — derivatives, Chapter 4 Organic Chemistry…"
            style={styles.input}
            autoFocus
          />
          {error && <div style={styles.error}>{error}</div>}
          <button
            onClick={handleStart}
            disabled={loading || !topic.trim()}
            style={styles.startBtn}
          >
            {loading ? '⏳ Starting session…' : '▶ Start Session'}
          </button>
        </div>
        <p style={styles.hint}>
          💡 Upload your class notes first via the <strong>Knowledge Base</strong> button above.
        </p>
      </div>
    </div>
  )
}

const styles = {
  mobileContainer: { display:'flex',alignItems:'center',justifyContent:'center',minHeight:'100vh',background:'#0f1117',padding:24 },
  joinBtn: { display:'block',padding:'14px 28px',background:'#2563eb',color:'#fff',borderRadius:10,fontSize:16,fontWeight:700,textDecoration:'none',textAlign:'center',marginTop:8 },
  sessionContainer: { display:'flex',flexDirection:'column',height:'100vh',background:'#0f1117' },
  iframe: { flex:1,border:'none',width:'100%' },
  controls: { display:'flex',alignItems:'center',gap:12,padding:'12px 16px',background:'#1a1d2e',borderTop:'1px solid #333',flexWrap:'wrap' },
  topicBadge: { color:'#e8eaf0',fontSize:14,fontWeight:600,marginRight:'auto' },
  btn: { padding:'8px 18px',border:'none',borderRadius:8,color:'#fff',cursor:'pointer',fontSize:14,fontWeight:600 },
  scriptBox: { background:'#1a1d2e',borderTop:'1px solid #333',padding:'12px 16px',maxHeight:220,overflowY:'auto' },
  scriptText: { whiteSpace:'pre-wrap',fontSize:13,color:'#ccc',marginTop:10,lineHeight:1.6 },
  startContainer: { display:'flex',alignItems:'center',justifyContent:'center',minHeight:'100vh',padding:24 },
  card: { background:'#1a1d2e',borderRadius:16,padding:40,width:'min(560px,100%)',border:'1px solid #333' },
  title: { fontSize:26,fontWeight:700,marginBottom:8,textAlign:'center' },
  subtitle: { color:'#888',textAlign:'center',marginBottom:32,lineHeight:1.6 },
  form: { display:'flex',flexDirection:'column',gap:12 },
  label: { fontSize:14,color:'#aaa' },
  input: { background:'#0f1117',border:'1px solid #444',borderRadius:8,padding:'12px 16px',color:'#fff',fontSize:16,outline:'none' },
  error: { background:'#5c2020',borderRadius:6,padding:'8px 12px',fontSize:13,color:'#fff' },
  startBtn: { padding:'14px',background:'#2563eb',color:'#fff',border:'none',borderRadius:10,fontSize:16,fontWeight:700,cursor:'pointer',marginTop:8 },
  hint: { marginTop:24,color:'#666',fontSize:13,textAlign:'center',lineHeight:1.6 },
}
