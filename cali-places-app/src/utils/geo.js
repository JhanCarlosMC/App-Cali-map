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
 * Builds a Google Maps directions URL for a destination (and optional waypoints).
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
 * Builds a Google Maps multi-stop directions URL for an ordered list of places.
 */
export function getMultiStopDirectionsUrl(stops, userLocation, mode = 'moto') {
  if (!stops || stops.length === 0) return 'https://www.google.com/maps';
  const travelmode = mode === 'walk' ? 'walking' : 'driving';
  const last = stops[stops.length - 1];
  const destination = `${last.lat},${last.lng}`;

  const origin = userLocation
    ? `${userLocation.lat},${userLocation.lng}`
    : `${stops[0].lat},${stops[0].lng}`;

  const intermediate = userLocation ? stops.slice(0, -1) : stops.slice(1, -1);
  const waypointsParam =
    intermediate.length > 0
      ? `&waypoints=${intermediate.map((s) => `${s.lat},${s.lng}`).join('|')}`
      : '';

  return `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}${waypointsParam}&travelmode=${travelmode}`;
}

/**
 * Orders places into a short visiting sequence using Nearest Neighbor + 2-opt
 * starting from `startLocation` (or the first place if no location is given).
 */
export function optimizeStopOrder(places, startLocation) {
  if (places.length <= 1) return [...places];

  const remaining = [...places];
  const ordered = [];
  let current = startLocation || { lat: remaining[0].lat, lng: remaining[0].lng };

  if (!startLocation) {
    ordered.push(remaining.shift());
  }

  while (remaining.length > 0) {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < remaining.length; i += 1) {
      const d = calculateDistanceKm(
        current.lat,
        current.lng,
        remaining[i].lat,
        remaining[i].lng
      );
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    const [next] = remaining.splice(bestIdx, 1);
    ordered.push(next);
    current = next;
  }

  // 2-opt refinement (keep start fixed when startLocation is provided; otherwise keep index 0 fixed)
  const fixedStartIdx = startLocation ? 0 : 1;
  const routeDistance = (seq) => {
    let total = 0;
    if (startLocation && seq.length > 0) {
      total += calculateDistanceKm(
        startLocation.lat,
        startLocation.lng,
        seq[0].lat,
        seq[0].lng
      );
    }
    for (let i = 0; i < seq.length - 1; i += 1) {
      total += calculateDistanceKm(
        seq[i].lat,
        seq[i].lng,
        seq[i + 1].lat,
        seq[i + 1].lng
      );
    }
    return total;
  };

  let improved = true;
  let bestDist = routeDistance(ordered);
  while (improved) {
    improved = false;
    for (let i = fixedStartIdx; i < ordered.length - 1; i += 1) {
      for (let j = i + 1; j < ordered.length; j += 1) {
        const candidate = [
          ...ordered.slice(0, i),
          ...ordered.slice(i, j + 1).reverse(),
          ...ordered.slice(j + 1),
        ];
        const candDist = routeDistance(candidate);
        if (candDist + 1e-6 < bestDist) {
          ordered.splice(0, ordered.length, ...candidate);
          bestDist = candDist;
          improved = true;
        }
      }
    }
  }

  return ordered;
}

/**
 * Fetches a street-level route across 2+ waypoints using OSRM (foot or car),
 * falling back to straight-line segments if the routing service is unavailable.
 */
export async function fetchMultiStopRoute({ waypoints, mode = 'walk', signal }) {
  if (!waypoints || waypoints.length < 2) {
    return { coordinates: [], distanceKm: 0, durationMin: 0, isFallback: true };
  }

  const profilePath = mode === 'walk' ? 'routed-foot' : 'routed-car';
  const coordsParam = waypoints.map((pt) => `${pt.lng},${pt.lat}`).join(';');
  const url = `https://routing.openstreetmap.de/${profilePath}/route/v1/driving/${coordsParam}?overview=full&geometries=geojson`;

  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), 8000);

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

    const coordinates = route.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
    const distanceKm = route.distance / 1000;
    const durationMin = Math.max(1, Math.round(route.duration / 60));
    const legs = Array.isArray(route.legs)
      ? route.legs.map((leg) => ({
          distanceKm: leg.distance / 1000,
          durationMin: Math.max(1, Math.round(leg.duration / 60)),
        }))
      : [];

    return {
      coordinates,
      distanceKm,
      durationMin,
      legs,
      isFallback: false,
    };
  } catch (err) {
    if (err.name === 'AbortError' && signal?.aborted) {
      throw err;
    }

    const speedKmh = mode === 'walk' ? 4.5 : 26;
    let distanceKm = 0;
    const legs = [];
    for (let i = 0; i < waypoints.length - 1; i += 1) {
      const legKm = calculateDistanceKm(
        waypoints[i].lat,
        waypoints[i].lng,
        waypoints[i + 1].lat,
        waypoints[i + 1].lng
      );
      distanceKm += legKm;
      legs.push({
        distanceKm: legKm,
        durationMin: Math.max(1, Math.round((legKm / speedKmh) * 60)),
      });
    }
    const durationMin = Math.max(1, Math.round((distanceKm / speedKmh) * 60));

    return {
      coordinates: waypoints.map((pt) => [pt.lat, pt.lng]),
      distanceKm,
      durationMin,
      legs,
      isFallback: true,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Fetches a street-level route between two points using OSRM (foot or car),
 * falling back to a straight-line estimate if the routing service is unavailable.
 */
export async function fetchRoute({ from, to, mode = 'walk', signal }) {
  return fetchMultiStopRoute({ waypoints: [from, to], mode, signal });
}
