"use strict";
// Video adapter for Replicate's documented HTTP API (https://replicate.com/docs/reference/http):
//   POST /v1/models/{owner}/{name}/predictions   (official models)   body {input}
//   POST /v1/predictions                         (owner/name:version) body {version,input}
//   GET  /v1/predictions/{id}  -> status: starting|processing|succeeded|failed|canceled
//   POST /v1/predictions/{id}/cancel
//   GET  /v1/account (token check). Output files need the Authorization header, so the server streams them.
const {callJson,mapError,redact}=require("./http");
const base=()=>(process.env.REPLICATE_API_BASE||"https://api.replicate.com/v1").replace(/\/+$/,"");
const MODEL_RE=/^[\w.-]+\/[\w.-]+(:[a-f0-9]{64})?$/,ID_RE=/^[a-z0-9]{10,40}$/,AFTER_RE=/^(\d+[smh])+$/;
const auth=()=>({Authorization:"Bearer "+process.env.REPLICATE_API_TOKEN});
function config(){
  const e=process.env;if(!e.REPLICATE_API_TOKEN||!e.REPLICATE_VIDEO_MODEL)return{configured:false,errors:[]};
  const errors=[];let extra={};
  if(!MODEL_RE.test(e.REPLICATE_VIDEO_MODEL))errors.push("REPLICATE_VIDEO_MODEL لازم يبقى owner/name أو owner/name:version (64 حرف)");
  if(e.REPLICATE_VIDEO_EXTRA_INPUT){try{extra=JSON.parse(e.REPLICATE_VIDEO_EXTRA_INPUT);if(!extra||typeof extra!=="object"||Array.isArray(extra))throw 0}catch(x){errors.push("REPLICATE_VIDEO_EXTRA_INPUT لازم يبقى JSON object");extra={}}}
  if(e.REPLICATE_CANCEL_AFTER&&!AFTER_RE.test(e.REPLICATE_CANCEL_AFTER))errors.push("REPLICATE_CANCEL_AFTER شكله زي 10m أو 90s");
  return{configured:!errors.length,errors,extra};
}
const validId=id=>ID_RE.test(id);
async function create(prompt){
  const c=config(),m=process.env.REPLICATE_VIDEO_MODEL,headers=auth();
  if(process.env.REPLICATE_CANCEL_AFTER)headers["Cancel-After"]=process.env.REPLICATE_CANCEL_AFTER;
  const input={...c.extra,prompt};
  const u=m.includes(":")?await callJson(base()+"/predictions",{method:"POST",headers,body:{version:m,input}})
                         :await callJson(base()+"/models/"+m+"/predictions",{method:"POST",headers,body:{input}});
  if(!u.ok)return mapError(u);
  const id=u.json&&u.json.id;
  return validId(String(id))?{code:200,body:{id:String(id),status:"queued"}}:{code:502,body:{error:"رد المزود مفيهوش معرّف مهمة صالح."}};
}
function pickUrl(o){
  if(typeof o==="string")return/^https?:\/\//.test(o)?o:null;
  if(Array.isArray(o))return o.map(pickUrl).find(Boolean)||null;
  if(o&&typeof o==="object")return Object.values(o).map(pickUrl).find(Boolean)||null;
  return null;
}
async function fetchPrediction(id){return callJson(base()+"/predictions/"+id,{headers:auth()})}
async function status(id){
  const u=await fetchPrediction(id);if(!u.ok)return mapError(u);
  const p=u.json||{};
  switch(p.status){
    case"starting":return{code:200,body:{status:"queued"}};
    case"processing":return{code:200,body:{status:"running"}};
    case"succeeded":return pickUrl(p.output)?{code:200,body:{status:"succeeded",url:"/api/video/jobs/"+id+"/file"}}
      :{code:502,body:{error:"المهمة خلصت لكن مفيش رابط فيديو في الناتج (ممكن المزود مسح الناتج بعد ساعة، أو الموديل بيرجّع صيغة تانية)."}};
    case"failed":return{code:200,body:{status:"failed",error:redact(String(p.error||"فشلت المهمة عند المزود")).slice(0,300)}};
    case"canceled":return{code:200,body:{status:"canceled"}};
    default:return{code:502,body:{error:"حالة غير معروفة من المزود: "+String(p.status).slice(0,40)}};
  }
}
function hostAllowed(url){
  let h;try{h=new URL(url)}catch(e){return false}
  if((process.env.REPLICATE_OUTPUT_HOST_ALLOWLIST||"").split(",").map(s=>s.trim()).filter(Boolean).includes(h.host))return true; // test/proxy hook
  return h.protocol==="https:"&&(h.hostname==="replicate.delivery"||h.hostname.endsWith(".replicate.delivery"));
}
async function fileInfo(id){
  const u=await fetchPrediction(id);if(!u.ok)return mapError(u);
  const p=u.json||{},url=p.status==="succeeded"?pickUrl(p.output):null;
  if(!url)return{code:409,body:{error:"الفيديو مش جاهز أو الناتج اتمسح."}};
  if(!hostAllowed(url))return{code:502,body:{error:"رابط الناتج من دومين غير مسموح، اتمنع."}};
  return{code:200,url,headers:auth()};
}
async function cancel(id){
  const u=await callJson(base()+"/predictions/"+id+"/cancel",{method:"POST",headers:auth()});
  return u.ok?{code:200,body:{status:"canceled"}}:mapError(u);
}
async function check(){ // validates the token without creating (or paying for) a prediction
  const u=await callJson(base()+"/account",{headers:auth()});
  return u.ok?{code:200,body:{ok:true,account:u.json&&u.json.username||null}}:mapError(u);
}
module.exports={name:"replicate",config,validId,create,status,fileInfo,cancel,check,hostAllowed};
