import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { CALI_CENTER, CATEGORIES } from '../data/caliPlaces';
import { estimateTravelTime, formatDistance, getDirectionsUrl } from '../utils/geo';

function createPlaceIcon(place, isSelected) {
  const category = CATEGORIES[place.category] || { color: '#4f46e5' };
  const color = place.visited ? '#64748b' : category.color;
  const size = isSelected ? 36 : 28;
  const ring = isSelected ? 'box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.35), 0 4px 12px rgba(0,0,0,0.35);' : 'box-shadow: 0 3px 8px rgba(0,0,0,0.3);';
  const checkMark = place.visited
    ? `<span class="map-pin-check" aria-hidden="true">✓</span>`
    : `<span class="map-pin-dot"></span>`;

  return L.divIcon({
    className: 'custom-place-marker',
    html: `<div class="map-pin ${isSelected ? 'is-selected' : ''} ${place.visited ? 'is-visited' : ''}" style="width:${size}px;height:${size}px;background:${color};${ring}">${checkMark}</div>`,
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

function buildPopupElement(place, userLocation, onShowRoute) {
  const category = CATEGORIES[place.category] || { label: 'Lugar', color: '#4f46e5' };
  const wrapper = document.createElement('div');
  wrapper.className = 'map-popup';

  const badge = document.createElement('span');
  badge.className = 'map-popup-badge';
  badge.style.backgroundColor = category.color;
  badge.textContent = category.label;
  wrapper.appendChild(badge);

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
    routeBtn.textContent = 'Ver camino aquí';
    routeBtn.addEventListener('click', () => {
      onShowRoute(place);
    });
    actions.appendChild(routeBtn);
  }

  const link = document.createElement('a');
  link.className = 'map-popup-link';
  link.href = getDirectionsUrl(place.lat, place.lng, userLocation);
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = 'Google Maps ↗';
  actions.appendChild(link);

  wrapper.appendChild(actions);

  return wrapper;
}

export default function CaliMap({
  places,
  selectedPlaceId,
  onSelectPlace,
  onShowRoute,
  activeRoute,
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
  const placesRef = useRef(places);
  const userLocationRef = useRef(userLocation);
  const radiusKmRef = useRef(radiusKm);

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
    placesRef.current = places;
  }, [places]);

  useEffect(() => {
    userLocationRef.current = userLocation;
  }, [userLocation]);

  useEffect(() => {
    radiusKmRef.current = radiusKm;
  }, [radiusKm]);

  // Initialize Leaflet map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
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

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Sync place markers
  useEffect(() => {
    const layer = markersLayerRef.current;
    if (!layer) return;

    layer.clearLayers();
    markersByIdRef.current.clear();

    places.forEach((place) => {
      const isSelected = place.id === selectedPlaceId;
      const marker = L.marker([place.lat, place.lng], {
        icon: createPlaceIcon(place, isSelected),
        zIndexOffset: isSelected ? 500 : 0,
      });

      marker.bindPopup(
        () => buildPopupElement(place, userLocation, onShowRouteRef.current),
        { maxWidth: 270 }
      );

      marker.on('click', () => {
        if (onSelectPlaceRef.current) {
          onSelectPlaceRef.current(place.id);
        }
      });

      marker.addTo(layer);
      markersByIdRef.current.set(place.id, marker);
    });
  }, [places, selectedPlaceId, userLocation]);

  // Open popup and fly to selected place
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedPlaceId) return;

    const place = placesRef.current.find((p) => p.id === selectedPlaceId);
    const marker = markersByIdRef.current.get(selectedPlaceId);
    if (!place || !marker) return;

    map.flyTo([place.lat, place.lng], Math.max(map.getZoom(), 15), {
      duration: 0.6,
    });
    marker.openPopup();
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

    // White casing for contrast against map streets
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
