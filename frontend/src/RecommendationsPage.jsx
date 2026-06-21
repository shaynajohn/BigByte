import { useCallback, useEffect, useMemo, useState } from 'react'
import { useGroupEvents } from './groupEvents.js'
import './recommendations.css'

const API_BASE =
  import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '' : 'http://127.0.0.1:8000')

const recommendationRequestCache = new Map()

async function fetchRecommendationData(endpoint, body) {
  const key = `${endpoint}:${JSON.stringify(body)}`
  if (!recommendationRequestCache.has(key)) {
    const request = fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          throw new Error(
            typeof data?.detail === 'string'
              ? data.detail
              : JSON.stringify(data?.detail) || `Recommend failed (${res.status})`,
          )
        }
        return data
      })
      .finally(() => {
        window.setTimeout(() => recommendationRequestCache.delete(key), 5000)
      })
    recommendationRequestCache.set(key, request)
  }
  return recommendationRequestCache.get(key)
}

function formatMinutes(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  return `${Math.max(1, Math.round(n))} min`
}

function formatMiles(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  return `${n.toFixed(n < 10 ? 1 : 0)} mi`
}

function buildLocationLine(r) {
  const locality = [r.city, r.state].filter(Boolean).join(', ')
  const address = [r.address, locality].filter(Boolean).join(' · ')
  return [r.neighborhood, address].filter(Boolean).join(' · ')
}

function buildMapUrl(r) {
  if (r.latitude != null && r.longitude != null) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
      `${r.latitude},${r.longitude}`,
    )}`
  }
  const query = [r.name, r.address, r.city, r.state].filter(Boolean).join(' ')
  return query
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
    : null
}

function buildSearchUrl(r, intent) {
  const query = [r.name, r.address, r.city, intent].filter(Boolean).join(' ')
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`
}

function buildFoodDescription(categories) {
  const skip = /^(restaurants?|food|bars?|cocktail bars)$/i
  const labels = String(categories || '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s && !skip.test(s))
  if (!labels.length) return 'San Francisco food spot'
  return labels.slice(0, 3).join(' · ')
}

function commuteModeLabel(mode) {
  return mode === 'walking' ? 'Walk' : mode === 'driving' ? 'Drive' : 'Commute'
}

function buildCommuteChips(r) {
  const chips = []
  const memberCommutes = Array.isArray(r.member_commutes) ? r.member_commutes : []
  const modes = Array.from(
    new Set(memberCommutes.map((row) => row?.mode).filter((mode) => mode === 'walking' || mode === 'driving')),
  )
  const avgMinutes = formatMinutes(r.commute_summary?.avg_preferred_minutes)
  const maxMinutes = formatMinutes(r.commute_summary?.max_preferred_minutes)
  const maxMiles = formatMiles(r.commute_summary?.max_preferred_distance_miles)
  const withinCount = Number(r.commute_summary?.within_max_count)
  const memberCount = Number(r.commute_summary?.member_count)
  const firstCommute = memberCommutes[0]

  if (modes.length === 1) {
    const label = commuteModeLabel(modes[0])
    const pieces =
      memberCount > 1
        ? [label, avgMinutes ? `avg ${avgMinutes}` : null, maxMinutes ? `max ${maxMinutes}` : null, maxMiles]
        : [label, maxMinutes || avgMinutes, maxMiles]
    chips.push([modes[0], pieces.filter(Boolean).join(' · ')])
  } else if (avgMinutes || maxMinutes || maxMiles) {
    chips.push([
      'group',
      [
        'Group commute',
        avgMinutes ? `avg ${avgMinutes}` : null,
        maxMinutes ? `max ${maxMinutes}` : null,
        maxMiles,
      ].filter(Boolean).join(' · '),
    ])
  }

  if (Number.isFinite(withinCount) && Number.isFinite(memberCount) && memberCount > 1) {
    chips.push(['cap', withinCount === memberCount ? "Under everyone's cap" : `${withinCount}/${memberCount} under cap`])
  } else if (memberCount === 1 && firstCommute?.within_max_minutes === false) {
    chips.push(['cap', 'Closest match, over cap'])
  }
  return chips
}

function normalizeFromApi(rows) {
  return (rows || []).slice(0, 3).map((r) => ({
    id: String(r.restaurant_id ?? r.id ?? r.name),
    name: r.name?.trim() || 'Food spot',
    location: buildLocationLine(r),
    description: buildFoodDescription(r.categories),
    mapUrl: buildMapUrl(r),
    menuUrl: buildSearchUrl(r, 'menu'),
    commuteChips: buildCommuteChips(r),
  }))
}

function emptyCounts() {
  return { love: 0, maybe: 0, pass: 0, total: 0 }
}

/**
 * Figma 50:573 — group top picks; cards grow on hover / focus for readability.
 */
export function RecommendationsPage({
  groupId,
  groupExists,
  actorId,
  memberActorIds,
  groupFeaturePreferences,
  latitude,
  longitude,
  onStartNewGroup,
}) {
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState([])
  const [message, setMessage] = useState('')
  const [votesData, setVotesData] = useState({ votes: {}, counts: {}, member_count: 0 })
  const [groupProgress, setGroupProgress] = useState({
    ready: false,
    completed: 0,
    total: 0,
  })

  const lat = latitude
  const lng = longitude

  const applyLivePayload = useCallback((payload) => {
    if (!payload?.exists) return
    setGroupProgress({
      ready: Boolean(payload.ready_for_recommendations),
      completed: Number(payload.completed_count || 0),
      total: Number(payload.member_count || 0),
    })
    if (payload.counts || payload.votes || payload.winner) {
      setVotesData({
        votes: payload.votes || {},
        counts: payload.counts || {},
        member_count: payload.member_count || 0,
        winner: payload.winner,
      })
    }
  }, [])

  useGroupEvents(groupId, applyLivePayload)

  const loadRecommendations = useCallback(async () => {
    setLoading(true)
    setRows([])
    setMessage('')
    const ids = (memberActorIds || []).filter(Boolean)
    if (!groupId && !ids.length) {
      setLoading(false)
      setMessage('Add at least one group member profile before asking for recommendations.')
      setRows([])
      return
    }
    const hasFeaturePreferences =
      groupFeaturePreferences && Object.keys(groupFeaturePreferences).length > 0
    const body = groupId
      ? {
          limit: 300,
          fairness_alpha: 0.7,
        }
      : hasFeaturePreferences
      ? {
          members: ids.map((id) => ({
            actor_id: id,
            features: groupFeaturePreferences,
          })),
          limit: 300,
          fairness_alpha: 0.7,
        }
      : { actor_ids: ids, limit: 300 }
    const la = typeof lat === 'number' ? lat : parseFloat(String(lat ?? ''))
    const lo = typeof lng === 'number' ? lng : parseFloat(String(lng ?? ''))
    if (!Number.isNaN(la) && !Number.isNaN(lo)) {
      body.latitude = la
      body.longitude = lo
    }
    try {
      const endpoint = groupId
        ? `/api/groups/${encodeURIComponent(groupId)}/recommendations`
        : hasFeaturePreferences
        ? '/api/recommendations/group_features'
        : '/api/recommendations/group'
      const data = await fetchRecommendationData(endpoint, body)
      const top = normalizeFromApi(data.top_3)
      setMessage(top.length ? '' : 'No matching San Francisco food spots yet. Try relaxing the group preferences.')
      setRows(top)
      if (groupId) {
        const voteRes = await fetch(`${API_BASE}/api/groups/${encodeURIComponent(groupId)}/votes`)
        const voteData = await voteRes.json().catch(() => ({}))
        if (voteRes.ok) setVotesData(voteData)
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not load recommendations.')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [groupId, memberActorIds, groupFeaturePreferences, lat, lng])

  const checkGroupReady = useCallback(async () => {
    if (!groupId) {
      setGroupProgress({ ready: true, completed: 0, total: 0 })
      return true
    }
    try {
      const res = await fetch(`${API_BASE}/api/groups/${encodeURIComponent(groupId)}`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(typeof data?.detail === 'string' ? data.detail : 'Group not found.')
      applyLivePayload({ exists: true, ...data })
      return Boolean(data.ready_for_recommendations)
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not load group status.')
      return false
    }
  }, [groupId, applyLivePayload])

  useEffect(() => {
    if (!groupExists) {
      setLoading(false)
      return undefined
    }

    let cancelled = false
    ;(async () => {
      setLoading(true)
      const ready = await checkGroupReady()
      if (cancelled) return
      if (ready) {
        await loadRecommendations()
      } else {
        setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [groupExists, checkGroupReady, loadRecommendations])

  useEffect(() => {
    if (!groupProgress.ready || !groupExists) return
    if (rows.length) return
    loadRecommendations()
  }, [groupProgress.ready, groupExists, rows.length, loadRecommendations])

  const picks = useMemo(() => rows, [rows])
  const leadingPick = useMemo(() => {
    let best = null
    let bestScore = -1
    for (const row of picks) {
      const counts = votesData.counts?.[row.id] || emptyCounts()
      const score = (counts.love || 0) * 2 + (counts.maybe || 0) - (counts.pass || 0)
      if (score > bestScore && (counts.total || 0) > 0) {
        best = row
        bestScore = score
      }
    }
    return best
  }, [picks, votesData])
  const finalWinner = useMemo(() => {
    const winnerId = votesData.winner?.restaurant_id
    return picks.find((row) => row.id === winnerId) || null
  }, [picks, votesData])
  const winnerPick = finalWinner || leadingPick

  async function voteFor(restaurantId, vote) {
    if (!groupId || !actorId) return
    setVotesData((prev) => ({
      ...prev,
      votes: {
        ...(prev.votes || {}),
        [actorId]: {
          ...((prev.votes || {})[actorId] || {}),
          [restaurantId]: vote,
        },
      },
    }))
    try {
      const res = await fetch(`${API_BASE}/api/groups/${encodeURIComponent(groupId)}/votes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor_id: actorId, restaurant_id: restaurantId, vote }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(typeof data?.detail === 'string' ? data.detail : 'Vote failed.')
      setVotesData(data)
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not save vote.')
    }
  }

  async function finalizeWinner(restaurantId) {
    if (!groupId || !actorId) return
    try {
      const res = await fetch(`${API_BASE}/api/groups/${encodeURIComponent(groupId)}/winner`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor_id: actorId, restaurant_id: restaurantId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(typeof data?.detail === 'string' ? data.detail : 'Could not choose winner.')
      setVotesData(data)
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not choose winner.')
    }
  }

  async function sharePick(pick) {
    const text = `BigByte picked ${pick.name}${pick.location ? ` at ${pick.location}` : ''}. ${pick.mapUrl || ''}`
    if (navigator.share) {
      await navigator.share({ title: `BigByte picked ${pick.name}`, text, url: pick.mapUrl || window.location.href })
      return
    }
    await navigator.clipboard?.writeText(text)
    setMessage('Copied the winning pick to your clipboard.')
  }

  if (!groupExists) {
    return (
      <div className="rec-page">
        <div className="rec-page__header">
          <p className="rec-page__brand">BigByte</p>
          <h1 className="rec-page__title">Your Group&apos;s Top Picks</h1>
        </div>
        <p className="rec-page__status">
          This group is not available. Return to the group list or use a valid invite link.
        </p>
        <div className="rec-page__footer">
          <button type="button" className="rec-page__retry" onClick={onStartNewGroup}>
            Start new group
          </button>
        </div>
      </div>
    )
  }

  if (loading && !picks.length && groupProgress.ready) {
    return (
      <div className="rec-loading-page" aria-live="polite" aria-busy="true">
        <div className="rec-loading-card">
          <p className="rec-loading-card__brand">BigByte</p>
          <h1 className="rec-loading-card__title">Finalizing your top picks.</h1>
          <p className="rec-loading-card__copy">Scoring the group, commute, and SF neighborhood matches...</p>
        </div>
      </div>
    )
  }

  if (!groupProgress.ready && groupId) {
    return (
      <div className="rec-loading-page" aria-live="polite" aria-busy="true">
        <div className="rec-loading-card">
          <p className="rec-loading-card__brand">BigByte</p>
          <h1 className="rec-loading-card__title">Waiting for the group.</h1>
          <p className="rec-loading-card__copy">
            {groupProgress.total
              ? `${groupProgress.completed} of ${groupProgress.total} members have submitted preferences.`
              : 'Waiting for group members to finish the questionnaire.'}
          </p>
          <p className="rec-loading-card__hint">Updates appear here automatically — no refresh needed.</p>
        </div>
      </div>
    )
  }

  return (
    <div className={`rec-page ${finalWinner ? 'rec-page--winner' : ''}`}>
      {finalWinner ? (
        <header className="rec-page__header">
          <p className="rec-page__brand">BigByte</p>
          <h1 className="rec-page__title">Your Group Picked</h1>
        </header>
      ) : null}

      <div className="rec-page__stretch">
        {!loading && message ? <p className="rec-page__status">{message}</p> : null}
        {!loading && finalWinner ? (
          <section className="rec-winner" aria-label="Final group pick">
            <div className="rec-winner__body">
              <p className="rec-consensus__eyebrow">Final pick</p>
              <h2 className="rec-winner__title">{finalWinner.name}</h2>
              {finalWinner.description ? <p className="rec-card__description">{finalWinner.description}</p> : null}
              {finalWinner.location ? <p className="rec-winner__location">{finalWinner.location}</p> : null}
              {finalWinner.commuteChips.length ? (
                <ul className="rec-card__commute" aria-label={`Commute details for ${finalWinner.name}`}>
                  {finalWinner.commuteChips.map(([id, label]) => (
                    <li key={id}>{label}</li>
                  ))}
                </ul>
              ) : null}
              <div className="rec-winner-actions">
                <a href={finalWinner.mapUrl} target="_blank" rel="noreferrer">
                  Maps
                </a>
                <a href={finalWinner.menuUrl} target="_blank" rel="noreferrer">
                  Menu
                </a>
                <button type="button" onClick={() => sharePick(finalWinner)}>
                  Share
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {!finalWinner ? <div className="rec-cards" aria-busy={loading}>
          {picks.map((r) => (
            <article key={r.id} className="rec-card" tabIndex={0}>
              {(() => {
                const counts = votesData.counts?.[r.id] || emptyCounts()
                const myVote = votesData.votes?.[actorId]?.[r.id] || ''
                return (
              <div className="rec-card__panel">
                <div className="rec-card__body">
                  <h2 className="rec-card__name">{r.name}</h2>
                  {r.description ? <p className="rec-card__description">{r.description}</p> : null}
                  {r.location ? <p className="rec-card__location">{r.location}</p> : null}
                  {r.commuteChips.length ? (
                    <ul className="rec-card__commute" aria-label={`Commute details for ${r.name}`}>
                      {r.commuteChips.map(([id, label]) => (
                        <li key={id}>{label}</li>
                      ))}
                    </ul>
                  ) : null}
                  {groupId ? (
                    <div className="rec-vote" aria-label={`Vote on ${r.name}`}>
                      <div className="rec-vote__buttons">
                        {[
                          ['love', 'Yes'],
                          ['maybe', 'Maybe'],
                          ['pass', 'Pass'],
                        ].map(([value, label]) => (
                          <button
                            key={value}
                            type="button"
                            className="rec-vote__btn"
                            aria-pressed={myVote === value}
                            onClick={() => voteFor(r.id, value)}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                      <p className="rec-vote__counts">
                        {counts.love || 0} yes · {counts.maybe || 0} maybe · {counts.pass || 0} pass
                      </p>
                    </div>
                  ) : null}
                </div>
              </div>
                )
              })()}
            </article>
          ))}
        </div> : null}
      </div>

      {!finalWinner && winnerPick ? (
        <div className="rec-sticky-pick">
          <button type="button" onClick={() => finalizeWinner(winnerPick.id)}>
            Pick {winnerPick.name}
          </button>
        </div>
      ) : null}
    </div>
  )
}
