import { useMemo, useState } from "react";
import { loadCommuteDraft, saveCommuteDraft } from "./questionnaireStorage.js";
import { saveGroupMeetup } from "./meetupApi.js";
import {
  SF_STARTING_POINTS,
  findStartingPoint,
  formatCoord,
  isSupportedOrigin,
  parseCoordinate,
} from "./sfLocations.js";
import "./questionnaire.css";

const DEFAULT_MAX_MINUTES = 20;
const TIME_PRESETS = [10, 15, 20, 30, 45];
const MODE_OPTIONS = [
  { id: "walking", label: "Walk", hint: "Neighborhood spots, short trips" },
  { id: "driving", label: "Drive", hint: "Wider range across the city" },
];
const ORIGIN_OPTIONS = [
  {
    id: "self",
    title: "Where I am",
    copy: "Use GPS or pick a neighborhood in SF.",
  },
  {
    id: "meetup",
    title: "Group meetup",
    copy: "Everyone measures from the same meeting spot.",
  },
];

/**
 * Commute step: per-member starting point (you vs group meetup) + travel mode + max minutes.
 */
export function QuestionnaireCommutePage({
  groupId,
  groupExists,
  actorId,
  isHost = false,
  groupMeetup,
  onMeetupUpdated,
  onBack,
  onComplete,
}) {
  const initial = useMemo(
    () => loadCommuteDraft(groupId, actorId),
    [groupId, actorId],
  );
  const meetup = groupMeetup || null;
  const [originType, setOriginType] = useState(() => {
    if (initial?.commute_origin_type === "meetup" || initial?.commute_origin_type === "self") {
      return initial.commute_origin_type;
    }
    if (meetup && !initial?.commute_origin_latitude) return "meetup";
    return "self";
  });
  const [selectedPreset, setSelectedPreset] = useState(
    () => initial?.commute_origin_preset || "",
  );
  const [originLabel, setOriginLabel] = useState(
    () => initial?.commute_origin_label || "",
  );
  const [latitude, setLatitude] = useState(() =>
    formatCoord(initial?.commute_origin_latitude),
  );
  const [longitude, setLongitude] = useState(() =>
    formatCoord(initial?.commute_origin_longitude),
  );
  const [setAsGroupMeetup, setSetAsGroupMeetup] = useState(
    () =>
      Boolean(initial?.commute_set_group_meetup) ||
      (isHost && !meetup && !initial?.commute_origin_latitude),
  );
  const [mode, setMode] = useState(initial?.commute_mode || "walking");
  const [maxMinutes, setMaxMinutes] = useState(
    initial?.commute_max_minutes || DEFAULT_MAX_MINUTES,
  );
  const [localError, setLocalError] = useState("");
  const [locating, setLocating] = useState(false);

  function applyPreset(presetId) {
    const preset = findStartingPoint(presetId);
    if (!preset) return;
    setLocalError("");
    setSelectedPreset(preset.id);
    setOriginLabel(preset.label);
    setLatitude(formatCoord(preset.latitude));
    setLongitude(formatCoord(preset.longitude));
  }

  function useCurrentLocation() {
    setLocalError("");
    setSelectedPreset("");
    if (!navigator.geolocation) {
      setLocalError(
        "Location sharing is not available. Pick a neighborhood below instead.",
      );
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLatitude(coords.latitude.toFixed(5));
        setLongitude(coords.longitude.toFixed(5));
        setOriginLabel("Your location");
        setLocating(false);
      },
      () => {
        setLocating(false);
        setLocalError(
          "Could not access your location. Pick a neighborhood or ask the group to set a meetup spot.",
        );
      },
      { enableHighAccuracy: true, maximumAge: 300000, timeout: 10000 },
    );
  }

  function resolvedSelfOrigin() {
    const lat = parseCoordinate(latitude, -90, 90);
    const lng = parseCoordinate(longitude, -180, 180);
    if (lat == null || lng == null) return null;
    if (!isSupportedOrigin(lat, lng)) return null;
    return {
      latitude: lat,
      longitude: lng,
      label: originLabel || "Your location",
    };
  }

  async function handleNext() {
    setLocalError("");

    if (originType === "meetup") {
      if (!meetup?.latitude || !meetup?.longitude) {
        setLocalError(
          "No group meetup spot yet. Pick where you are, or set a meetup spot for everyone.",
        );
        return;
      }
    } else if (!resolvedSelfOrigin()) {
      setLocalError(
        "Use your location or pick a neighborhood in San Francisco.",
      );
      return;
    }

    const selfOrigin = resolvedSelfOrigin();
    const draft = {
      commute_origin_type: originType,
      commute_origin_latitude: selfOrigin?.latitude ?? null,
      commute_origin_longitude: selfOrigin?.longitude ?? null,
      commute_origin_label:
        originType === "meetup"
          ? meetup?.label || "Group meetup"
          : selfOrigin?.label || "",
      commute_origin_preset: selectedPreset || "",
      commute_mode: mode,
      commute_max_minutes: Number(maxMinutes),
      commute_set_group_meetup: setAsGroupMeetup,
    };
    saveCommuteDraft(groupId, draft, actorId);

    try {
      if (setAsGroupMeetup && selfOrigin) {
        await saveGroupMeetup(groupId, actorId, {
          latitude: selfOrigin.latitude,
          longitude: selfOrigin.longitude,
          label: selfOrigin.label,
        });
        onMeetupUpdated?.();
      }
    } catch (e) {
      setLocalError(
        e instanceof Error ? e.message : "Could not save group meetup.",
      );
      return;
    }

    onComplete?.(draft);
  }

  const selfOrigin = resolvedSelfOrigin();
  const summaryOrigin =
    originType === "meetup" ? meetup?.label : selfOrigin?.label;
  const summaryReady =
    originType === "meetup"
      ? Boolean(meetup?.label)
      : Boolean(selfOrigin?.label);
  const modeLabel = mode === "walking" ? "Walking" : "Driving";

  if (!groupExists) {
    return (
      <div className="q-stars-page q-stars-page--focused">
        <div className="q-stars__main">
          <p className="q-stars__missing">
            This group is not available. Return to the group list or use a valid
            invite link.
          </p>
          <button type="button" className="q-stars__next" onClick={onBack}>
            Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="q-stars-page q-stars-page--focused">
      <div className="q-stars__main q-stars__main--wide">
        <button
          type="button"
          className="q-stars__back"
          onClick={onBack}
          aria-label="Go back"
        >
          <img
            src="/q-stars-back.svg"
            alt=""
            width={46}
            height={46}
            decoding="async"
          />
        </button>

        <p className="q-flow__eyebrow">Step 1 of 5</p>
        <h1 className="q-stars__title">How far is too far?</h1>
        <p className="q-flow__hint q-flow__hint--commute">
          Set your starting point and how long you&apos;re willing to travel.
          Everyone can start from a different place.
        </p>

        {localError ? (
          <div className="q-stars__banner-error" role="alert">
            {localError}
          </div>
        ) : null}

        <div
          className={`q-commute-summary ${summaryReady ? "q-commute-summary--ready" : ""}`}
          aria-live="polite"
        >
          <span className="q-commute-summary__label">Your commute</span>
          <p className="q-commute-summary__line">
            {summaryReady ? (
              <>
                <strong>{modeLabel}</strong>
                <span aria-hidden> · </span>
                up to <strong>{maxMinutes} min</strong>
                <span aria-hidden> · </span>
                from <strong>{summaryOrigin}</strong>
              </>
            ) : (
              "Pick a starting point to continue"
            )}
          </p>
        </div>

        <div className="q-commute-stack">
          <section className="q-commute-section" aria-labelledby="commute-origin-heading">
            <h2 id="commute-origin-heading" className="q-commute-section__title">
              1. Starting point
            </h2>
            <div className="q-commute-origin-grid" role="radiogroup" aria-label="Starting point">
              {ORIGIN_OPTIONS.map((option) => {
                const isMeetup = option.id === "meetup";
                const disabled = isMeetup && !meetup;
                const checked = originType === option.id;
                const subtitle = isMeetup
                  ? meetup?.label
                    ? `Meeting at ${meetup.label}`
                    : "No meetup set yet — pick “Where I am” or ask the host."
                  : option.copy;

                return (
                  <button
                    key={option.id}
                    type="button"
                    className={`q-commute-origin-card ${checked ? "q-commute-origin-card--active" : ""} ${disabled ? "q-commute-origin-card--disabled" : ""}`}
                    role="radio"
                    aria-checked={checked}
                    disabled={disabled}
                    onClick={() => {
                      if (disabled) return;
                      setLocalError("");
                      setOriginType(option.id);
                    }}
                  >
                    <span className="q-commute-origin-card__title">{option.title}</span>
                    <span className="q-commute-origin-card__copy">{subtitle}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="q-commute-section" aria-labelledby="commute-spot-heading">
            <h2 id="commute-spot-heading" className="q-commute-section__title">
              2. {originType === "meetup" ? "Meetup spot" : "Your location"}
            </h2>

            {originType === "meetup" ? (
              <div className="q-commute-panel">
                {meetup?.label ? (
                  <>
                    <p className="q-commute-spot-badge" aria-label={`Meetup at ${meetup.label}`}>
                      {meetup.label}
                    </p>
                    <p className="q-commute-panel__copy">
                      Recommendations will measure travel time from this shared spot.
                    </p>
                  </>
                ) : (
                  <p className="q-commute-panel__copy q-commute-panel__copy--muted">
                    The host hasn&apos;t set a meetup yet. Choose &quot;Where I am&quot; above, or
                    set one on the group page.
                  </p>
                )}
              </div>
            ) : (
              <div className="q-commute-panel">
                {isHost && !meetup ? (
                  <p className="q-commute__host-note">
                    You&apos;re the host — pick a neighborhood below and check &quot;Set as group
                    meetup&quot; so friends can join from the same spot.
                  </p>
                ) : null}

                <button
                  type="button"
                  className="q-commute-location-btn"
                  onClick={useCurrentLocation}
                  disabled={locating}
                >
                  {locating ? "Finding your location…" : "Use my current location"}
                </button>

                <p className="q-commute-panel__divider">
                  <span>or pick a neighborhood</span>
                </p>

                <div
                  className="q-commute-neighborhoods"
                  role="group"
                  aria-label="Neighborhood starting points"
                >
                  {SF_STARTING_POINTS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      className={`q-commute-neighborhood ${selectedPreset === preset.id ? "q-commute-neighborhood--active" : ""}`}
                      aria-pressed={selectedPreset === preset.id}
                      onClick={() => applyPreset(preset.id)}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>

                {selfOrigin ? (
                  <div className="q-commute-spot-row">
                    <p className="q-commute-spot-badge">{selfOrigin.label}</p>
                    <label className="q-commute-meetup-toggle">
                      <input
                        type="checkbox"
                        checked={setAsGroupMeetup}
                        onChange={(e) => setSetAsGroupMeetup(e.target.checked)}
                      />
                      <span className="q-commute-meetup-toggle__text">
                        <strong>Set as group meetup</strong>
                        <span>Everyone can measure from this spot</span>
                      </span>
                    </label>
                  </div>
                ) : (
                  <p className="q-commute-panel__copy q-commute-panel__copy--muted">
                    Choose GPS or a neighborhood in San Francisco.
                  </p>
                )}
              </div>
            )}
          </section>

          <section className="q-commute-section" aria-labelledby="commute-travel-heading">
            <h2 id="commute-travel-heading" className="q-commute-section__title">
              3. Travel &amp; time
            </h2>

            <div className="q-commute-panel q-commute-panel--travel">
              <p className="q-commute-panel__label">How you&apos;ll get there</p>
              <div className="q-commute-segment" role="group" aria-label="Preferred commute mode">
                {MODE_OPTIONS.map(({ id, label, hint }) => (
                  <button
                    key={id}
                    type="button"
                    className={`q-commute-segment__btn ${mode === id ? "q-commute-segment__btn--active" : ""}`}
                    aria-pressed={mode === id}
                    onClick={() => {
                      setLocalError("");
                      setMode(id);
                    }}
                  >
                    <span className="q-commute-segment__title">{label}</span>
                    <span className="q-commute-segment__hint">{hint}</span>
                  </button>
                ))}
              </div>

              <div className="q-commute-time">
                <div className="q-commute-time__header">
                  <p className="q-commute-time__value">
                    <span>{maxMinutes}</span> min
                  </p>
                  <p className="q-commute-time__label">Maximum travel time</p>
                </div>

                <div className="q-stars__slider-wrap q-commute-time__slider">
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

                <div className="q-commute-time__presets" role="group" aria-label="Quick time presets">
                  {TIME_PRESETS.map((minutes) => (
                    <button
                      key={minutes}
                      type="button"
                      className={`q-commute-time__preset ${maxMinutes === minutes ? "q-commute-time__preset--active" : ""}`}
                      aria-pressed={maxMinutes === minutes}
                      onClick={() => setMaxMinutes(minutes)}
                    >
                      {minutes} min
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>
        </div>

        <button type="button" className="q-stars__next" onClick={handleNext}>
          Next
        </button>
      </div>
    </div>
  );
}
