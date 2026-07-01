/**
 * Shared guest preferences for demo API seeding (Indian, Mission walk).
 */
export const GUEST_FEATURES = {
  good_for_groups: { value: true, importance: 3 },
  categories: {
    value: ['Indian'],
    importance: 5,
    dealbreaker_strength: 3,
  },
  price_range: { value: 2, importance: 3 },
  table_service: { value: true, importance: 2 },
  takeout: { value: true, importance: 2 },
  ambiance_labels: { value: ['casual'], importance: 2 },
  commute: {
    value: {
      origin: { latitude: 37.7599, longitude: -122.4148 },
      mode: 'walking',
      max_minutes: 25,
    },
    importance: 4,
    dealbreaker_strength: 2,
  },
}

export async function apiJson(baseUrl, path, options = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const detail = typeof data?.detail === 'string' ? data.detail : JSON.stringify(data?.detail || res.status)
    throw new Error(`${path} failed: ${detail}`)
  }
  return data
}

export async function joinGuestAndSubmit(apiBase, groupId, actorId = 'guest:demo-friend') {
  await apiJson(apiBase, `/api/groups/${encodeURIComponent(groupId)}/members`, {
    method: 'POST',
    body: JSON.stringify({ actor_id: actorId, name: 'Friend' }),
  })
  await apiJson(apiBase, `/api/groups/${encodeURIComponent(groupId)}/answers`, {
    method: 'POST',
    body: JSON.stringify({ actor_id: actorId, features: GUEST_FEATURES }),
  })
}

export async function waitForServers(apiBase, frontendUrl) {
  try {
    await apiJson(apiBase, '/api/health')
  } catch {
    throw new Error(`Backend not reachable at ${apiBase}. Start: python3 -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000`)
  }
  try {
    const res = await fetch(frontendUrl)
    if (!res.ok) throw new Error('bad status')
  } catch {
    throw new Error(`Frontend not reachable at ${frontendUrl}. Start: npm --prefix frontend run dev`)
  }
}
