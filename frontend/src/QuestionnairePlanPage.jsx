import { useMemo, useState } from "react";
import {
  loadDeliveryDraft,
  loadTableServiceDraft,
  loadTakeoutDraft,
  saveDeliveryDraft,
  saveTableServiceDraft,
  saveTakeoutDraft,
} from "./questionnaireStorage.js";
import "./questionnaire.css";

const PLAN_OPTIONS = [
  {
    id: "dine-in",
    title: "Sit down",
    copy: "Best for groups, dates, and a real meal.",
    values: {
      table_service: "yes",
      takeout_available: "yes",
      delivery_available: "no",
    },
  },
  {
    id: "fast-casual",
    title: "Fast",
    copy: "Counter-service, takeout-friendly, low commitment.",
    values: {
      table_service: "no",
      takeout_available: "yes",
      delivery_available: "no",
    },
  },
  {
    id: "delivery-ok",
    title: "Delivery",
    copy: "Keep options open if the group wants to stay put.",
    values: {
      table_service: "no",
      takeout_available: "yes",
      delivery_available: "yes",
    },
  },
  {
    id: "anything",
    title: "Don't care",
    copy: "Optimize for food, distance, and group fit.",
    values: {
      table_service: "yes",
      takeout_available: "yes",
      delivery_available: "yes",
    },
  },
];

function inferInitialPlan(tableService, takeout, delivery) {
  const values = {
    table_service: tableService?.table_service,
    takeout_available: takeout?.takeout_available,
    delivery_available: delivery?.delivery_available,
  };
  return (
    PLAN_OPTIONS.find((option) =>
      Object.entries(option.values).every(
        ([key, value]) => values[key] === value,
      ),
    )?.id ?? "anything"
  );
}

export function QuestionnairePlanPage({
  groupId,
  groupExists,
  actorId,
  onBack,
  onComplete,
}) {
  const initialTable = useMemo(
    () => loadTableServiceDraft(groupId, actorId),
    [groupId, actorId],
  );
  const initialTakeout = useMemo(
    () => loadTakeoutDraft(groupId, actorId),
    [groupId, actorId],
  );
  const initialDelivery = useMemo(
    () => loadDeliveryDraft(groupId, actorId),
    [groupId, actorId],
  );
  const [selected, setSelected] = useState(() =>
    inferInitialPlan(initialTable, initialTakeout, initialDelivery),
  );
  const [localError, setLocalError] = useState("");

  function persist(optionId = selected) {
    const option = PLAN_OPTIONS.find((row) => row.id === optionId);
    if (!option) {
      setLocalError("Choose the kind of plan this meal should be.");
      return;
    }
    const soft = 2;
    saveTableServiceDraft(
      groupId,
      {
        table_service: option.values.table_service,
        table_service_dealbreaker_level: soft,
      },
      actorId,
    );
    saveTakeoutDraft(
      groupId,
      {
        takeout_available: option.values.takeout_available,
        takeout_dealbreaker_level: soft,
      },
      actorId,
    );
    saveDeliveryDraft(
      groupId,
      {
        delivery_available: option.values.delivery_available,
        delivery_dealbreaker_level: soft,
      },
      actorId,
    );
    onComplete?.(option.values);
  }

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

        <p className="q-flow__eyebrow">Step 4 of 5</p>
        <h1 className="q-stars__title">What&apos;s the move?</h1>

        {localError ? (
          <div className="q-stars__banner-error" role="alert">
            {localError}
          </div>
        ) : null}

        <div className="q-plan-grid" role="radiogroup" aria-label="Dining plan">
          {PLAN_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              className="q-plan-card"
              role="radio"
              aria-checked={selected === option.id}
              onClick={() => {
                setLocalError("");
                setSelected(option.id);
              }}
            >
              <span className="q-plan-card__title">{option.title}</span>
              <span className="q-plan-card__copy">{option.copy}</span>
            </button>
          ))}
        </div>

        <button
          type="button"
          className="q-stars__next"
          onClick={() => persist()}
        >
          Next
        </button>
      </div>
    </div>
  );
}
