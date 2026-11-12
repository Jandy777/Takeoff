import { convertLegacyCad } from "./legacyCad";

self.onmessage = ({data}) => {
  try { self.postMessage({result:convertLegacyCad(data.text,{units:"inches"})}); }
  catch (error) { self.postMessage({error:error.message || "This CAD file could not be converted."}); }
};
