const questionnaireByGroup = {}

const CUISINE_LABELS = {
  pizza: 'Pizza',
  burgers: 'Burgers',
  sandwiches: 'Sandwiches',
  thai: 'Thai',
  breakfast_brunch: 'Breakfast & Brunch',
  cuban: 'Cuban',
  italian: 'Italian',
  chinese: 'Chinese',
  japanese_sushi: 'Japanese / Sushi',
  indian: 'Indian',
  vietnamese: 'Vietnamese',
  greek: 'Greek',
  mediterranean: 'Mediterranean',
  korean: 'Korean',
  bbq: 'Barbeque',
  caribbean: 'Caribbean',
  latin_american: 'Latin American',
  seafood: 'Seafood',
}

/**
 * @typedef {Object} QuestionnaireStarsDraft
 * @property {number[]} star_ratings_accepted
 * @property {number} stars_dealbreaker_level
 */

export function loadStarsDraft(groupId) {
  try {
    const row = questionnaireByGroup[groupId]
    if (!row || typeof row !== 'object') return null
    return {
      star_ratings_accepted: Array.isArray(row.star_ratings_accepted)
        ? row.star_ratings_accepted.filter((n) => typeof n === 'number' && n >= 1 && n <= 5)
        : [],
      stars_dealbreaker_level:
        typeof row.stars_dealbreaker_level === 'number' &&
        row.stars_dealbreaker_level >= 1 &&
        row.stars_dealbreaker_level <= 5
          ? row.stars_dealbreaker_level
          : 3,
    }
  } catch {
    return null
  }
}

/** Keep star question answers in memory for this browser tab only. */
export function saveStarsDraft(groupId, draft) {
  try {
    questionnaireByGroup[groupId] = {
      ...questionnaireByGroup[groupId],
      ...draft,
      updated_at: new Date().toISOString(),
    }
  } catch {
    /* ignore */
  }
}

const CUISINE_IDS = new Set([
  'pizza',
  'burgers',
  'sandwiches',
  'thai',
  'breakfast_brunch',
  'cuban',
  'italian',
  'chinese',
  'japanese_sushi',
  'indian',
  'vietnamese',
  'greek',
  'mediterranean',
  'korean',
  'bbq',
  'caribbean',
  'latin_american',
  'seafood',
])

/**
 * @typedef {Object} QuestionnaireCuisineDraft
 * @property {string[]} cuisine_types_selected
 * @property {number} cuisine_dealbreaker_level
 */

export function loadCuisineDraft(groupId) {
  try {
    const row = questionnaireByGroup[groupId]
    if (!row || typeof row !== 'object') return null
    const cuisine_types_selected = Array.isArray(row.cuisine_types_selected)
      ? row.cuisine_types_selected.filter((s) => typeof s === 'string' && CUISINE_IDS.has(s))
      : []
    const cuisine_dealbreaker_level =
      typeof row.cuisine_dealbreaker_level === 'number' &&
      row.cuisine_dealbreaker_level >= 1 &&
      row.cuisine_dealbreaker_level <= 5
        ? row.cuisine_dealbreaker_level
        : 3
    return { cuisine_types_selected, cuisine_dealbreaker_level }
  } catch {
    return null
  }
}

/** Keep cuisine mood answers in memory for this browser tab only. */
export function saveCuisineDraft(groupId, draft) {
  try {
    questionnaireByGroup[groupId] = {
      ...questionnaireByGroup[groupId],
      ...draft,
      updated_at: new Date().toISOString(),
    }
  } catch {
    /* ignore */
  }
}

/**
 * @typedef {Object} QuestionnairePriceDraft
 * @property {number[]} price_tiers_accepted 1–4 meaning $ … $$$$
 * @property {number} price_dealbreaker_level
 */

export function loadPriceDraft(groupId) {
  try {
    const row = questionnaireByGroup[groupId]
    if (!row || typeof row !== 'object') return null
    const price_tiers_accepted = Array.isArray(row.price_tiers_accepted)
      ? row.price_tiers_accepted.filter((n) => typeof n === 'number' && n >= 1 && n <= 4)
      : []
    const price_dealbreaker_level =
      typeof row.price_dealbreaker_level === 'number' &&
      row.price_dealbreaker_level >= 1 &&
      row.price_dealbreaker_level <= 5
        ? row.price_dealbreaker_level
        : 3
    return { price_tiers_accepted, price_dealbreaker_level }
  } catch {
    return null
  }
}

/** Keep price range answers in memory for this browser tab only. */
export function savePriceDraft(groupId, draft) {
  try {
    questionnaireByGroup[groupId] = {
      ...questionnaireByGroup[groupId],
      ...draft,
      updated_at: new Date().toISOString(),
    }
  } catch {
    /* ignore */
  }
}

function clampDealbreaker(n) {
  return typeof n === 'number' && n >= 1 && n <= 5 ? n : 3
}

function yesNoToBoolean(value) {
  if (value === 'yes') return true
  if (value === 'no') return false
  return null
}

function preferredPriceLevel(tiers) {
  const valid = Array.isArray(tiers) ? tiers.filter((n) => n >= 1 && n <= 4) : []
  if (!valid.length) return null
  return Math.round(valid.reduce((sum, n) => sum + n, 0) / valid.length)
}

export function getGroupFeaturePreferences(groupId) {
  const row = questionnaireByGroup[groupId]
  if (!row || typeof row !== 'object') return null

  const features = {
    good_for_groups: { value: true, importance: 3 },
  }

  const cuisines = Array.isArray(row.cuisine_types_selected)
    ? row.cuisine_types_selected.map((id) => CUISINE_LABELS[id]).filter(Boolean)
    : []
  if (cuisines.length) {
    features.categories = {
      value: cuisines,
      importance: clampDealbreaker(row.cuisine_dealbreaker_level),
      dealbreaker_strength: clampDealbreaker(row.cuisine_dealbreaker_level),
    }
  }

  const priceLevel = preferredPriceLevel(row.price_tiers_accepted)
  if (priceLevel != null) {
    features.price_range = {
      value: priceLevel,
      importance: clampDealbreaker(row.price_dealbreaker_level),
      dealbreaker_strength: clampDealbreaker(row.price_dealbreaker_level),
    }
  }

  const tableService = yesNoToBoolean(row.table_service)
  if (tableService != null) {
    features.table_service = {
      value: tableService,
      importance: clampDealbreaker(row.table_service_dealbreaker_level),
      dealbreaker_strength: clampDealbreaker(row.table_service_dealbreaker_level),
    }
  }

  const takeout = yesNoToBoolean(row.takeout_available)
  if (takeout != null) {
    features.takeout = {
      value: takeout,
      importance: clampDealbreaker(row.takeout_dealbreaker_level),
      dealbreaker_strength: clampDealbreaker(row.takeout_dealbreaker_level),
    }
  }

  const delivery = yesNoToBoolean(row.delivery_available)
  if (delivery != null) {
    features.delivery = {
      value: delivery,
      importance: clampDealbreaker(row.delivery_dealbreaker_level),
      dealbreaker_strength: clampDealbreaker(row.delivery_dealbreaker_level),
    }
  }

  const ambiance = Array.isArray(row.ambiance_types_selected)
    ? row.ambiance_types_selected.filter((id) => AMBIANCE_IDS.has(id))
    : []
  if (ambiance.length) {
    features.ambiance_labels = {
      value: ambiance,
      importance: clampDealbreaker(row.ambiance_dealbreaker_level),
      dealbreaker_strength: clampDealbreaker(row.ambiance_dealbreaker_level),
    }
  }

  const stars = Array.isArray(row.star_ratings_accepted)
    ? row.star_ratings_accepted.filter((n) => n >= 1 && n <= 5)
    : []
  if (stars.length) {
    features.stars = {
      value: stars,
      importance: clampDealbreaker(row.stars_dealbreaker_level),
      dealbreaker_strength: clampDealbreaker(row.stars_dealbreaker_level),
    }
  }

  return features
}

/** Figma 35:314 — table service yes/no + dealbreaker */
export function loadTableServiceDraft(groupId) {
  try {
    const row = questionnaireByGroup[groupId]
    if (!row || typeof row !== 'object') return null
    const v = row.table_service
    const table_service = v === 'yes' || v === 'no' ? v : null
    return {
      table_service,
      table_service_dealbreaker_level: clampDealbreaker(row.table_service_dealbreaker_level),
    }
  } catch {
    return null
  }
}

export function saveTableServiceDraft(groupId, draft) {
  try {
    questionnaireByGroup[groupId] = {
      ...questionnaireByGroup[groupId],
      ...draft,
      updated_at: new Date().toISOString(),
    }
  } catch {
    /* ignore */
  }
}

/** Figma 35:365 */
export function loadTakeoutDraft(groupId) {
  try {
    const row = questionnaireByGroup[groupId]
    if (!row || typeof row !== 'object') return null
    const v = row.takeout_available
    const takeout_available = v === 'yes' || v === 'no' ? v : null
    return {
      takeout_available,
      takeout_dealbreaker_level: clampDealbreaker(row.takeout_dealbreaker_level),
    }
  } catch {
    return null
  }
}

export function saveTakeoutDraft(groupId, draft) {
  try {
    questionnaireByGroup[groupId] = {
      ...questionnaireByGroup[groupId],
      ...draft,
      updated_at: new Date().toISOString(),
    }
  } catch {
    /* ignore */
  }
}

/** Figma 35:388 */
export function loadDeliveryDraft(groupId) {
  try {
    const row = questionnaireByGroup[groupId]
    if (!row || typeof row !== 'object') return null
    const v = row.delivery_available
    const delivery_available = v === 'yes' || v === 'no' ? v : null
    return {
      delivery_available,
      delivery_dealbreaker_level: clampDealbreaker(row.delivery_dealbreaker_level),
    }
  } catch {
    return null
  }
}

export function saveDeliveryDraft(groupId, draft) {
  try {
    questionnaireByGroup[groupId] = {
      ...questionnaireByGroup[groupId],
      ...draft,
      updated_at: new Date().toISOString(),
    }
  } catch {
    /* ignore */
  }
}

const AMBIANCE_IDS = new Set(['casual', 'classy', 'romantic', 'trendy', 'hipster', 'touristy'])

/** Figma 35:411 */
export function loadAmbianceDraft(groupId) {
  try {
    const row = questionnaireByGroup[groupId]
    if (!row || typeof row !== 'object') return null
    const ambiance_types_selected = Array.isArray(row.ambiance_types_selected)
      ? row.ambiance_types_selected.filter((s) => typeof s === 'string' && AMBIANCE_IDS.has(s))
      : []
    return {
      ambiance_types_selected,
      ambiance_dealbreaker_level: clampDealbreaker(row.ambiance_dealbreaker_level),
    }
  } catch {
    return null
  }
}

export function saveAmbianceDraft(groupId, draft) {
  try {
    questionnaireByGroup[groupId] = {
      ...questionnaireByGroup[groupId],
      ...draft,
      updated_at: new Date().toISOString(),
    }
  } catch {
    /* ignore */
  }
}

/** Mark this tab's participant as finished the full questionnaire. */
export function markQuestionnaireFlowComplete(groupId) {
  try {
    const actorId = 'current-session'
    const prev =
      questionnaireByGroup[groupId] && typeof questionnaireByGroup[groupId] === 'object'
        ? questionnaireByGroup[groupId]
        : {}
    const prevDone =
      typeof prev.member_questionnaire_done === 'object' && prev.member_questionnaire_done !== null
        ? prev.member_questionnaire_done
        : {}
    questionnaireByGroup[groupId] = {
      ...prev,
      member_questionnaire_done: {
        ...prevDone,
        [actorId]: new Date().toISOString(),
      },
      updated_at: new Date().toISOString(),
    }
  } catch {
    /* ignore */
  }
}

/** How many participants have completed the flow in this tab's in-memory session. */
export function getQuestionnaireCompletionCount(groupId) {
  try {
    const row = questionnaireByGroup[groupId]
    const done = row?.member_questionnaire_done
    if (!done || typeof done !== 'object') return 0
    return Object.keys(done).length
  } catch {
    return 0
  }
}
