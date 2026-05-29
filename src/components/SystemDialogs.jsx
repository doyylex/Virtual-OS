import { useEffect } from 'react';
import { useDialogStore } from '../store/useDialogStore.js';
import { AlertDialog } from './AlertDialog.jsx';
import { ConfirmDialog } from './ConfirmDialog.jsx';
import { PromptDialog } from './PromptDialog.jsx';
import { SaveFileDialog } from './SaveFileDialog.jsx';

export function SystemDialogs() {
  const dialogs = useDialogStore((state) => state.dialogs);
  const resolveDialog = useDialogStore((state) => state.resolveDialog);
  const closeTopDialog = useDialogStore((state) => state.closeTopDialog);
  const activeDialog = dialogs.at(-1) ?? null;

  useEffect(() => {
    if (!activeDialog) {
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeTopDialog();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [activeDialog, closeTopDialog]);

  if (!activeDialog) {
    return null;
  }

  const handleResolve = (value) => resolveDialog(activeDialog.id, value);
  const dialogComponentByKind = {
    alert: <AlertDialog dialog={activeDialog} onResolve={handleResolve} />,
    confirm: <ConfirmDialog dialog={activeDialog} onResolve={handleResolve} />,
    prompt: <PromptDialog dialog={activeDialog} onResolve={handleResolve} />,
    saveFile: <SaveFileDialog dialog={activeDialog} onResolve={handleResolve} />,
  };

  return (
    <div className="ros-system-dialog-layer" onClick={closeTopDialog}>
      {dialogComponentByKind[activeDialog.kind] ?? dialogComponentByKind.alert}
    </div>
  );
}
