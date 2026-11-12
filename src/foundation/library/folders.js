import { DETAIL_FIELDS } from "./documents";

const clean = (value) => String(value || "").trim();
export const folderKey = (parts) => JSON.stringify(parts.map((part) => clean(part).toLocaleLowerCase()));
export function buildFolders(drawings, kind = "all") {
  const root = { key: "root", name: "All drawings", path: [], children: [], drawings: [], count: 0 };
  for (const drawing of drawings) {
    if (["custom", "tract"].includes(kind) && drawing.job_type !== kind) continue;
    const parts = [clean(drawing.customer_name) || "Unspecified customer", clean(drawing.project_name) || "Untitled project"];
    if (clean(drawing.model_name)) parts.push(clean(drawing.model_name));
    if (clean(drawing.elevation)) parts.push(`Elevation ${clean(drawing.elevation)}`);
    let node = root;
    node.count++;
    for (let index = 0; index < parts.length; index++) {
      const path = parts.slice(0, index + 1), key = folderKey(path);
      let child = node.children.find((item) => item.key === key);
      if (!child) { child = { key, name: parts[index], path, children: [], drawings: [], count: 0 }; node.children.push(child); }
      node = child; node.count++;
    }
    node.drawings.push(drawing);
  }
  const sort = (node) => {
    node.children.sort((a,b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));
    node.drawings.sort((a,b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")));
    node.children.forEach(sort);
  };
  sort(root); return root;
}
export function resolveFolder(root, path) {
  let node = root;
  for (let i = 0; i < path.length; i++) {
    const child = node.children.find((item) => item.key === folderKey(path.slice(0, i + 1)));
    if (!child) break;
    node = child;
  }
  return node;
}
export function searchDrawings(drawings, query, kind = "all") {
  const term = clean(query).toLocaleLowerCase();
  return drawings.filter((drawing) => (!["custom","tract"].includes(kind) || drawing.job_type === kind)
    && DETAIL_FIELDS.some((field) => clean(drawing[field]).toLocaleLowerCase().includes(term)))
    .sort((a,b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")));
}
export function drawingPath(drawing) {
  return [drawing.customer_name, drawing.project_name, drawing.model_name, drawing.elevation && `Elevation ${drawing.elevation}`].filter(Boolean);
}
