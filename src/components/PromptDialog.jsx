import { useEffect, useRef, useState } from 'react';
import { SystemDialog } from './SystemDialog.jsx';

export function PromptDialog({ dialog, onResolve }) {
  const [value, setValue] = useState(dialog.defaultValue);
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const handleCancel = () => onResolve(null);

  const handleConfirm = () => {
    const nextValue = value.trim();

    if (!dialog.allowEmpty && !nextValue) {
      setError('Ingresa un valor.');
      return;
    }

    const validationMessage = dialog.validate?.(nextValue);

    if (validationMessage) {
      setError(validationMessage);
      return;
    }

    onResolve(nextValue);
  };

  return (
    <SystemDialog
      dialog={dialog}
      onCancel={handleCancel}
      actions={
        <>
          <button className="ros-system-dialog-button" type="button" onClick={handleConfirm}>
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
      <label className="ros-system-dialog-field">
        {dialog.label ? <span>{dialog.label}</span> : null}
        <input
          ref={inputRef}
          value={value}
          placeholder={dialog.placeholder}
          aria-invalid={error ? 'true' : 'false'}
          onChange={(event) => {
            setValue(event.target.value);
            setError('');
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              handleConfirm();
            }
          }}
        />
      </label>
      {error ? <em>{error}</em> : null}
    </SystemDialog>
  );
}
