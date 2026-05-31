const recycleBinFolderId = 'recycle-bin-folder';

export const getFileExtension = (name = '') => {
  const cleanName = String(name ?? '').trim();
  const extensionIndex = cleanName.lastIndexOf('.');

  return extensionIndex > 0 ? cleanName.slice(extensionIndex).toLowerCase() : '';
};

export const isTextFileName = (name = '') => getFileExtension(name) === '.txt';

export const isImageFileName = (name = '') => ['.png'].includes(getFileExtension(name));

export const getNodeTypeLabel = (node) => {
  if (node?.id === recycleBinFolderId) {
    return 'Recycle Bin';
  }

  if (node?.type === 'folder') {
    return 'Folder';
  }

  if (isImageFileName(node?.name)) {
    return 'PNG image';
  }

  return 'Text file';
};

export const getExplorerNodeIconType = (node, trashItemCount = 0) => {
  if (node?.id === recycleBinFolderId) {
    return trashItemCount > 0 ? 'trash-full' : 'trash';
  }

  if (node?.type === 'file') {
    return isImageFileName(node.name) ? 'image' : 'file';
  }

  return 'folder';
};

export const getNodeIconTone = (node, trashItemCount = 0) => {
  const iconType = getExplorerNodeIconType(node, trashItemCount);

  if (iconType === 'file') {
    return 'notepad';
  }

  return iconType;
};
