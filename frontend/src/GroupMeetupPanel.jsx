import { useState } from 'react'
import { SF_STARTING_POINTS } from './sfLocations.js'
import { saveGroupMeetup } from './meetupApi.js'

/**
 * Set or update the shared group meetup spot (group hub + host setup).
 */
export function GroupMeetupPanel({
  groupId,
  actorId,
  meetup,
  onUpdated,
  compact = false,
}) {
  const [selectedPreset, setSelectedPreset] = useState('')
  const [label, setLabel] = useState(meetup?.label || '')
  const [latitude, setLatitude] = useState(meetup?.latitude ?? null)
  const [longitude, setLongitude] = useState(meetup?.longitude ?? null)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [locating, setLocating] = useState(false)
  const [saving, setSaving] = useState(false)

  function applyPreset(preset) {
    setError('')
    setSelectedPreset(preset.id)
    setLabel(preset.label)
    setLatitude(preset.latitude)
    setLongitude(preset.longitude)
  }

  function useCurrentLocation() {
    setError('')
    setStatus('')
    setSelectedPreset('')
    if (!navigator.geolocation) {
      setError('Location is not available in this browser. Pick a neighborhood instead.')
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLatitude(coords.latitude)
        setLongitude(coords.longitude)
        setLabel('Host location')
        setLocating(false)
        setStatus('Using your current location as the meetup spot.')
      },
      () => {
        setLocating(false)
        setError('Could not access your location. Pick a neighborhood instead.')
      },
      { enableHighAccuracy: true, maximumAge: 300000, timeout: 10000 },
    )
  }

  async function handleSave() {
    setError('')
    setStatus('')
    if (latitude == null || longitude == null || !label.trim()) {
      setError('Pick a neighborhood or use your location first.')
      return
    }
    setSaving(true)
    try {
      const saved = await saveGroupMeetup(groupId, actorId, {
        latitude,
        longitude,
        label: label.trim(),
      })
      setStatus(`Meetup set to ${saved.label}.`)
      onUpdated?.(saved)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save meetup.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className={`group-meetup ${compact ? 'group-meetup--compact' : ''}`} aria-label="Group meetup spot">
      <div className="group-meetup__copy">
        <p className="group-meetup__eyebrow">Group meetup spot</p>
        <h3 className="group-meetup__title">
          {meetup?.label ? meetup.label : 'Where is everyone meeting?'}
        </h3>
        <p className="group-meetup__hint">
          {meetup
            ? 'Members can measure distance from this spot or from where they are.'
            : 'Set a meetup neighborhood so friends can choose “Group meetup” in the questionnaire.'}
        </p>
      </div>

      {error ? <p className="kahoot-error">{error}</p> : null}
      {status ? <p className="kahoot-status">{status}</p> : null}

      <div className="group-meetup__presets" role="group" aria-label="Meetup neighborhoods">
        {SF_STARTING_POINTS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className={`group-meetup__pill ${selectedPreset === preset.id ? 'group-meetup__pill--active' : ''}`}
            onClick={() => applyPreset(preset)}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div className="group-meetup__actions">
        <button
          type="button"
          className="kahoot-btn kahoot-btn--ghost kahoot-btn--sm"
          onClick={useCurrentLocation}
          disabled={locating}
        >
          {locating ? 'Finding location…' : 'Use my location'}
        </button>
        <button
          type="button"
          className="kahoot-btn kahoot-btn--primary kahoot-btn--sm"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? 'Saving…' : meetup ? 'Update meetup' : 'Save meetup spot'}
        </button>
      </div>
    </section>
  )
}
