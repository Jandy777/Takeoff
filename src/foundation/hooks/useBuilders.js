import {useCallback,useEffect,useRef,useState} from "react";
import {builderRepository} from "../library/supabase";
import {validateBuilderName,findBuilder} from "../library/builders";

export function useBuilders(account) {
  const userId=account.member?account.session?.user.id:null;
  const current=useRef(userId);current.current=userId;
  const request=useRef(0);
  const [state,setState]=useState({userId:null,items:[],loaded:false,busy:false,error:""});
  const refresh=useCallback(async()=>{
    if(!userId)return;
    const ticket=++request.current;
    try {
      const items=await builderRepository.list();
      if(current.current===userId&&ticket===request.current)setState(previous=>({...previous,userId,items,loaded:true,error:""}));
    }catch(e){if(current.current===userId&&ticket===request.current)setState(previous=>({...previous,userId,error:e.message}));}
  },[userId]);
  useEffect(()=>{setState({userId,items:[],loaded:false,busy:false,error:""});refresh();},[userId,refresh]);
  const run=useCallback(async(action)=>{
    if(!userId||!account.canEdit)throw Error("Estimator or administrator access is required.");
    setState(previous=>({...previous,busy:true,error:""}));
    try {const result=await action();await refresh();return result;}
    catch(e){if(current.current===userId)setState(previous=>({...previous,error:e.message}));throw e;}
    finally{if(current.current===userId)setState(previous=>({...previous,busy:false}));}
  },[userId,account.canEdit,refresh]);
  return {...(state.userId===userId?state:{items:[],loaded:false,busy:false,error:""}),refresh,
    add:name=>run(()=>{const clean=validateBuilderName(name);return findBuilder(state.userId===userId?state.items:[],clean)||builderRepository.add(clean);}),
    rename:(id,name)=>run(()=>builderRepository.rename(id,validateBuilderName(name))),
    remove:id=>run(()=>builderRepository.remove(id))};
}
