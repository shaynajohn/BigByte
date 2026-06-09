import { useCallback, useEffect, useMemo, useState } from 'react'
import './recommendations.css'

const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'

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
  if (r.distance_miles != null && !Number.isNaN(Number(r.distance_miles))) {
    parts.push(`About ${Number(r.distance_miles).toFixed(1)} miles from the meeting point.`)
  }
  if (r.score != null) {
    parts.push(`Rank score ${typeof r.score === 'number' ? r.score.toFixed(2) : r.score}.`)
  }
  if (parts.length) return parts.join(' ')
  return 'Each restaurant reflects how the place lines up with what your group said matters — flavors, budget, distance, and vibe.'
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
    name: r.name?.trim() || 'Restaurant',
    location: buildLocationLine(r),
    mapUrl: buildMapUrl(r),
    blurb: buildBlurb(r),
    meta: buildMeta(r),
    tags: buildTags(r),
  }))
}

/**
 * Figma 50:573 — group top picks; cards grow on hover / focus for readability.
 */
export function RecommendationsPage({
  groupExists,
  memberActorIds,
  groupFeaturePreferences,
  latitude,
  longitude,
  onStartNewGroup,
}) {
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState([])
  const [note, setNote] = useState('')

  const lat = latitude
  const lng = longitude

  const load = useCallback(async () => {
    setLoading(true)
    setRows([])
    setNote('')
    const ids = (memberActorIds || []).filter(Boolean)
    if (!ids.length) {
      setLoading(false)
      setNote('Add at least one group member profile before asking for recommendations.')
      setRows([])
      return
    }
    const hasFeaturePreferences =
      groupFeaturePreferences && Object.keys(groupFeaturePreferences).length > 0
    const body = hasFeaturePreferences
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
      const top = normalizeFromApi(data.top_3)
      const note = data.note && !data.note.includes('Nothing is saved') ? data.note : ''
      setNote(note || (top.length ? '' : 'No matching Bay Area restaurants yet. Try relaxing the group preferences.'))
      setRows(top)
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Could not load recommendations.')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [memberActorIds, groupFeaturePreferences, lat, lng])

  useEffect(() => {
    if (!groupExists) {
      setLoading(false)
      return
    }
    load()
  }, [groupExists, load])

  const picks = useMemo(() => rows, [rows])

  if (!groupExists) {
    return (
      <div className="rec-page">
        <div className="rec-page__header">
          <p className="rec-page__brand">BigByte</p>
          <h1 className="rec-page__title">Your Group&apos;s Top Picks</h1>
        </div>
        <p className="rec-page__status">
          This group is not on this device. Return to the group list or use a valid invite link.
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

        <div className="rec-cards" aria-busy={loading}>
          {picks.map((r) => (
            <article key={r.id} className="rec-card" tabIndex={0}>
              <div className="rec-card__panel">
                <div className="rec-card__body">
                  <h2 className="rec-card__name">{r.name}</h2>
                  {r.location ? <p className="rec-card__location">{r.location}</p> : null}
                  {r.meta.length ? (
                    <div className="rec-card__meta" aria-label="Restaurant details">
                      {r.meta.map((item) => (
                        <span key={item}>{item}</span>
                      ))}
                    </div>
                  ) : null}
                  <p className="rec-card__blurb">{r.blurb}</p>
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
