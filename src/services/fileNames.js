export const normalizeExtension = (extension = '') => {
  const cleanExtension = extension.trim();

  if (!cleanExtension) {
    return '';
  }

  return cleanExtension.startsWith('.') ? cleanExtension : `.${cleanExtension}`;
};

export const splitFileName = (name = '') => {
  const trimmedName = name.trim();
  const extensionIndex = trimmedName.lastIndexOf('.');

  if (extensionIndex <= 0) {
    return { baseName: trimmedName, extension: '' };
  }

  return {
    baseName: trimmedName.slice(0, extensionIndex),
    extension: trimmedName.slice(extensionIndex),
  };
};

export const stripLockedExtension = (name = '', extension = '') => {
  const cleanName = name.trim();
  const cleanExtension = normalizeExtension(extension);

  if (!cleanExtension) {
    return cleanName;
  }

  return cleanName.toLowerCase().endsWith(cleanExtension.toLowerCase())
    ? cleanName.slice(0, -cleanExtension.length).trim()
    : cleanName;
};

export const joinFileName = (baseName = '', extension = '') => {
  const cleanExtension = normalizeExtension(extension);
  const cleanBaseName = stripLockedExtension(baseName, cleanExtension);

  return cleanExtension ? `${cleanBaseName}${cleanExtension}` : cleanBaseName;
};

export const getEditableNodeName = (node) => {
  if (node?.type !== 'file') {
    return { baseName: node?.name ?? '', extension: '' };
  }

  return splitFileName(node.name);
};
