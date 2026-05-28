export function DesktopIcon({
  draftName,
  isDragging,
  isEditing,
  isSelected,
  label,
  onContextMenu,
  onFocus,
  onKeyDown,
  onOpen,
  onPointerDown,
  onRenameBlur,
  onRenameChange,
  onRenameKeyDown,
  onSelect,
  position,
  tone,
}) {
  return (
    <button
      className="ros-desktop-icon"
      data-dragging={isDragging ? 'true' : 'false'}
      data-editing={isEditing ? 'true' : 'false'}
      data-selected={isSelected ? 'true' : 'false'}
      type="button"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
      }}
      onClick={onSelect}
      onContextMenu={onContextMenu}
      onDoubleClick={onOpen}
      onFocus={onFocus}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      aria-pressed={isSelected}
    >
      <span className="ros-icon-shell" data-tone={tone} aria-hidden="true">
        <span className="ros-icon-mark" />
      </span>
      {isEditing ? (
        <input
          className="ros-desktop-icon-input"
          value={draftName}
          autoFocus
          spellCheck="false"
          aria-label={`Renombrar ${label}`}
          onBlur={onRenameBlur}
          onChange={(event) => onRenameChange(event.target.value)}
          onClick={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
          onFocus={(event) => event.target.select()}
          onKeyDown={onRenameKeyDown}
          onPointerDown={(event) => event.stopPropagation()}
        />
      ) : (
        <span className="ros-desktop-icon-label">{label}</span>
      )}
    </button>
  );
}
