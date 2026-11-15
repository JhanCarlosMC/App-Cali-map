import { useEffect, useRef, useState } from 'react';
import { MapPin, X } from 'lucide-react';
import { CALI_CENTER, CATEGORIES } from '../data/caliPlaces';

export default function AddPlaceDialog({
  isOpen,
  pickedCoords,
  onClose,
  onRequestMapPick,
  onAddPlace,
}) {
  const dialogRef = useRef(null);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('cultura');
  const [neighborhood, setNeighborhood] = useState('');
  const [description, setDescription] = useState('');
  const [coordEdits, setCoordEdits] = useState(null);
  const [error, setError] = useState('');

  const lat = coordEdits?.lat ?? String(pickedCoords?.lat ?? CALI_CENTER.lat);
  const lng = coordEdits?.lng ?? String(pickedCoords?.lng ?? CALI_CENTER.lng);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen && !dialog.open) {
      dialog.showModal();
    } else if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  // Fallback light-dismiss for browsers without native closedby="any"
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || 'closedBy' in HTMLDialogElement.prototype) return;

    const outside = (e) => {
      const r = dialog.getBoundingClientRect();
      return (
        e.clientX < r.left ||
        e.clientX > r.right ||
        e.clientY < r.top ||
        e.clientY > r.bottom
      );
    };

    let pressedOutside = false;
    const handlePointerDown = (e) => {
      pressedOutside = outside(e);
    };
    const handlePointerUp = (e) => {
      if (pressedOutside && outside(e)) {
        dialog.close();
      }
    };

    dialog.addEventListener('pointerdown', handlePointerDown);
    dialog.addEventListener('pointerup', handlePointerUp);
    return () => {
      dialog.removeEventListener('pointerdown', handlePointerDown);
      dialog.removeEventListener('pointerup', handlePointerUp);
    };
  }, []);

  const handleDialogClose = () => {
    const dialog = dialogRef.current;
    if (dialog) {
      dialog.returnValue = '';
    }
    onClose();
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmedName = name.trim();
    const parsedLat = Number.parseFloat(lat);
    const parsedLng = Number.parseFloat(lng);

    if (!trimmedName) {
      setError('Escribe el nombre del lugar.');
      return;
    }
    if (Number.isNaN(parsedLat) || Number.isNaN(parsedLng)) {
      setError('Ingresa coordenadas válidas o elígelas en el mapa.');
      return;
    }

    onAddPlace({
      name: trimmedName,
      category,
      neighborhood: neighborhood.trim() || 'Cali',
      description: description.trim(),
      lat: parsedLat,
      lng: parsedLng,
    });

    setName('');
    setNeighborhood('');
    setDescription('');
    setCoordEdits(null);
    setError('');
    onClose();
  };

  return (
    <dialog
      ref={dialogRef}
      className="add-place-dialog"
      aria-labelledby="add-place-title"
      closedby="any"
      onClose={handleDialogClose}
    >
      <div className="dialog-header">
        <h2 id="add-place-title">Agregar lugar por visitar</h2>
        <button
          type="button"
          className="dialog-close-btn"
          onClick={onClose}
          aria-label="Cerrar"
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>

      <form className="dialog-form" onSubmit={handleSubmit}>
        <label className="form-field">
          <span>Nombre del lugar *</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej. Café Macondo, Mirador Sebastián..."
            autoFocus
            required
          />
        </label>

        <div className="form-row">
          <label className="form-field">
            <span>Categoría</span>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {Object.values(CATEGORIES).map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.label}
                </option>
              ))}
            </select>
          </label>

          <label className="form-field">
            <span>Barrio o zona</span>
            <input
              type="text"
              value={neighborhood}
              onChange={(e) => setNeighborhood(e.target.value)}
              placeholder="Ej. El Peñón, Granada"
            />
          </label>
        </div>

        <label className="form-field">
          <span>Notas o descripción</span>
          <textarea
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="¿Qué quieres hacer o probar ahí?"
          />
        </label>

        <div className="coords-box">
          <div className="coords-header">
            <span>Ubicación en el mapa</span>
            <button
              type="button"
              className="btn-pick-map"
              onClick={() => {
                setCoordEdits(null);
                onRequestMapPick();
              }}
            >
              <MapPin size={14} aria-hidden="true" />
              <span>Elegir punto en el mapa</span>
            </button>
          </div>
          <div className="form-row">
            <label className="form-field">
              <span>Latitud</span>
              <input
                type="number"
                step="any"
                value={lat}
                onChange={(e) => setCoordEdits({ lat: e.target.value, lng })}
                required
              />
            </label>
            <label className="form-field">
              <span>Longitud</span>
              <input
                type="number"
                step="any"
                value={lng}
                onChange={(e) => setCoordEdits({ lat, lng: e.target.value })}
                required
              />
            </label>
          </div>
        </div>

        {error && <p className="form-error">{error}</p>}

        <div className="dialog-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn-primary">
            Guardar lugar
          </button>
        </div>
      </form>
    </dialog>
  );
}
