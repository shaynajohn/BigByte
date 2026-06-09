import { useEffect, useMemo, useState } from 'react'
import { derivePreferencesFromText } from './derivePreferences.js'
import { JoinGroupPage } from './JoinGroupPage.jsx'
import { LandingPage } from './LandingPage.jsx'
import { QuestionnaireStarsPage } from './QuestionnaireStarsPage.jsx'
import { QuestionnaireStep2Page } from './QuestionnaireStep2Page.jsx'
import { QuestionnairePricePage } from './QuestionnairePricePage.jsx'
import { QuestionnaireBooleanStepPage } from './QuestionnaireBooleanStep.jsx'
import { QuestionnaireAmbiancePage } from './QuestionnaireAmbiancePage.jsx'
import { QuestionnaireWaitingPage } from './QuestionnaireWaitingPage.jsx'
import { RecommendationsPage } from './RecommendationsPage.jsx'
import { getGroupFeaturePreferences } from './questionnaireStorage.js'
import './App.css'

const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'
const BAY_AREA_MEETING_POINT = {
  label: 'San Francisco Bay Area',
  anchor: 'San Francisco, CA',
  latitude: '37.7749',
  longitude: '-122.4194',
}

function MeetingPointControls({
  idPrefix,
  title,
  hint,
  latitude,
  longitude,
  onLatitudeChange,
  onLongitudeChange,
  onUseCurrentLocation,
}) {
  return (
    <section className="meeting-point" aria-label={title}>
      <div className="meeting-point__copy">
        <p className="meeting-point__eyebrow">Meeting point</p>
        <h3 className="meeting-point__title">{title}</h3>
        <p className="meeting-point__hint">{hint}</p>
      </div>
      <div className="meeting-point__grid">
        <label className="kahoot-label" htmlFor={`${idPrefix}-lat`}>
          Latitude
        </label>
        <label className="kahoot-label" htmlFor={`${idPrefix}-lng`}>
          Longitude
        </label>
        <input
          id={`${idPrefix}-lat`}
          className="kahoot-input"
          value={latitude}
          onChange={(e) => onLatitudeChange(e.target.value)}
        />
        <input
          id={`${idPrefix}-lng`}
          className="kahoot-input"
          value={longitude}
          onChange={(e) => onLongitudeChange(e.target.value)}
        />
      </div>
      <button
        type="button"
        className="kahoot-btn kahoot-btn--ghost meeting-point__button"
        onClick={onUseCurrentLocation}
      >
        Use my current location
      </button>
    </section>
  )
}

let inMemoryActorId = ''
let inMemoryGroups = {}

/** Stable guest actor for this browser tab only (`guest:<uuid>`). */
function getOrCreateActorId() {
  if (!inMemoryActorId) {
    inMemoryActorId = `guest:${crypto.randomUUID()}`
  }
  return inMemoryActorId
}

function randomId() {
  return Math.random().toString(36).slice(2, 10)
}

function getPath() {
  const raw = window.location.hash || '#/'
  return raw.startsWith('#') ? raw.slice(1) : raw
}

function navigate(path) {
  window.location.hash = `#${path}`
}

function normalizeCuisineLabel(label) {
  const normalized = String(label || '').trim().toLowerCase()
  if (normalized.includes('japanese') && normalized.includes('sushi')) return 'Japanese / Sushi'
  if (normalized === 'bbq') return 'Barbeque'
  return label
}

function budgetToPriceLevel(prefs) {
  const min = prefs?.budget_min
  const max = prefs?.budget_max
  const target =
    min != null && max != null
      ? (Number(min) + Number(max)) / 2
      : max != null
        ? Number(max)
        : min != null
          ? Number(min)
          : null
  if (target == null || Number.isNaN(target)) return null
  if (target <= 15) return 1
  if (target <= 30) return 2
  if (target <= 50) return 3
  return 4
}

function buildSessionFeaturePreferences(prefs) {
  if (!prefs) return null
  const features = {
    good_for_groups: { value: true, importance: 3 },
  }

  const cuisines = (prefs.cuisine_preferences || []).map(normalizeCuisineLabel).filter(Boolean)
  if (cuisines.length) {
    features.categories = {
      value: cuisines,
      importance: 5,
      dealbreaker_strength: 3,
    }
  }

  const priceLevel = budgetToPriceLevel(prefs)
  if (priceLevel != null) {
    features.price_range = {
      value: priceLevel,
      importance: 4,
      dealbreaker_strength: 2,
    }
  }

  return features
}

function loadGroups() {
  return inMemoryGroups
}

function saveGroups(groups) {
  inMemoryGroups = groups
}

function getInviteUrl(groupId) {
  return `${window.location.origin}${window.location.pathname}#/join/${groupId}`
}

/** Main Polsley / Kahoot-style flow (no hash sub-routes). */
const FLOW = {
  HOME: 'home',
  DESCRIBE: 'describe',
  DERIVED: 'derived',
  CONFIRM: 'confirm',
  DONE: 'done',
}

function App() {
  const [route, setRoute] = useState(getPath())
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [groupVersion, setGroupVersion] = useState(0)

  const [flowStep, setFlowStep] = useState(FLOW.HOME)
  const [description, setDescription] = useState('')
  const [derived, setDerived] = useState(null)
  const [sessionPreferences, setSessionPreferences] = useState(null)

  const [joinName, setJoinName] = useState('')

  const [recLoading, setRecLoading] = useState(false)
  const [recommendations, setRecommendations] = useState(null)
  const [latInput, setLatInput] = useState(BAY_AREA_MEETING_POINT.latitude)
  const [lngInput, setLngInput] = useState(BAY_AREA_MEETING_POINT.longitude)

  const [groupRecLoading, setGroupRecLoading] = useState(false)
  const [groupRecommendations, setGroupRecommendations] = useState(null)
  const [groupLatInput, setGroupLatInput] = useState(BAY_AREA_MEETING_POINT.latitude)
  const [groupLngInput, setGroupLngInput] = useState(BAY_AREA_MEETING_POINT.longitude)

  const [actorId] = useState(() => getOrCreateActorId())

  useEffect(() => {
    function onHashChange() {
      setRoute(getPath())
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  const isMainFlow = route === '/' || route === ''

  function goDerived() {
    setError('')
    const text = description.trim()
    if (text.length < 3) {
      setError('Add a sentence or two about how you like to eat.')
      return
    }
    setDerived(derivePreferencesFromText(text))
    setFlowStep(FLOW.DERIVED)
  }

  function goConfirm() {
    setError('')
    setFlowStep(FLOW.CONFIRM)
  }

  function savePreferencesYes() {
    setError('')
    const prefs = {
      raw_description: description.trim(),
      ...derived,
      captured_at: new Date().toISOString(),
    }
    setSessionPreferences(prefs)
    setStatus('')
    setFlowStep(FLOW.DONE)
  }

  function savePreferencesNo() {
    setDerived(null)
    setDescription('')
    setFlowStep(FLOW.DESCRIBE)
    setStatus('Okay — describe your preferences again when you are ready.')
  }

  function resetFlow() {
    setDescription('')
    setDerived(null)
    setSessionPreferences(null)
    setFlowStep(FLOW.HOME)
    setError('')
    setStatus('')
    setRecommendations(null)
  }

  function applyCurrentLocation(target) {
    setError('')
    if (!navigator.geolocation) {
      setError('Your browser does not support location sharing. You can still type a meeting point manually.')
      return
    }

    setStatus('Finding your current location…')
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const nextLat = coords.latitude.toFixed(4)
        const nextLng = coords.longitude.toFixed(4)
        if (target === 'group') {
          setGroupLatInput(nextLat)
          setGroupLngInput(nextLng)
        } else {
          setLatInput(nextLat)
          setLngInput(nextLng)
        }
        setStatus('Using your current location as the meeting point.')
      },
      () => {
        setStatus('')
        setError(
          `Could not access your location. The ${BAY_AREA_MEETING_POINT.label} default is still ready to use.`,
        )
      },
      { enableHighAccuracy: true, maximumAge: 300000, timeout: 10000 },
    )
  }

  async function fetchRecommendations() {
    setError('')
    setRecLoading(true)
    setRecommendations(null)
    const lat = parseFloat(latInput)
    const lng = parseFloat(lngInput)
    const sessionFeatures = buildSessionFeaturePreferences(sessionPreferences)
    const hasSessionFeatures = sessionFeatures && Object.keys(sessionFeatures).length > 0
    const body = hasSessionFeatures
      ? {
          members: [
            {
              actor_id: actorId,
              features: sessionFeatures,
            },
          ],
          limit: 200,
          fairness_alpha: 0.7,
        }
      : {
          actor_id: actorId,
          limit: 200,
        }
    if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
      body.latitude = lat
      body.longitude = lng
    }
    try {
      const endpoint = hasSessionFeatures
        ? '/api/recommendations/group_features'
        : '/api/recommendations'
      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(
          typeof data?.detail === 'string'
            ? data.detail
            : JSON.stringify(data?.detail) || `Recommend failed (${res.status})`,
        )
      }
      setRecommendations(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setRecLoading(false)
    }
  }

  async function fetchGroupRecommendations(memberActorIds) {
    setError('')
    setGroupRecLoading(true)
    setGroupRecommendations(null)
    const lat = parseFloat(groupLatInput)
    const lng = parseFloat(groupLngInput)
    const featurePreferences =
      groupFeaturePreferences || buildSessionFeaturePreferences(sessionPreferences)
    const hasFeaturePreferences =
      featurePreferences && Object.keys(featurePreferences).length > 0
    const body = hasFeaturePreferences
      ? {
          members: memberActorIds.map((id) => ({
            actor_id: id,
            features: featurePreferences,
          })),
          limit: 200,
          fairness_alpha: 0.7,
        }
      : {
          actor_ids: memberActorIds,
          limit: 200,
        }
    if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
      body.latitude = lat
      body.longitude = lng
    }
    try {
      const endpoint = hasFeaturePreferences
        ? '/api/recommendations/group_features'
        : '/api/recommendations/group'
      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(
          typeof data?.detail === 'string'
            ? data.detail
            : JSON.stringify(data?.detail) || `Recommend failed (${res.status})`,
        )
      }
      setGroupRecommendations(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setGroupRecLoading(false)
    }
  }

  function onStartGroup() {
    setError('')
    setStatus('')
    const groupId = randomId()
    const groups = loadGroups()
    groups[groupId] = {
      id: groupId,
      created_at: new Date().toISOString(),
      members: [
        {
          id: randomId(),
          name: 'You (host)',
          actor_id: getOrCreateActorId(),
          joined_at: new Date().toISOString(),
        },
      ],
    }
    saveGroups(groups)
    setGroupVersion((n) => n + 1)
    navigate(`/group/${groupId}`)
  }

  /** Creates a local group and returns its join code (landing page). */
  function createGroupFromLanding() {
    setError('')
    setStatus('')
    const groupId = randomId()
    const groups = loadGroups()
    groups[groupId] = {
      id: groupId,
      created_at: new Date().toISOString(),
      members: [
        {
          id: randomId(),
          name: 'You (host)',
          actor_id: getOrCreateActorId(),
          joined_at: new Date().toISOString(),
        },
      ],
    }
    saveGroups(groups)
    setGroupVersion((n) => n + 1)
    return groupId
  }

  function joinWithCodeFromLanding(raw) {
    setError('')
    setStatus('')
    const code = raw.trim()
    if (!code) {
      setError('Enter a join code.')
      return
    }
    const groups = loadGroups()
    if (!groups[code]) {
      setError('No group found with that code on this device.')
      return
    }
    navigate(`/join/${code}`)
  }

  function onJoinGroupSubmit(e, groupId) {
    e.preventDefault()
    setError('')
    setStatus('')
    const name = joinName.trim()
    if (!name) {
      setError('Please enter your name.')
      return
    }

    const groups = loadGroups()
    const group = groups[groupId]
    if (!group) {
      setError('That group does not exist in this browser session.')
      return
    }

    const memberId = randomId()
    group.members = Array.isArray(group.members) ? group.members : []
    group.members.push({
      id: memberId,
      name,
      actor_id: getOrCreateActorId(),
      joined_at: new Date().toISOString(),
    })
    groups[groupId] = group
    saveGroups(groups)
    setGroupVersion((n) => n + 1)
    setJoinName('')
    navigate(`/questionnaire/${groupId}`)
  }

  const parts = route.split('/').filter(Boolean)
  const routeKey = parts[0] || ''
  const groupIdFromRoute =
    (routeKey === 'group' && parts[1]) ||
    (routeKey === 'join' && parts[1]) ||
    (routeKey === 'questionnaire' && parts[1]) ||
    null
  const questionnaireWaiting =
    routeKey === 'questionnaire' && groupIdFromRoute && parts[2] === 'waiting'
  const questionnaireResults =
    routeKey === 'questionnaire' && groupIdFromRoute && parts[2] === 'results'
  const questionnaireStep =
    routeKey === 'questionnaire' && groupIdFromRoute
      ? ['2', '3', '4', '5', '6', '7'].includes(parts[2])
        ? parts[2]
        : 'stars'
      : 'stars'
  const currentGroup = useMemo(() => {
    if (!groupIdFromRoute) return null
    const groups = loadGroups()
    return groups[groupIdFromRoute] || null
  }, [groupIdFromRoute, route, groupVersion])

  const questionnaireMemberActorIds = useMemo(
    () => (currentGroup?.members || []).map((m) => m.actor_id).filter(Boolean),
    [currentGroup],
  )

  const groupFeaturePreferences = useMemo(
    () => (groupIdFromRoute ? getGroupFeaturePreferences(groupIdFromRoute) : null),
    [groupIdFromRoute, route],
  )

  const allGroups = useMemo(() => {
    const groups = loadGroups()
    return Object.values(groups).sort((a, b) => {
      const at = typeof a?.created_at === 'string' ? a.created_at : ''
      const bt = typeof b?.created_at === 'string' ? b.created_at : ''
      return bt.localeCompare(at)
    })
  }, [route, groupVersion])

  const stepIndex =
    flowStep === FLOW.HOME
      ? 0
      : flowStep === FLOW.DESCRIBE
        ? 1
        : flowStep === FLOW.DERIVED
          ? 2
          : flowStep === FLOW.CONFIRM
            ? 3
            : flowStep === FLOW.DONE
              ? 4
              : 0

  return (
    <div className="app-shell">
      {isMainFlow ? (
        flowStep === FLOW.HOME ? (
          <LandingPage
            error={error}
            onCreateGroup={createGroupFromLanding}
            onJoinSubmit={joinWithCodeFromLanding}
            onNavigateToGroup={(id) => navigate(`/join/${id}`)}
          />
        ) : (
        <main className="kahoot-flow">
          <header className="kahoot-header">
            <p className="kahoot-brand">BigByte</p>
            {flowStep !== FLOW.HOME && flowStep !== FLOW.DONE ? (
              <div className="kahoot-steps" aria-hidden>
                {[1, 2, 3].map((n) => (
                  <span
                    key={n}
                    className={`kahoot-step-dot ${stepIndex >= n ? 'active' : ''}`}
                  />
                ))}
              </div>
            ) : null}
          </header>

          {error ? <p className="kahoot-error">{error}</p> : null}
          {status ? <p className="kahoot-status">{status}</p> : null}

          {flowStep === FLOW.DESCRIBE ? (
            <section className="kahoot-panel">
              <p className="kahoot-step-label">Step 1 — Describe</p>
              <h2 className="kahoot-heading">How do you like to eat?</h2>
              <p className="kahoot-hint">
                Mention diets, allergies, cuisines, budget, or how far you’ll travel.
              </p>
              <label className="kahoot-label" htmlFor="prefs-desc">
                Your words
              </label>
              <textarea
                id="prefs-desc"
                className="kahoot-textarea"
                rows={6}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Mostly vegetarian, no nuts, love Thai and Vietnamese, usually under $25 per person, happy to walk 15 minutes."
              />
              <div className="kahoot-actions">
                <button
                  type="button"
                  className="kahoot-btn kahoot-btn--ghost"
                  onClick={resetFlow}
                >
                  Back
                </button>
                <button
                  type="button"
                  className="kahoot-btn kahoot-btn--primary"
                  onClick={goDerived}
                >
                  Next
                </button>
              </div>
            </section>
          ) : null}

          {flowStep === FLOW.DERIVED && derived ? (
            <section className="kahoot-panel">
              <p className="kahoot-step-label">Step 2 — What we understood</p>
              <h2 className="kahoot-heading">Here’s your profile (preview)</h2>
              {derived.confidence_note ? (
                <p className="kahoot-hint">{derived.confidence_note}</p>
              ) : null}
              <div className="kahoot-cards">
                <div className="kahoot-card">
                  <span className="kahoot-card-label">Dietary</span>
                  <ul>
                    {derived.dietary_restrictions.length ? (
                      derived.dietary_restrictions.map((d) => (
                        <li key={d}>{d}</li>
                      ))
                    ) : (
                      <li className="kahoot-card-empty">None detected</li>
                    )}
                  </ul>
                </div>
                <div className="kahoot-card">
                  <span className="kahoot-card-label">Cuisines</span>
                  <ul>
                    {derived.cuisine_preferences.length ? (
                      derived.cuisine_preferences.map((c) => (
                        <li key={c}>{c}</li>
                      ))
                    ) : (
                      <li className="kahoot-card-empty">None detected</li>
                    )}
                  </ul>
                </div>
                <div className="kahoot-card kahoot-card--wide">
                  <span className="kahoot-card-label">Budget & distance</span>
                  <p>
                    {derived.budget_min != null || derived.budget_max != null
                      ? `$${derived.budget_min ?? '…'} – $${derived.budget_max ?? '…'}`
                      : 'Not detected'}
                  </p>
                  <p>
                    Max distance:{' '}
                    {derived.max_distance_miles != null
                      ? `${derived.max_distance_miles} mi`
                      : 'Not detected'}
                  </p>
                </div>
              </div>
              <div className="kahoot-actions">
                <button
                  type="button"
                  className="kahoot-btn kahoot-btn--ghost"
                  onClick={() => setFlowStep(FLOW.DESCRIBE)}
                >
                  Edit description
                </button>
                <button
                  type="button"
                  className="kahoot-btn kahoot-btn--primary"
                  onClick={goConfirm}
                >
                  Looks good
                </button>
              </div>
            </section>
          ) : null}

          {flowStep === FLOW.CONFIRM && derived ? (
            <section className="kahoot-panel kahoot-panel--confirm">
              <p className="kahoot-step-label">Step 3 — Save?</p>
              <h2 className="kahoot-heading">Save these preferences?</h2>
              <p className="kahoot-lead kahoot-lead--narrow">
                We’ll store this profile on this device so you can use it for group
                meals later.
              </p>
              <div className="kahoot-binary">
                <button
                  type="button"
                  className="kahoot-btn kahoot-btn--yes kahoot-btn--xl"
                  onClick={savePreferencesYes}
                >
                  Yes, save
                </button>
                <button
                  type="button"
                  className="kahoot-btn kahoot-btn--no kahoot-btn--xl"
                  onClick={savePreferencesNo}
                >
                  No, start over
                </button>
              </div>
            </section>
          ) : null}

          {flowStep === FLOW.DONE ? (
            <section className="kahoot-panel kahoot-panel--done">
              <h2 className="kahoot-heading">You’re set</h2>
              <p className="kahoot-lead">
                Preferences are kept only in this page session. Refreshing or closing
                the tab clears them.
              </p>
              {sessionPreferences ? (
                <p className="kahoot-hint" style={{ marginTop: 8 }}>
                  Session profile ready for demo recommendations.
                </p>
              ) : null}
              <p className="kahoot-hint" style={{ marginTop: 8 }}>
                Session participant: <code className="kahoot-code">{actorId}</code>
              </p>
              <MeetingPointControls
                idPrefix="rec"
                title={BAY_AREA_MEETING_POINT.label}
                hint={`Defaults to ${BAY_AREA_MEETING_POINT.anchor}; use your live location if the group is meeting somewhere more specific.`}
                latitude={latInput}
                longitude={lngInput}
                onLatitudeChange={setLatInput}
                onLongitudeChange={setLngInput}
                onUseCurrentLocation={() => applyCurrentLocation('solo')}
              />
              <div className="kahoot-actions kahoot-actions--center" style={{ marginTop: 16 }}>
                <button
                  type="button"
                  className="kahoot-btn kahoot-btn--primary"
                  onClick={fetchRecommendations}
                  disabled={recLoading}
                >
                  {recLoading ? 'Loading…' : 'Get recommendations'}
                </button>
              </div>
              {recommendations?.note && !recommendations.note.includes('Nothing is saved') ? (
                <p className="kahoot-error" style={{ marginTop: 12 }}>
                  {recommendations.note}
                </p>
              ) : null}
              {recommendations?.top_3?.length ? (
                <div style={{ marginTop: 24, textAlign: 'left', maxWidth: 480, marginInline: 'auto' }}>
                  <p className="kahoot-step-label">Top 3 (rules-based)</p>
                  <ul className="group-list group-list--plain">
                    {recommendations.top_3.map((r) => (
                      <li key={r.restaurant_id} style={{ marginBottom: 12 }}>
                        <strong>{r.name}</strong>
                        <br />
                        <span className="kahoot-hint">
                          match{' '}
                          {r.group_score != null
                            ? `${Math.round(Number(r.group_score) * 100)}%`
                            : (r.score?.toFixed?.(2) ?? r.score)}
                          {r.distance_miles != null
                            ? ` · ${Number(r.distance_miles).toFixed(2)} mi`
                            : ''}
                          {r.stars != null ? ` · ★${r.stars}` : ''}
                        </span>
                        <br />
                        <span className="kahoot-hint">{r.categories}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <div className="kahoot-actions kahoot-actions--center">
                <button
                  type="button"
                  className="kahoot-btn kahoot-btn--primary"
                  onClick={() => navigate('/groups')}
                >
                  Group mode
                </button>
                <button
                  type="button"
                  className="kahoot-btn kahoot-btn--ghost"
                  onClick={resetFlow}
                >
                  Start over
                </button>
              </div>
            </section>
          ) : null}
        </main>
        )
      ) : (
        routeKey === 'questionnaire' && groupIdFromRoute ? (
          questionnaireWaiting ? (
            <QuestionnaireWaitingPage
              groupId={groupIdFromRoute}
              groupExists={!!currentGroup}
              memberActorIds={questionnaireMemberActorIds}
              latitude={parseFloat(groupLatInput)}
              longitude={parseFloat(groupLngInput)}
              onBackToGroup={() => {
                setError('')
                navigate(`/group/${groupIdFromRoute}`)
              }}
              onContinueToResults={() => {
                setError('')
                navigate(`/questionnaire/${groupIdFromRoute}/results`)
              }}
            />
          ) : questionnaireResults ? (
            <RecommendationsPage
              groupExists={!!currentGroup}
              memberActorIds={questionnaireMemberActorIds}
              groupFeaturePreferences={groupFeaturePreferences}
              latitude={parseFloat(groupLatInput)}
              longitude={parseFloat(groupLngInput)}
              onStartNewGroup={() => {
                setError('')
                navigate('/')
              }}
            />
          ) : questionnaireStep === '7' ? (
            <QuestionnaireAmbiancePage
              groupId={groupIdFromRoute}
              groupExists={!!currentGroup}
              onBack={() => {
                setError('')
                navigate(`/questionnaire/${groupIdFromRoute}/6`)
              }}
              onComplete={() => {
                setError('')
                navigate(`/questionnaire/${groupIdFromRoute}/waiting`)
              }}
            />
          ) : questionnaireStep === '6' ? (
            <QuestionnaireBooleanStepPage
              groupId={groupIdFromRoute}
              groupExists={!!currentGroup}
              variant="delivery"
              onBack={() => {
                setError('')
                navigate(`/questionnaire/${groupIdFromRoute}/5`)
              }}
              onComplete={() => {
                setError('')
                navigate(`/questionnaire/${groupIdFromRoute}/7`)
              }}
            />
          ) : questionnaireStep === '5' ? (
            <QuestionnaireBooleanStepPage
              groupId={groupIdFromRoute}
              groupExists={!!currentGroup}
              variant="takeout"
              onBack={() => {
                setError('')
                navigate(`/questionnaire/${groupIdFromRoute}/4`)
              }}
              onComplete={() => {
                setError('')
                navigate(`/questionnaire/${groupIdFromRoute}/6`)
              }}
            />
          ) : questionnaireStep === '4' ? (
            <QuestionnaireBooleanStepPage
              groupId={groupIdFromRoute}
              groupExists={!!currentGroup}
              variant="table_service"
              onBack={() => {
                setError('')
                navigate(`/questionnaire/${groupIdFromRoute}/3`)
              }}
              onComplete={() => {
                setError('')
                navigate(`/questionnaire/${groupIdFromRoute}/5`)
              }}
            />
          ) : questionnaireStep === '3' ? (
            <QuestionnairePricePage
              groupId={groupIdFromRoute}
              groupExists={!!currentGroup}
              onBack={() => {
                setError('')
                navigate(`/questionnaire/${groupIdFromRoute}/2`)
              }}
              onComplete={() => {
                setError('')
                navigate(`/questionnaire/${groupIdFromRoute}/4`)
              }}
            />
          ) : questionnaireStep === '2' ? (
            <QuestionnaireStep2Page
              groupId={groupIdFromRoute}
              groupExists={!!currentGroup}
              onBack={() => {
                setError('')
                navigate(`/questionnaire/${groupIdFromRoute}`)
              }}
              onNext={() => {
                setError('')
                navigate(`/questionnaire/${groupIdFromRoute}/3`)
              }}
            />
          ) : (
            <QuestionnaireStarsPage
              groupId={groupIdFromRoute}
              groupExists={!!currentGroup}
              onBack={() => {
                setError('')
                navigate('/')
              }}
              onComplete={() => {
                setError('')
                navigate(`/questionnaire/${groupIdFromRoute}/2`)
              }}
            />
          )
        ) : routeKey === 'join' && groupIdFromRoute ? (
          <JoinGroupPage
            groupId={groupIdFromRoute}
            groupExists={!!currentGroup}
            joinName={joinName}
            onJoinNameChange={setJoinName}
            onSubmit={(e) => onJoinGroupSubmit(e, groupIdFromRoute)}
            onCancel={() => {
              setError('')
              navigate('/groups')
            }}
            onBackHome={() => {
              setError('')
              navigate('/')
            }}
            error={error}
          />
        ) : (
        <main className="app-secondary">
          <section id="center" className="secondary-section">
            <div>
              <h1 className="secondary-title">BigByte</h1>
              <p className="secondary-sub">Groups (session demo)</p>
            </div>

            {status ? <p className="kahoot-status">{status}</p> : null}
            {error ? <p className="kahoot-error">{error}</p> : null}

            {route === '/groups' || route === '/join' ? (
              <div className="group-hub">
                <h2 className="kahoot-heading">Join a group</h2>
                <p className="kahoot-hint">
                  Groups in this browser session:
                </p>
                <ul className="group-list">
                  {allGroups.length ? null : <li>(no groups yet)</li>}
                  {allGroups.map((g) => (
                    <li key={g.id} className="group-row">
                      <div>
                        <strong>Group</strong>{' '}
                        <code className="kahoot-code">{g.id}</code>{' '}
                        <span className="group-meta">
                          ({Array.isArray(g.members) ? g.members.length : 0} members)
                        </span>
                      </div>
                      <div className="group-row-actions">
                        <button
                          type="button"
                          className="kahoot-btn kahoot-btn--primary kahoot-btn--sm"
                          onClick={() => navigate(`/join/${g.id}`)}
                        >
                          Join
                        </button>
                        <button
                          type="button"
                          className="kahoot-btn kahoot-btn--ghost kahoot-btn--sm"
                          onClick={() => navigate(`/group/${g.id}`)}
                        >
                          View
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
                <div className="kahoot-actions">
                  <button
                    type="button"
                    className="kahoot-btn kahoot-btn--primary"
                    onClick={onStartGroup}
                  >
                    Create a group
                  </button>
                  <button
                    type="button"
                    className="kahoot-btn kahoot-btn--ghost"
                    onClick={() => {
                      setStatus('Paste invite link — coming next.')
                      setError('')
                    }}
                  >
                    Join via invite link (TODO)
                  </button>
                </div>
                <div className="kahoot-actions">
                  <button
                    type="button"
                    className="kahoot-btn kahoot-btn--ghost"
                    onClick={() => navigate('/')}
                  >
                    ← Home
                  </button>
                  <button
                    type="button"
                    className="kahoot-btn kahoot-btn--ghost"
                    onClick={() => {
                      saveGroups({})
                      setGroupVersion((n) => n + 1)
                      setStatus('Cleared session groups.')
                      setError('')
                    }}
                  >
                    Clear groups
                  </button>
                </div>
              </div>
            ) : null}

            {routeKey === 'group' && groupIdFromRoute ? (
              <div className="group-detail">
                <h2 className="kahoot-heading">Group {groupIdFromRoute}</h2>
                <p className="kahoot-hint">Invite link:</p>
                <code className="kahoot-code kahoot-code--block">
                  {getInviteUrl(groupIdFromRoute)}
                </code>
                <div className="kahoot-actions">
                  <button
                    type="button"
                    className="kahoot-btn kahoot-btn--primary"
                    onClick={() => navigate(`/join/${groupIdFromRoute}`)}
                  >
                    Join this group
                  </button>
                </div>
                <p className="kahoot-hint">Members:</p>
                <ul className="group-list group-list--plain">
                  {(currentGroup?.members || []).map((m) => (
                    <li key={m.id}>
                      <strong>{m.name}</strong>
                      {m.actor_id ? (
                        <span className="kahoot-hint">
                          {' '}
                          · profile <code className="kahoot-code">{m.actor_id.slice(0, 18)}…</code>
                        </span>
                      ) : (
                        <span className="kahoot-hint"> · (no profile id — re-join after update)</span>
                      )}
                    </li>
                  ))}
                  {currentGroup?.members?.length ? null : (
                    <li className="kahoot-card-empty">(none yet)</li>
                  )}
                </ul>
                <p className="kahoot-hint" style={{ marginTop: 16 }}>
                  Each person should complete the flow in this browser session. Then use the
                  meeting point below for distance filtering.
                </p>
                <MeetingPointControls
                  idPrefix="grp"
                  title={`${BAY_AREA_MEETING_POINT.label} group spot`}
                  hint={`Start from ${BAY_AREA_MEETING_POINT.anchor}, or use the host's current location as the meetup point.`}
                  latitude={groupLatInput}
                  longitude={groupLngInput}
                  onLatitudeChange={setGroupLatInput}
                  onLongitudeChange={setGroupLngInput}
                  onUseCurrentLocation={() => applyCurrentLocation('group')}
                />
                <div className="kahoot-actions" style={{ marginTop: 12 }}>
                  <button
                    type="button"
                    className="kahoot-btn kahoot-btn--primary"
                    disabled={groupRecLoading}
                    onClick={() => {
                      const ids = (currentGroup?.members || [])
                        .map((m) => m.actor_id)
                        .filter(Boolean)
                      if (!ids.length) {
                        setError(
                          'No member actor ids in this group. Create or join the group with the current app version so profiles can be linked.',
                        )
                        return
                      }
                      fetchGroupRecommendations(ids)
                    }}
                  >
                    {groupRecLoading ? 'Loading…' : 'Get group recommendations'}
                  </button>
                </div>
                {groupRecommendations?.note && !groupRecommendations.note.includes('Nothing is saved') ? (
                  <p className="kahoot-error" style={{ marginTop: 12 }}>
                    {groupRecommendations.note}
                  </p>
                ) : null}
                {groupRecommendations?.preferences_merged ? (
                  <p className="kahoot-hint" style={{ marginTop: 8 }}>
                    Merged budget (est. $/person):{' '}
                    {groupRecommendations.preferences_merged.budget_min != null ||
                    groupRecommendations.preferences_merged.budget_max != null
                      ? `$${groupRecommendations.preferences_merged.budget_min ?? '…'} – $${groupRecommendations.preferences_merged.budget_max ?? '…'}`
                      : 'any'}
                    {groupRecommendations.preferences_merged.max_distance_miles != null
                      ? ` · max ${groupRecommendations.preferences_merged.max_distance_miles} mi (tightest)`
                      : ''}
                  </p>
                ) : null}
                {groupRecommendations?.top_3?.length ? (
                  <div style={{ marginTop: 16, textAlign: 'left', maxWidth: 480, marginInline: 'auto' }}>
                    <p className="kahoot-step-label">Top picks for the group</p>
                    <ul className="group-list group-list--plain">
                      {groupRecommendations.top_3.map((r) => (
                        <li key={r.restaurant_id} style={{ marginBottom: 12 }}>
                          <strong>{r.name}</strong>
                          <br />
                          <span className="kahoot-hint">
                            match{' '}
                            {r.group_score != null
                              ? `${Math.round(Number(r.group_score) * 100)}%`
                              : (r.score?.toFixed?.(2) ?? r.score)}
                            {r.cuisine_group_fit != null
                              ? ` · group cuisine fit ${(Number(r.cuisine_group_fit) * 100).toFixed(0)}%`
                              : ''}
                            {r.distance_miles != null
                              ? ` · ${Number(r.distance_miles).toFixed(2)} mi`
                              : ''}
                            {r.stars != null ? ` · ★${r.stars}` : ''}
                          </span>
                          <br />
                          <span className="kahoot-hint">{r.categories}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <div className="kahoot-actions">
                  <button
                    type="button"
                    className="kahoot-btn kahoot-btn--ghost"
                    onClick={() => navigate('/groups')}
                  >
                    All groups
                  </button>
                  <button
                    type="button"
                    className="kahoot-btn kahoot-btn--ghost"
                    onClick={() => {
                      const groups = loadGroups()
                      delete groups[groupIdFromRoute]
                      saveGroups(groups)
                      setGroupVersion((n) => n + 1)
                      navigate('/groups')
                    }}
                  >
                    Delete group
                  </button>
                </div>
              </div>
            ) : null}

          </section>
        </main>
        )
      )}
    </div>
  )
}

export default App
