import { useCallback, useMemo, useState } from 'react'
import { loadStarsDraft, saveStarsDraft } from './questionnaireStorage.js'
import './questionnaire.css'

const STARS = [1, 2, 3, 4, 5]

/**
 * First group questionnaire step (Figma 5:2): ¼ + ½ + ¼ layout — two edge photos and
 * acceptable star ratings + dealbreaker in the center column.
 */
export function QuestionnaireStarsPage({ groupId, groupExists, onBack, onComplete }) {
  const initial = useMemo(() => loadStarsDraft(groupId), [groupId])
  const [selected, setSelected] = useState(() => new Set(initial?.star_ratings_accepted ?? []))
  const [dealbreaker, setDealbreaker] = useState(initial?.stars_dealbreaker_level ?? 3)
  const [localError, setLocalError] = useState('')

  const toggleStar = useCallback((n) => {
    setLocalError('')
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(n)) next.delete(n)
      else next.add(n)
      return next
    })
  }, [])

  function handleNext() {
    setLocalError('')
    if (selected.size === 0) {
      setLocalError('Select at least one star rating.')
      return
    }
    const star_ratings_accepted = [...selected].sort((a, b) => a - b)
    const stars_dealbreaker_level = dealbreaker
    saveStarsDraft(groupId, { star_ratings_accepted, stars_dealbreaker_level })
    onComplete({ star_ratings_accepted, stars_dealbreaker_level })
  }

  if (!groupExists) {
    return (
      <div className="q-stars-page">
        <div className="q-stars__aside q-stars__aside--left" aria-hidden>
          <div className="q-stars__aside-crop q-stars__aside-crop--left">
            <img src="/questionnaire-hero.png" alt="" width={810} height={1440} decoding="async" />
          </div>
        </div>
        <div className="q-stars__main">
          <p className="q-stars__missing">
            This group is not on this device. Return to the group list or use a valid invite link.
          </p>
          <button type="button" className="q-stars__next" onClick={onBack}>
            Back
          </button>
        </div>
        <div className="q-stars__aside q-stars__aside--right" aria-hidden>
          <div className="q-stars__aside-crop q-stars__aside-crop--right">
            <img src="/questionnaire-hero-right.png" alt="" width={736} height={1104} decoding="async" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="q-stars-page">
      <div className="q-stars__aside q-stars__aside--left" aria-hidden>
        <div className="q-stars__aside-crop q-stars__aside-crop--left">
          <img src="/questionnaire-hero.png" alt="" width={810} height={1440} decoding="async" />
        </div>
      </div>

      <div className="q-stars__main">
        <button type="button" className="q-stars__back" onClick={onBack} aria-label="Go back">
          <img src="/q-stars-back.svg" alt="" width={46} height={46} decoding="async" />
        </button>

        <h1 className="q-stars__title">
          Which star ratings would you consider? (Select all that apply)
        </h1>

        {localError ? (
          <div className="q-stars__banner-error" role="alert">
            {localError}
          </div>
        ) : null}

        <ul className="q-stars__options" aria-label="Star ratings">
          {STARS.map((n) => {
            const checked = selected.has(n)
            const label = n === 1 ? '1 Star' : `${n} Stars`
            return (
              <li key={n} className="q-stars__option">
                <button
                  type="button"
                  className="q-stars__option-btn"
                  role="checkbox"
                  aria-checked={checked}
                  onClick={() => toggleStar(n)}
                >
                  <span className="q-stars__radio" aria-hidden />
                  <span>{label}</span>
                </button>
              </li>
            )
          })}
        </ul>

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
              aria-label="How strongly this star filter is a dealbreaker, 1 not at all to 5 must match"
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

      <div className="q-stars__aside q-stars__aside--right" aria-hidden>
        <div className="q-stars__aside-crop q-stars__aside-crop--right">
          <img src="/questionnaire-hero-right.png" alt="" width={736} height={1104} decoding="async" />
        </div>
      </div>
    </div>
  )
}
