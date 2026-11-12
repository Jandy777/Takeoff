import React, { useMemo } from "react";
import { FolderSimple, File, CaretDown, CaretRight, MagnifyingGlass, ArrowSquareOut, Plus, ArrowClockwise, House, Users, User, SignOut } from "@phosphor-icons/react";
import { buildFolders, resolveFolder, searchDrawings, drawingPath } from "../library/folders";
import { drawingTitle } from "../library/documents";
import { useDrawingPreview } from "../hooks/useDrawingPreview";
import { useLibraryNavigation } from "../hooks/useLibraryNavigation";
import { DrawingPreview } from "./DrawingPreview";
import { TakeoffTeam } from "./TakeoffTeam";
import { TakeoffAccount } from "./TakeoffAccount";
import { AuthReturnNotice } from "./AuthReturnNotice";

const date = (value) => value && Number.isFinite(new Date(value).getTime()) ? new Date(value).toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"}) : "Not recorded";
const labels = {all:"All drawings", custom:"Custom jobs", tract:"Tract homes", builders:"Builders", team:"Your team", account:"Your account"};
function FolderTree({ nodes, current, expanded, onToggle, onNavigate }) {
  return <ul className="folder-tree">{nodes.map((node) => <li key={node.key}><div className={current.key===node.key ? "folder-tree-row selected" : "folder-tree-row"}>
    <button type="button" className="folder-disclosure" aria-label={`${expanded.has(node.key)?"Collapse":"Expand"} ${node.name}`} aria-expanded={expanded.has(node.key)} onClick={()=>onToggle(node.key)} disabled={!node.children.length}>{node.children.length ? expanded.has(node.key)?<CaretDown/>:<CaretRight/> : null}</button>
    <button type="button" className="folder-tree-name" title={node.name} aria-current={current.key===node.key ? "location" : undefined} onClick={()=>onNavigate(node.path)}><FolderSimple/><span>{node.name}</span></button>
  </div>{node.children.length>0 && expanded.has(node.key) && <FolderTree nodes={node.children} current={current} expanded={expanded} onToggle={onToggle} onNavigate={onNavigate}/>}</li>)}</ul>;
}
function Inspector({ drawing, library, account, previewLoader }) {
  const preview = useDrawingPreview(drawing, account.session.user.id, previewLoader);
  return <aside className="drawing-inspector" aria-label="Drawing details">
    {!drawing ? <div className="inspector-empty"><File size={38}/><h2>Drawing details</h2><p>Select a drawing to preview its plan and project information.</p></div> : <>
      <h2>{drawingTitle(drawing)}</h2>
      <div className="drawing-preview">{preview.loading ? <p role="status">Loading saved plan…</p> : preview.error ? <div><p role="alert">{preview.error}</p><button className="library-button" onClick={preview.retry}>Retry preview</button></div> : <DrawingPreview record={preview.record}/>}</div>
      <dl>{[["Builder / customer",drawing.customer_name],["Project",drawing.project_name],["City",drawing.city],["Estimator",drawing.estimator_name]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value||"Not entered"}</dd></div>)}</dl>
      <dl className="inspector-revision">{[["Print / revision",drawing.print_revision],["Last saved",date(drawing.updated_at)],["Drawing type",drawing.job_type==="tract"?"Tract home":"Custom job"]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value||"Not entered"}</dd></div>)}</dl>
      {drawing.locked && <p className="inspector-preserved">Preserved revision · opens view-only</p>}
      <button className="library-button primary inspector-open" disabled={library.busy} onClick={()=>library.openDrawing(drawing.id)}><ArrowSquareOut/> Open drawing</button>
    </>}
  </aside>;
}

export function LibraryWorkspace({ library, account, hasUnfiledDrawing, previewLoader }) {
  const {section,setSection,path,setPath,query,setQuery,selectedId,setSelectedId,expanded,setExpanded}=useLibraryNavigation(account.session.user.id);
  const tree=useMemo(()=>buildFolders(library.drawings,section),[library.drawings,section]);
  const current=resolveFolder(tree,path), searching=Boolean(query.trim());
  const files=searching?searchDrawings(library.drawings,query,section):current.drawings;
  const selected=files.find((item)=>item.id===selectedId);
  const siblings=current.path.length>=3?resolveFolder(tree,current.path.slice(0,2)).children.filter((node)=>node.path[2]!==current.path[2]):[];
  const special=["team","account"].includes(section);
  function navigate(next) {
    setPath(next); setQuery(""); setSelectedId(null);
    setExpanded((previous)=>{const result=new Set(previous); let node=tree; for(const part of next){node=node.children.find((item)=>item.name.toLocaleLowerCase()===part.toLocaleLowerCase());if(!node)break;result.add(node.key);} return result;});
  }
  function chooseSection(next){setSection(next);setPath([]);setQuery("");setSelectedId(null);}
  function toggle(key){setExpanded((previous)=>{const next=new Set(previous);if(next.has(key))next.delete(key);else next.add(key);return next;});}
  return <div className="library-layout folder-library" {...(library.modal ? {inert:"","aria-hidden":true}:{})}>
    <aside className="library-sidebar explorer-sidebar">
      <a className="library-brand" href="#" onClick={(e)=>{e.preventDefault();chooseSection("all");}}><svg viewBox="0 0 34 34" aria-hidden="true"><path d="M4 5h26v24H20v-9h-6v9H4z"/><path d="M10 5v9h20"/></svg><span>TAKEOFF<small>WEST SUBURBAN CONCRETE</small></span></a>
      <span className="sidebar-label">WORKSPACE</span><nav aria-label="Library navigation">{["all","custom","tract","builders"].map((key)=><button key={key} className={section===key?"active":""} aria-current={section===key?"page":undefined} onClick={()=>chooseSection(key)}>{key==="all"?<File/>:<FolderSimple/>}{labels[key]}</button>)}</nav>
      {!special && <div className="explorer-tree"><span className="sidebar-label">BROWSE BUILDERS</span><FolderTree nodes={tree.children} current={current} expanded={expanded} onToggle={toggle} onNavigate={navigate}/>{!tree.count && <p className="library-muted">Folders appear when drawings are saved.</p>}</div>}
      <div className="explorer-account"><nav aria-label="Account navigation"><button onClick={()=>chooseSection("account")} className={section==="account"?"active":""}><User/> Your account</button>{account.isAdmin && <button onClick={()=>chooseSection("team")} className={section==="team"?"active":""}><Users/> Team access</button>}</nav><div className="explorer-signed-in"><span title={account.session.user.email}>{account.session.user.email}</span><button aria-label="Sign out" title="Sign out" disabled={library.busy} onClick={library.signOut}><SignOut/></button></div></div>
    </aside>
    <main className="library-main explorer-main">
      <div className="explorer-top"><span>{special?labels[section]:"Folder Explorer"}</span>{!special && <label className="library-search"><MagnifyingGlass/><input type="search" aria-label="Search drawings" value={query} onChange={(event)=>{setQuery(event.target.value);setSelectedId(null);}} placeholder="Search drawings, projects, or builders…"/></label>}</div>
      {library.error && !library.modal && <p className="library-error" role="alert">{library.error}</p>}<AuthReturnNotice account={account}/>
      {library.recovery && !library.modal && <div className="library-recovery"><div><strong>A recovery draft is available on this device.</strong><p>{library.recovery.project_name} · {library.recovery.print_revision}</p></div>{account.canEdit && <button className="library-button" disabled={library.busy} onClick={library.restoreRecovery}>Recover drawing</button>}<button className="library-button" onClick={()=>library.exportBackup(library.recovery)}>Export backup</button></div>}
      {special ? section==="account"?<TakeoffAccount account={account}/>:account.isAdmin?<TakeoffTeam account={account}/>:<p>Administrator access is required.</p> : <>
        <nav className="folder-breadcrumb" aria-label="Folder breadcrumb"><button onClick={()=>navigate([])} aria-label="Library root"><House/></button><button onClick={()=>navigate([])}>{labels[section]}</button>{current.path.map((part,index)=><React.Fragment key={index}><CaretRight/><button onClick={()=>navigate(current.path.slice(0,index+1))}>{part}</button></React.Fragment>)}</nav>
        <header className="library-page-header explorer-heading"><div><h1>{searching?"Search results":current.path.length>=4?`${current.path[current.path.length-2]} · ${current.name}`:current.path.length?current.name:labels[section]}</h1><p className="library-muted">{searching?`${files.length} matching drawings across ${labels[section].toLowerCase()}`:`${current.count} drawing${current.count===1?"":"s"}${current.children.length?` · ${current.children.length} folder${current.children.length===1?"":"s"}`:""}`}</p></div><div className="explorer-actions"><button className="library-button" aria-label="Refresh drawings" disabled={library.busy} onClick={library.refresh}><ArrowClockwise/></button>{account.canEdit && <><button className="library-button" disabled={library.busy} onClick={()=>library.setModal("import")}>Import CAD drawing</button><button className="library-button primary" disabled={library.busy} onClick={()=>library.setModal("create")}><Plus/> New drawing</button></>}</div></header>
        {(library.active || (hasUnfiledDrawing && account.canEdit)) && <div className="explorer-resume"><span>{library.active ? `${library.active.project_name} · ${library.active.print_revision}` : "An unfiled drawing is open"}</span><button className="library-button" onClick={()=>library.active?library.setOpen(false):library.setModal("capture")}>{library.active?"Continue drawing":"Save open drawing"}</button></div>}
        <div className="explorer-list">
          {!searching && current.children.map((folder)=><button className="explorer-folder" key={folder.key} onClick={()=>navigate(folder.path)}><FolderSimple/><span>{folder.name}</span><small>{folder.count} drawing{folder.count===1?"":"s"}</small><CaretRight/></button>)}
          {files.length>0 && <><div className="explorer-file-labels"><span>Drawing</span><span>Print / revision</span><span>Estimator</span><span>Last saved</span></div>{files.map((drawing)=><button className={`explorer-file${selectedId===drawing.id?" selected":""}`} key={drawing.id} aria-pressed={selectedId===drawing.id} disabled={library.busy} onClick={()=>setSelectedId(drawing.id)} onDoubleClick={()=>library.openDrawing(drawing.id)}><span className="explorer-file-title"><File/><span><strong>{drawingTitle(drawing)}</strong>{searching && <small>{drawingPath(drawing).join(" / ")}</small>}{drawing.locked && <small className="revision-preserved">Preserved revision</small>}</span></span><span>{drawing.print_revision}</span><span>{drawing.estimator_name||"—"}</span><span>{date(drawing.updated_at)}</span></button>)}</>}
          {!files.length && (searching || !current.children.length) && <div className="library-empty"><FolderSimple size={40}/><h2>{searching?"No matching drawings":"Every job starts with a drawing"}</h2><p className="library-muted">{searching?"Try a customer, project, city, estimator, model, elevation, or revision.":"Saved drawings appear in folders organized by their project details."}</p>{account.canEdit && !searching && <button className="library-button primary" onClick={()=>library.setModal("create")}>Create your first drawing</button>}</div>}
        </div>{!searching && siblings.length>0 && <section className="explorer-siblings"><h2>Other models in this project</h2>{siblings.map((node)=><button className="explorer-folder" key={node.key} onClick={()=>navigate(node.path)}><FolderSimple/><span>{node.name}</span><small>{node.count} drawing{node.count===1?"":"s"}</small><CaretRight/></button>)}</section>}<footer className="library-footer">Drawings and quantities · Blueprint PDFs stay in your existing file storage.</footer>
      </>}
    </main>
    {!special && <Inspector drawing={selected} library={library} account={account} previewLoader={previewLoader}/>}
  </div>;
}
