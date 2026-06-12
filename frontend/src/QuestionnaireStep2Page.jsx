import { useCallback, useMemo, useState } from "react";
import { loadCuisineDraft, saveCuisineDraft } from "./questionnaireStorage.js";
import "./questionnaire.css";

/** Figma 27:94 — display order (wrap-friendly). */
const MOOD_CUISINES = [
  { id: "pizza", label: "Pizza" },
  { id: "burgers", label: "Burgers" },
  { id: "sandwiches", label: "Sandwiches" },
  { id: "thai", label: "Thai" },
  { id: "breakfast_brunch", label: "Breakfast/Brunch" },
  { id: "cuban", label: "Cuban" },
  { id: "italian", label: "Italian" },
  { id: "chinese", label: "Chinese" },
  { id: "japanese_sushi", label: "Japanese/Sushi" },
  { id: "indian", label: "Indian" },
  { id: "vietnamese", label: "Vietnamese" },
  { id: "greek", label: "Greek" },
  { id: "mediterranean", label: "Mediterranean" },
  { id: "korean", label: "Korean" },
  { id: "bbq", label: "BBQ" },
  { id: "caribbean", label: "Caribbean" },
  { id: "latin_american", label: "Latin American" },
  { id: "seafood", label: "Seafood" },
  { id: "american", label: "American" },
  { id: "french", label: "French" },
  { id: "filipino", label: "Filipino" },
  { id: "burmese", label: "Burmese" },
  { id: "ethiopian", label: "Ethiopian" },
  { id: "vegetarian", label: "Vegetarian" },
  { id: "bakeries", label: "Bakeries" },
  { id: "desserts", label: "Desserts" },
  { id: "coffee", label: "Coffee & Tea" },
];

/**
 * Second questionnaire step (Figma 27:94): cuisine moods + dealbreaker, ¼–½–¼ layout.
 */
export function QuestionnaireStep2Page({
  groupId,
  groupExists,
  actorId,
  onBack,
  onNext,
}) {
  const initial = useMemo(
    () => loadCuisineDraft(groupId, actorId),
    [groupId, actorId],
  );
  const [selected, setSelected] = useState(
    () => new Set(initial?.cuisine_types_selected ?? []),
  );
  const [dealbreaker, setDealbreaker] = useState(
    initial?.cuisine_dealbreaker_level ?? 3,
  );
  const [localError, setLocalError] = useState("");

  const toggleCuisine = useCallback((id) => {
    setLocalError("");
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  function handleNext() {
    setLocalError("");
    if (selected.size === 0) {
      setLocalError("Select at least one cuisine.");
      return;
    }
    const cuisine_types_selected = [...selected].sort((a, b) => {
      const ia = MOOD_CUISINES.findIndex((c) => c.id === a);
      const ib = MOOD_CUISINES.findIndex((c) => c.id === b);
      return ia - ib;
    });
    const cuisine_dealbreaker_level = dealbreaker;
    saveCuisineDraft(
      groupId,
      { cuisine_types_selected, cuisine_dealbreaker_level },
      actorId,
    );
    onNext({ cuisine_types_selected, cuisine_dealbreaker_level });
  }

  const asideLeft = (
    <div className="q-stars__aside q-stars__aside--left" aria-hidden>
      <div className="q-stars__aside-crop q-stars__aside-crop--left">
        <img
          src="/questionnaire-hero.png"
          alt=""
          width={810}
          height={1440}
          decoding="async"
        />
      </div>
    </div>
  );

  const asideRight = (
    <div className="q-stars__aside q-stars__aside--right" aria-hidden>
      <div className="q-stars__aside-crop q-stars__aside-crop--step2-right">
        <img
          src="/questionnaire-step2-right.png"
          alt=""
          width={900}
          height={1200}
          decoding="async"
        />
      </div>
    </div>
  );

  if (!groupExists) {
    return (
      <div className="q-stars-page">
        {asideLeft}
        <div className="q-stars__main">
          <p className="q-stars__missing">
            This group is not available. Return to the group list or use a valid
            invite link.
          </p>
          <button type="button" className="q-stars__next" onClick={onBack}>
            Back
          </button>
        </div>
        {asideRight}
      </div>
    );
  }

  return (
    <div className="q-stars-page">
      {asideLeft}

      <div className="q-stars__main">
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

        <p className="q-flow__eyebrow">Step 2 of 5</p>
        <h1 className="q-stars__title">What sounds good?</h1>

        {localError ? (
          <div className="q-stars__banner-error" role="alert">
            {localError}
          </div>
        ) : null}

        <div
          className="q-cuisine__tags"
          role="group"
          aria-label="Cuisine types"
        >
          {MOOD_CUISINES.map(({ id, label }) => {
            const on = selected.has(id);
            return (
              <button
                key={id}
                type="button"
                className="q-cuisine__pill"
                aria-pressed={on}
                onClick={() => toggleCuisine(id)}
              >
                <span className="q-cuisine__pill-label">{label}</span>
                <span className="q-cuisine__pill-icon" aria-hidden>
                  <img
                    src={on ? "/q-cuisine-check.svg" : "/q-cuisine-plus.svg"}
                    alt=""
                    width={25}
                    height={25}
                    decoding="async"
                  />
                </span>
              </button>
            );
          })}
        </div>

        <div className="q-stars__dealbreaker">
          <p className="q-stars__dealbreaker-heading">Dealbreaker</p>
          <div className="q-stars__slider-wrap">
            <input
              className="q-stars__slider"
              type="range"
              min={1}
              max={5}
              step={1}
              value={dealbreaker}
              onChange={(e) => {
                setLocalError("");
                setDealbreaker(Number(e.target.value));
              }}
              aria-valuemin={1}
              aria-valuemax={5}
              aria-valuenow={dealbreaker}
              aria-label="How strongly cuisine choices are a dealbreaker, 1 not at all to 5 must match"
            />
            <div className="q-stars__slider-labels">
              <span>Not a Dealbreaker</span>
              <span>Dealbreaker</span>
            </div>
          </div>
        </div>

        <button type="button" className="q-stars__next" onClick={handleNext}>
          Next
        </button>
      </div>

      {asideRight}
    </div>
  );
}
