import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Compass,
  Crosshair,
  List,
  LocateFixed,
  Map as MapIcon,
  MapPin,
  Plus,
  RotateCcw,
  Route,
  Search,
  X,
} from 'lucide-react';
import CaliMap from './components/CaliMap';
import PlaceCard from './components/PlaceCard';
import AddPlaceDialog from './components/AddPlaceDialog';
import RoutePanel from './components/RoutePanel';
import CompassHud from './components/CompassHud';
import { CALI_CENTER, CATEGORIES, DEFAULT_PLACES } from './data/caliPlaces';
import {
  calculateBearing,
  calculateDistanceKm,
  fetchMultiStopRoute,
  fetchRoute,
  getCardinalDirection,
  normalizeHeading,
  optimizeStopOrder,
} from './utils/geo';
import './App.css';

const STORAGE_KEY = 'cali-places-app:v1';
const TOUR_STORAGE_KEY = 'cali-places-app:tour-v1';

function loadInitialPlaces() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PLACES;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      const defaultsById = new Map(DEFAULT_PLACES.map((p) => [p.id, p]));
      const merged = parsed.map((p) =>
        p.id === 'cristo-rey' && defaultsById.has('cristo-rey')
          ? { ...defaultsById.get('cristo-rey'), visited: p.visited }
          : p
      );
      const existingIds = new Set(merged.map((p) => p.id));
      const missingDefaults = DEFAULT_PLACES.filter((p) => !existingIds.has(p.id));
      return [...missingDefaults, ...merged];
    }
  } catch {
    // Ignore malformed storage and fall back to defaults
  }
  return DEFAULT_PLACES;
}

function loadInitialTourIds() {
  try {
    const raw = localStorage.getItem(TOUR_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function computeTargetInfo(userLocation, activeRoute, selectedPlaceId, placesWithDistance) {
  if (!userLocation) return null;
  if (activeRoute) {
    const coords = activeRoute.routeData?.coordinates;
    if (Array.isArray(coords) && coords.length >= 2) {
      for (let i = 1; i < coords.length; i += 1) {
        const [lat, lng] = coords[i];
        const dKm = calculateDistanceKm(userLocation.lat, userLocation.lng, lat, lng);
        if (dKm >= 0.015 || i === coords.length - 1) {
          return {
            label: 'Inicio de ruta',
            bearing: calculateBearing(userLocation.lat, userLocation.lng, lat, lng),
          };
        }
      }
    }
    const firstTarget = activeRoute.stops?.[0] || activeRoute.place;
    if (firstTarget) {
      return {
        label: firstTarget.name,
        bearing: calculateBearing(
          userLocation.lat,
          userLocation.lng,
          firstTarget.lat,
          firstTarget.lng
        ),
      };
    }
  }
  if (selectedPlaceId) {
    const sel = placesWithDistance.find((p) => p.id === selectedPlaceId);
    if (sel && sel.bearingDeg != null) {
      return {
        label: sel.name,
        bearing: sel.bearingDeg,
      };
    }
  }
  return null;
}

export default function App() {
  const [places, setPlaces] = useState(loadInitialPlaces);
  const [selectedPlaceId, setSelectedPlaceId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [radiusKm, setRadiusKm] = useState(0);

  const [userLocation, setUserLocation] = useState(null);
  const [locationStatus, setLocationStatus] = useState(() =>
    'geolocation' in navigator ? 'locating' : 'idle'
  );
  const [locationError, setLocationError] = useState('');
  const [centerOnUserTrigger, setCenterOnUserTrigger] = useState(0);
  const [centerOnCaliTrigger, setCenterOnCaliTrigger] = useState(0);

  const [userHeading, setUserHeading] = useState(0);
  const [headingSource, setHeadingSource] = useState('manual');
  const [compassStatus, setCompassStatus] = useState('idle');
  const [followUser, setFollowUser] = useState(false);

  const [mapMode, setMapMode] = useState('browse');
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [pickedCoords, setPickedCoords] = useState(null);

  const [mobilePanel, setMobilePanel] = useState('map');
  const [tourPlaceIds, setTourPlaceIds] = useState(loadInitialTourIds);
  const [activeRoute, setActiveRoute] = useState(null);
  const [routeHint, setRouteHint] = useState('');
  const routeAbortRef = useRef(null);
  const hintTimerRef = useRef(null);
  const compassHandlerRef = useRef(null);

  const showHint = (msg) => {
    if (hintTimerRef.current) {
      clearTimeout(hintTimerRef.current);
    }
    setRouteHint(msg);
    hintTimerRef.current = setTimeout(() => {
      setRouteHint('');
      hintTimerRef.current = null;
    }, 3500);
  };

  useEffect(() => {
    return () => {
      if (routeAbortRef.current) routeAbortRef.current.abort();
      if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
      if (compassHandlerRef.current) {
        window.removeEventListener(
          'deviceorientationabsolute',
          compassHandlerRef.current,
          true
        );
        window.removeEventListener(
          'deviceorientation',
          compassHandlerRef.current,
          true
        );
      }
    };
  }, []);

  const handleChangeHeading = (nextDeg, source = 'manual') => {
    const normalized = normalizeHeading(nextDeg);
    setUserHeading(normalized);
    setHeadingSource(source);
    if (source !== 'compass' && compassHandlerRef.current) {
      window.removeEventListener(
        'deviceorientationabsolute',
        compassHandlerRef.current,
        true
      );
      window.removeEventListener(
        'deviceorientation',
        compassHandlerRef.current,
        true
      );
      compassHandlerRef.current = null;
      setCompassStatus((prev) => (prev === 'active' ? 'idle' : prev));
    }
  };

  const handleRequestCompass = async () => {
    if (headingSource === 'compass' && compassStatus === 'active') {
      handleChangeHeading(userHeading, 'manual');
      return;
    }

    if (typeof window === 'undefined' || !('DeviceOrientationEvent' in window)) {
      setCompassStatus('unsupported');
      return;
    }

    if (
      typeof window.DeviceOrientationEvent.requestPermission === 'function'
    ) {
      try {
        const perm = await window.DeviceOrientationEvent.requestPermission();
        if (perm !== 'granted') {
          setCompassStatus('denied');
          return;
        }
      } catch {
        setCompassStatus('denied');
        return;
      }
    }

    let receivedReading = false;
    const onOrientation = (event) => {
      let compassDeg = null;
      if (typeof event.webkitCompassHeading === 'number') {
        compassDeg = event.webkitCompassHeading;
      } else if (typeof event.alpha === 'number') {
        compassDeg = 360 - event.alpha;
      }
      if (compassDeg != null && !Number.isNaN(compassDeg)) {
        receivedReading = true;
        setCompassStatus('active');
        setHeadingSource('compass');
        setUserHeading(normalizeHeading(Math.round(compassDeg)));
      }
    };

    if (compassHandlerRef.current) {
      window.removeEventListener(
        'deviceorientationabsolute',
        compassHandlerRef.current,
        true
      );
      window.removeEventListener(
        'deviceorientation',
        compassHandlerRef.current,
        true
      );
    }

    compassHandlerRef.current = onOrientation;
    window.addEventListener('deviceorientationabsolute', onOrientation, true);
    window.addEventListener('deviceorientation', onOrientation, true);
    setCompassStatus('active');
    setHeadingSource('compass');

    setTimeout(() => {
      if (!receivedReading && compassHandlerRef.current === onOrientation) {
        setCompassStatus('unsupported');
        setHeadingSource('manual');
      }
    }, 1800);
  };

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(places));
    } catch {
      // Ignore storage quota errors
    }
  }, [places]);

  useEffect(() => {
    try {
      localStorage.setItem(TOUR_STORAGE_KEY, JSON.stringify(tourPlaceIds));
    } catch {
      // Ignore storage quota errors
    }
  }, [tourPlaceIds]);

  const requestGpsLocation = (shouldCenter = false) => {
    if (!('geolocation' in navigator)) {
      setLocationStatus('error');
      setLocationError('Tu navegador no soporta geolocalización.');
      return;
    }

    setLocationStatus('locating');
    setLocationError('');

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          isSimulated: false,
        });
        setLocationStatus('active');
        if (shouldCenter) {
          setCenterOnUserTrigger((n) => n + 1);
        }
      },
      (err) => {
        setLocationStatus('error');
        if (err.code === err.PERMISSION_DENIED) {
          setLocationError('Permiso de ubicación denegado. Puedes marcar tu punto en el mapa.');
        } else {
          setLocationError('No pudimos obtener tu GPS. Puedes marcar tu punto en el mapa.');
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  };

  useEffect(() => {
    if (!('geolocation' in navigator)) return;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const nextLat = pos.coords.latitude;
        const nextLng = pos.coords.longitude;
        const nextAcc = pos.coords.accuracy;
        const gpsHeading = pos.coords.heading;

        setUserLocation((prev) => {
          if (prev?.isSimulated) return prev;
          if (prev) {
            const movedKm = calculateDistanceKm(prev.lat, prev.lng, nextLat, nextLng);
            if (movedKm < 0.015) return prev;

            const walkBearing =
              typeof gpsHeading === 'number' && !Number.isNaN(gpsHeading)
                ? normalizeHeading(Math.round(gpsHeading))
                : Math.round(calculateBearing(prev.lat, prev.lng, nextLat, nextLng));

            setHeadingSource((src) => {
              if (src !== 'compass') {
                setUserHeading(walkBearing);
                return 'gps';
              }
              return src;
            });
          } else if (typeof gpsHeading === 'number' && !Number.isNaN(gpsHeading)) {
            setUserHeading(normalizeHeading(Math.round(gpsHeading)));
            setHeadingSource('gps');
          }
          return {
            lat: nextLat,
            lng: nextLng,
            accuracy: nextAcc,
            isSimulated: false,
          };
        });
        setLocationStatus((prev) => (prev === 'manual' ? 'manual' : 'active'));
      },
      () => {
        setLocationStatus((prev) => (prev === 'manual' ? 'manual' : 'error'));
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  const placesWithDistance = useMemo(() => {
    return places.map((place) => {
      const distanceKm = userLocation
        ? calculateDistanceKm(userLocation.lat, userLocation.lng, place.lat, place.lng)
        : null;
      const bearingDeg = userLocation
        ? calculateBearing(userLocation.lat, userLocation.lng, place.lat, place.lng)
        : null;
      return { ...place, distanceKm, bearingDeg };
    });
  }, [places, userLocation]);

  const filteredPlaces = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    const filtered = placesWithDistance.filter((place) => {
      if (activeCategory !== 'all' && place.category !== activeCategory) {
        return false;
      }
      if (statusFilter === 'pending' && place.visited) return false;
      if (statusFilter === 'visited' && !place.visited) return false;
      if (radiusKm > 0 && place.distanceKm != null && place.distanceKm > radiusKm) {
        return false;
      }
      if (q) {
        const haystack = `${place.name} ${place.neighborhood} ${place.description}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });

    if (userLocation) {
      filtered.sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
    }

    return filtered;
  }, [placesWithDistance, activeCategory, statusFilter, radiusKm, searchQuery, userLocation]);

  // Keep pinned tour/route/selected places visible on the map even if a sidebar filter is active
  const mapPlaces = useMemo(() => {
    const visibleIds = new Set(filteredPlaces.map((p) => p.id));
    const pinnedIds = new Set(tourPlaceIds);
    if (selectedPlaceId) pinnedIds.add(selectedPlaceId);
    if (activeRoute?.place?.id) pinnedIds.add(activeRoute.place.id);
    if (activeRoute?.stops) {
      activeRoute.stops.forEach((s) => pinnedIds.add(s.id));
    }

    const extra = placesWithDistance.filter(
      (p) => !visibleIds.has(p.id) && pinnedIds.has(p.id)
    );
    return extra.length > 0 ? [...filteredPlaces, ...extra] : filteredPlaces;
  }, [filteredPlaces, placesWithDistance, tourPlaceIds, selectedPlaceId, activeRoute]);

  const stats = useMemo(() => {
    const visited = places.filter((p) => p.visited).length;
    return {
      total: places.length,
      visited,
      pending: places.length - visited,
    };
  }, [places]);

  const handleToggleVisited = (id) => {
    setPlaces((prev) =>
      prev.map((p) => (p.id === id ? { ...p, visited: !p.visited } : p))
    );
  };

  const handleCloseRoute = () => {
    if (routeAbortRef.current) {
      routeAbortRef.current.abort();
    }
    setActiveRoute(null);
  };

  const handleDeletePlace = (id) => {
    setPlaces((prev) => prev.filter((p) => p.id !== id));
    setTourPlaceIds((prev) => prev.filter((item) => item !== id));
    if (selectedPlaceId === id) {
      setSelectedPlaceId(null);
    }
    if (
      activeRoute?.place?.id === id ||
      activeRoute?.stops?.some((s) => s.id === id)
    ) {
      handleCloseRoute();
    }
  };

  const handleAddPlace = (newPlace) => {
    const created = {
      ...newPlace,
      id: `custom-${Date.now()}`,
      visited: false,
      isCustom: true,
    };
    setPlaces((prev) => [created, ...prev]);
    setSelectedPlaceId(created.id);
    setPickedCoords(null);
  };

  const handleMapPick = (coords) => {
    if (mapMode === 'pick-place') {
      setPickedCoords(coords);
      setMapMode('browse');
      setIsAddOpen(true);
    } else if (mapMode === 'pick-location') {
      setUserLocation({
        lat: coords.lat,
        lng: coords.lng,
        accuracy: null,
        isSimulated: true,
      });
      setLocationStatus('manual');
      setLocationError('');
      setMapMode('browse');
      setCenterOnUserTrigger((n) => n + 1);
    } else if (mapMode === 'pick-heading') {
      if (userLocation) {
        const aimedDeg = Math.round(
          calculateBearing(
            userLocation.lat,
            userLocation.lng,
            coords.lat,
            coords.lng
          )
        );
        handleChangeHeading(aimedDeg, 'map-aim');
        const card = getCardinalDirection(aimedDeg);
        showHint(`Vista orientada hacia el ${card.label} (${aimedDeg}°)`);
      }
      setMapMode('browse');
    }
  };

  const handleSelectPlace = (id) => {
    setSelectedPlaceId(id);
    setMobilePanel('map');
  };

  const handleToggleTour = (id) => {
    setTourPlaceIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const loadRoute = async (place, mode, fromLocation) => {
    if (routeAbortRef.current) {
      routeAbortRef.current.abort();
    }
    const controller = new AbortController();
    routeAbortRef.current = controller;

    setActiveRoute({
      place,
      stops: null,
      mode,
      routeData: null,
      loading: true,
    });

    try {
      const routeData = await fetchRoute({
        from: fromLocation,
        to: { lat: place.lat, lng: place.lng },
        mode,
        signal: controller.signal,
      });
      setActiveRoute((prev) =>
        prev && prev.place?.id === place.id && prev.mode === mode
          ? { ...prev, routeData, loading: false }
          : prev
      );
    } catch (err) {
      if (err.name !== 'AbortError') {
        setActiveRoute((prev) => (prev ? { ...prev, loading: false } : null));
      }
    }
  };

  const loadMultiStopRoute = async (orderedStops, mode, startLocation) => {
    if (routeAbortRef.current) {
      routeAbortRef.current.abort();
    }
    const controller = new AbortController();
    routeAbortRef.current = controller;

    setActiveRoute({
      place: orderedStops[0],
      stops: orderedStops,
      mode,
      routeData: null,
      loading: true,
    });

    const waypoints = startLocation
      ? [startLocation, ...orderedStops]
      : orderedStops;

    try {
      const routeData = await fetchMultiStopRoute({
        waypoints,
        mode,
        signal: controller.signal,
      });
      setActiveRoute((prev) =>
        prev && prev.stops && prev.mode === mode
          ? { ...prev, routeData, loading: false }
          : prev
      );
    } catch (err) {
      if (err.name !== 'AbortError') {
        setActiveRoute((prev) => (prev ? { ...prev, loading: false } : null));
      }
    }
  };

  const handleBuildOptimalRoute = (modeOverride) => {
    const selectedPlaces = tourPlaceIds
      .map((id) => places.find((p) => p.id === id))
      .filter(Boolean);

    if (selectedPlaces.length === 0) {
      showHint('Toca los puntos en el mapa y presiona "+ Ruta" para armar tu recorrido.');
      return;
    }

    if (selectedPlaces.length === 1 && !userLocation) {
      showHint('Elige al menos 2 lugares en el mapa o activa tu GPS.');
      return;
    }

    setRouteHint('');
    const orderedStops = optimizeStopOrder(selectedPlaces, userLocation);
    const mode = modeOverride || activeRoute?.mode || 'walk';
    setMobilePanel('map');
    loadMultiStopRoute(orderedStops, mode, userLocation);
  };

  const handleShowRoute = (place) => {
    setSelectedPlaceId(place.id);
    setMobilePanel('map');

    if (!userLocation) {
      showHint('Activa tu GPS o usa "Marcar dónde estoy" para trazar el camino desde tu punto.');
      return;
    }

    const distKm =
      place.distanceKm ??
      calculateDistanceKm(userLocation.lat, userLocation.lng, place.lat, place.lng);
    const defaultMode = distKm <= 1.5 ? 'walk' : 'moto';
    loadRoute(place, defaultMode, userLocation);
  };

  const handleChangeRouteMode = (newMode) => {
    if (!activeRoute || activeRoute.mode === newMode) return;
    if (activeRoute.stops && activeRoute.stops.length > 0) {
      loadMultiStopRoute(activeRoute.stops, newMode, userLocation);
      return;
    }
    if (!userLocation || !activeRoute.place) return;
    loadRoute(activeRoute.place, newMode, userLocation);
  };

  const routeStopNumbers = useMemo(() => {
    const map = new Map();
    if (activeRoute?.stops?.length) {
      activeRoute.stops.forEach((stop, idx) => {
        map.set(stop.id, idx + 1);
      });
    }
    return map;
  }, [activeRoute]);

  const handleResetDefaults = () => {
    setPlaces(DEFAULT_PLACES);
    setTourPlaceIds([]);
    setSelectedPlaceId(null);
    handleCloseRoute();
  };

  const distanceFromCaliKm = userLocation
    ? calculateDistanceKm(userLocation.lat, userLocation.lng, CALI_CENTER.lat, CALI_CENTER.lng)
    : null;

  const targetInfo = computeTargetInfo(
    userLocation,
    activeRoute,
    selectedPlaceId,
    placesWithDistance
  );

  const currentCardinal = getCardinalDirection(userHeading);

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobilePanel === 'list' ? 'is-mobile-open' : ''}`}>
        <header className="sidebar-header">
          <div className="brand-row">
            <div className="brand-title-group">
              <span className="brand-icon" aria-hidden="true">
                <Compass size={20} />
              </span>
              <div>
                <h1>Cali Mapa</h1>
                <p className="brand-subtitle">
                  {stats.pending} por visitar · {stats.visited} visitados
                </p>
              </div>
            </div>

            <button
              type="button"
              className="btn-add-place"
              onClick={() => {
                setPickedCoords(
                  userLocation
                    ? {
                        lat: Number(userLocation.lat.toFixed(6)),
                        lng: Number(userLocation.lng.toFixed(6)),
                      }
                    : CALI_CENTER
                );
                setIsAddOpen(true);
              }}
            >
              <Plus size={16} aria-hidden="true" />
              <span>Agregar</span>
            </button>
          </div>

          <section className="location-panel" aria-label="Mi ubicación y cercanía">
            <div className="location-actions">
              <button
                type="button"
                className={`btn-locate ${locationStatus === 'active' ? 'is-active' : ''}`}
                onClick={() => requestGpsLocation(true)}
              >
                <LocateFixed size={15} aria-hidden="true" />
                <span>
                  {locationStatus === 'locating' ? 'Buscando GPS...' : 'Mi ubicación GPS'}
                </span>
              </button>

              <button
                type="button"
                className={`btn-manual-pin ${mapMode === 'pick-location' ? 'is-active' : ''}`}
                onClick={() => {
                  setMapMode((m) => (m === 'pick-location' ? 'browse' : 'pick-location'));
                  setMobilePanel('map');
                }}
              >
                <MapPin size={15} aria-hidden="true" />
                <span>{mapMode === 'pick-location' ? 'Cancelar' : 'Marcar dónde estoy'}</span>
              </button>
            </div>

            {locationError && <p className="location-note is-warning">{locationError}</p>}

            {userLocation && (
              <>
                <div className="orientation-strip">
                  <div className="orientation-strip-status">
                    <Compass size={14} className="orientation-strip-icon" aria-hidden="true" />
                    <span>
                      Mirando al <strong>{currentCardinal.label}</strong> (
                      {Math.round(userHeading)}°)
                    </span>
                  </div>
                  <button
                    type="button"
                    className={`btn-aim-heading ${
                      mapMode === 'pick-heading' ? 'is-active' : ''
                    }`}
                    onClick={() => {
                      setMapMode((m) =>
                        m === 'pick-heading' ? 'browse' : 'pick-heading'
                      );
                      setMobilePanel('map');
                    }}
                    title="Haz clic en la calle hacia donde estás mirando en el mapa"
                  >
                    <Crosshair size={13} aria-hidden="true" />
                    <span>
                      {mapMode === 'pick-heading' ? 'Cancelar' : 'Apuntar mi vista'}
                    </span>
                  </button>
                </div>

                <div className="radius-row">
                  <span className="radius-label">A mi alrededor:</span>
                  <div className="radius-pills" role="group" aria-label="Filtrar por radio de distancia">
                    {[
                      { value: 0, label: 'Todos' },
                      { value: 1, label: '1 km' },
                      { value: 3, label: '3 km' },
                      { value: 5, label: '5 km' },
                    ].map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        className={`radius-pill ${radiusKm === opt.value ? 'is-active' : ''}`}
                        onClick={() => setRadiusKm(opt.value)}
                        aria-pressed={radiusKm === opt.value}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {distanceFromCaliKm != null && distanceFromCaliKm > 30 && (
              <p className="location-note">
                Estás a {Math.round(distanceFromCaliKm)} km de Cali. Usa{' '}
                <strong>Marcar dónde estoy</strong> para simular tu punto en la ciudad.
              </p>
            )}
          </section>

          <div className="search-box">
            <Search size={16} className="search-icon" aria-hidden="true" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar lugar, barrio o plan..."
              aria-label="Buscar lugares en Cali"
            />
            {searchQuery && (
              <button
                type="button"
                className="search-clear"
                onClick={() => setSearchQuery('')}
                aria-label="Limpiar búsqueda"
              >
                <X size={14} aria-hidden="true" />
              </button>
            )}
          </div>

          <div className="status-tabs" role="group" aria-label="Filtrar por estado">
            {[
              { id: 'all', label: 'Todos' },
              { id: 'pending', label: 'Por visitar' },
              { id: 'visited', label: 'Visitados' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`status-tab ${statusFilter === tab.id ? 'is-active' : ''}`}
                onClick={() => setStatusFilter(tab.id)}
                aria-pressed={statusFilter === tab.id}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="category-pills" role="group" aria-label="Filtrar por categoría">
            <button
              type="button"
              className={`cat-pill ${activeCategory === 'all' ? 'is-active' : ''}`}
              onClick={() => setActiveCategory('all')}
              aria-pressed={activeCategory === 'all'}
            >
              Todas
            </button>
            {Object.values(CATEGORIES).map((cat) => (
              <button
                key={cat.id}
                type="button"
                className={`cat-pill ${activeCategory === cat.id ? 'is-active' : ''}`}
                style={{ '--cat-color': cat.color }}
                onClick={() => setActiveCategory(cat.id)}
                aria-pressed={activeCategory === cat.id}
              >
                <span className="cat-dot" aria-hidden="true" />
                <span>{cat.label}</span>
              </button>
            ))}
          </div>
        </header>

        <div className="places-list" role="region" aria-label="Listado de lugares">
          {tourPlaceIds.length > 0 && (
            <div className="tour-builder-bar">
              <div className="tour-builder-info">
                <Route size={16} aria-hidden="true" />
                <span>
                  <strong>{tourPlaceIds.length}</strong>{' '}
                  {tourPlaceIds.length === 1 ? 'sitio en tu ruta' : 'sitios en tu ruta'}
                </span>
              </div>
              <div className="tour-builder-actions">
                <button
                  type="button"
                  className="btn-tour-clear"
                  onClick={() => {
                    setTourPlaceIds([]);
                    if (activeRoute?.stops) handleCloseRoute();
                  }}
                >
                  Limpiar
                </button>
                <button
                  type="button"
                  className="btn-tour-go"
                  disabled={tourPlaceIds.length < 2 && !userLocation}
                  onClick={() => handleBuildOptimalRoute()}
                >
                  Ruta óptima
                </button>
              </div>
            </div>
          )}

          {filteredPlaces.length === 0 ? (
            <div className="empty-state">
              <p>No hay lugares que coincidan con este filtro.</p>
              {radiusKm > 0 && (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setRadiusKm(0)}
                >
                  Ver toda la ciudad
                </button>
              )}
            </div>
          ) : (
            filteredPlaces.map((place) => (
              <PlaceCard
                key={place.id}
                place={place}
                userHeading={userLocation ? userHeading : null}
                isSelected={place.id === selectedPlaceId}
                isInTour={tourPlaceIds.includes(place.id)}
                onSelect={handleSelectPlace}
                onShowRoute={handleShowRoute}
                onToggleTour={handleToggleTour}
                onToggleVisited={handleToggleVisited}
                onDelete={handleDeletePlace}
              />
            ))
          )}

          <div className="list-footer">
            <button
              type="button"
              className="btn-reset-list"
              onClick={handleResetDefaults}
              title="Restaurar la lista original de lugares de Cali"
            >
              <RotateCcw size={13} aria-hidden="true" />
              <span>Restaurar lugares iniciales</span>
            </button>
          </div>
        </div>
      </aside>

      <main className="map-stage">
        {mapMode !== 'browse' && (
          <div className="map-pick-banner" role="status">
            <span>
              {mapMode === 'pick-place'
                ? 'Haz clic en el mapa de Cali para ubicar el nuevo lugar'
                : mapMode === 'pick-heading'
                  ? 'Toca la calle o esquina hacia donde estás mirando para orientar tu vista'
                  : 'Haz clic en el mapa para marcar tu ubicación actual'}
            </span>
            <button
              type="button"
              className="btn-cancel-pick"
              onClick={() => {
                setMapMode('browse');
                if (mapMode === 'pick-place') setIsAddOpen(true);
              }}
            >
              Cancelar
            </button>
          </div>
        )}

        <CompassHud
          userLocation={userLocation}
          userHeading={userHeading}
          headingSource={headingSource}
          compassStatus={compassStatus}
          followUser={followUser}
          mapMode={mapMode}
          targetInfo={targetInfo}
          onChangeHeading={handleChangeHeading}
          onRequestCompass={handleRequestCompass}
          onTogglePickHeading={() =>
            setMapMode((m) => (m === 'pick-heading' ? 'browse' : 'pick-heading'))
          }
          onToggleFollowUser={() => {
            setFollowUser((prev) => {
              const next = !prev;
              if (next) setCenterOnUserTrigger((n) => n + 1);
              return next;
            });
          }}
          onCenterOnUser={() => setCenterOnUserTrigger((n) => n + 1)}
          onRequestPickLocation={() => setMapMode('pick-location')}
        />

        <div className="map-floating-controls">
          <button
            type="button"
            className="map-float-btn"
            onClick={() => setCenterOnCaliTrigger((n) => n + 1)}
            title="Centrar en Cali"
          >
            <Compass size={16} aria-hidden="true" />
            <span>Centro de Cali</span>
          </button>

          {userLocation && (
            <button
              type="button"
              className="map-float-btn is-primary"
              onClick={() => setCenterOnUserTrigger((n) => n + 1)}
              title="Ir a mi ubicación"
            >
              <LocateFixed size={16} aria-hidden="true" />
              <span>Mi ubicación</span>
            </button>
          )}
        </div>

        <CaliMap
          places={mapPlaces}
          selectedPlaceId={selectedPlaceId}
          onSelectPlace={(id) => setSelectedPlaceId(id)}
          onShowRoute={handleShowRoute}
          onToggleTour={handleToggleTour}
          onToggleVisited={handleToggleVisited}
          tourPlaceIds={tourPlaceIds}
          activeRoute={activeRoute}
          routeStopNumbers={routeStopNumbers}
          userLocation={userLocation}
          userHeading={userHeading}
          followUser={followUser}
          radiusKm={radiusKm}
          mapMode={mapMode}
          onMapPick={handleMapPick}
          centerOnUserTrigger={centerOnUserTrigger}
          centerOnCaliTrigger={centerOnCaliTrigger}
        />

        {routeHint && (
          <div className="map-hint-toast" role="status">
            {routeHint}
          </div>
        )}

        {tourPlaceIds.length > 0 && !activeRoute && (
          <div className="map-tour-cta">
            <button
              type="button"
              className="btn-map-tour-go"
              onClick={() => handleBuildOptimalRoute()}
            >
              <Route size={16} aria-hidden="true" />
              <span>Generar ruta ({tourPlaceIds.length})</span>
            </button>
            <button
              type="button"
              className="btn-map-tour-clear"
              onClick={() => setTourPlaceIds([])}
              aria-label="Limpiar selección de ruta"
              title="Limpiar selección"
            >
              <X size={15} aria-hidden="true" />
            </button>
          </div>
        )}

        <RoutePanel
          activeRoute={activeRoute}
          userLocation={userLocation}
          userHeading={userHeading}
          onAlignHeading={(deg) => handleChangeHeading(deg, 'manual')}
          onChangeMode={handleChangeRouteMode}
          onSelectStop={(id) => setSelectedPlaceId(id)}
          onClose={handleCloseRoute}
        />

        <div className="mobile-view-switcher">
          <button
            type="button"
            className={mobilePanel === 'map' ? 'is-active' : ''}
            onClick={() => setMobilePanel('map')}
            aria-label="Ver mapa"
            title="Ver mapa"
          >
            <MapIcon size={20} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={mobilePanel === 'list' ? 'is-active' : ''}
            onClick={() => setMobilePanel('list')}
            aria-label={`Ver lista (${filteredPlaces.length})`}
            title={`Ver lista (${filteredPlaces.length})`}
          >
            <List size={20} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={`btn-switcher-route ${activeRoute?.stops ? 'is-active' : ''}`}
            onClick={() => handleBuildOptimalRoute()}
            aria-label={`Generar ruta óptima (${tourPlaceIds.length} seleccionados)`}
            title="Generar ruta óptima"
          >
            <Route size={20} aria-hidden="true" />
            {tourPlaceIds.length > 0 && (
              <span className="switcher-badge">{tourPlaceIds.length}</span>
            )}
          </button>
        </div>
      </main>

      <AddPlaceDialog
        isOpen={isAddOpen}
        pickedCoords={pickedCoords}
        onClose={() => setIsAddOpen(false)}
        onRequestMapPick={() => {
          setIsAddOpen(false);
          setMapMode('pick-place');
          setMobilePanel('map');
        }}
        onAddPlace={handleAddPlace}
      />
    </div>
  );
}
