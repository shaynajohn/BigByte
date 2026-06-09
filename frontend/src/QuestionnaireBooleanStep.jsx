import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import {
  loadTableServiceDraft,
  saveTableServiceDraft,
  loadTakeoutDraft,
  saveTakeoutDraft,
  loadDeliveryDraft,
  saveDeliveryDraft,
} from './questionnaireStorage.js'
import './questionnaire.css'

const BOOLEAN_STEP_CONFIG = {
  table_service: {
    title: 'Do you want table service?',
    load: loadTableServiceDraft,
    save: saveTableServiceDraft,
    valueKey: 'table_service',
    dealbreakerKey: 'table_service_dealbreaker_level',
    leftSrc: '/questionnaire-table-left.png',
    leftW: 1080,
    leftH: 1349,
    leftCrop: 'q-stars__aside-crop--table-left',
    rightSrc: '/questionnaire-table-right.png',
    rightW: 750,
    rightH: 1049,
    rightCrop: 'q-stars__aside-crop--table-right',
  },
  takeout: {
    title: 'Should takeout be available?',
    load: loadTakeoutDraft,
    save: saveTakeoutDraft,
    valueKey: 'takeout_available',
    dealbreakerKey: 'takeout_dealbreaker_level',
    leftSrc: '/questionnaire-takeout-left.png',
    leftW: 1000,
    leftH: 1500,
    leftCrop: 'q-stars__aside-crop--takeout-left',
    rightSrc: '/questionnaire-takeout-right.png',
    rightW: 736,
    rightH: 920,
    rightCrop: 'q-stars__aside-crop--takeout-right',
  },
  delivery: {
    title: 'Should delivery be available?',
    load: loadDeliveryDraft,
    save: saveDeliveryDraft,
    valueKey: 'delivery_available',
    dealbreakerKey: 'delivery_dealbreaker_level',
    leftSrc: '/questionnaire-delivery-left.png',
    leftW: 1200,
    leftH: 1800,
    leftCrop: 'q-stars__aside-crop--delivery-left',
    rightSrc: '/questionnaire-delivery-right.png',
    rightW: 736,
    rightH: 1104,
    rightCrop: 'q-stars__aside-crop--delivery-right',
  },
}

/**
 * Yes/No questionnaire steps (Figma 35:314, 35:365, 35:388): ¼–½–¼, radio-style rows + dealbreaker slider.
 *
 * @param {object} props
 * @param {string} props.groupId
 * @param {boolean} props.groupExists
 * @param {'table_service'|'takeout'|'delivery'} props.variant
 * @param {() => void} props.onBack
 * @param {() => void} props.onComplete
 */
export function QuestionnaireBooleanStepPage({ groupId, groupExists, variant, onBack, onComplete }) {
  const cfg = BOOLEAN_STEP_CONFIG[variant]
  const initial = useMemo(() => cfg.load(groupId), [groupId, cfg])
  const [value, setValue] = useState(() => initial?.[cfg.valueKey] ?? null)
  const [dealbreaker, setDealbreaker] = useState(() => initial?.[cfg.dealbreakerKey] ?? 3)
  const [localError, setLocalError] = useState('')

  /* Same component instance is reused across variants; re-sync from this step's draft. */
  useEffect(() => {
    const loaded = cfg.load(groupId)
    setValue(loaded?.[cfg.valueKey] ?? null)
    setDealbreaker(loaded?.[cfg.dealbreakerKey] ?? 3)
    setLocalError('')
  }, [groupId, variant, cfg])
  const titleId = useId()

  const asideLeft = (
    <div className="q-stars__aside q-stars__aside--left" aria-hidden>
      <div className={`q-stars__aside-crop ${cfg.leftCrop}`}>
        <img src={cfg.leftSrc} alt="" width={cfg.leftW} height={cfg.leftH} decoding="async" />
      </div>
    </div>
  )

  const asideRight = (
    <div className="q-stars__aside q-stars__aside--right" aria-hidden>
      <div className={`q-stars__aside-crop ${cfg.rightCrop}`}>
        <img src={cfg.rightSrc} alt="" width={cfg.rightW} height={cfg.rightH} decoding="async" />
      </div>
    </div>
  )

  const persist = useCallback(
    (nextValue, nextDealbreaker) => {
      cfg.save(groupId, {
        [cfg.valueKey]: nextValue,
        [cfg.dealbreakerKey]: nextDealbreaker,
      })
    },
    [cfg, groupId],
  )

  function handleNext() {
    setLocalError('')
    if (value !== 'yes' && value !== 'no') {
      setLocalError('Select Yes or No.')
      return
    }
    persist(value, dealbreaker)
    onComplete?.()
  }

  if (!groupExists) {
    return (
      <div className="q-stars-page">
        {asideLeft}
        <div className="q-stars__main">
          <p className="q-stars__missing">
            This group is not on this device. Return to the group list or use a valid invite link.
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

        <h1 className="q-stars__title" id={titleId}>
          {cfg.title}
        </h1>

        {localError ? (
          <div className="q-stars__banner-error" role="alert">
            {localError}
          </div>
        ) : null}

        <ul
          className="q-stars__options q-stars__options--boolean"
          role="radiogroup"
          aria-labelledby={titleId}
        >
          <li className="q-stars__option">
            <button
              type="button"
              className="q-stars__option-btn q-stars__option-btn--yn"
              role="radio"
              aria-checked={value === 'yes'}
              onClick={() => {
                setValue('yes')
                setLocalError('')
                persist('yes', dealbreaker)
              }}
            >
              <span className="q-stars__radio" aria-hidden />
              <span className="q-stars__option-yn-label">Yes</span>
            </button>
          </li>
          <li className="q-stars__option">
            <button
              type="button"
              className="q-stars__option-btn q-stars__option-btn--yn"
              role="radio"
              aria-checked={value === 'no'}
              onClick={() => {
                setValue('no')
                setLocalError('')
                persist('no', dealbreaker)
              }}
            >
              <span className="q-stars__radio" aria-hidden />
              <span className="q-stars__option-yn-label">No</span>
            </button>
          </li>
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
                const n = Number(e.target.value)
                setLocalError('')
                setDealbreaker(n)
                if (value === 'yes' || value === 'no') persist(value, n)
              }}
              aria-valuemin={1}
              aria-valuemax={5}
              aria-valuenow={dealbreaker}
              aria-label="How strongly this choice is a dealbreaker, 1 not at all to 5 must match"
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
