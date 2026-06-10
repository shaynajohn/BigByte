import { useCallback, useEffect, useMemo, useState } from 'react'
import './recommendations.css'

const API_BASE =
  import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '' : 'http://127.0.0.1:8000')

const CATEGORY_IMAGES = [
  { test: /coffee|tea|cafe/i, url: 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=900&q=80' },
  { test: /baker|donut|bagel|bread|pastr/i, url: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=900&q=80' },
  { test: /dessert|ice cream|bubble tea|boba/i, url: 'https://images.unsplash.com/photo-1563805042-7684c019e1cb?auto=format&fit=crop&w=900&q=80' },
  { test: /pizza/i, url: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=900&q=80' },
  { test: /burger|sandwich/i, url: 'https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=900&q=80' },
  { test: /ramen|japanese|sushi|izakaya/i, url: 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=900&q=80' },
  { test: /thai|vietnamese|burmese|asian/i, url: 'https://images.unsplash.com/photo-1559314809-0d155014e29e?auto=format&fit=crop&w=900&q=80' },
  { test: /mexican|taco|latin|cuban|filipino/i, url: 'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?auto=format&fit=crop&w=900&q=80' },
  { test: /italian|pasta|mediterranean|greek/i, url: 'https://images.unsplash.com/photo-1551183053-bf91a1d81141?auto=format&fit=crop&w=900&q=80' },
  { test: /seafood|oyster/i, url: 'https://images.unsplash.com/photo-1559737558-2f5a35f4523b?auto=format&fit=crop&w=900&q=80' },
  { test: /vegetarian|vegan|salad/i, url: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=900&q=80' },
]

function pickCuisineLabel(categories) {
  const raw = String(categories || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const skip = /restaurants|restaurant|food|bars?/i
  const hit = raw.find((c) => !skip.test(c))
  return hit || raw[0] || 'Dining'
}

function pickAmbianceLabel(labels) {
  const first = Array.isArray(labels) ? labels.find(Boolean) : null
  if (!first) return 'Dining'
  return String(first)
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(' ')
}

function formatPriceLevel(priceRange) {
  const level = Number(priceRange)
  if (!Number.isFinite(level) || level < 1) return null
  return '$'.repeat(Math.min(Math.round(level), 4))
}

function buildLocationLine(r) {
  const locality = [r.city, r.state].filter(Boolean).join(', ')
  return [r.address, locality].filter(Boolean).join(' · ')
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

function buildImageUrl(r) {
  if (r.image_url) return r.image_url
  const haystack = `${r.name || ''} ${r.categories || ''}`
  const hit = CATEGORY_IMAGES.find(({ test }) => test.test(haystack))
  return hit?.url || 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=900&q=80'
}

function buildBlurb(r) {
  const parts = []
  if (typeof r.group_score === 'number' && !Number.isNaN(r.group_score)) {
    parts.push(`Group match is ${Math.round(Number(r.group_score) * 100)}%.`)
  }
  if (typeof r.avg_utility === 'number' && !Number.isNaN(r.avg_utility)) {
    parts.push(`Average preference fit is ${Math.round(Number(r.avg_utility) * 100)}%.`)
  }
  if (typeof r.cuisine_group_fit === 'number' && !Number.isNaN(r.cuisine_group_fit)) {
    parts.push(
      `Cuisine fit for the group is about ${Math.round(Number(r.cuisine_group_fit) * 100)}%.`,
    )
  }
  if (r.score != null) {
    parts.push(`Rank score ${typeof r.score === 'number' ? r.score.toFixed(2) : r.score}.`)
  }
  if (parts.length) return parts.join(' ')
  return 'Each pick reflects how the food spot lines up with what your group said matters: flavors, budget, distance, and vibe.'
}

function buildReasons(r) {
  const reasons = []
  if (typeof r.group_score === 'number' && !Number.isNaN(r.group_score)) {
    reasons.push(`${Math.round(Number(r.group_score) * 100)}% group match`)
  }
  if (r.relaxed_dealbreaker_fallback) {
    reasons.push('Best compromise when preferences conflict')
  }
  if (r.price_range != null) {
    reasons.push(`${formatPriceLevel(r.price_range)} budget fit`)
  }
  if (r.takeout) reasons.push('Takeout works')
  if (r.delivery) reasons.push('Delivery available')
  if (r.good_for_groups) reasons.push('Group-friendly')
  if (r.table_service) reasons.push('Table service')
  return reasons.slice(0, 4)
}

function buildTags(r) {
  const tags = []
  tags.push({ id: 'vibe', label: pickAmbianceLabel(r.ambiance_labels) })
  tags.push({ id: 'cuisine', label: pickCuisineLabel(r.categories) })
  if (r.stars != null) {
    const s = Number(r.stars)
    const label = Number.isInteger(s) ? `${s} Stars` : `${s.toFixed(1)} Stars`.replace('.0 Stars', ' Stars')
    tags.push({ id: 'stars', label })
  } else {
    tags.push({ id: 'stars', label: '—' })
  }
  tags.push({ id: 'price', label: formatPriceLevel(r.price_range) || '$$' })
  return tags
}

function buildMeta(r) {
  const meta = []
  if (r.distance_miles != null && !Number.isNaN(Number(r.distance_miles))) {
    meta.push(`${Number(r.distance_miles).toFixed(1)} mi`)
  }
  if (r.review_count != null) {
    meta.push(`${Number(r.review_count).toLocaleString()} reviews`)
  }
  if (r.price_range != null) {
    meta.push(formatPriceLevel(r.price_range))
  }
  return meta.filter(Boolean)
}

function normalizeFromApi(rows) {
  return (rows || []).slice(0, 3).map((r) => ({
    id: String(r.restaurant_id ?? r.id ?? r.name),
    name: r.name?.trim() || 'Food spot',
    location: buildLocationLine(r),
    mapUrl: buildMapUrl(r),
    imageUrl: buildImageUrl(r),
    imageAlt: `${r.name?.trim() || 'Food spot'} preview`,
    blurb: buildBlurb(r),
    reasons: buildReasons(r),
    meta: buildMeta(r),
    tags: buildTags(r),
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
          limit: 200,
          fairness_alpha: 0.7,
        }
      : hasFeaturePreferences
      ? {
          members: ids.map((id) => ({
            actor_id: id,
            features: groupFeaturePreferences,
          })),
          limit: 200,
          fairness_alpha: 0.7,
        }
      : { actor_ids: ids, limit: 200 }
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

  return (
    <div className="rec-page">
      <header className="rec-page__header">
        <p className="rec-page__brand">BigByte</p>
        <h1 className="rec-page__title">Your Group&apos;s Top Picks</h1>
      </header>

      <div className="rec-page__stretch">
        {loading ? <p className="rec-page__status">Loading recommendations…</p> : null}
        {!loading && note ? <p className="rec-page__status">{note}</p> : null}
        {!loading && picks.length ? (
          <section className="rec-consensus" aria-label="Group voting status">
            <p className="rec-consensus__eyebrow">Consensus round</p>
            <h2 className="rec-consensus__title">
              {leadingPick ? `${leadingPick.name} is leading` : 'Vote on your favorites'}
            </h2>
            <p className="rec-consensus__copy">
              Tap Love, Maybe, or Pass on each card. Counts update for the whole group.
            </p>
          </section>
        ) : null}

        <div className="rec-cards" aria-busy={loading}>
          {picks.map((r) => (
            <article key={r.id} className="rec-card" tabIndex={0}>
              {(() => {
                const counts = votesData.counts?.[r.id] || emptyCounts()
                const myVote = votesData.votes?.[actorId]?.[r.id] || ''
                return (
              <div className="rec-card__panel">
                <div className="rec-card__image-wrap">
                  <img className="rec-card__image" src={r.imageUrl} alt={r.imageAlt} loading="lazy" />
                </div>
                <div className="rec-card__body">
                  <h2 className="rec-card__name">{r.name}</h2>
                  {r.location ? <p className="rec-card__location">{r.location}</p> : null}
                  {r.meta.length ? (
                    <div className="rec-card__meta" aria-label="Food spot details">
                      {r.meta.map((item) => (
                        <span key={item}>{item}</span>
                      ))}
                    </div>
                  ) : null}
                  <p className="rec-card__blurb">{r.blurb}</p>
                  {r.reasons.length ? (
                    <ul className="rec-card__reasons" aria-label={`Why ${r.name} fits`}>
                      {r.reasons.map((reason) => (
                        <li key={reason}>{reason}</li>
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
                  {r.mapUrl ? (
                    <a
                      className="rec-card__map"
                      href={r.mapUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open in Maps
                    </a>
                  ) : null}
                </div>
              </div>
                )
              })()}
              <ul className="rec-card__tags" aria-label="Highlights">
                {r.tags.map((t) => (
                  <li key={t.id} className="rec-card__tag">
                    {t.label}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </div>

      <div className="rec-page__footer">
        <button type="button" className="rec-page__retry" onClick={onStartNewGroup}>
          Start new group
        </button>
      </div>
    </div>
  )
}
