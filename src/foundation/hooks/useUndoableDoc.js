import { useCallback, useRef, useState } from "react";
import { clone } from "../geometry";
import { EMPTY_DOC } from "../model";

// Owns the document (walls/pads/windows/areas/dims) plus whole-snapshot undo/redo.
// Every other hook receives `doc` and `apply` from here rather than touching
// document state directly, so this stays the single source of truth for mutation.
export function useUndoableDoc() {
  const [doc, setDoc] = useState(EMPTY_DOC);

  const undoRef = useRef([]);
  const redoRef = useRef([]);

  const pushUndo = useCallback((snapshot) => {
    undoRef.current.push(clone(snapshot));
    if (undoRef.current.length > 50) undoRef.current.shift();
    redoRef.current = [];
  }, []);

  const apply = useCallback(
    (fn) => {
      pushUndo(doc);
      setDoc((d) => fn(clone(d)) || d);
    },
    [doc, pushUndo]
  );

  const doUndo = useCallback(() => {
    if (!undoRef.current.length) return false;
    setDoc((cur) => {
      redoRef.current.push(cur);
      return undoRef.current.pop();
    });
    return true;
  }, []);

  const doRedo = useCallback(() => {
    if (!redoRef.current.length) return false;
    setDoc((cur) => {
      undoRef.current.push(cur);
      return redoRef.current.pop();
    });
    return true;
  }, []);

  const clearDoc = useCallback(() => {
    apply(() => clone(EMPTY_DOC));
  }, [apply]);

  return { doc, setDoc, apply, pushUndo, doUndo, doRedo, clearDoc };
}
