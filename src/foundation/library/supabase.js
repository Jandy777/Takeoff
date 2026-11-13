import { createClient } from "@supabase/supabase-js";
import { authReturnNotice } from "./authReturn";
import { readAuthProviders } from "./socialAuth";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const initialAuthNotice = typeof window === "undefined" ? null : authReturnNotice(window.location.href);
export const supabase = url && key ? createClient(url, key) : null;
export const loadAuthProviders = () => readAuthProviders(url, key);

export const SUMMARY_COLUMNS = "id,customer_name,project_name,city,estimator_name,print_revision,model_name,elevation,job_type,parent_id,locked,version,created_at,updated_at";
function checked(result) {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}

export const drawingRepository = {
  async list() {
    return checked(await supabase.from("drawings").select(SUMMARY_COLUMNS).order("updated_at", { ascending: false }));
  },
  async open(id) {
    return checked(await supabase.from("drawings").select("*").eq("id", id).single());
  },
  async create(details, payload) {
    return checked(await supabase.from("drawings").insert({ ...details, ...payload }).select("*").single());
  },
  async save(id, version, payload) {
    const result = checked(await supabase.from("drawings").update(payload).eq("id", id).eq("version", version).select(SUMMARY_COLUMNS));
    if (!result.length) throw new Error("A newer version was saved by someone else, or your editing access changed. Your work is kept on this device. Export a backup before reopening the latest drawing.");
    return result[0];
  },
  async revise(id, version, details) {
    const result = checked(await supabase.rpc("new_drawing_revision", { source_id: id, expected_version: version, details }));
    return Array.isArray(result) ? result[0] : result;
  },
};

function builderChecked(result) {
  if(result.error?.code==='23505')throw Error("That customer / builder is already listed.");
  return checked(result);
}
export const builderRepository={
  async list(){return checked(await supabase.from("builders").select("id,name,active").eq("active",true).order("name"));},
  async add(name){return builderChecked(await supabase.from("builders").upsert({name,active:true},{onConflict:"name_key"}).select("id,name,active").single());},
  async rename(id,name){return builderChecked(await supabase.from("builders").update({name}).eq("id",id).select("id,name,active").single());},
  async remove(id){return checked(await supabase.from("builders").update({active:false}).eq("id",id).select("id").single());}
};
