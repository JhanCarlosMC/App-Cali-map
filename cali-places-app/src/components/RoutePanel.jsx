import { Bike, ExternalLink, Footprints, X } from 'lucide-react';
import { formatDistance, getDirectionsUrl } from '../utils/geo';

export default function RoutePanel({
  activeRoute,
  userLocation,
  onChangeMode,
  onClose,
}) {
  if (!activeRoute) return null;

  const { place, mode, routeData, loading } = activeRoute;

  return (
    <section className="route-panel" aria-label="Ruta en el mapa">
      <div className="route-panel-header">
        <div className="route-panel-title-wrap">
          <span className="route-panel-eyebrow">Cómo llegar a</span>
          <h2 className="route-panel-title">{place.name}</h2>
        </div>
        <button
          type="button"
          className="route-panel-close"
          onClick={onClose}
          aria-label="Cerrar ruta"
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>

      <div className="route-mode-switch" role="group" aria-label="Modo de transporte">
        <button
          type="button"
          className={`route-mode-btn ${mode === 'walk' ? 'is-active' : ''}`}
          onClick={() => onChangeMode('walk')}
          aria-pressed={mode === 'walk'}
        >
          <Footprints size={16} aria-hidden="true" />
          <span>Caminata</span>
        </button>
        <button
          type="button"
          className={`route-mode-btn ${mode === 'moto' ? 'is-active' : ''}`}
          onClick={() => onChangeMode('moto')}
          aria-pressed={mode === 'moto'}
        >
          <Bike size={16} aria-hidden="true" />
          <span>Moto</span>
        </button>
      </div>

      <div className="route-panel-body">
        {loading ? (
          <p className="route-stats-loading">Calculando mejor camino...</p>
        ) : routeData ? (
          <div className="route-stats">
            <span className="route-duration">{routeData.durationMin} min</span>
            <span className="route-dot" aria-hidden="true">·</span>
            <span className="route-distance">{formatDistance(routeData.distanceKm)}</span>
            {routeData.isFallback && (
              <span className="route-fallback-tag">Línea directa</span>
            )}
          </div>
        ) : null}

        <a
          className="route-maps-link"
          href={getDirectionsUrl(place.lat, place.lng, userLocation, mode)}
          target="_blank"
          rel="noopener noreferrer"
        >
          <span>Abrir en Maps</span>
          <ExternalLink size={14} aria-hidden="true" />
        </a>
      </div>
    </section>
  );
}
