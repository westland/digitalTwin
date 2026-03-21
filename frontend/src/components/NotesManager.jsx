import React, { useState, useEffect } from 'react'
import { uploadNotesFile, uploadNotesText, listTopics, deleteTopic } from '../api/client.js'

export default function NotesManager({ onClose }) {
  const [topics, setTopics]         = useState([])
  const [topic, setTopic]           = useState('')
  const [text, setText]             = useState('')
  const [file, setFile]             = useState(null)
  const [mode, setMode]             = useState('text')   // 'text' | 'file'
  const [loading, setLoading]       = useState(false)
  const [message, setMessage]       = useState(null)

  useEffect(() => { fetchTopics() }, [])

  async function fetchTopics() {
    const data = await listTopics()
    setTopics(data.topics || [])
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!topic.trim()) return setMessage({ type: 'error', text: 'Topic is required.' })
    setLoading(true)
    try {
      let result
      if (mode === 'text') {
        if (!text.trim()) throw new Error('Notes text is empty.')
        result = await uploadNotesText(topic.trim(), text)
      } else {
        if (!file) throw new Error('No file selected.')
        result = await uploadNotesFile(topic.trim(), file)
      }
      setMessage({
        type: 'success',
        text: `✅ Successfully ingested "${result.topic}" — ${result.chunks_added} chunks added to the knowledge base.`
      })
      setTopic(''); setText(''); setFile(null)
      fetchTopics()
    } catch (err) {
      setMessage({ type: 'error', text: `❌ Upload failed: ${err.message}` })
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(t) {
    if (!confirm(`Delete all notes for "${t}"?`)) return
    await deleteTopic(t)
    fetchTopics()
  }

  return (
    <div style={overlay}>
      <div style={modal}>
        <div style={header}>
          <h2 style={{ margin: 0, fontSize: 18 }}>📚 Knowledge Base</h2>
          <button onClick={onClose} style={closeBtn}>✕</button>
        </div>

        {/* Existing topics */}
        {topics.length > 0 && (
          <div style={section}>
            <h3 style={sectionTitle}>Stored Topics</h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {topics.map(t => (
                <div key={t} style={chip}>
                  <span>{t}</span>
                  <button onClick={() => handleDelete(t)} style={chipDelete}>✕</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Upload form */}
        <form onSubmit={handleSubmit} style={section}>
          <h3 style={sectionTitle}>Add Notes</h3>
          <input
            type="text"
            placeholder="Topic name (e.g. Calculus, Chapter 3)"
            value={topic}
            onChange={e => setTopic(e.target.value)}
            style={input}
          />
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <button type="button" onClick={() => setMode('text')} style={mode === 'text' ? tabActive : tab}>Paste Text</button>
            <button type="button" onClick={() => setMode('file')} style={mode === 'file' ? tabActive : tab}>Upload File</button>
          </div>
          {mode === 'text' ? (
            <textarea
              placeholder="Paste your class notes here…"
              value={text}
              onChange={e => setText(e.target.value)}
              rows={8}
              style={{ ...input, resize: 'vertical', fontFamily: 'monospace', fontSize: 13 }}
            />
          ) : (
            <div style={{ marginBottom: 12 }}>
              <input
                type="file"
                accept=".txt,.pdf,.docx"
                onChange={e => setFile(e.target.files?.[0] ?? null)}
                style={{ color: '#ccc' }}
              />
              <p style={{ color: '#888', fontSize: 12, marginTop: 4 }}>Accepts .txt, .pdf, .docx</p>
            </div>
          )}
          {message && (
            <div style={{ ...msgBox, background: message.type === 'error' ? '#5c2020' : '#1a3d1a' }}>
              {message.text}
            </div>
          )}
          <button type="submit" disabled={loading} style={submitBtn}>
            {loading ? 'Processing…' : 'Ingest Notes'}
          </button>
        </form>
      </div>
    </div>
  )
}

const overlay  = { position:'fixed',inset:0,background:'rgba(0,0,0,0.75)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:200 }
const modal    = { background:'#1a1d2e',borderRadius:12,padding:24,width:'min(560px,95vw)',maxHeight:'85vh',overflowY:'auto',border:'1px solid #333' }
const header   = { display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20 }
const closeBtn = { background:'none',border:'none',color:'#aaa',fontSize:20,cursor:'pointer' }
const section  = { marginBottom:20 }
const sectionTitle = { fontSize:14,color:'#888',marginBottom:10,textTransform:'uppercase',letterSpacing:1 }
const chip     = { display:'flex',alignItems:'center',gap:6,background:'#2a2d40',borderRadius:20,padding:'4px 12px',fontSize:13 }
const chipDelete = { background:'none',border:'none',color:'#f44336',cursor:'pointer',fontSize:14,lineHeight:1 }
const input    = { width:'100%',background:'#0f1117',border:'1px solid #333',borderRadius:6,padding:'8px 12px',color:'#e8eaf0',fontSize:14,marginBottom:12,outline:'none' }
const tab      = { padding:'6px 16px',borderRadius:6,border:'1px solid #333',background:'#0f1117',color:'#888',cursor:'pointer',fontSize:13 }
const tabActive = { ...tab, background:'#2563eb',color:'#fff',border:'1px solid #2563eb' }
const submitBtn = { width:'100%',padding:'10px',background:'#2563eb',color:'#fff',border:'none',borderRadius:8,fontSize:15,cursor:'pointer',fontWeight:600 }
const msgBox   = { borderRadius:6,padding:'8px 12px',marginBottom:12,fontSize:13,color:'#fff' }
