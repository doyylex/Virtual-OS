import { stripLockedExtension } from '../services/fileNames.js';

export function DesktopIcon({
  draftName,
  isDragging,
  isEditing,
  isSelected,
  label,
  dropFolderId,
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
  renameExtension = '',
  tone,
}) {
  return (
    <button
      className="ros-desktop-icon"
      data-dragging={isDragging ? 'true' : 'false'}
      data-editing={isEditing ? 'true' : 'false'}
      data-drop-folder-id={dropFolderId}
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
        <span className="ros-inline-rename-field ros-desktop-rename-field">
          <input
            className="ros-desktop-icon-input"
            value={draftName}
            autoFocus
            spellCheck="false"
            aria-label={`Rename ${label}`}
            onBlur={onRenameBlur}
            onChange={(event) => onRenameChange(stripLockedExtension(event.target.value, renameExtension))}
            onClick={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
            onFocus={(event) => event.target.select()}
            onKeyDown={onRenameKeyDown}
            onPointerDown={(event) => event.stopPropagation()}
          />
          {renameExtension ? <span className="ros-extension-suffix">{renameExtension}</span> : null}
        </span>
      ) : (
        <span className="ros-desktop-icon-label">{label}</span>
      )}
    </button>
  );
}
