import { useRef, useState } from 'react';
import {
  Compass,
  Crosshair,
  LocateFixed,
  Navigation,
  SlidersHorizontal,
  Smartphone,
  X,
} from 'lucide-react';
import {
  CARDINAL_POINTS,
  getCardinalDirection,
  getRelativeDirection,
  normalizeHeading,
} from '../utils/geo';

export default function CompassHud({
  userLocation,
  userHeading,
  headingSource,
  compassStatus,
  followUser,
  mapMode,
  targetInfo,
  onChangeHeading,
  onRequestCompass,
  onTogglePickHeading,
  onToggleFollowUser,
  onCenterOnUser,
  onRequestPickLocation,
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const dialRef = useRef(null);
  const isDraggingRef = useRef(false);

  const effectiveHeading = normalizeHeading(userHeading ?? 0);
  const cardinal = getCardinalDirection(effectiveHeading);

  const relativeTarget =
    targetInfo != null
      ? getRelativeDirection(effectiveHeading, targetInfo.bearing)
      : null;
  const targetCardinal =
    targetInfo != null ? getCardinalDirection(targetInfo.bearing) : null;

  const updateHeadingFromPointer = (clientX, clientY) => {
    const el = dialRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = clientX - cx;
    const dy = clientY - cy;
    if (Math.hypot(dx, dy) < 4) return;
    // 0 deg is up (North), 90 deg is right (East)
    const angleRad = Math.atan2(dx, -dy);
    const angleDeg = normalizeHeading(Math.round((angleRad * 180) / Math.PI));
    onChangeHeading(angleDeg, 'manual');
  };

  const handlePointerDown = (e) => {
    if (!userLocation) return;
    e.preventDefault();
    isDraggingRef.current = true;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    updateHeadingFromPointer(e.clientX, e.clientY);
  };

  const handlePointerMove = (e) => {
    if (!isDraggingRef.current) return;
    updateHeadingFromPointer(e.clientX, e.clientY);
  };

  const handlePointerUp = (e) => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  };

  const sourceLabel =
    headingSource === 'compass'
      ? 'Brújula del dispositivo'
      : headingSource === 'gps'
        ? 'Rumbo al caminar (GPS)'
        : headingSource === 'map-aim'
          ? 'Apuntado en el mapa'
          : 'Ajuste manual';

  return (
    <aside
      className={`compass-hud ${isExpanded ? 'is-expanded' : ''}`}
      aria-label="Brújula y orientación personal"
    >
      <div className="compass-hud-main">
        {/* Interactive Compass Rose Dial */}
        <div
          ref={dialRef}
          className={`compass-dial ${userLocation ? 'is-interactive' : ''}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          role="slider"
          tabIndex={userLocation ? 0 : -1}
          aria-label="Dirección hacia donde estás mirando en grados"
          aria-valuemin={0}
          aria-valuemax={359}
          aria-valuenow={Math.round(effectiveHeading)}
          aria-valuetext={`Mirando al ${cardinal.label} (${Math.round(effectiveHeading)} grados)`}
          title={
            userLocation
              ? 'Arrastra o toca la brújula para girar hacia dónde estás mirando'
              : 'Brújula (Norte arriba)'
          }
          onKeyDown={(e) => {
            if (!userLocation) return;
            if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
              e.preventDefault();
              onChangeHeading(normalizeHeading(effectiveHeading + 15), 'manual');
            } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
              e.preventDefault();
              onChangeHeading(normalizeHeading(effectiveHeading - 15), 'manual');
            }
          }}
        >
          <span className="compass-mark is-north" aria-hidden="true">
            N
          </span>
          <span className="compass-mark is-east" aria-hidden="true">
            E
          </span>
          <span className="compass-mark is-south" aria-hidden="true">
            S
          </span>
          <span className="compass-mark is-west" aria-hidden="true">
            O
          </span>

          {/* Vision cone inside the dial */}
          <div
            className="compass-dial-cone"
            style={{ transform: `rotate(${effectiveHeading}deg)` }}
            aria-hidden="true"
          >
            <span className="compass-dial-beam" />
            <span className="compass-dial-arrow" />
          </div>

          {/* Target bearing marker on the dial rim if a place/route is active */}
          {targetInfo != null && (
            <div
              className="compass-dial-target"
              style={{ transform: `rotate(${targetInfo.bearing}deg)` }}
              title={`Destino hacia el ${targetCardinal?.label} (${Math.round(targetInfo.bearing)}°)`}
              aria-hidden="true"
            >
              <span className="compass-dial-target-dot" />
            </div>
          )}

          <span className="compass-dial-center" aria-hidden="true" />
        </div>

        {/* Status & Quick Orientation Summary */}
        <div className="compass-hud-summary">
          <div className="compass-hud-heading-row">
            <span className="compass-eyebrow">
              {userLocation ? 'Mirando hacia' : 'Referencia'}
            </span>
            <button
              type="button"
              className={`compass-expand-btn ${isExpanded ? 'is-active' : ''}`}
              onClick={() => setIsExpanded((prev) => !prev)}
              aria-expanded={isExpanded}
              aria-label={
                isExpanded
                  ? 'Cerrar controles de orientación'
                  : 'Ajustar hacia dónde estoy mirando'
              }
              title="Ajustar orientación y brújula"
            >
              {isExpanded ? (
                <X size={14} aria-hidden="true" />
              ) : (
                <SlidersHorizontal size={14} aria-hidden="true" />
              )}
              <span>{isExpanded ? 'Cerrar' : 'Orientar'}</span>
            </button>
          </div>

          {userLocation ? (
            <>
              <div className="compass-current-dir">
                <strong className="compass-cardinal-badge">{cardinal.short}</strong>
                <span className="compass-cardinal-name">{cardinal.label}</span>
                <span className="compass-deg">{Math.round(effectiveHeading)}°</span>
              </div>

              {targetInfo && relativeTarget ? (
                <p className="compass-target-hint">
                  <span className="compass-target-arrow" aria-hidden="true">
                    {relativeTarget.arrow}
                  </span>
                  <span>
                    <strong>{targetInfo.label}:</strong> {relativeTarget.text} (al{' '}
                    {targetCardinal?.short})
                  </span>
                </p>
              ) : (
                <p className="compass-subnote">{sourceLabel}</p>
              )}
            </>
          ) : (
            <div className="compass-no-location">
              <p className="compass-subnote">
                El <strong>Norte (N)</strong> está arriba. Marca tu punto para ver hacia dónde miras.
              </p>
              <button
                type="button"
                className="compass-locate-cta"
                onClick={onRequestPickLocation}
              >
                <LocateFixed size={13} aria-hidden="true" />
                <span>Ubicarme en el mapa</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Expanded Orientation Controls */}
      {isExpanded && (
        <div className="compass-hud-controls">
          {!userLocation ? (
            <p className="compass-help-text">
              Primero activa <strong>Mi ubicación GPS</strong> o{' '}
              <strong>Marcar dónde estoy</strong> para usar tu posición como punto de
              referencia entre las calles.
            </p>
          ) : (
            <>
              <div className="compass-quick-actions">
                <button
                  type="button"
                  className={`compass-action-btn ${
                    mapMode === 'pick-heading' ? 'is-active' : ''
                  }`}
                  onClick={onTogglePickHeading}
                >
                  <Crosshair size={14} aria-hidden="true" />
                  <span>
                    {mapMode === 'pick-heading'
                      ? 'Toca la calle en el mapa...'
                      : 'Apuntar calle en el mapa'}
                  </span>
                </button>

                <button
                  type="button"
                  className={`compass-action-btn ${
                    headingSource === 'compass' ? 'is-active' : ''
                  }`}
                  onClick={onRequestCompass}
                >
                  <Smartphone size={14} aria-hidden="true" />
                  <span>
                    {compassStatus === 'active'
                      ? 'Brújula activa'
                      : 'Usar brújula del móvil'}
                  </span>
                </button>
              </div>

              {compassStatus === 'unsupported' && (
                <p className="compass-sensor-msg">
                  Tu dispositivo o navegador no reporta brújula magnética. Usa la rueda,
                  los puntos cardinales o <strong>Apuntar calle en el mapa</strong>.
                </p>
              )}
              {compassStatus === 'denied' && (
                <p className="compass-sensor-msg">
                  Permiso de orientación denegado en el navegador. Puedes girar tu vista
                  manualmente abajo.
                </p>
              )}

              <div
                className="compass-cardinal-grid"
                role="group"
                aria-label="Puntos cardinales rápidos"
              >
                {CARDINAL_POINTS.map((pt) => {
                  const isCurrent = cardinal.short === pt.short;
                  return (
                    <button
                      key={pt.short}
                      type="button"
                      className={`compass-cardinal-btn ${isCurrent ? 'is-active' : ''} ${
                        pt.short === 'N' ? 'is-north' : ''
                      }`}
                      onClick={() => onChangeHeading(pt.deg, 'manual')}
                      aria-pressed={isCurrent}
                      title={`Mirar hacia el ${pt.label} (${pt.deg}°)`}
                    >
                      {pt.short}
                    </button>
                  );
                })}
              </div>

              <div className="compass-slider-row">
                <label htmlFor="heading-range-slider" className="compass-slider-label">
                  <span>Girar mi vista</span>
                  <strong>
                    {cardinal.label} ({Math.round(effectiveHeading)}°)
                  </strong>
                </label>
                <input
                  id="heading-range-slider"
                  type="range"
                  min="0"
                  max="359"
                  value={Math.round(effectiveHeading)}
                  onChange={(e) => onChangeHeading(Number(e.target.value), 'manual')}
                  className="compass-range-input"
                />
              </div>

              <div className="compass-reference-row">
                <button
                  type="button"
                  className={`compass-follow-btn ${followUser ? 'is-active' : ''}`}
                  onClick={onToggleFollowUser}
                  aria-pressed={followUser}
                >
                  <Navigation size={14} aria-hidden="true" />
                  <span>
                    {followUser ? 'Siguiendo mis pasos ✓' : 'Mantener mapa centrado en mí'}
                  </span>
                </button>

                <button
                  type="button"
                  className="compass-center-btn"
                  onClick={onCenterOnUser}
                  title="Centrar el mapa en mí ahora"
                >
                  <Compass size={14} aria-hidden="true" />
                  <span>Ir a mí</span>
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </aside>
  );
}
