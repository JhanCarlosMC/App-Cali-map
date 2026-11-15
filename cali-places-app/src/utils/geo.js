/**
 * Calculates the great-circle distance between two coordinates in kilometers
 * using the Haversine formula.
 */
export function calculateDistanceKm(lat1, lng1, lat2, lng2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Formats a distance in km to a readable Spanish label.
 */
export function formatDistance(km) {
  if (km == null || Number.isNaN(km)) return '';
  if (km < 1) {
    return `${Math.round(km * 1000)} m`;
  }
  return `${km.toFixed(1)} km`;
}

/**
 * Estimates travel time based on distance in km.
 */
export function estimateTravelTime(km) {
  if (km == null || Number.isNaN(km)) return '';
  if (km <= 1.5) {
    const walkMinutes = Math.max(1, Math.round((km / 4.5) * 60));
    return `~${walkMinutes} min a pie`;
  }
  const driveMinutes = Math.max(3, Math.round((km / 24) * 60));
  return `~${driveMinutes} min en carro`;
}

/**
 * Builds a Google Maps directions URL for a destination.
 */
export function getDirectionsUrl(lat, lng, userLocation, mode = 'moto') {
  const dest = `${lat},${lng}`;
  const travelmode = mode === 'walk' ? 'walking' : 'driving';
  if (userLocation) {
    return `https://www.google.com/maps/dir/?api=1&origin=${userLocation.lat},${userLocation.lng}&destination=${dest}&travelmode=${travelmode}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${dest}`;
}

/**
 * Fetches a street-level route between two points using OSRM (foot or car),
 * falling back to a straight-line estimate if the routing service is unavailable.
 */
export async function fetchRoute({ from, to, mode = 'walk', signal }) {
  const profilePath = mode === 'walk' ? 'routed-foot' : 'routed-car';
  const url = `https://routing.openstreetmap.de/${profilePath}/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;

  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), 7000);

  const combinedSignal = signal
    ? AbortSignal.any([signal, timeoutController.signal])
    : timeoutController.signal;

  try {
    const res = await fetch(url, { signal: combinedSignal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const route = data?.routes?.[0];
    if (!route?.geometry?.coordinates?.length) {
      throw new Error('No route found');
    }

    // GeoJSON is [lng, lat]; Leaflet expects [lat, lng]
    const coordinates = route.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
    const distanceKm = route.distance / 1000;
    const durationMin = Math.max(1, Math.round(route.duration / 60));

    return {
      coordinates,
      distanceKm,
      durationMin,
      isFallback: false,
    };
  } catch (err) {
    if (err.name === 'AbortError' && signal?.aborted) {
      throw err;
    }

    const distanceKm = calculateDistanceKm(from.lat, from.lng, to.lat, to.lng);
    const speedKmh = mode === 'walk' ? 4.5 : 26;
    const durationMin = Math.max(1, Math.round((distanceKm / speedKmh) * 60));

    return {
      coordinates: [
        [from.lat, from.lng],
        [to.lat, to.lng],
      ],
      distanceKm,
      durationMin,
      isFallback: true,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
