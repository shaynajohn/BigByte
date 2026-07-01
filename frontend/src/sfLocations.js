/** Curated SF starting points for commute (no geocoding API required). */
const SF_STARTING_POINTS_RAW = [
  { id: 'alamo_square', label: 'Alamo Square', latitude: 37.776, longitude: -122.4346 },
  { id: 'bayview', label: 'Bayview', latitude: 37.7346, longitude: -122.3907 },
  { id: 'bernal_heights', label: 'Bernal Heights', latitude: 37.741, longitude: -122.4156 },
  { id: 'castro', label: 'Castro', latitude: 37.7609, longitude: -122.435 },
  { id: 'chinatown', label: 'Chinatown', latitude: 37.7941, longitude: -122.4078 },
  { id: 'civic_center', label: 'Civic Center', latitude: 37.7793, longitude: -122.4193 },
  { id: 'cole_valley', label: 'Cole Valley', latitude: 37.7654, longitude: -122.4499 },
  { id: 'cow_hollow', label: 'Cow Hollow', latitude: 37.7974, longitude: -122.435 },
  { id: 'dogpatch', label: 'Dogpatch', latitude: 37.7606, longitude: -122.3904 },
  { id: 'embarcadero', label: 'Embarcadero', latitude: 37.7955, longitude: -122.3937 },
  { id: 'excelsior', label: 'Excelsior', latitude: 37.7257, longitude: -122.4324 },
  { id: 'financial_district', label: 'Financial District', latitude: 37.7946, longitude: -122.3999 },
  { id: 'fishermans_wharf', label: "Fisherman's Wharf", latitude: 37.808, longitude: -122.4177 },
  { id: 'glen_park', label: 'Glen Park', latitude: 37.7339, longitude: -122.4336 },
  { id: 'haight', label: 'Haight-Ashbury', latitude: 37.7692, longitude: -122.4481 },
  { id: 'hayes', label: 'Hayes Valley', latitude: 37.7762, longitude: -122.4245 },
  { id: 'hunters_point', label: 'Hunters Point', latitude: 37.7284, longitude: -122.3753 },
  { id: 'japantown', label: 'Japantown', latitude: 37.7854, longitude: -122.4297 },
  { id: 'lower_haight', label: 'Lower Haight', latitude: 37.7716, longitude: -122.4314 },
  { id: 'marina', label: 'Marina', latitude: 37.8021, longitude: -122.4416 },
  { id: 'mission', label: 'Mission District', latitude: 37.7599, longitude: -122.4148 },
  { id: 'mission_bay', label: 'Mission Bay', latitude: 37.7706, longitude: -122.3892 },
  { id: 'nob_hill', label: 'Nob Hill', latitude: 37.7929, longitude: -122.4167 },
  { id: 'nopa', label: 'NoPa', latitude: 37.7789, longitude: -122.437 },
  { id: 'noe_valley', label: 'Noe Valley', latitude: 37.7509, longitude: -122.4336 },
  { id: 'north_beach', label: 'North Beach', latitude: 37.8061, longitude: -122.4103 },
  { id: 'oceanview', label: 'Oceanview', latitude: 37.7234, longitude: -122.4597 },
  { id: 'outer_richmond', label: 'Outer Richmond', latitude: 37.775, longitude: -122.481 },
  { id: 'outer_sunset', label: 'Outer Sunset', latitude: 37.737, longitude: -122.491 },
  { id: 'pacific_heights', label: 'Pacific Heights', latitude: 37.7924, longitude: -122.439 },
  { id: 'parkside', label: 'Parkside', latitude: 37.742, longitude: -122.484 },
  { id: 'potrero_hill', label: 'Potrero Hill', latitude: 37.7599, longitude: -122.3986 },
  { id: 'presidio_heights', label: 'Presidio Heights', latitude: 37.7885, longitude: -122.448 },
  { id: 'richmond', label: 'Inner Richmond', latitude: 37.7801, longitude: -122.4662 },
  { id: 'russian_hill', label: 'Russian Hill', latitude: 37.8016, longitude: -122.4194 },
  { id: 'soma', label: 'SoMa', latitude: 37.7786, longitude: -122.4056 },
  { id: 'sunset', label: 'Inner Sunset', latitude: 37.7534, longitude: -122.4637 },
  { id: 'telegraph_hill', label: 'Telegraph Hill', latitude: 37.8026, longitude: -122.4058 },
  { id: 'tenderloin', label: 'Tenderloin', latitude: 37.7847, longitude: -122.4148 },
  { id: 'treasure_island', label: 'Treasure Island', latitude: 37.823, longitude: -122.37 },
  { id: 'union_square', label: 'Union Square', latitude: 37.7879, longitude: -122.4075 },
  { id: 'visitacion_valley', label: 'Visitacion Valley', latitude: 37.7137, longitude: -122.4043 },
  { id: 'western_addition', label: 'Western Addition', latitude: 37.7819, longitude: -122.4325 },
  { id: 'west_portal', label: 'West Portal', latitude: 37.7378, longitude: -122.4664 },
]

export const SF_STARTING_POINTS = [...SF_STARTING_POINTS_RAW].sort((a, b) =>
  a.label.localeCompare(b.label),
)

export function findStartingPoint(id) {
  return SF_STARTING_POINTS.find((row) => row.id === id) || null
}

export const BAY_AREA_BOUNDS = {
  minLat: 37.0,
  maxLat: 38.3,
  minLng: -123.1,
  maxLng: -121.5,
}

export function isSupportedOrigin(lat, lng) {
  return (
    lat >= BAY_AREA_BOUNDS.minLat &&
    lat <= BAY_AREA_BOUNDS.maxLat &&
    lng >= BAY_AREA_BOUNDS.minLng &&
    lng <= BAY_AREA_BOUNDS.maxLng
  )
}

export function formatCoord(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(5) : ''
}

export function parseCoordinate(value, min, max) {
  const n = Number(value)
  return Number.isFinite(n) && n >= min && n <= max ? n : null
}
