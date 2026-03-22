/**
 * ScriptLibrary — view, edit, and re-launch saved lecture scripts.
 */
import React, { useState, useEffect, useCallback } from 'react'
import { listScripts, updateScript, deleteScript } from '../api/client.js'

export default function ScriptLibrary({ onLoad, onClose }) {
  const [scripts, setScripts]     = useState([])
  const [editing, setEditing]     = useState(null)   // { id, script }
  const [saving, setSaving]       = useState(false)
  const [loading, setLoading]     = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    const data = await listScripts()
    setScripts(data.scripts || [])
    setLoading(false)
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const handleSaveEdit = async () => {
    setSaving(true)
    try {
      await updateScript(editing.id, editing.script)
      setEditing(null)
      await refresh()
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id, topic) => {
    if (!confirm(`Delete script for "${topic}"?`)) return
    await deleteScript(id)
    await refresh()
  }

  const fmt = iso => new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'
  })

  return (
    <div style={s.overlay}>
      <div style={s.modal}>
        <div style={s.header}>
          <h2 style={{ margin: 0, fontSize: 18 }}>📝 Saved Lecture Scripts</h2>
          <button onClick={onClose} style={s.closeBtn}>✕</button>
        </div>

        {loading && <p style={s.muted}>Loading…</p>}
        {!loading && scripts.length === 0 && (
          <p style={s.muted}>No saved scripts yet. Generate one from the Lecture tab.</p>
        )}

        {scripts.map(sc => (
          <div key={sc.id} style={s.card}>
            <div style={s.cardHeader}>
              <div>
                <div style={s.topic}>{sc.topic}</div>
                <div style={s.meta}>
                  {sc.duration_minutes} min · saved {fmt(sc.created_at)}
                  {sc.updated_at !== sc.created_at && ` · edited ${fmt(sc.updated_at)}`}
                </div>
              </div>
              <div style={s.actions}>
                <button onClick={() => onLoad(sc)} style={{ ...s.btn, background: '#2563eb' }}>
                  ▶ Load
                </button>
                <button onClick={() => setEditing({ id: sc.id, script: sc.script, topic: sc.topic })}
                  style={{ ...s.btn, background: '#7c3aed' }}>
                  ✏️ Edit
                </button>
                <button onClick={() => handleDelete(sc.id, sc.topic)}
                  style={{ ...s.btn, background: '#991b1b' }}>
                  🗑
                </button>
              </div>
            </div>

            {/* Inline editor */}
            {editing?.id === sc.id && (
              <div style={{ marginTop: 12 }}>
                <textarea
                  value={editing.script}
                  onChange={e => setEditing(prev => ({ ...prev, script: e.target.value }))}
                  rows={14}
                  style={s.textarea}
                />
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button onClick={handleSaveEdit} disabled={saving}
                    style={{ ...s.btn, background: '#15803d', flex: 1 }}>
                    {saving ? 'Saving…' : '💾 Save Changes'}
                  </button>
                  <button onClick={() => onLoad({ ...sc, script: editing.script })}
                    style={{ ...s.btn, background: '#2563eb', flex: 1 }}>
                    ▶ Load Edited Version
                  </button>
                  <button onClick={() => setEditing(null)}
                    style={{ ...s.btn, background: '#374151' }}>
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Script preview when not editing */}
            {editing?.id !== sc.id && (
              <details style={{ marginTop: 8 }}>
                <summary style={s.previewToggle}>Preview script ▾</summary>
                <pre style={s.preview}>{sc.script}</pre>
              </details>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

const s = {
  overlay:     { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 },
  modal:       { background: '#1a1d2e', borderRadius: 12, padding: 24, width: 'min(700px,95vw)', maxHeight: '90vh', overflowY: 'auto', border: '1px solid #333' },
  header:      { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  closeBtn:    { background: 'none', border: 'none', color: '#aaa', fontSize: 20, cursor: 'pointer' },
  muted:       { color: '#666', fontSize: 14, textAlign: 'center', padding: '20px 0' },
  card:        { background: '#0f1117', borderRadius: 10, padding: 16, marginBottom: 14, border: '1px solid #2a2d40' },
  cardHeader:  { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' },
  topic:       { fontWeight: 700, fontSize: 15, color: '#e8eaf0', marginBottom: 3 },
  meta:        { fontSize: 12, color: '#666' },
  actions:     { display: 'flex', gap: 6, flexShrink: 0 },
  btn:         { padding: '6px 12px', border: 'none', borderRadius: 6, color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600 },
  textarea:    { width: '100%', background: '#1a1d2e', border: '1px solid #444', borderRadius: 8, padding: '10px 12px', color: '#fff', fontSize: 13, fontFamily: 'monospace', lineHeight: 1.6, resize: 'vertical', boxSizing: 'border-box' },
  previewToggle: { cursor: 'pointer', fontSize: 12, color: '#7c3aed', fontWeight: 600 },
  preview:     { whiteSpace: 'pre-wrap', fontSize: 12, color: '#aaa', lineHeight: 1.6, marginTop: 8, maxHeight: 180, overflowY: 'auto' },
}
