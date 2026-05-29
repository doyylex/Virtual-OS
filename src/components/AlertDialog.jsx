import { SystemDialog } from './SystemDialog.jsx';

export function AlertDialog({ dialog, onResolve }) {
  const handleClose = () => onResolve(true);

  return (
    <SystemDialog
      dialog={dialog}
      onCancel={handleClose}
      actions={
        <button className="ros-system-dialog-button" type="button" autoFocus onClick={handleClose}>
          {dialog.confirmLabel}
        </button>
      }
    >
      <p>{dialog.message}</p>
      {dialog.detail ? <small>{dialog.detail}</small> : null}
    </SystemDialog>
  );
}
