import React, { useState, useEffect } from 'react'
import AvatarSession from './components/AvatarSession.jsx'
import EmotionDetector from './components/EmotionDetector.jsx'
import NotesManager from './components/NotesManager.jsx'
import { healthCheck } from './api/client.js'

export default function App() {
  const [sessionId, setSessionId]       = useState(null)
  const [showNotes, setShowNotes]       = useState(false)
  const [health, setHealth]             = useState(null)
  const [emotionEnabled, setEmotion]    = useState(false)

  useEffect(() => {
    healthCheck().then(setHealth).catch(() => {})
  }, [])

  return (
    <div style={{ minHeight: '100vh', background: '#0f1117', color: '#e8eaf0' }}>
      {/* Top navbar */}
      <nav style={nav}>
        <span style={navBrand}>🤖 Digital Twin</span>
        <div style={navActions}>
          {health && (
            <span style={healthBadge} title={`${health.rag_chunks} chunks stored`}>
              📚 {health.rag_chunks} chunks · {health.topics?.length ?? 0} topics
            </span>
          )}
          <button
            onClick={() => setEmotion(e => !e)}
            style={{ ...navBtn, background: emotionEnabled ? '#1a3d1a' : '#3d1a1a' }}
            title="Toggle emotion detection"
          >
            {emotionEnabled ? '👁 Emotion ON' : '👁 Emotion OFF'}
          </button>
          <button onClick={() => setShowNotes(true)} style={{ ...navBtn, background: '#1e2a4a' }}>
            📚 Knowledge Base
          </button>
        </div>
      </nav>

      {/* Main content */}
      <AvatarSession sessionId={sessionId} onSessionChange={setSessionId} onOpenNotes={() => setShowNotes(true)} />

      {/* Emotion detector (background, shows self-view thumbnail) */}
      <EmotionDetector sessionId={sessionId} enabled={emotionEnabled && !!sessionId} />

      {/* Notes modal */}
      {showNotes && <NotesManager onClose={() => { setShowNotes(false); healthCheck().then(setHealth) }} />}
    </div>
  )
}

const nav = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  padding: '12px 20px', background: '#1a1d2e', borderBottom: '1px solid #333',
  position: 'sticky', top: 0, zIndex: 50,
}
const navBrand   = { fontWeight: 700, fontSize: 18 }
const navActions = { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }
const navBtn     = { padding: '6px 14px', border: '1px solid #444', borderRadius: 8, color: '#e8eaf0', cursor: 'pointer', fontSize: 13 }
const healthBadge = { fontSize: 12, color: '#888', padding: '4px 10px', background: '#111', borderRadius: 20, border: '1px solid #333' }
