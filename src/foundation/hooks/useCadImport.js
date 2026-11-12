import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MAX_CAD_BYTES, selectCadLayout } from "../library/legacyCad";

export function useCadImport() {
  const [state,setState] = useState({});
  const generation = useRef(0), worker = useRef(null);
  useEffect(() => () => { generation.current++; worker.current?.terminate(); }, []);
  const reset = useCallback(() => {
    generation.current++; worker.current?.terminate(); worker.current = null; setState({});
  }, []);
  const readFile = useCallback(async (file) => {
    const current = ++generation.current;
    worker.current?.terminate(); worker.current = null;
    if (!file) { setState({}); return; }
    if (!/\.dxf$/i.test(file.name)) { setState({error:"Choose a DXF file. Export DWG files as DXF from your CAD program first."}); return; }
    if (!file.size || file.size > MAX_CAD_BYTES) { setState({error:"Choose a nonempty DXF smaller than 10 MB."}); return; }
    setState({busy:true,sourceName:file.name});
    try {
      const text = await file.text();
      if (current !== generation.current) return;
      const task = new Worker(new URL("../library/cadImport.worker.js",import.meta.url),{type:"module"});
      worker.current = task;
      const finish = (next) => {
        task.terminate();
        if (current === generation.current) { worker.current = null; setState({sourceName:file.name,...next}); }
      };
      task.onmessage = ({data}) => finish(data.error ? {error:data.error} : {result:data.result,layoutId:data.result.conversion.layouts.length>1?"":"all"});
      task.onerror = () => finish({error:"Could not read this CAD file. Try selecting it again."});
      task.postMessage({text});
    } catch { if (current === generation.current) setState({error:"Could not read this file. Check that it is available on this device."}); }
  }, []);
  const selected = useMemo(()=>state.result ? selectCadLayout(state.result,state.layoutId) : null,[state.result,state.layoutId]);
  const chooseLayout = useCallback((layoutId)=>setState(previous=>({...previous,layoutId})),[]);
  return {...state,result:selected,preview:state.result,layouts:state.result?.conversion.layouts||[],chooseLayout,readFile,reset};
}
