import { useEffect, useState } from 'react'
import { markQuestionnaireFlowComplete } from './questionnaireStorage.js'
import './questionnaire-waiting.css'

const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'

/** Figma 43:518 — five photos on the orbit. */
const WAITING_ORBIT_SLOTS = [
  { nodeId: '43:567', src: '/waiting-rotation-1.png', w: 721, h: 1023 },
  { nodeId: '43:568', src: '/waiting-rotation-2.png', w: 666, h: 1000 },
  { nodeId: '43:569', src: '/waiting-rotation-3.png', w: 736, h: 920 },
  { nodeId: '43:570', src: '/waiting-rotation-4.png', w: 1200, h: 1600 },
  { nodeId: '43:571', src: '/waiting-rotation-5.png', w: 736, h: 1104 },
]

/**
 * Figma 43:518 — copy in `.q-wait-page__copy` matches the frame text only; chrome lives outside.
 * Prefetches group recommendations; "Next" appears once the API returns so users advance explicitly.
 */
export function QuestionnaireWaitingPage({
  groupId,
  groupExists,
  memberActorIds,
  latitude,
  longitude,
  onBackToGroup,
  onContinueToResults,
}) {
  const [phase, setPhase] = useState('loading')

  useEffect(() => {
    markQuestionnaireFlowComplete(groupId)
  }, [groupId])

  useEffect(() => {
    if (!groupExists) return undefined

    const ids = (memberActorIds || []).filter(Boolean)
    if (!ids.length) {
      setPhase('ready')
      return undefined
    }

    let cancelled = false
    setPhase('loading')

    const body = { actor_ids: ids, limit: 200 }
    const la = typeof latitude === 'number' ? latitude : parseFloat(String(latitude ?? ''))
    const lo = typeof longitude === 'number' ? longitude : parseFloat(String(longitude ?? ''))
    if (!Number.isNaN(la) && !Number.isNaN(lo)) {
      body.latitude = la
      body.longitude = lo
    }

    ;(async () => {
      try {
        const res = await fetch(`${API_BASE}/api/recommendations/group`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (cancelled) return
        await res.json().catch(() => ({}))
      } catch {
        /* still offer Next — results page loads its own data */
      }
      if (!cancelled) setPhase('ready')
    })()

    return () => {
      cancelled = true
    }
  }, [groupExists, memberActorIds, latitude, longitude])

  if (!groupExists) {
    return (
      <div className="q-wait-page">
        <div className="q-wait-page__content">
          <p className="q-wait-page__missing">
            This group is not on this device. Return to the group list or use a valid invite link.
          </p>
          <button type="button" className="q-wait-page__btn" onClick={onBackToGroup}>
            Back to groups
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="q-wait-page">
      <div className="q-wait-page__content">
        <div className="q-wait-page__copy">
          <p className="q-wait-page__brand">BigByte</p>
          <h1 className="q-wait-page__headline">
            Collecting group preferences and finding the perfect restaurant…
          </h1>
          {phase === 'loading' ? (
            <p className="q-wait-page__status" aria-live="polite">
              Finding your group&apos;s top picks…
            </p>
          ) : null}
          <div className="q-wait-page__actions">
            {phase === 'ready' ? (
              <button type="button" className="q-wait-page__btn q-wait-page__btn--primary" onClick={onContinueToResults}>
                Next
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="q-wait__stage" aria-hidden="true">
        <div className="q-wait__stage-inner">
          <div className="q-wait__orbit">
            {WAITING_ORBIT_SLOTS.map((slot, i) => (
              <div key={slot.nodeId} className="q-wait__orbit-arm" style={{ '--i': i }}>
                <div className="q-wait__orbit-upright">
                  <div
                    className="q-wait__slot q-wait__slot--orbit"
                    data-node-id={slot.nodeId}
                  >
                    <div className="q-wait__slot-crop">
                      <img src={slot.src} alt="" width={slot.w} height={slot.h} decoding="async" />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
