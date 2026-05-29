const recycleBinFolderId = 'recycle-bin-folder';

export const getExplorerNodeIconType = (node, trashItemCount = 0) => {
  if (node?.id === recycleBinFolderId) {
    return trashItemCount > 0 ? 'trash-full' : 'trash';
  }

  return node?.type === 'file' ? 'file' : 'folder';
};
