const SECTIONS = ["all", "custom", "tract", "builders", "team", "account"];
const keyFor = (userId) => `takeoff.library-navigation.v1.${userId}`;

export function cleanLibraryNavigation(value) {
  const strings = (items) => Array.isArray(items) ? items.filter((item) => typeof item === "string").slice(0, 1000) : [];
  return {
    section: SECTIONS.includes(value?.section) ? value.section : "all",
    path: strings(value?.path).slice(0, 4),
    query: typeof value?.query === "string" ? value.query : "",
    selectedId: typeof value?.selectedId === "string" ? value.selectedId : null,
    expanded: strings(value?.expanded),
  };
}

export function readLibraryNavigation(userId, storage) {
  try { return cleanLibraryNavigation(userId ? JSON.parse(storage.getItem(keyFor(userId))) : null); }
  catch { return cleanLibraryNavigation(null); }
}

export function writeLibraryNavigation(userId, value, storage) {
  try { if (userId) storage.setItem(keyFor(userId), JSON.stringify(cleanLibraryNavigation(value))); }
  catch { /* Remembering a folder is optional when browser storage is unavailable. */ }
}
