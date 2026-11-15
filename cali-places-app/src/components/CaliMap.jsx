import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { CALI_CENTER, CATEGORIES } from '../data/caliPlaces';
import { estimateTravelTime, formatDistance, getDirectionsUrl } from '../utils/geo';

function getIconKey(place, isSelected, stopNumber, isInTour) {
  return `${place.category}|${place.visited ? 1 : 0}|${isSelected ? 1 : 0}|${stopNumber ?? ''}|${isInTour ? 1 : 0}`;
}

function createPlaceIcon(place, isSelected, stopNumber, isInTour) {
  const category = CATEGORIES[place.category] || { color: '#4f46e5' };
  const color = stopNumber != null ? '#0f172a' : place.visited ? '#64748b' : category.color;
  const size = isSelected || stopNumber != null ? 34 : 28;
  let ring = 'box-shadow: 0 3px 8px rgba(0,0,0,0.3);';
  if (isSelected) {
    ring = 'box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.35), 0 4px 12px rgba(0,0,0,0.35);';
  } else if (isInTour && stopNumber == null) {
    ring = 'box-shadow: 0 0 0 3px #0f172a, 0 4px 10px rgba(0,0,0,0.35);';
  }

  let innerHtml = `<span class="map-pin-dot"></span>`;
  if (stopNumber != null) {
    innerHtml = `<span class="map-pin-number">${stopNumber}</span>`;
  } else if (place.visited) {
    innerHtml = `<span class="map-pin-check" aria-hidden="true">✓</span>`;
  }

  return L.divIcon({
    className: 'custom-place-marker',
    html: `<div class="map-pin ${isSelected ? 'is-selected' : ''} ${place.visited ? 'is-visited' : ''} ${stopNumber != null ? 'is-route-stop' : ''} ${isInTour ? 'is-in-tour' : ''}" style="width:${size}px;height:${size}px;background:${color};${ring}">${innerHtml}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });
}

function createUserIcon() {
  return L.divIcon({
    className: 'custom-user-marker',
    html: `
      <div class="user-location-pin">
        <span class="user-location-pulse"></span>
        <span class="user-location-core"></span>
      </div>
    `,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

function buildPopupElement(
  place,
  userLocation,
  onShowRoute,
  isInTour,
  onToggleTour,
  onToggleVisited
) {
  const category = CATEGORIES[place.category] || { label: 'Lugar', color: '#4f46e5' };
  const wrapper = document.createElement('div');
  wrapper.className = 'map-popup';

  const topRow = document.createElement('div');
  topRow.className = 'map-popup-top';

  const badge = document.createElement('span');
  badge.className = 'map-popup-badge';
  badge.style.backgroundColor = category.color;
  badge.textContent = category.label;
  topRow.appendChild(badge);

  if (onToggleVisited) {
    let visited = Boolean(place.visited);
    const visitBtn = document.createElement('button');
    visitBtn.type = 'button';
    visitBtn.className = `map-popup-visit-btn ${visited ? 'is-active' : ''}`;
    visitBtn.textContent = visited ? 'Visitado ✓' : 'Por visitar';
    visitBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      visited = !visited;
      visitBtn.className = `map-popup-visit-btn ${visited ? 'is-active' : ''}`;
      visitBtn.textContent = visited ? 'Visitado ✓' : 'Por visitar';
      onToggleVisited(place.id);
    });
    topRow.appendChild(visitBtn);
  }

  wrapper.appendChild(topRow);

  const title = document.createElement('h3');
  title.className = 'map-popup-title';
  title.textContent = place.name;
  wrapper.appendChild(title);

  if (place.neighborhood) {
    const hood = document.createElement('p');
    hood.className = 'map-popup-hood';
    hood.textContent = place.neighborhood;
    wrapper.appendChild(hood);
  }

  if (place.description) {
    const desc = document.createElement('p');
    desc.className = 'map-popup-desc';
    desc.textContent = place.description;
    wrapper.appendChild(desc);
  }

  if (place.distanceKm != null) {
    const dist = document.createElement('p');
    dist.className = 'map-popup-distance';
    dist.textContent = `A ${formatDistance(place.distanceKm)} (${estimateTravelTime(place.distanceKm)})`;
    wrapper.appendChild(dist);
  }

  const actions = document.createElement('div');
  actions.className = 'map-popup-actions';

  if (onShowRoute) {
    const routeBtn = document.createElement('button');
    routeBtn.type = 'button';
    routeBtn.className = 'map-popup-route-btn';
    routeBtn.textContent = 'Ir aquí';
    routeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      onShowRoute(place);
    });
    actions.appendChild(routeBtn);
  }

  if (onToggleTour) {
    let selected = Boolean(isInTour);
    const tourBtn = document.createElement('button');
    tourBtn.type = 'button';
    tourBtn.className = `map-popup-tour-btn ${selected ? 'is-active' : ''}`;
    tourBtn.textContent = selected ? 'En ruta ✓' : '+ Ruta';
    tourBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      selected = !selected;
      tourBtn.className = `map-popup-tour-btn ${selected ? 'is-active' : ''}`;
      tourBtn.textContent = selected ? 'En ruta ✓' : '+ Ruta';
      onToggleTour(place.id);
    });
    actions.appendChild(tourBtn);
  }

  const link = document.createElement('a');
  link.className = 'map-popup-link';
  link.href = getDirectionsUrl(place.lat, place.lng, userLocation);
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = 'Maps ↗';
  actions.appendChild(link);

  wrapper.appendChild(actions);

  return wrapper;
}

export default function CaliMap({
  places,
  selectedPlaceId,
  onSelectPlace,
  onShowRoute,
  onToggleTour,
  onToggleVisited,
  tourPlaceIds,
  activeRoute,
  routeStopNumbers,
  userLocation,
  radiusKm,
  mapMode,
  onMapPick,
  centerOnUserTrigger,
  centerOnCaliTrigger,
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersLayerRef = useRef(null);
  const markersByIdRef = useRef(new Map());
  const userLayerRef = useRef(null);
  const routeLayerRef = useRef(null);
  const mapModeRef = useRef(mapMode);
  const onMapPickRef = useRef(onMapPick);
  const onSelectPlaceRef = useRef(onSelectPlace);
  const onShowRouteRef = useRef(onShowRoute);
  const onToggleTourRef = useRef(onToggleTour);
  const onToggleVisitedRef = useRef(onToggleVisited);
  const tourPlaceIdsRef = useRef(tourPlaceIds);
  const placesRef = useRef(places);
  const userLocationRef = useRef(userLocation);
  const radiusKmRef = useRef(radiusKm);
  const clickedFromMapRef = useRef(false);

  useEffect(() => {
    mapModeRef.current = mapMode;
  }, [mapMode]);

  useEffect(() => {
    onMapPickRef.current = onMapPick;
  }, [onMapPick]);

  useEffect(() => {
    onSelectPlaceRef.current = onSelectPlace;
  }, [onSelectPlace]);

  useEffect(() => {
    onShowRouteRef.current = onShowRoute;
  }, [onShowRoute]);

  useEffect(() => {
    onToggleTourRef.current = onToggleTour;
  }, [onToggleTour]);

  useEffect(() => {
    onToggleVisitedRef.current = onToggleVisited;
  }, [onToggleVisited]);

  useEffect(() => {
    tourPlaceIdsRef.current = tourPlaceIds;
  }, [tourPlaceIds]);

  useEffect(() => {
    placesRef.current = places;
  }, [places]);

  useEffect(() => {
    userLocationRef.current = userLocation;
  }, [userLocation]);

  useEffect(() => {
    radiusKmRef.current = radiusKm;
  }, [radiusKm]);

  // Initialize Leaflet map once + ResizeObserver to prevent gray tiles on mobile resize
  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) return;
    const markersById = markersByIdRef.current;

    const map = L.map(container, {
      center: [CALI_CENTER.lat, CALI_CENTER.lng],
      zoom: 13,
      zoomControl: false,
    });

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    markersLayerRef.current = L.layerGroup().addTo(map);
    routeLayerRef.current = L.layerGroup().addTo(map);
    userLayerRef.current = L.layerGroup().addTo(map);

    map.on('click', (event) => {
      if (mapModeRef.current !== 'browse' && onMapPickRef.current) {
        onMapPickRef.current({
          lat: Number(event.latlng.lat.toFixed(6)),
          lng: Number(event.latlng.lng.toFixed(6)),
        });
      }
    });

    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize({ animate: false });
    });
    resizeObserver.observe(container);

    mapRef.current = map;

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
      markersLayerRef.current = null;
      routeLayerRef.current = null;
      userLayerRef.current = null;
      markersById.clear();
    };
  }, []);

  // Sync place markers in place (only rebuild icon DOM when visual state changes)
  useEffect(() => {
    const layer = markersLayerRef.current;
    if (!layer) return;

    const nextIds = new Set(places.map((p) => p.id));

    for (const [id, marker] of markersByIdRef.current.entries()) {
      if (!nextIds.has(id)) {
        layer.removeLayer(marker);
        markersByIdRef.current.delete(id);
      }
    }

    places.forEach((place) => {
      const isSelected = place.id === selectedPlaceId;
      const stopNumber = routeStopNumbers?.get(place.id) ?? null;
      const isInTour = tourPlaceIds?.includes(place.id) ?? false;
      const nextIconKey = getIconKey(place, isSelected, stopNumber, isInTour);
      const nextZIndex = isSelected ? 500 : stopNumber != null ? 300 : isInTour ? 200 : 0;
      const existing = markersByIdRef.current.get(place.id);

      if (existing) {
        existing._placeData = place;
        const pos = existing.getLatLng();
        if (pos.lat !== place.lat || pos.lng !== place.lng) {
          existing.setLatLng([place.lat, place.lng]);
        }
        if (existing._iconKey !== nextIconKey) {
          existing.setIcon(createPlaceIcon(place, isSelected, stopNumber, isInTour));
          existing._iconKey = nextIconKey;
        }
        existing.setZIndexOffset(nextZIndex);
      } else {
        const marker = L.marker([place.lat, place.lng], {
          icon: createPlaceIcon(place, isSelected, stopNumber, isInTour),
          zIndexOffset: nextZIndex,
        });
        marker._placeData = place;
        marker._iconKey = nextIconKey;

        marker.bindPopup(
          () =>
            buildPopupElement(
              marker._placeData,
              userLocationRef.current,
              onShowRouteRef.current,
              tourPlaceIdsRef.current?.includes(marker._placeData.id),
              onToggleTourRef.current,
              onToggleVisitedRef.current
            ),
          { maxWidth: 280 }
        );

        marker.on('click', () => {
          clickedFromMapRef.current = true;
          if (onSelectPlaceRef.current) {
            onSelectPlaceRef.current(place.id);
          }
        });

        marker.addTo(layer);
        markersByIdRef.current.set(place.id, marker);
      }
    });
  }, [places, selectedPlaceId, routeStopNumbers, tourPlaceIds]);

  // Fly to and open popup only when selected from the list (not when tapped directly on the map)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedPlaceId) return;

    if (clickedFromMapRef.current) {
      clickedFromMapRef.current = false;
      return;
    }

    const place = placesRef.current.find((p) => p.id === selectedPlaceId);
    const marker = markersByIdRef.current.get(selectedPlaceId);
    if (!place || !marker) return;

    map.flyTo([place.lat, place.lng], Math.max(map.getZoom(), 15), {
      duration: 0.6,
    });
    if (!marker.isPopupOpen()) {
      marker.openPopup();
    }
  }, [selectedPlaceId]);

  // Sync user location pin + accuracy + "around me" radius circle
  useEffect(() => {
    const layer = userLayerRef.current;
    if (!layer) return;
    layer.clearLayers();

    if (!userLocation) return;

    if (userLocation.accuracy && userLocation.accuracy > 10) {
      L.circle([userLocation.lat, userLocation.lng], {
        radius: Math.min(userLocation.accuracy, 500),
        color: '#2563eb',
        fillColor: '#3b82f6',
        fillOpacity: 0.12,
        weight: 1,
        interactive: false,
      }).addTo(layer);
    }

    if (radiusKm > 0) {
      L.circle([userLocation.lat, userLocation.lng], {
        radius: radiusKm * 1000,
        color: '#0ea5e9',
        fillColor: '#0ea5e9',
        fillOpacity: 0.07,
        weight: 2,
        dashArray: '6 6',
        interactive: false,
      }).addTo(layer);
    }

    const userMarker = L.marker([userLocation.lat, userLocation.lng], {
      icon: createUserIcon(),
      zIndexOffset: 1000,
    });

    const label = userLocation.isSimulated
      ? 'Tu ubicación (simulada en Cali)'
      : 'Tu ubicación actual';
    userMarker.bindTooltip(label, { direction: 'top', offset: [0, -10] });
    userMarker.addTo(layer);
  }, [userLocation, radiusKm]);

  // Draw active route polyline and fit map bounds
  useEffect(() => {
    const layer = routeLayerRef.current;
    const map = mapRef.current;
    if (!layer || !map) return;

    layer.clearLayers();
    const coords = activeRoute?.routeData?.coordinates;
    if (!coords || coords.length < 2) return;

    const isWalk = activeRoute.mode === 'walk';

    L.polyline(coords, {
      color: '#ffffff',
      weight: isWalk ? 7 : 8,
      opacity: 0.9,
      lineCap: 'round',
      lineJoin: 'round',
    }).addTo(layer);

    const routeLine = L.polyline(coords, {
      color: isWalk ? '#059669' : '#2563eb',
      weight: isWalk ? 4 : 5,
      opacity: 0.95,
      dashArray: isWalk ? '2 8' : undefined,
      lineCap: 'round',
      lineJoin: 'round',
    }).addTo(layer);

    map.fitBounds(routeLine.getBounds(), {
      padding: [64, 64],
      maxZoom: 16,
    });
  }, [activeRoute?.routeData, activeRoute?.mode]);

  // Center on user when requested
  useEffect(() => {
    const map = mapRef.current;
    const loc = userLocationRef.current;
    const radius = radiusKmRef.current;
    if (!map || !loc || centerOnUserTrigger === 0) return;

    const targetZoom = radius > 0 && radius <= 1 ? 15 : radius >= 5 ? 13 : 14;
    map.flyTo([loc.lat, loc.lng], targetZoom, {
      duration: 0.65,
    });
  }, [centerOnUserTrigger]);

  // Center on Cali when requested
  useEffect(() => {
    const map = mapRef.current;
    if (!map || centerOnCaliTrigger === 0) return;

    map.flyTo([CALI_CENTER.lat, CALI_CENTER.lng], 13, {
      duration: 0.65,
    });
  }, [centerOnCaliTrigger]);

  return (
    <div
      ref={containerRef}
      className={`cali-map-container ${mapMode !== 'browse' ? 'is-picking' : ''}`}
      aria-label="Mapa interactivo de Santiago de Cali"
    />
  );
}
