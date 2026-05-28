export function DesktopContextMenu({ items, position }) {
  return (
    <div
      className="ros-context-menu"
      role="menu"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
      }}
      onClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      {items.map((item) =>
        item.type === 'separator' ? (
          <div className="ros-context-menu-separator" key={item.id} role="separator" />
        ) : (
          <button
            className="ros-context-menu-item"
            disabled={item.disabled}
            key={item.id}
            role="menuitem"
            type="button"
            onClick={item.onSelect}
          >
            <span>{item.label}</span>
            {item.hint ? <small>{item.hint}</small> : null}
          </button>
        ),
      )}
    </div>
  );
}
