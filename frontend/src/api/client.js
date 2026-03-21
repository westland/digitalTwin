const BASE = '/api'

export async function startConversation(topic, lectureScript = null) {
  const res = await fetch(`${BASE}/conversations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic, lecture_script: lectureScript })
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function endConversation(conversationId) {
  await fetch(`${BASE}/conversations/${conversationId}`, { method: 'DELETE' })
}

export async function uploadNotesText(topic, content) {
  const res = await fetch(`${BASE}/notes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic, content })
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function uploadNotesFile(topic, file) {
  const fd = new FormData()
  fd.append('topic', topic)
  fd.append('file', file)
  const res = await fetch(`${BASE}/notes/file`, { method: 'POST', body: fd })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function listTopics() {
  const res = await fetch(`${BASE}/notes/topics`)
  if (!res.ok) return { topics: [] }
  return res.json()
}

export async function deleteTopic(topic) {
  const res = await fetch(`${BASE}/notes/${encodeURIComponent(topic)}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function generateLectureScript(topic, durationMinutes = 6) {
  const res = await fetch(`${BASE}/lecture/script`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic, duration_minutes: durationMinutes })
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function healthCheck() {
  const res = await fetch(`${BASE}/health`)
  if (!res.ok) return null
  return res.json()
}

export async function listReplicas() {
  const res = await fetch(`${BASE}/replicas`)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}
