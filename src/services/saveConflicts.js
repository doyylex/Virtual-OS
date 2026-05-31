export const findNameConflict = (nodes, folderId, name, ignoredNodeId = null) => {
  const cleanName = String(name ?? '').trim().toLowerCase();

  if (!cleanName) {
    return null;
  }

  return nodes.find((node) =>
    node.parentId === folderId &&
    node.id !== ignoredNodeId &&
    node.name.toLowerCase() === cleanName,
  ) ?? null;
};

export const resolveSaveConflict = ({ conflictNode, fileName, showChoiceDialog, title }) => {
  if (!conflictNode) {
    return 'create';
  }

  const isFileConflict = conflictNode.type === 'file';
  const conflictTypeLabel = isFileConflict ? 'un archivo' : 'una carpeta';

  return showChoiceDialog({
    title,
    message: `Ya existe ${conflictTypeLabel} llamado "${fileName}".`,
    detail: isFileConflict
      ? 'Quieres sobrescribirlo o guardar una copia con otro nombre?'
      : 'No se puede sobrescribir una carpeta desde esta app. Puedes guardar una copia con otro nombre.',
    icon: 'warning',
    cancelValue: 'cancel',
    choices: [
      ...(isFileConflict ? [{ label: 'Sobrescribir', value: 'overwrite', autoFocus: true }] : []),
      { label: 'Crear copia', value: 'copy', autoFocus: !isFileConflict },
      { label: 'Cancelar', value: 'cancel' },
    ],
  });
};
