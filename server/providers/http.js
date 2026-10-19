"use strict";
// Shared upstream-call helper: timeouts, JSON parsing, error mapping and secret redaction.
const SECRET_VARS=["REPLICATE_API_TOKEN","IMAGE_API_KEY"];
function redact(s){
  let out=String(s);
  for(const k of SECRET_VARS){const v=process.env[k];if(v&&v.length>=6)out=out.split(v).join("[hidden]")}
  return out.replace(/\b(sk|r8|key|nvapi|csk)[-_][A-Za-z0-9_-]{6,}/gi,"[hidden]");
}
async function callJson(url,{method="GET",headers={},body,timeout}={}){
  const ac=new AbortController(),t=setTimeout(()=>ac.abort(),timeout||+process.env.UPSTREAM_TIMEOUT_MS||60000);
  try{
    const r=await fetch(url,{method,headers:{...headers,...(body?{"Content-Type":"application/json"}:{})},body:body?JSON.stringify(body):undefined,signal:ac.signal,redirect:"error"});
    const text=await r.text();let json=null;try{json=JSON.parse(text)}catch(e){}
    return{ok:r.ok,status:r.status,json,text:text.slice(0,300),retryAfter:r.headers.get("retry-after")};
  }catch(e){return{ok:false,status:0,json:null,text:e&&e.name==="AbortError"?"timeout":"network"}}
  finally{clearTimeout(t)}
}
function mapError(u){
  if(u.status===0)return{code:u.text==="timeout"?504:502,body:{error:u.text==="timeout"?"المزود ماردش في الوقت المحدد.":"مش قادر أوصل للمزود. راجع الاتصال أو العنوان."}};
  const j=u.json,d=j&&(j.detail||j.title||(j.error&&(j.error.message||j.error)))||u.text;
  const detail=redact(typeof d==="string"?d:JSON.stringify(d)).slice(0,200);
  const msg={401:"مفتاح API مرفوض (401).",403:"غير مصرّح (403): راجع صلاحيات المفتاح.",402:"الرصيد أو الدفع غير كافي عند المزود (402).",404:"المورد مش موجود (404): راجع اسم الموديل أو العنوان.",422:"المدخلات غير مقبولة للموديل (422).",429:"تجاوزت حد الاستخدام عند المزود (429)، جرّب بعد شوية."}[u.status]||"المزود رد بخطأ "+u.status+".";
  return{code:u.status===429?429:502,body:{error:msg+(detail?" "+detail:""),upstreamStatus:u.status}};
}
module.exports={callJson,mapError,redact};
