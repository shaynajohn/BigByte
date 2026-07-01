const API_BASE =
  import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '' : 'http://127.0.0.1:8000')

export async function saveGroupMeetup(groupId, actorId, { latitude, longitude, label }) {
  const res = await fetch(`${API_BASE}/api/groups/${encodeURIComponent(groupId)}/meetup`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ actor_id: actorId, latitude, longitude, label }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(typeof data?.detail === 'string' ? data.detail : 'Could not save meetup spot.')
  }
  return data.meetup
}

export function hostActorIdFromGroup(group) {
  if (group?.host_actor_id) return group.host_actor_id
  const members = group?.members || []
  return members[0]?.actor_id || null
}

export function isGroupHost(group, actorId) {
  const hostId = hostActorIdFromGroup(group)
  return Boolean(hostId && actorId && hostId === actorId)
}
