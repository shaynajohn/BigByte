import { useMemo, useState } from 'react'
import { loadCommuteDraft, saveCommuteDraft } from './questionnaireStorage.js'
import './questionnaire.css'

const DEFAULT_MAX_MINUTES = 20
const MODE_OPTIONS = [
  { id: 'walking', label: 'Walk' },
  { id: 'driving', label: 'Drive' },
]
const BAY_AREA_BOUNDS = {
  minLat: 37.0,
  maxLat: 38.3,
  minLng: -123.1,
  maxLng: -121.5,
}

function formatCoord(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(5) : ''
}

function parseCoordinate(value, min, max) {
  const n = Number(value)
  return Number.isFinite(n) && n >= min && n <= max ? n : null
}

function isSupportedOrigin(lat, lng) {
  return (
    lat >= BAY_AREA_BOUNDS.minLat &&
    lat <= BAY_AREA_BOUNDS.maxLat &&
    lng >= BAY_AREA_BOUNDS.minLng &&
    lng <= BAY_AREA_BOUNDS.maxLng
  )
}

/**
 * Simple commute step: use browser location, preferred mode, and max minutes.
 */
export function QuestionnaireCommutePage({ groupId, groupExists, actorId, onBack, onComplete }) {
  const initial = useMemo(() => loadCommuteDraft(groupId, actorId), [groupId, actorId])
  const [latitude, setLatitude] = useState(() => formatCoord(initial?.commute_origin_latitude))
  const [longitude, setLongitude] = useState(() => formatCoord(initial?.commute_origin_longitude))
  const [mode, setMode] = useState(initial?.commute_mode || 'walking')
  const [maxMinutes, setMaxMinutes] = useState(initial?.commute_max_minutes || DEFAULT_MAX_MINUTES)
  const [localError, setLocalError] = useState('')
  const [status, setStatus] = useState('')
  const [locating, setLocating] = useState(false)

  function useCurrentLocation() {
    setLocalError('')
    setStatus('')
    if (!navigator.geolocation) {
      setLocalError('Location sharing is not available in this browser. Type an approximate location instead.')
      return
    }
    setLocating(true)
    setStatus('Finding your location...')
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLatitude(coords.latitude.toFixed(5))
        setLongitude(coords.longitude.toFixed(5))
        setLocating(false)
        setStatus('Location added.')
      },
      () => {
        setLocating(false)
        setStatus('')
        setLocalError('Could not access your location. Type an approximate latitude and longitude instead.')
      },
      { enableHighAccuracy: true, maximumAge: 300000, timeout: 10000 },
    )
  }

  function handleNext() {
    setLocalError('')
    const lat = parseCoordinate(latitude, -90, 90)
    const lng = parseCoordinate(longitude, -180, 180)
    if (lat == null || lng == null) {
      setLocalError('Use your current location or enter valid latitude and longitude values.')
      return
    }
    if (!isSupportedOrigin(lat, lng)) {
      setLocalError('Use a Bay Area location so commute times make sense for San Francisco restaurants.')
      return
    }
    const draft = {
      commute_origin_latitude: lat,
      commute_origin_longitude: lng,
      commute_mode: mode,
      commute_max_minutes: Number(maxMinutes),
    }
    saveCommuteDraft(groupId, draft, actorId)
    onComplete?.(draft)
  }

  const asideLeft = (
    <div className="q-stars__aside q-stars__aside--left" aria-hidden>
      <div className="q-commute__rail" />
    </div>
  )

  const asideRight = (
    <div className="q-stars__aside q-stars__aside--right" aria-hidden>
      <div className="q-commute__rail q-commute__rail--right" />
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

        <h1 className="q-stars__title">How are you getting there?</h1>

        {localError ? (
          <div className="q-stars__banner-error" role="alert">
            {localError}
          </div>
        ) : null}
        {status ? <p className="q-commute__status">{status}</p> : null}

        <div className="q-commute">
          <button
            type="button"
            className="q-commute__location-btn"
            onClick={useCurrentLocation}
            disabled={locating}
          >
            {locating ? 'Finding location...' : 'Use my current location'}
          </button>

          <div className="q-commute__grid">
            <label className="q-commute__label" htmlFor="commute-lat">
              Latitude
            </label>
            <label className="q-commute__label" htmlFor="commute-lng">
              Longitude
            </label>
            <input
              id="commute-lat"
              className="q-commute__input"
              value={latitude}
              inputMode="decimal"
              onChange={(e) => {
                setLocalError('')
                setLatitude(e.target.value)
              }}
              placeholder="37.77490"
            />
            <input
              id="commute-lng"
              className="q-commute__input"
              value={longitude}
              inputMode="decimal"
              onChange={(e) => {
                setLocalError('')
                setLongitude(e.target.value)
              }}
              placeholder="-122.41940"
            />
          </div>

          <div className="q-cuisine__tags q-commute__modes" role="group" aria-label="Preferred commute mode">
            {MODE_OPTIONS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                className="q-cuisine__pill"
                aria-pressed={mode === id}
                onClick={() => {
                  setLocalError('')
                  setMode(id)
                }}
              >
                <span className="q-cuisine__pill-label">{label}</span>
                <span className="q-cuisine__pill-icon" aria-hidden>
                  <img
                    src={mode === id ? '/q-cuisine-check.svg' : '/q-cuisine-plus.svg'}
                    alt=""
                    width={25}
                    height={25}
                    decoding="async"
                  />
                </span>
              </button>
            ))}
          </div>

          <div className="q-stars__dealbreaker q-commute__minutes">
            <p className="q-stars__dealbreaker-heading">Max commute: {maxMinutes} minutes</p>
            <div className="q-stars__slider-wrap">
              <input
                className="q-stars__slider"
                type="range"
                min={5}
                max={60}
                step={5}
                value={maxMinutes}
                onChange={(e) => setMaxMinutes(Number(e.target.value))}
                aria-valuemin={5}
                aria-valuemax={60}
                aria-valuenow={maxMinutes}
                aria-label="Maximum commute time in minutes"
              />
              <div className="q-stars__slider-labels">
                <span>5 min</span>
                <span>60 min</span>
              </div>
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
