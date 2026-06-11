import { useCallback, useEffect, useMemo, useState } from 'react'
import './recommendations.css'

const API_BASE =
  import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '' : 'http://127.0.0.1:8000')

const LOADING_FOOD_TILES = [
  { id: 'pizza', label: 'Pizza', src: '/food-spinner-pizza.svg' },
  { id: 'thai', label: 'Thai', src: '/food-spinner-thai.svg' },
  { id: 'sushi', label: 'Sushi', src: '/food-spinner-sushi.svg' },
]

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
    reservationUrl: buildSearchUrl(r, 'reservation'),
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
  const [note, setNote] = useState('')
  const [votesData, setVotesData] = useState({ votes: {}, counts: {}, member_count: 0 })

  const lat = latitude
  const lng = longitude

  const load = useCallback(async () => {
    setLoading(true)
    setRows([])
    setNote('')
    const ids = (memberActorIds || []).filter(Boolean)
    if (!groupId && !ids.length) {
      setLoading(false)
      setNote('Add at least one group member profile before asking for recommendations.')
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
      const top = normalizeFromApi(data.top_3)
      const note = data.note && !data.note.includes('Nothing is saved') ? data.note : ''
      setNote(note || (top.length ? '' : 'No matching San Francisco food spots yet. Try relaxing the group preferences.'))
      setRows(top)
      if (groupId) {
        const voteRes = await fetch(`${API_BASE}/api/groups/${encodeURIComponent(groupId)}/votes`)
        const voteData = await voteRes.json().catch(() => ({}))
        if (voteRes.ok) setVotesData(voteData)
      }
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Could not load recommendations.')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [groupId, memberActorIds, groupFeaturePreferences, lat, lng])

  useEffect(() => {
    if (!groupExists) {
      setLoading(false)
      return
    }
    load()
  }, [groupExists, load])

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
      setNote(e instanceof Error ? e.message : 'Could not save vote.')
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
      setNote(e instanceof Error ? e.message : 'Could not choose winner.')
    }
  }

  async function sharePick(pick) {
    const text = `BigByte picked ${pick.name}${pick.location ? ` at ${pick.location}` : ''}. ${pick.mapUrl || ''}`
    if (navigator.share) {
      await navigator.share({ title: `BigByte picked ${pick.name}`, text, url: pick.mapUrl || window.location.href })
      return
    }
    await navigator.clipboard?.writeText(text)
    setNote('Copied the winning pick to your clipboard.')
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

  if (loading && !picks.length) {
    return (
      <div className="rec-loading-page" aria-live="polite" aria-busy="true">
        <div className="rec-loading-card">
          <p className="rec-loading-card__brand">BigByte</p>
          <h1 className="rec-loading-card__title">Finalizing your top picks.</h1>
          <div className="rec-loading-food" aria-hidden="true">
            {LOADING_FOOD_TILES.map((tile, index) => (
              <div key={tile.id} className="rec-loading-food__tile" style={{ '--i': index }}>
                <img src={tile.src} alt="" width="96" height="96" decoding="async" />
                <span>{tile.label}</span>
              </div>
            ))}
          </div>
          <p className="rec-loading-card__copy">Scoring the group, commute, and SF neighborhood matches...</p>
        </div>
      </div>
    )
  }

  return (
    <div className={`rec-page ${finalWinner ? 'rec-page--winner' : ''}`}>
      <header className="rec-page__header">
        <p className="rec-page__brand">BigByte</p>
        <h1 className="rec-page__title">
          {finalWinner ? 'Your Group Picked' : 'Vote On Your Top Picks'}
        </h1>
      </header>

      <div className="rec-page__stretch">
        {!loading && note ? <p className="rec-page__status">{note}</p> : null}
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
                <a href={finalWinner.reservationUrl} target="_blank" rel="noreferrer">
                  Reservation
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
        {!loading && picks.length && !finalWinner ? (
          <section className="rec-consensus" aria-label="Group voting status">
            <p className="rec-consensus__eyebrow">Consensus round</p>
            <h2 className="rec-consensus__title">
              {leadingPick ? `${leadingPick.name} is leading` : 'Pick your favorite'}
            </h2>
            <p className="rec-consensus__copy">
              Vote on the cards. When the group agrees, choose the leading pick.
            </p>
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
                          ['love', 'Love'],
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
                        {counts.love || 0} love · {counts.maybe || 0} maybe · {counts.pass || 0} pass
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
            Choose leading pick: {winnerPick.name}
          </button>
        </div>
      ) : null}

      <div className="rec-page__footer">
        <button type="button" className="rec-page__retry" onClick={onStartNewGroup}>
          Start new group
        </button>
      </div>
    </div>
  )
}
