import { splitFileName } from './fileNames.js';
import { isTextFileName } from './fileIcons.js';

export const normalizeSearchText = (value = '') =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

const getNodeNameSearchValues = (node) => {
  if (node?.type !== 'file') {
    return [node?.name ?? ''];
  }

  const { baseName } = splitFileName(node.name);

  return [node.name, baseName];
};

export const nodeMatchesSearchQuery = (node, normalizedQuery, extraValues = []) => {
  if (!normalizedQuery) {
    return false;
  }

  const searchableContent = node?.type === 'file' && isTextFileName(node.name) ? node.content : '';

  return [...getNodeNameSearchValues(node), node?.type, searchableContent, ...extraValues].some((value) =>
    normalizeSearchText(value).includes(normalizedQuery),
  );
};

export const getNodeSearchRank = (node, normalizedQuery) => {
  const normalizedNames = getNodeNameSearchValues(node).map((value) => normalizeSearchText(value));

  if (normalizedNames.some((value) => value === normalizedQuery)) {
    return 0;
  }

  if (normalizedNames.some((value) => value.startsWith(normalizedQuery))) {
    return 1;
  }

  if (normalizedNames.some((value) => value.includes(normalizedQuery))) {
    return 2;
  }

  return nodeMatchesSearchQuery(node, normalizedQuery) ? 3 : 4;
};
