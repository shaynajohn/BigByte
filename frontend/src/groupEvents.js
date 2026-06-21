import { useEffect, useRef } from 'react'

const API_BASE =
  import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '' : 'http://127.0.0.1:8000')

function parseEventData(raw) {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    return parsed?.data ?? parsed
  } catch {
    return null
  }
}

/**
 * Subscribe to live group updates (questionnaire progress, votes, winner).
 * Falls back gracefully if EventSource is unavailable.
 */
export function useGroupEvents(groupId, onUpdate) {
  const handlerRef = useRef(onUpdate)

  useEffect(() => {
    handlerRef.current = onUpdate
  }, [onUpdate])

  useEffect(() => {
    if (!groupId || typeof EventSource === 'undefined') return undefined

    const source = new EventSource(
      `${API_BASE}/api/groups/${encodeURIComponent(groupId)}/stream`,
    )

    function handleMessage(event) {
      const payload = parseEventData(event.data)
      if (payload) handlerRef.current(payload)
    }

    source.addEventListener('snapshot', handleMessage)
    source.addEventListener('update', handleMessage)
    source.onerror = () => {
      /* browser auto-reconnects EventSource */
    }

    return () => {
      source.close()
    }
  }, [groupId])
}
