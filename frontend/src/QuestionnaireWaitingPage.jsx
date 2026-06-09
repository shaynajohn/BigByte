import { useEffect, useState } from 'react'
import { markQuestionnaireFlowComplete } from './questionnaireStorage.js'
import './questionnaire-waiting.css'

const API_BASE =
  import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '' : 'http://127.0.0.1:8000')

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
 * Polls group completion; "Next" appears once every backend member has submitted answers.
 */
export function QuestionnaireWaitingPage({
  groupId,
  groupExists,
  actorId,
  memberActorIds,
  onBackToGroup,
  onContinueToResults,
}) {
  const [phase, setPhase] = useState('loading')
  const [progress, setProgress] = useState({
    completed: 0,
    total: (memberActorIds || []).filter(Boolean).length,
  })

  useEffect(() => {
    markQuestionnaireFlowComplete(groupId, actorId)
  }, [groupId, actorId])

  useEffect(() => {
    if (!groupExists) return undefined

    let cancelled = false
    let timer = null

    async function poll() {
      try {
        const res = await fetch(`${API_BASE}/api/groups/${encodeURIComponent(groupId)}`)
        if (cancelled) return
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(typeof data?.detail === 'string' ? data.detail : 'Group not found.')
        const completed = Number(data.completed_count || 0)
        const total = Number(data.member_count || (memberActorIds || []).filter(Boolean).length || 0)
        setProgress({ completed, total })
        setPhase(data.ready_for_recommendations || (total > 0 && completed >= total) ? 'ready' : 'waiting')
      } catch {
        if (!cancelled) setPhase('waiting')
      }

      if (!cancelled) {
        timer = window.setTimeout(poll, 2000)
      }
    }

    setPhase('loading')
    poll()

    return () => {
      cancelled = true
      if (timer) window.clearTimeout(timer)
    }
  }, [groupExists, groupId, memberActorIds])

  if (!groupExists) {
    return (
      <div className="q-wait-page">
        <div className="q-wait-page__content">
          <p className="q-wait-page__missing">
            This group is not available. Return to the group list or use a valid invite link.
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
            Collecting group preferences and finding the perfect San Francisco food spot…
          </h1>
          {phase === 'loading' || phase === 'waiting' ? (
            <p className="q-wait-page__status" aria-live="polite">
              {progress.total
                ? `${progress.completed} of ${progress.total} members have submitted preferences.`
                : 'Waiting for group members to submit preferences.'}
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
