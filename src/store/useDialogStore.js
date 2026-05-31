import { create } from 'zustand';

const createDialogId = () => `dialog-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

const createDialog = (kind, options, resolve) => ({
  id: createDialogId(),
  kind,
  title: options.title ?? (kind === 'confirm' ? 'Confirmar accion' : 'Entrada requerida'),
  message: options.message ?? '',
  detail: options.detail ?? '',
  label: options.label ?? '',
  defaultValue: options.defaultValue ?? '',
  initialFolderId: options.initialFolderId ?? 'documents',
  lockedExtension: options.lockedExtension ?? '',
  placeholder: options.placeholder ?? '',
  confirmLabel: options.confirmLabel ?? 'Aceptar',
  cancelLabel: options.cancelLabel ?? 'Cancelar',
  icon: options.icon ?? (kind === 'confirm' ? 'question' : 'info'),
  allowEmpty: options.allowEmpty ?? false,
  blockedFolderIds: options.blockedFolderIds ?? [],
  choices: options.choices ?? [],
  cancelValue: options.cancelValue ?? null,
  validate: options.validate,
  resolve,
});

const getDialogCancelValue = (dialog) => {
  if (dialog.kind === 'confirm') {
    return false;
  }

  if (dialog.kind === 'alert') {
    return true;
  }

  if (dialog.kind === 'choice') {
    return dialog.cancelValue;
  }

  return null;
};

export const useDialogStore = create((set, get) => ({
  dialogs: [],

  showConfirm: (options = {}) =>
    new Promise((resolve) => {
      const dialog = createDialog('confirm', options, resolve);
      set((state) => ({ dialogs: [...state.dialogs, dialog] }));
    }),

  showPrompt: (options = {}) =>
    new Promise((resolve) => {
      const dialog = createDialog('prompt', options, resolve);
      set((state) => ({ dialogs: [...state.dialogs, dialog] }));
    }),

  showAlert: (options = {}) =>
    new Promise((resolve) => {
      const dialog = createDialog('alert', options, resolve);
      set((state) => ({ dialogs: [...state.dialogs, dialog] }));
    }),

  showChoiceDialog: (options = {}) =>
    new Promise((resolve) => {
      const dialog = createDialog('choice', options, resolve);
      set((state) => ({ dialogs: [...state.dialogs, dialog] }));
    }),

  showSaveFileDialog: (options = {}) =>
    new Promise((resolve) => {
      const dialog = createDialog('saveFile', options, resolve);
      set((state) => ({ dialogs: [...state.dialogs, dialog] }));
    }),

  resolveDialog: (dialogId, value) => {
    const dialog = get().dialogs.find((candidate) => candidate.id === dialogId);

    if (!dialog) {
      return;
    }

    set((state) => ({
      dialogs: state.dialogs.filter((candidate) => candidate.id !== dialogId),
    }));
    dialog.resolve(value);
  },

  closeTopDialog: () => {
    const dialog = get().dialogs.at(-1);

    if (!dialog) {
      return;
    }

    get().resolveDialog(dialog.id, getDialogCancelValue(dialog));
  },
}));
