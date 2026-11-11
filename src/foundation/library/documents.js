import { EMPTY_DOC } from "../model";

export const DETAIL_FIELDS = ["customer_name", "project_name", "city", "estimator_name", "print_revision", "model_name", "elevation", "job_type"];
export const BLANK_DETAILS = { customer_name: "", project_name: "", city: "", estimator_name: "", print_revision: "", model_name: "", elevation: "", job_type: "custom" };

export function cleanDetails(details) {
  const result = Object.fromEntries(DETAIL_FIELDS.map((key) => [key, String(details[key] || "").trim()]));
  if (!result.customer_name || !result.project_name || !result.print_revision) throw new Error("Enter a customer, project, and print date or revision.");
  if (DETAIL_FIELDS.some((key) => result[key].length > 160)) throw new Error("Keep each drawing detail under 160 characters.");
  if (!["custom", "tract"].includes(result.job_type)) throw new Error("Choose a custom job or tract home.");
  return result;
}

export function readDocument(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("This drawing could not be opened.");
  if (data.schemaVersion && data.schemaVersion !== 1) throw new Error("This drawing uses a newer format. Update Takeoff before opening it.");
  const document = { schemaVersion: 1 };
  const ids = new Set();
  for (const key of Object.keys(EMPTY_DOC)) {
    if (data[key] != null && !Array.isArray(data[key])) throw new Error(`The saved ${key} data is invalid.`);
    document[key] = (data[key] || []).map((entity) => {
      if (!entity || !Number.isSafeInteger(entity.id) || entity.id < 1 || ids.has(entity.id)) throw new Error("The drawing contains invalid or repeated item identifiers.");
      ids.add(entity.id);
      return JSON.parse(JSON.stringify(entity));
    });
  }
  return document;
}

export function drawingPayload(document, rowColors) {
  return { document: readDocument(document), settings: { rowColors: { ...rowColors } } };
}

export function groupDrawings(drawings, query = "", kind = "all") {
  const term = query.trim().toLocaleLowerCase();
  const groups = new Map();
  for (const drawing of drawings) {
    if (kind !== "all" && drawing.job_type !== kind) continue;
    if (term && !DETAIL_FIELDS.map((key) => drawing[key]).join(" ").toLocaleLowerCase().includes(term)) continue;
    // An ID identifies a drawing; shared names never merge its saved contents.
    const key = JSON.stringify([drawing.customer_name.toLocaleLowerCase(), drawing.project_name.toLocaleLowerCase()]);
    if (!groups.has(key)) groups.set(key, { key, customer: drawing.customer_name, project: drawing.project_name, drawings: [] });
    groups.get(key).drawings.push(drawing);
  }
  return [...groups.values()];
}

export function drawingTitle(drawing) {
  return [drawing.model_name, drawing.elevation && `Elevation ${drawing.elevation}`].filter(Boolean).join(" · ") || "Custom foundation";
}
