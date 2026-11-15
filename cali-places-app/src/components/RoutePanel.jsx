import { useState } from 'react';
import {
  Bike,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Footprints,
  X,
} from 'lucide-react';
import {
  formatDistance,
  getDirectionsUrl,
  getMultiStopDirectionsUrl,
} from '../utils/geo';

export default function RoutePanel({
  activeRoute,
  userLocation,
  onChangeMode,
  onSelectStop,
  onClose,
}) {
  const [showDetails, setShowDetails] = useState(false);

  if (!activeRoute) return null;

  const { place, stops, mode, routeData, loading } = activeRoute;
  const isMultiStop = Array.isArray(stops) && stops.length > 1;
  const orderedStops = isMultiStop ? stops : place ? [place] : [];
  const titleText = isMultiStop
    ? `Ruta óptima (${orderedStops.length} lugares)`
    : place?.name || '';

  const mapsUrl = isMultiStop
    ? getMultiStopDirectionsUrl(orderedStops, userLocation, mode)
    : getDirectionsUrl(place.lat, place.lng, userLocation, mode);

  const legs = routeData?.legs || [];
  const hasUserOrigin = Boolean(userLocation);

  return (
    <section className="route-panel" aria-label="Ruta en el mapa">
      <div className="route-panel-header">
        <div className="route-panel-title-wrap">
          <span className="route-panel-eyebrow">
            {isMultiStop ? 'Recorrido sugerido' : 'Cómo llegar a'}
          </span>
          <h2 className="route-panel-title">{titleText}</h2>
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

      {isMultiStop && !showDetails && (
        <ol className="route-stops-list">
          {orderedStops.map((stop, idx) => (
            <li key={stop.id} className="route-stop-chip">
              <span className="route-stop-num">{idx + 1}</span>
              <span className="route-stop-name">{stop.name}</span>
            </li>
          ))}
        </ol>
      )}

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

        <div className="route-panel-actions">
          <button
            type="button"
            className="route-details-toggle"
            onClick={() => setShowDetails((prev) => !prev)}
            aria-expanded={showDetails}
          >
            <span>{showDetails ? 'Ocultar' : 'Detalles'}</span>
            {showDetails ? (
              <ChevronUp size={14} aria-hidden="true" />
            ) : (
              <ChevronDown size={14} aria-hidden="true" />
            )}
          </button>

          <a
            className="route-maps-link"
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            <span>Maps</span>
            <ExternalLink size={14} aria-hidden="true" />
          </a>
        </div>
      </div>

      {showDetails && (
        <ol className="route-details-list">
          {orderedStops.map((stop, idx) => {
            const legIdx = hasUserOrigin ? idx : idx - 1;
            const leg = legIdx >= 0 ? legs[legIdx] : null;
            return (
              <li key={stop.id} className="route-detail-item">
                <button
                  type="button"
                  className="route-detail-btn"
                  onClick={() => onSelectStop?.(stop.id)}
                >
                  <span className="route-stop-num">{idx + 1}</span>
                  <div className="route-detail-info">
                    <div className="route-detail-top">
                      <strong>{stop.name}</strong>
                      {leg && (
                        <span className="route-detail-leg">
                          +{leg.durationMin} min · {formatDistance(leg.distanceKm)}
                        </span>
                      )}
                    </div>
                    {stop.neighborhood && (
                      <span className="route-detail-hood">{stop.neighborhood}</span>
                    )}
                    {stop.description && (
                      <p className="route-detail-desc">{stop.description}</p>
                    )}
                  </div>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
