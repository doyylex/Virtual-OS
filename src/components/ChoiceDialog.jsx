import { SystemDialog } from './SystemDialog.jsx';

export function ChoiceDialog({ dialog, onResolve }) {
  const handleCancel = () => onResolve(dialog.cancelValue);

  return (
    <SystemDialog
      dialog={dialog}
      onCancel={handleCancel}
      actions={dialog.choices.map((choice) => (
        <button
          className="ros-system-dialog-button"
          key={choice.value}
          type="button"
          autoFocus={choice.autoFocus}
          onClick={() => onResolve(choice.value)}
        >
          {choice.label}
        </button>
      ))}
    >
      <p>{dialog.message}</p>
      {dialog.detail ? <small>{dialog.detail}</small> : null}
    </SystemDialog>
  );
}
