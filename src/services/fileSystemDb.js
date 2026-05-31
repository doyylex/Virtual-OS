const DB_NAME = 'roso-os-file-system';
const DB_VERSION = 3;
const NODE_STORE_NAME = 'nodes';
const DESKTOP_LAYOUT_STORE_NAME = 'desktopLayout';
const DESKTOP_LAYOUT_KEY = 'positions';
const DESKTOP_FOLDER_ID = 'desktop-folder';
const RECYCLE_BIN_FOLDER_ID = 'recycle-bin-folder';

const rootNodes = [
  {
    id: 'root',
    parentId: null,
    type: 'folder',
    name: 'C:',
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 'documents',
    parentId: 'root',
    type: 'folder',
    name: 'My Documents',
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: DESKTOP_FOLDER_ID,
    parentId: 'root',
    type: 'folder',
    name: 'Desktop',
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 'system-folder',
    parentId: 'root',
    type: 'folder',
    name: 'Roso OS',
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: RECYCLE_BIN_FOLDER_ID,
    parentId: 'root',
    type: 'folder',
    name: 'Recycle Bin',
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 'readme-file',
    parentId: 'documents',
    type: 'file',
    name: 'welcome.txt',
    content: 'Welcome to Roso OS.\\n\\nThis file lives in IndexedDB.',
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 'portfolio-file',
    parentId: 'documents',
    type: 'file',
    name: 'portfolio.txt',
    content: 'Portfolio under construction.\\nThis environment will soon have real projects and files.',
    createdAt: 0,
    updatedAt: 0,
  },
];

const requestToPromise = (request) =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const ensureObjectStores = (database) => {
  if (!database.objectStoreNames.contains(NODE_STORE_NAME)) {
    const store = database.createObjectStore(NODE_STORE_NAME, { keyPath: 'id' });
    store.createIndex('parentId', 'parentId', { unique: false });
  }

  if (!database.objectStoreNames.contains(DESKTOP_LAYOUT_STORE_NAME)) {
    database.createObjectStore(DESKTOP_LAYOUT_STORE_NAME, { keyPath: 'id' });
  }
};

const getValidTimestamp = (timestamp, fallback) => {
  const time = Number(timestamp);

  return Number.isFinite(time) && time > 0 ? time : fallback;
};

const protectedSystemNodeNames = {
  documents: 'My Documents',
  [DESKTOP_FOLDER_ID]: 'Desktop',
  [RECYCLE_BIN_FOLDER_ID]: 'Recycle Bin',
};

const seedFileMigrations = {
  'readme-file': {
    name: 'welcome.txt',
    content: 'Welcome to Roso OS.\\n\\nThis file lives in IndexedDB.',
  },
  'portfolio-file': {
    content: 'Portfolio under construction.\\nThis environment will soon have real projects and files.',
  },
};

const normalizeNode = (node, now) => {
  const createdAt = getValidTimestamp(node.createdAt, now);
  const updatedAt = getValidTimestamp(node.updatedAt, createdAt);
  const normalizedNode = {
    ...node,
    createdAt,
    updatedAt,
  };
  const protectedName = protectedSystemNodeNames[normalizedNode.id];
  const seedFileMigration = seedFileMigrations[normalizedNode.id];

  if (protectedName && normalizedNode.name !== protectedName) {
    normalizedNode.name = protectedName;
    normalizedNode.updatedAt = now;
  }

  if (seedFileMigration) {
    if (seedFileMigration.name && normalizedNode.name !== seedFileMigration.name) {
      normalizedNode.name = seedFileMigration.name;
      normalizedNode.updatedAt = now;
    }

    if (seedFileMigration.content && normalizedNode.content !== seedFileMigration.content) {
      normalizedNode.content = seedFileMigration.content;
      normalizedNode.updatedAt = now;
    }
  }

  if (normalizedNode.parentId === RECYCLE_BIN_FOLDER_ID) {
    normalizedNode.trashedAt = getValidTimestamp(normalizedNode.trashedAt, updatedAt);

    if (!normalizedNode.originalParentId || normalizedNode.originalParentId === RECYCLE_BIN_FOLDER_ID) {
      normalizedNode.originalParentId = DESKTOP_FOLDER_ID;
    }
  }

  return normalizedNode;
};

const haveNodesChanged = (nodes, normalizedNodes) =>
  nodes.length !== normalizedNodes.length ||
  normalizedNodes.some((node, index) => JSON.stringify(node) !== JSON.stringify(nodes[index]));

const withSystemNodes = (nodes) => {
  const now = Date.now();
  const normalizedNodes = nodes.map((node) => normalizeNode(node, now));
  const existingNodeIds = new Set(normalizedNodes.map((node) => node.id));
  const missingNodes = rootNodes
    .filter((node) => !existingNodeIds.has(node.id))
    .map((node) => ({
      ...node,
      createdAt: node.createdAt || now,
      updatedAt: node.updatedAt || now,
    }));

  return [...normalizedNodes, ...missingNodes];
};

const openDatabase = () =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      ensureObjectStores(request.result);
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const withStore = async (storeName, mode, callback) => {
  const database = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    const result = callback(store);

    transaction.oncomplete = () => {
      database.close();
      resolve(result);
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error);
    };
  });
};

export const createNodeId = () => `node-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export async function loadFileSystemNodes() {
  const database = await openDatabase();
  let nodes;

  try {
    const transaction = database.transaction(NODE_STORE_NAME, 'readonly');
    const store = transaction.objectStore(NODE_STORE_NAME);
    nodes = await requestToPromise(store.getAll());
  } finally {
    database.close();
  }

  if (nodes.length === 0) {
    return seedFileSystem();
  }

  const normalizedNodes = withSystemNodes(nodes);

  if (haveNodesChanged(nodes, normalizedNodes)) {
    await saveFileSystemNodes(normalizedNodes);
  }

  return normalizedNodes;
}

export async function seedFileSystem() {
  const now = Date.now();
  const seededNodes = rootNodes.map((node) => ({
    ...node,
    createdAt: node.createdAt || now,
    updatedAt: node.updatedAt || now,
  }));

  await withStore(NODE_STORE_NAME, 'readwrite', (store) => {
    seededNodes.forEach((node) => store.put(node));
  });

  return seededNodes;
}

export async function saveFileSystemNodes(nodes) {
  await withStore(NODE_STORE_NAME, 'readwrite', (store) => {
    store.clear();
    nodes.forEach((node) => store.put(node));
  });
}

export async function loadDesktopLayout() {
  const database = await openDatabase();

  try {
    const transaction = database.transaction(DESKTOP_LAYOUT_STORE_NAME, 'readonly');
    const store = transaction.objectStore(DESKTOP_LAYOUT_STORE_NAME);
    const layout = await requestToPromise(store.get(DESKTOP_LAYOUT_KEY));

    return layout?.positions ?? {};
  } finally {
    database.close();
  }
}

export async function saveDesktopLayout(positions) {
  await withStore(DESKTOP_LAYOUT_STORE_NAME, 'readwrite', (store) => {
    store.put({ id: DESKTOP_LAYOUT_KEY, positions });
  });
}
