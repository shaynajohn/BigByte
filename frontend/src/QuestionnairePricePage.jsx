import { useCallback, useMemo, useState } from 'react'
import { loadPriceDraft, savePriceDraft } from './questionnaireStorage.js'
import './questionnaire.css'

const PRICE_TIERS = [
  { tier: 1, label: '$' },
  { tier: 2, label: '$$' },
  { tier: 3, label: '$$$' },
  { tier: 4, label: '$$$$' },
]

/**
 * Price range step (Figma 31:277): ¼–½–¼ layout, $–$$$$ multi-select + dealbreaker.
 */
export function QuestionnairePricePage({ groupId, groupExists, actorId, onBack, onComplete }) {
  const initial = useMemo(() => loadPriceDraft(groupId, actorId), [groupId, actorId])
  const [selected, setSelected] = useState(() => new Set(initial?.price_tiers_accepted ?? []))
  const [dealbreaker, setDealbreaker] = useState(initial?.price_dealbreaker_level ?? 3)
  const [localError, setLocalError] = useState('')

  const toggleTier = useCallback((tier) => {
    setLocalError('')
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(tier)) next.delete(tier)
      else next.add(tier)
      return next
    })
  }, [])

  function handleNext() {
    setLocalError('')
    if (selected.size === 0) {
      setLocalError('Select at least one price range.')
      return
    }
    const price_tiers_accepted = [...selected].sort((a, b) => a - b)
    const price_dealbreaker_level = dealbreaker
    savePriceDraft(groupId, { price_tiers_accepted, price_dealbreaker_level }, actorId)
    onComplete({ price_tiers_accepted, price_dealbreaker_level })
  }

  /* Figma canvas 31:312 / 31:313 — price frame 31:277 side rails (not stars heroes) */
  const asideLeft = (
    <div className="q-stars__aside q-stars__aside--left" aria-hidden>
      <div className="q-stars__aside-crop q-stars__aside-crop--price-left">
        <img src="/questionnaire-price-left.png" alt="" width={735} height={885} decoding="async" />
      </div>
    </div>
  )

  const asideRight = (
    <div className="q-stars__aside q-stars__aside--right" aria-hidden>
      <div className="q-stars__aside-crop q-stars__aside-crop--price-right">
        <img src="/questionnaire-price-right.png" alt="" width={735} height={859} decoding="async" />
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
          What price range do you prefer? (Select all that apply)
        </h1>

        {localError ? (
          <div className="q-stars__banner-error" role="alert">
            {localError}
          </div>
        ) : null}

        <ul className="q-stars__options" aria-label="Price ranges">
          {PRICE_TIERS.map(({ tier, label }) => {
            const checked = selected.has(tier)
            return (
              <li key={tier} className="q-stars__option">
                <button
                  type="button"
                  className="q-stars__option-btn q-stars__option-btn--price-tier"
                  role="checkbox"
                  aria-checked={checked}
                  onClick={() => toggleTier(tier)}
                >
                  <span className="q-stars__radio" aria-hidden />
                  <span className="q-stars__option-price-label">{label}</span>
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
              aria-label="How strongly price preferences are a dealbreaker, 1 not at all to 5 must match"
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
