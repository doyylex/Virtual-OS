import { SystemDialog } from './SystemDialog.jsx';

export function ConfirmDialog({ dialog, onResolve }) {
  const handleCancel = () => onResolve(false);
  const handleConfirm = () => onResolve(true);

  return (
    <SystemDialog
      dialog={dialog}
      onCancel={handleCancel}
      actions={
        <>
          <button className="ros-system-dialog-button" type="button" autoFocus onClick={handleConfirm}>
            {dialog.confirmLabel}
          </button>
          <button className="ros-system-dialog-button" type="button" onClick={handleCancel}>
            {dialog.cancelLabel}
          </button>
        </>
      }
    >
      <p>{dialog.message}</p>
      {dialog.detail ? <small>{dialog.detail}</small> : null}
    </SystemDialog>
  );
}
