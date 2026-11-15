import { Check, MapPin, Navigation, Route, Trash2 } from 'lucide-react';
import { CATEGORIES } from '../data/caliPlaces';
import { estimateTravelTime, formatDistance } from '../utils/geo';

export default function PlaceCard({
  place,
  isSelected,
  isInTour,
  onSelect,
  onShowRoute,
  onToggleTour,
  onToggleVisited,
  onDelete,
}) {
  const category = CATEGORIES[place.category] || {
    label: 'Lugar',
    color: '#4f46e5',
  };

  return (
    <article
      className={`place-card ${isSelected ? 'is-selected' : ''} ${place.visited ? 'is-visited' : ''}`}
    >
      <button
        type="button"
        className="place-card-main"
        onClick={() => onSelect(place.id)}
      >
        <div className="place-card-top">
          <span
            className="place-category-badge"
            style={{ '--cat-color': category.color }}
          >
            {category.label}
          </span>
          {place.distanceKm != null && (
            <span className="place-distance-pill">
              <MapPin size={12} aria-hidden="true" />
              <span>{formatDistance(place.distanceKm)}</span>
            </span>
          )}
        </div>

        <h3 className="place-card-title">{place.name}</h3>

        {place.neighborhood && (
          <p className="place-card-hood">
            {place.neighborhood}
            {place.distanceKm != null && (
              <span className="place-card-time">
                {' · '}
                {estimateTravelTime(place.distanceKm)}
              </span>
            )}
          </p>
        )}

        {place.description && (
          <p className="place-card-desc">{place.description}</p>
        )}
      </button>

      <div className="place-card-actions">
        <button
          type="button"
          className={`btn-visited ${place.visited ? 'is-active' : ''}`}
          onClick={() => onToggleVisited(place.id)}
          aria-pressed={place.visited}
        >
          <Check size={14} aria-hidden="true" />
          <span>{place.visited ? 'Visitado' : 'Por visitar'}</span>
        </button>

        <button
          type="button"
          className={`btn-tour-toggle ${isInTour ? 'is-active' : ''}`}
          onClick={() => onToggleTour(place.id)}
          aria-pressed={isInTour}
          title={isInTour ? 'Quitar de la ruta óptima' : 'Agregar a ruta óptima'}
        >
          <Route size={14} aria-hidden="true" />
          <span>{isInTour ? 'En ruta' : '+ Ruta'}</span>
        </button>

        <button
          type="button"
          className="btn-directions"
          onClick={() => onShowRoute(place)}
          title="Ver camino en el mapa"
        >
          <Navigation size={14} aria-hidden="true" />
          <span>Ir</span>
        </button>

        {place.isCustom && (
          <button
            type="button"
            className="btn-delete"
            onClick={() => onDelete(place.id)}
            aria-label={`Eliminar ${place.name}`}
            title="Eliminar lugar"
          >
            <Trash2 size={14} aria-hidden="true" />
          </button>
        )}
      </div>
    </article>
  );
}
