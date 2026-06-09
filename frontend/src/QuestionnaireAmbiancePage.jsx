import { useCallback, useMemo, useState } from 'react'
import { loadAmbianceDraft, saveAmbianceDraft } from './questionnaireStorage.js'
import './questionnaire.css'

/** Figma 35:411 — display order (wrap-friendly). */
const AMBIANCE_OPTIONS = [
  { id: 'casual', label: 'Casual' },
  { id: 'classy', label: 'Classy' },
  { id: 'romantic', label: 'Romantic' },
  { id: 'trendy', label: 'Trendy' },
  { id: 'hipster', label: 'Hipster' },
  { id: 'touristy', label: 'Touristy' },
]

/**
 * Ambiance multi-select (Figma 35:411): pills + dealbreaker slider, ¼–½–¼ rails.
 */
export function QuestionnaireAmbiancePage({ groupId, groupExists, actorId, onBack, onComplete }) {
  const initial = useMemo(() => loadAmbianceDraft(groupId, actorId), [groupId, actorId])
  const [selected, setSelected] = useState(() => new Set(initial?.ambiance_types_selected ?? []))
  const [dealbreaker, setDealbreaker] = useState(initial?.ambiance_dealbreaker_level ?? 3)
  const [localError, setLocalError] = useState('')

  const toggle = useCallback((id) => {
    setLocalError('')
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  function handleNext() {
    setLocalError('')
    if (selected.size === 0) {
      setLocalError('Select at least one ambiance.')
      return
    }
    const ambiance_types_selected = [...selected].sort((a, b) => {
      const ia = AMBIANCE_OPTIONS.findIndex((o) => o.id === a)
      const ib = AMBIANCE_OPTIONS.findIndex((o) => o.id === b)
      return ia - ib
    })
    const ambiance_dealbreaker_level = dealbreaker
    saveAmbianceDraft(groupId, { ambiance_types_selected, ambiance_dealbreaker_level }, actorId)
    onComplete?.({ ambiance_types_selected, ambiance_dealbreaker_level })
  }

  const asideLeft = (
    <div className="q-stars__aside q-stars__aside--left" aria-hidden>
      <div className="q-stars__aside-crop q-stars__aside-crop--ambiance-left">
        <img src="/questionnaire-ambiance-left.png" alt="" width={900} height={1200} decoding="async" />
      </div>
    </div>
  )

  const asideRight = (
    <div className="q-stars__aside q-stars__aside--right" aria-hidden>
      <div className="q-stars__aside-crop q-stars__aside-crop--ambiance-right">
        <img src="/questionnaire-ambiance-right.png" alt="" width={900} height={1200} decoding="async" />
      </div>
    </div>
  )

  if (!groupExists) {
    return (
      <div className="q-stars-page">
        {asideLeft}
        <div className="q-stars__main">
          <p className="q-stars__missing">
            This group is not available. Return to the group list or use a valid invite link.
          </p>
          <button type="button" className="q-stars__next" onClick={onBack}>
            Back
          </button>
        </div>
        {asideRight}
      </div>
    )
  }

  return (
    <div className="q-stars-page">
      {asideLeft}

      <div className="q-stars__main">
        <button type="button" className="q-stars__back" onClick={onBack} aria-label="Go back">
          <img src="/q-stars-back.svg" alt="" width={46} height={46} decoding="async" />
        </button>

        <h1 className="q-stars__title">
          What kind of ambiance are you looking for? (Select all that apply)
        </h1>

        {localError ? (
          <div className="q-stars__banner-error" role="alert">
            {localError}
          </div>
        ) : null}

        <div className="q-cuisine__tags" role="group" aria-label="Ambiance types">
          {AMBIANCE_OPTIONS.map(({ id, label }) => {
            const on = selected.has(id)
            return (
              <button
                key={id}
                type="button"
                className="q-cuisine__pill"
                aria-pressed={on}
                onClick={() => toggle(id)}
              >
                <span className="q-cuisine__pill-label">{label}</span>
                <span className="q-cuisine__pill-icon" aria-hidden>
                  <img
                    src={on ? '/q-cuisine-check.svg' : '/q-cuisine-plus.svg'}
                    alt=""
                    width={25}
                    height={25}
                    decoding="async"
                  />
                </span>
              </button>
            )
          })}
        </div>

        <div className="q-stars__dealbreaker">
          <p className="q-stars__dealbreaker-heading">Dealbreaker</p>
          <div className="q-stars__slider-wrap">
            <input
              className="q-stars__slider"
              type="range"
              min={1}
              max={5}
              step={1}
              value={dealbreaker}
              onChange={(e) => {
                setLocalError('')
                setDealbreaker(Number(e.target.value))
              }}
              aria-valuemin={1}
              aria-valuemax={5}
              aria-valuenow={dealbreaker}
              aria-label="How strongly ambiance choices are a dealbreaker, 1 not at all to 5 must match"
            />
            <div className="q-stars__slider-labels">
              <span>Not a Dealbreaker</span>
              <span>Dealbreaker</span>
            </div>
          </div>
        </div>

        <button type="button" className="q-stars__next" onClick={handleNext}>
          Next
        </button>
      </div>

      {asideRight}
    </div>
  )
}
