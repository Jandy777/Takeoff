import React,{useEffect,useState} from "react";
import {builderKey} from "../library/builders";

function BuilderRow({item,directory,canEdit}) {
  const [editing,setEditing]=useState(false),[name,setName]=useState(item.name),[removing,setRemoving]=useState(false);
  useEffect(()=>{setName(item.name);},[item.name]);
  async function save(){try{await directory.rename(item.id,name);setEditing(false);}catch{}}
  return <li className="builder-row">
    {editing?<><input aria-label={`Rename ${item.name}`} value={name} maxLength={160} onChange={event=>setName(event.target.value)} disabled={directory.busy}/><button type="button" className="library-button" disabled={directory.busy||!name.trim()} onClick={save}>Save name</button><button type="button" className="library-button" disabled={directory.busy} onClick={()=>{setName(item.name);setEditing(false);}}>Cancel</button></>:<><strong>{item.name}</strong>{canEdit&&!removing&&<><button type="button" className="library-button" disabled={directory.busy} onClick={()=>setEditing(true)} aria-label={`Edit ${item.name}`}>Edit</button><button type="button" className="library-button" disabled={directory.busy} onClick={()=>setRemoving(true)} aria-label={`Remove ${item.name}`}>Remove</button></>}</>}
    {removing&&<div className="builder-remove"><p>Remove {item.name} from verified choices? Existing drawings keep their recorded name.</p><button type="button" className="library-button" disabled={directory.busy} onClick={()=>directory.remove(item.id).catch(()=>{})}>Remove from list</button><button type="button" className="library-button" disabled={directory.busy} onClick={()=>setRemoving(false)}>Keep</button></div>}
  </li>;
}
export function BuilderManager({directory,canEdit}) {
  const [name,setName]=useState(""),[query,setQuery]=useState("");
  async function add(){try{await directory.add(name);setName("");}catch{}}
  const items=(directory.items||[]).filter(item=>builderKey(item.name).includes(builderKey(query)));
  return <section className="builder-manager" aria-label="Verified customers and builders" onKeyDown={event=>{if(event.key==='Enter'&&event.target.tagName==='INPUT')event.preventDefault();}}>
    <p>Shared company list. Renaming or removing a choice keeps names already recorded on drawings.</p>
    <div className="builder-controls"><label>Find a company<input type="search" value={query} onChange={event=>setQuery(event.target.value)} /></label><button type="button" className="library-button" disabled={directory.busy} onClick={directory.refresh}>Refresh list</button></div>
    {canEdit&&<div className="builder-controls"><label>New customer / builder<input value={name} maxLength={160} onChange={event=>setName(event.target.value)} disabled={directory.busy}/></label><button type="button" className="library-button" disabled={directory.busy||!name.trim()} onClick={add}>Add company</button></div>}
    {directory.error&&<p className="library-error" role="alert">{directory.error}</p>}
    {!directory.loaded&&!directory.error&&<p role="status">Loading verified companies…</p>}
    <ul>{items.map(item=><BuilderRow key={item.id} item={item} directory={directory} canEdit={canEdit}/>)}</ul>
    {directory.loaded&&!items.length&&<p>No matching companies.</p>}
  </section>;
}
