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
  const conflictTypeLabel = isFileConflict ? 'a file' : 'a folder';

  return showChoiceDialog({
    title,
    message: `There is already ${conflictTypeLabel} named "${fileName}".`,
    detail: isFileConflict
      ? 'Do you want to overwrite it or save a copy with another name?'
      : 'This app cannot overwrite a folder. You can save a copy with another name.',
    icon: 'warning',
    cancelValue: 'cancel',
    choices: [
      ...(isFileConflict ? [{ label: 'Overwrite', value: 'overwrite', autoFocus: true }] : []),
      { label: 'Create Copy', value: 'copy', autoFocus: !isFileConflict },
      { label: 'Cancel', value: 'cancel' },
    ],
  });
};
