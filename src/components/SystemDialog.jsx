export function SystemDialog({ actions, children, dialog, onCancel }) {
  return (
    <div
      className="ros-system-dialog-shell"
      data-kind={dialog.kind}
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${dialog.id}-title`}
      onClick={(event) => event.stopPropagation()}
    >
      <header className="ros-system-dialog-titlebar">
        <span id={`${dialog.id}-title`}>{dialog.title}</span>
        <button className="ros-system-dialog-close" type="button" aria-label="Close" onClick={onCancel}>
          X
        </button>
      </header>
      <div className="ros-system-dialog-body">
        <span className="ros-system-dialog-icon" data-icon={dialog.icon} aria-hidden="true" />
        <div className="ros-system-dialog-content">{children}</div>
      </div>
      <footer className="ros-system-dialog-actions">{actions}</footer>
    </div>
  );
}
