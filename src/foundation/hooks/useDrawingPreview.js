import { useEffect, useState } from "react";
import { drawingRepository } from "../library/supabase";

export function useDrawingPreview(drawing, userId, loader = drawingRepository.open) {
  const [state, setState] = useState({});
  const [attempt, retry] = useState(0);
  const key = drawing ? JSON.stringify([userId, drawing.id, drawing.updated_at, attempt]) : "";
  useEffect(() => {
    if (!key) return;
    let live = true;
    Promise.resolve().then(() => loader(drawing.id)).then((record) => {
      if (live) setState({ key, record });
    }).catch((error) => { if (live) setState({ key, error: error.message }); });
    return () => { live = false; };
  }, [key, loader]);
  return { ...(state.key === key ? state : {}), loading: Boolean(key && state.key !== key), retry: () => retry((n) => n + 1) };
}
