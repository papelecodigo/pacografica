import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const supabase=createClient(SUPABASE_URL,SUPABASE_ANON_KEY);

// A autenticação continua pertencendo ao usuário que fez login, mas o ERP trabalha
// com o user_id do dono da empresa. Assim integrantes da equipe podem usar contas
// próprias e compartilhar os mesmos dados sem compartilhar senha.
async function resolveWorkspaceSession(session){
  if(!session?.user?.id||!session.access_token)return session;
  const authUserId=session.user.id;
  try{
    const url=new URL(`${SUPABASE_URL}/rest/v1/team_members`);
    url.searchParams.set('select','owner_user_id,role,display_name');
    url.searchParams.set('member_user_id',`eq.${authUserId}`);
    url.searchParams.set('active','eq.true');
    url.searchParams.set('limit','1');
    const r=await fetch(url,{headers:{apikey:SUPABASE_ANON_KEY,Authorization:`Bearer ${session.access_token}`},cache:'no-store'});
    if(r.ok){
      const rows=await r.json();
      const member=rows?.[0];
      if(member?.owner_user_id){
        const effectiveUser={
          ...session.user,
          id:member.owner_user_id,
          auth_user_id:authUserId,
          workspace_owner_id:member.owner_user_id,
          workspace_role:member.role||'attendant',
          workspace_name:member.display_name||null
        };
        return {...session,user:effectiveUser};
      }
    }
  }catch(error){console.warn('Workspace:',error)}
  return {...session,user:{...session.user,auth_user_id:authUserId,workspace_owner_id:authUserId,workspace_role:'owner'}};
}

const rawSignIn=supabase.auth.signInWithPassword.bind(supabase.auth);
supabase.auth.signInWithPassword=async credentials=>{
  const result=await rawSignIn(credentials);
  if(result?.data?.session){
    const session=await resolveWorkspaceSession(result.data.session);
    result.data.session=session;
    result.data.user=session.user;
  }
  return result;
};

const rawGetSession=supabase.auth.getSession.bind(supabase.auth);
supabase.auth.getSession=async()=>{
  const result=await rawGetSession();
  if(result?.data?.session)result.data.session=await resolveWorkspaceSession(result.data.session);
  return result;
};

const ERP_TABLES=new Set(['customers','products','quotes','quote_items','orders','order_items','production_steps','tasks','art_approvals','suppliers','stock_items','stock_movements','purchase_requests','receivables','payables','automation_rules','audit_logs']);

const uuid=()=>crypto.randomUUID?.()||`${Date.now()}-${Math.random().toString(16).slice(2)}`;
const now=()=>new Date().toISOString();

export class PacoDB{
  constructor(){this.user=null;this.cloudERP=true;this.schemaError=null}
  setUser(user){this.user=user}
  key(table){return `paco_v5_${this.user?.id||'guest'}_${table}`}
  localList(table){try{return JSON.parse(localStorage.getItem(this.key(table))||'[]')}catch{return[]}}
  localSave(table,rows){localStorage.setItem(this.key(table),JSON.stringify(rows))}
  async detectERP(){
    if(!this.user)return false;
    const {error}=await supabase.from('products').select('id').eq('user_id',this.user.id).limit(1);
    this.cloudERP=!error;
    this.schemaError=error||null;
    return this.cloudERP;
  }
  async list(table){
    if(ERP_TABLES.has(table)&&!this.cloudERP)return this.localList(table);
    let q=supabase.from(table).select('*').eq('user_id',this.user.id);
    const {data,error}=await q;
    if(error){
      if(ERP_TABLES.has(table)){this.cloudERP=false;this.schemaError=error;return this.localList(table)}
      throw error;
    }
    return data||[];
  }
  async insert(table,payload){
    const row={...payload,user_id:payload.user_id||this.user.id,created_at:payload.created_at||now(),updated_at:payload.updated_at||now()};
    if(ERP_TABLES.has(table)&&!this.cloudERP){row.id=row.id||uuid();const rows=this.localList(table);rows.push(row);this.localSave(table,rows);return row}
    const {data,error}=await supabase.from(table).insert(row).select().single();
    if(error){
      if(ERP_TABLES.has(table)){this.cloudERP=false;row.id=row.id||uuid();const rows=this.localList(table);rows.push(row);this.localSave(table,rows);return row}
      throw error;
    }
    return data;
  }
  async insertMany(table,payloads){
    if(!payloads.length)return[];
    if(ERP_TABLES.has(table)&&!this.cloudERP){const rows=this.localList(table),out=payloads.map(p=>({...p,id:p.id||uuid(),user_id:p.user_id||this.user.id,created_at:p.created_at||now(),updated_at:p.updated_at||now()}));rows.push(...out);this.localSave(table,rows);return out}
    const prepared=payloads.map(p=>({...p,user_id:p.user_id||this.user.id}));
    const {data,error}=await supabase.from(table).insert(prepared).select();
    if(error){
      if(ERP_TABLES.has(table)){this.cloudERP=false;return this.insertMany(table,payloads)}
      throw error;
    }
    return data||[];
  }
  async update(table,id,payload){
    const patch={...payload,updated_at:payload.updated_at||now()};
    if(ERP_TABLES.has(table)&&!this.cloudERP){const rows=this.localList(table),i=rows.findIndex(x=>x.id===id);if(i<0)return null;rows[i]={...rows[i],...patch};this.localSave(table,rows);return rows[i]}
    const {data,error}=await supabase.from(table).update(patch).eq('id',id).eq('user_id',this.user.id).select().single();
    if(error){
      if(ERP_TABLES.has(table)){this.cloudERP=false;return this.update(table,id,payload)}
      throw error;
    }
    return data;
  }
  async remove(table,id){
    if(ERP_TABLES.has(table)&&!this.cloudERP){const rows=this.localList(table).filter(x=>x.id!==id);this.localSave(table,rows);return true}
    const {error}=await supabase.from(table).delete().eq('id',id).eq('user_id',this.user.id);
    if(error){
      if(ERP_TABLES.has(table)){this.cloudERP=false;return this.remove(table,id)}
      throw error;
    }
    return true;
  }
  async audit(entityType,entityId,action,oldData=null,newData=null){
    try{return await this.insert('audit_logs',{entity_type:entityType,entity_id:entityId,action,old_data:oldData,new_data:newData})}catch{return null}
  }
  async approveQuoteRPC(quoteId){
    if(!this.cloudERP)return null;
    const {data,error}=await supabase.rpc('approve_quote_to_order',{p_quote_id:quoteId});
    if(error)return null;
    return data;
  }
}

export const db=new PacoDB();
