import { useEffect, useRef, useState } from 'react'
import { markQuestionnaireFlowComplete } from './questionnaireStorage.js'
import './questionnaire-waiting.css'

const API_BASE =
  import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '' : 'http://127.0.0.1:8000')

/**
 * Figma 43:518 — copy in `.q-wait-page__copy` matches the frame text only; chrome lives outside.
 * Polls group completion and continues automatically once every member has submitted answers.
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
  const continueRef = useRef(onContinueToResults)

  useEffect(() => {
    continueRef.current = onContinueToResults
  }, [onContinueToResults])

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
        const ready = data.ready_for_recommendations || (total > 0 && completed >= total)
        setProgress({ completed, total })
        setPhase(ready ? 'ready' : 'waiting')
        if (ready) {
          window.setTimeout(() => {
            if (!cancelled) continueRef.current()
          }, 250)
          return
        }
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
            {phase === 'ready'
              ? 'Building your final picks.'
              : 'Waiting for everyone, then finding your SF food match.'}
          </h1>
          <p className="q-wait-page__status" aria-live="polite">
            {phase === 'ready'
              ? 'Almost there...'
              : progress.total
                ? `${progress.completed} of ${progress.total} members have submitted preferences.`
                : 'Waiting for group members to submit preferences.'}
          </p>
          <ul className="q-wait-page__steps" aria-label="What BigByte is preparing">
            <li>Combining the group&apos;s cravings</li>
            <li>Checking commute tradeoffs</li>
            <li>Building a short list people can vote on</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
