/**
 * MediaPipe FaceLandmarker-based emotion detection.
 * Runs in the background, sends emotion payloads to the backend via WebSocket.
 *
 * Detected states:
 *   - confused   (brow furrowed, head tilt)
 *   - bored      (eyes half-closed, gaze away)
 *   - engaged    (neutral + looking at screen)
 *   - surprised  (brows raised, mouth open)
 *   - neutral
 */
import { useEffect, useRef, useCallback, useState } from 'react'
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'

const WS_BASE = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
const WS_URL  = `${WS_BASE}//${window.location.host}/ws/emotion`

const SEND_INTERVAL_MS  = 3000   // send emotion every 3 seconds
const DETECT_INTERVAL_MS = 500  // run detection at most every 500ms (~2fps)
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'

function classifyEmotion(blendshapes) {
  if (!blendshapes || blendshapes.length === 0) return { emotion: 'neutral', confidence: 0.5 }

  const get = (name) => {
    const s = blendshapes.find(b => b.categoryName === name)
    return s ? s.score : 0
  }

  const browDown      = (get('browDownLeft') + get('browDownRight')) / 2
  const browInnerUp   = get('browInnerUp')
  const browOuterUp   = (get('browOuterUpLeft') + get('browOuterUpRight')) / 2
  const eyeBlink      = (get('eyeBlinkLeft') + get('eyeBlinkRight')) / 2
  const eyeWide       = (get('eyeWideLeft') + get('eyeWideRight')) / 2
  const mouthOpen     = get('jawOpen')
  const eyeLookOut    = (get('eyeLookOutLeft') + get('eyeLookOutRight')) / 2

  const gazeAway = eyeLookOut > 0.4

  // Surprised: brows raised + eyes wide (+ possibly mouth open)
  if ((browInnerUp > 0.4 || browOuterUp > 0.4) && eyeWide > 0.3) {
    return { emotion: 'surprised', confidence: 0.8, gaze_away: gazeAway, mouth_open: mouthOpen > 0.3 }
  }
  // Confused: brows furrowed (browDown) without matching surprise
  if (browDown > 0.35 && browInnerUp < 0.2) {
    return { emotion: 'confused', confidence: Math.min(browDown + 0.2, 1.0), gaze_away: gazeAway, mouth_open: mouthOpen > 0.3 }
  }
  // Bored / tired: eyes half-closed or gaze away
  if (eyeBlink > 0.35 || gazeAway) {
    return { emotion: 'bored', confidence: 0.7, gaze_away: gazeAway, mouth_open: false }
  }
  // Engaged: open eyes, looking forward
  if (eyeWide > 0.1 && !gazeAway && eyeBlink < 0.2) {
    return { emotion: 'engaged', confidence: 0.75, gaze_away: false, mouth_open: mouthOpen > 0.3 }
  }
  return { emotion: 'neutral', confidence: 0.5, gaze_away: gazeAway, mouth_open: mouthOpen > 0.3 }
}

export function useEmotionDetection(sessionId, enabled = true) {
  const videoRef   = useRef(null)
  const landmarker = useRef(null)
  const wsRef      = useRef(null)
  const rafRef     = useRef(null)
  const lastSend   = useRef(0)
  const [currentEmotion, setCurrentEmotion] = useState('neutral')
  const [wsConnected, setWsConnected]       = useState(false)

  // Init WebSocket
  const connectWS = useCallback(() => {
    if (!sessionId) return
    const ws = new WebSocket(`${WS_URL}/${sessionId}`)
    ws.onopen  = () => { setWsConnected(true); console.log('[Emotion WS] connected') }
    ws.onclose = () => { setWsConnected(false) }
    ws.onerror = (e) => console.warn('[Emotion WS] error', e)
    wsRef.current = ws
    return ws
  }, [sessionId])

  // Init MediaPipe
  const initLandmarker = useCallback(async () => {
    try {
      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.17/wasm'
      )
      landmarker.current = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
        outputFaceBlendshapes: true,
        runningMode: 'VIDEO',
        numFaces: 1
      })
      console.log('[MediaPipe] FaceLandmarker ready')
    } catch (e) {
      console.warn('[MediaPipe] init failed, falling back to CPU:', e)
      try {
        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.17/wasm'
        )
        landmarker.current = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: 'CPU' },
          outputFaceBlendshapes: true,
          runningMode: 'VIDEO',
          numFaces: 1
        })
      } catch (e2) {
        console.error('[MediaPipe] Could not initialize:', e2)
      }
    }
  }, [])

  const lastDetect = useRef(0)

  // Detection loop — throttled to DETECT_INTERVAL_MS to avoid saturating the CPU
  const detect = useCallback(() => {
    const now = performance.now()
    if (now - lastDetect.current < DETECT_INTERVAL_MS) {
      rafRef.current = requestAnimationFrame(detect)
      return
    }
    lastDetect.current = now

    if (!landmarker.current || !videoRef.current || videoRef.current.readyState < 2) {
      rafRef.current = requestAnimationFrame(detect)
      return
    }
    const result = landmarker.current.detectForVideo(videoRef.current, now)

    if (result.faceBlendshapes && result.faceBlendshapes.length > 0) {
      const blendshapes = result.faceBlendshapes[0].categories
      const emotionData = classifyEmotion(blendshapes)
      setCurrentEmotion(emotionData.emotion)

      if (wsRef.current?.readyState === WebSocket.OPEN && now - lastSend.current > SEND_INTERVAL_MS) {
        lastSend.current = now
        wsRef.current.send(JSON.stringify({ session_id: sessionId, ...emotionData }))
      }
    }
    rafRef.current = requestAnimationFrame(detect)
  }, [sessionId])

  // Start webcam
  const startCamera = useCallback(async (videoEl) => {
    videoRef.current = videoEl
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 320, height: 240, facingMode: 'user' }
      })
      videoEl.srcObject = stream
      await videoEl.play()
    } catch (e) {
      console.warn('[Camera] Could not access webcam:', e)
    }
  }, [])

  useEffect(() => {
    if (!enabled || !sessionId) return
    initLandmarker()
    connectWS()
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      if (wsRef.current) wsRef.current.close()
      if (landmarker.current) landmarker.current.close()
      if (videoRef.current?.srcObject) {
        videoRef.current.srcObject.getTracks().forEach(t => t.stop())
      }
    }
  }, [enabled, sessionId, initLandmarker, connectWS])

  const startDetection = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(detect)
  }, [detect])

  return { startCamera, startDetection, currentEmotion, wsConnected, videoRef }
}
