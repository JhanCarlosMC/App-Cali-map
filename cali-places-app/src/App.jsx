import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Compass,
  List,
  LocateFixed,
  Map as MapIcon,
  MapPin,
  Plus,
  RotateCcw,
  Search,
  X,
} from 'lucide-react';
import CaliMap from './components/CaliMap';
import PlaceCard from './components/PlaceCard';
import AddPlaceDialog from './components/AddPlaceDialog';
import RoutePanel from './components/RoutePanel';
import { CALI_CENTER, CATEGORIES, DEFAULT_PLACES } from './data/caliPlaces';
import { calculateDistanceKm, fetchRoute } from './utils/geo';
import './App.css';

const STORAGE_KEY = 'cali-places-app:v1';

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

  const [mapMode, setMapMode] = useState('browse');
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [pickedCoords, setPickedCoords] = useState(null);

  const [mobilePanel, setMobilePanel] = useState('map');
  const [activeRoute, setActiveRoute] = useState(null);
  const routeAbortRef = useRef(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(places));
    } catch {
      // Ignore storage quota errors
    }
  }, [places]);

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
        setUserLocation((prev) => {
          if (prev?.isSimulated) return prev;
          return {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
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
      return { ...place, distanceKm };
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

  const handleDeletePlace = (id) => {
    setPlaces((prev) => prev.filter((p) => p.id !== id));
    if (selectedPlaceId === id) {
      setSelectedPlaceId(null);
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
    }
  };

  const handleSelectPlace = (id) => {
    setSelectedPlaceId(id);
    setMobilePanel('map');
  };

  const loadRoute = async (place, mode, fromLocation) => {
    if (routeAbortRef.current) {
      routeAbortRef.current.abort();
    }
    const controller = new AbortController();
    routeAbortRef.current = controller;

    setActiveRoute({
      place,
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
        prev && prev.place.id === place.id && prev.mode === mode
          ? { ...prev, routeData, loading: false }
          : prev
      );
    } catch (err) {
      if (err.name !== 'AbortError') {
        setActiveRoute((prev) => (prev ? { ...prev, loading: false } : null));
      }
    }
  };

  const handleShowRoute = (place) => {
    setSelectedPlaceId(place.id);
    setMobilePanel('map');

    if (!userLocation) {
      setLocationError(
        'Activa tu GPS o usa "Marcar dónde estoy" para trazar el camino desde tu ubicación.'
      );
      setMobilePanel('list');
      return;
    }

    const distKm =
      place.distanceKm ??
      calculateDistanceKm(userLocation.lat, userLocation.lng, place.lat, place.lng);
    const defaultMode = distKm <= 1.5 ? 'walk' : 'moto';
    loadRoute(place, defaultMode, userLocation);
  };

  const handleChangeRouteMode = (newMode) => {
    if (!activeRoute || !userLocation || activeRoute.mode === newMode) return;
    loadRoute(activeRoute.place, newMode, userLocation);
  };

  const handleCloseRoute = () => {
    if (routeAbortRef.current) {
      routeAbortRef.current.abort();
    }
    setActiveRoute(null);
  };

  const handleResetDefaults = () => {
    setPlaces(DEFAULT_PLACES);
    setSelectedPlaceId(null);
  };

  const distanceFromCaliKm = userLocation
    ? calculateDistanceKm(userLocation.lat, userLocation.lng, CALI_CENTER.lat, CALI_CENTER.lng)
    : null;

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
                isSelected={place.id === selectedPlaceId}
                onSelect={handleSelectPlace}
                onShowRoute={handleShowRoute}
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
          places={filteredPlaces}
          selectedPlaceId={selectedPlaceId}
          onSelectPlace={(id) => setSelectedPlaceId(id)}
          onShowRoute={handleShowRoute}
          activeRoute={activeRoute}
          userLocation={userLocation}
          radiusKm={radiusKm}
          mapMode={mapMode}
          onMapPick={handleMapPick}
          centerOnUserTrigger={centerOnUserTrigger}
          centerOnCaliTrigger={centerOnCaliTrigger}
        />

        <RoutePanel
          activeRoute={activeRoute}
          userLocation={userLocation}
          onChangeMode={handleChangeRouteMode}
          onClose={handleCloseRoute}
        />

        <div className="mobile-view-switcher">
          <button
            type="button"
            className={mobilePanel === 'map' ? 'is-active' : ''}
            onClick={() => setMobilePanel('map')}
          >
            <MapIcon size={16} aria-hidden="true" />
            <span>Mapa</span>
          </button>
          <button
            type="button"
            className={mobilePanel === 'list' ? 'is-active' : ''}
            onClick={() => setMobilePanel('list')}
          >
            <List size={16} aria-hidden="true" />
            <span>Lista ({filteredPlaces.length})</span>
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
