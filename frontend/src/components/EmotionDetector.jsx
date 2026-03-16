/**
 * Hidden webcam + MediaPipe emotion detector.
 * The video element is small and tucked in corner; user sees their own face.
 */
import React, { useEffect, useRef } from 'react'
import { useEmotionDetection } from '../hooks/useEmotionDetection.js'

const EMOTION_EMOJI = {
  confused:  '🤔',
  bored:     '😴',
  engaged:   '😊',
  surprised: '😲',
  neutral:   '😐',
}

export default function EmotionDetector({ sessionId, enabled }) {
  const videoEl = useRef(null)
  const { startCamera, startDetection, currentEmotion, wsConnected } =
    useEmotionDetection(sessionId, enabled)

  useEffect(() => {
    if (!enabled || !videoEl.current) return
    startCamera(videoEl.current).then(() => startDetection())
  }, [enabled, startCamera, startDetection])

  if (!enabled) return null

  return (
    <div style={styles.container}>
      {/* Small self-view */}
      <video
        ref={videoEl}
        muted
        playsInline
        style={styles.video}
      />
      <div style={styles.badge}>
        <span style={styles.emoji}>{EMOTION_EMOJI[currentEmotion] ?? '😐'}</span>
        <span style={styles.label}>{currentEmotion}</span>
        <span style={{ ...styles.dot, background: wsConnected ? '#4caf50' : '#f44336' }} />
      </div>
    </div>
  )
}

const styles = {
  container: {
    position: 'fixed',
    bottom: 16,
    right: 16,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
    zIndex: 100,
  },
  video: {
    width: 120,
    height: 90,
    borderRadius: 8,
    border: '2px solid #333',
    objectFit: 'cover',
    transform: 'scaleX(-1)',   // mirror
  },
  badge: {
    background: 'rgba(0,0,0,0.7)',
    borderRadius: 12,
    padding: '3px 10px',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 12,
  },
  emoji: { fontSize: 16 },
  label: { color: '#fff', textTransform: 'capitalize' },
  dot: { width: 7, height: 7, borderRadius: '50%', display: 'inline-block' },
}
