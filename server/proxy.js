"use strict";
// Weblume optional backend (Node >= 18, zero dependencies). Serves index.html and proxies image/video providers
// so API keys stay in environment variables. Provider endpoints are fixed in server/providers/*, never taken from the client.
const http=require("http"),fs=require("fs"),path=require("path"),{Readable}=require("stream");
const ROOT=path.join(__dirname,"..");
(function loadEnv(){ // minimal .env reader; real environment variables win. No inline comments, one KEY=value per line.
  try{for(const l of fs.readFileSync(path.join(ROOT,".env"),"utf8").split(/\r?\n/)){
    const m=l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);if(!m||l.trim().startsWith("#"))continue;
    let v=m[2];if(/^(["']).*\1$/.test(v))v=v.slice(1,-1);if(process.env[m[1]]===undefined)process.env[m[1]]=v}}catch(e){}
})();
const images=require("./providers/openai-images"),video=require("./providers/replicate-video");
const MAX_BODY=100000;
const baseHeaders={"Cache-Control":"no-store","X-Content-Type-Options":"nosniff","X-Frame-Options":"DENY","Referrer-Policy":"no-referrer"};
const send=(res,c,b)=>{res.writeHead(c,{...baseHeaders,"Content-Type":"application/json; charset=utf-8"});res.end(JSON.stringify(b))};
const out=(res,r)=>send(res,r.code,r.body);
function readBody(req){return new Promise((ok,no)=>{
  if(!(req.headers["content-type"]||"").startsWith("application/json"))return no(Object.assign(new Error("Content-Type لازم application/json"),{code:415}));
  let n=0;const c=[];req.on("data",d=>{n+=d.length;if(n>MAX_BODY){no(Object.assign(new Error("الطلب كبير"),{code:413}));req.destroy()}else c.push(d)});
  req.on("end",()=>{try{const j=JSON.parse(Buffer.concat(c).toString()||"{}");ok(j&&typeof j==="object"&&!Array.isArray(j)?j:{})}catch(e){no(Object.assign(new Error("JSON غير صالح"),{code:400}))}});
  req.on("error",no)})}
// Chat relay for providers that block direct browser calls (CORS). Upstream hosts are fixed here; the client
// only chooses which of these names to use. The key comes from the browser's Authorization header (the user's own key)
// or from the env var, and is never logged or echoed back.
const LLM_UPSTREAMS={nvidia:{base:()=>process.env.LLM_NVIDIA_BASE||"https://integrate.api.nvidia.com/v1",env:"NVIDIA_API_KEY"},
  cerebras:{base:()=>process.env.LLM_CEREBRAS_BASE||"https://api.cerebras.ai/v1",env:"CEREBRAS_API_KEY"}};
const MAX_LLM_BODY=4*1024*1024;
function readRaw(req,limit){return new Promise((ok,no)=>{
  if(!(req.headers["content-type"]||"").startsWith("application/json"))return no(Object.assign(new Error("Content-Type لازم application/json"),{code:415}));
  let n=0;const c=[];req.on("data",d=>{n+=d.length;if(n>limit){no(Object.assign(new Error("الطلب كبير"),{code:413}));req.destroy()}else c.push(d)});
  req.on("end",()=>{const t=Buffer.concat(c).toString();try{const j=JSON.parse(t||"{}");if(!j||typeof j!=="object"||Array.isArray(j))throw 0;ok(JSON.stringify(j))}catch(e){no(Object.assign(new Error("JSON غير صالح"),{code:400}))}});
  req.on("error",no)})}
async function relayLLM(req,res,name,sub){
  const up=LLM_UPSTREAMS[name];if(!up)return send(res,404,{error:"مزود غير معروف."});
  const auth=String(req.headers.authorization||"");const key=/^Bearer\s+\S{8,}$/.test(auth)?auth:(process.env[up.env]?"Bearer "+process.env[up.env]:"");
  if(!key)return send(res,401,{error:"مفيش مفتاح للمزود ده."});
  const isChat=sub==="chat/completions";if(isChat&&req.method!=="POST"||!isChat&&req.method!=="GET")return send(res,405,{error:"Method غير مسموح."});
  const body=isChat?await readRaw(req,MAX_LLM_BODY):undefined;
  const ac=new AbortController(),t=setTimeout(()=>ac.abort(),600000);res.on("close",()=>ac.abort());
  let r;try{r=await fetch(up.base()+"/"+sub,{method:req.method,headers:{Authorization:key,"Content-Type":"application/json",Accept:isChat?"text/event-stream, application/json":"application/json"},body,signal:ac.signal,redirect:"error"})}
  catch(e){clearTimeout(t);return send(res,502,{error:"مش قادر أوصل لـ "+name+"."})}
  const o={...baseHeaders,"Content-Type":r.headers.get("content-type")||"application/json"};
  res.writeHead(r.status,o);if(!r.body){clearTimeout(t);return res.end()}
  Readable.fromWeb(r.body).on("error",()=>res.destroy()).on("end",()=>clearTimeout(t)).pipe(res);
}
const prompt=b=>typeof b.prompt==="string"&&b.prompt.trim()&&b.prompt.length<=4000?b.prompt.trim():null;
function state(){const v=video.config();return{
  image:images.configured(),video:v.configured,videoCancel:v.configured,
  providers:{image:{provider:images.name,configured:images.configured()},video:{provider:video.name,configured:v.configured,errors:v.errors}}}}
async function streamFile(req,res,id){
  const f=await video.fileInfo(id);if(f.body)return out(res,f);
  const h={...f.headers};if(req.headers.range)h.Range=req.headers.range;
  const ac=new AbortController();res.on("close",()=>ac.abort());
  let r;try{r=await fetch(f.url,{headers:h,signal:ac.signal})}catch(e){return send(res,502,{error:"تعذر تحميل الفيديو من المزود."})}
  if(!r.ok&&r.status!==206)return send(res,502,{error:"تعذر تحميل الفيديو من المزود ("+r.status+")."});
  const ct=r.headers.get("content-type")||"",o={...baseHeaders,"Cache-Control":"private, max-age=300","Content-Type":/^video\//.test(ct)?ct:"video/mp4"};
  for(const k of["content-length","content-range","accept-ranges"]){const v=r.headers.get(k);if(v)o[k]=v}
  res.writeHead(r.status,o);Readable.fromWeb(r.body).on("error",()=>res.destroy()).pipe(res);
}
const server=http.createServer(async(req,res)=>{
  try{
    const p=new URL(req.url,"http://x").pathname,m=req.method;
    if(m!=="GET"&&m!=="HEAD"){const o=req.headers.origin;if(o&&o!=="http://"+req.headers.host&&o!=="https://"+req.headers.host)return send(res,403,{error:"Origin غير مسموح."})}
    if(m==="GET"&&(p==="/"||p==="/index.html")){res.writeHead(200,{...baseHeaders,"Content-Type":"text/html; charset=utf-8"});return res.end(fs.readFileSync(path.join(ROOT,"index.html")))}
    if(m==="GET"&&p==="/api/health")return send(res,200,state());
    const lm=p.match(/^\/api\/llm\/([a-z]+)\/(models|chat\/completions)$/);if(lm)return await relayLLM(req,res,lm[1],lm[2]);
    if(m==="GET"&&p==="/api/providers/video/check"){if(!video.config().configured)return send(res,503,{error:"مزود الفيديو مش مضبوط."});return out(res,await video.check())}
    if(m==="POST"&&p==="/api/images"){
      if(!images.configured())return send(res,503,{error:"مزود الصور مش مضبوط (IMAGE_API_URL و IMAGE_MODEL)."});
      const b=await readBody(req),pr=prompt(b);if(!pr)return send(res,400,{error:"الوصف مطلوب (حتى 4000 حرف)."});
      if(b.size!=null&&b.size!==""&&!/^\d{2,4}x\d{2,4}$/.test(String(b.size)))return send(res,400,{error:"المقاس لازم يبقى WxH مثل 1024x1024."});
      return out(res,await images.generate({prompt:pr,size:b.size?String(b.size):""}));
    }
    if(p==="/api/video/jobs"&&m==="POST"){
      if(!video.config().configured)return send(res,503,{error:"مزود الفيديو مش مضبوط (REPLICATE_API_TOKEN و REPLICATE_VIDEO_MODEL)."});
      const b=await readBody(req),pr=prompt(b);if(!pr)return send(res,400,{error:"الوصف مطلوب (حتى 4000 حرف)."});
      return out(res,await video.create(pr));
    }
    const j=p.match(/^\/api\/video\/jobs\/([^/]+)(\/file)?$/);
    if(j){
      const id=decodeURIComponent(j[1]);if(!video.validId(id))return send(res,400,{error:"معرّف مهمة غير صالح."});
      if(!video.config().configured)return send(res,503,{error:"مزود الفيديو مش مضبوط."});
      if(j[2]&&m==="GET")return await streamFile(req,res,id);
      if(!j[2]&&m==="GET")return out(res,await video.status(id));
      if(!j[2]&&m==="DELETE")return out(res,await video.cancel(id));
    }
    send(res,404,{error:"مش موجود."});
  }catch(e){send(res,e.code&&e.code>=400&&e.code<500?e.code:500,{error:e.code?e.message:"خطأ داخلي في السيرفر."})}
});
module.exports={server,state};
if(require.main===module){
  const port=+process.env.PORT||8787,host=process.env.HOST||"127.0.0.1";
  const openBrowser=()=>{if(process.env.OPEN_BROWSER!=="1")return;const u="http://127.0.0.1:"+port,cp=require("child_process");try{process.platform==="win32"?cp.exec('start "" "'+u+'"'):cp.exec((process.platform==="darwin"?"open ":"xdg-open ")+u)}catch(e){}};
  server.on("error",e=>{if(e&&e.code==="EADDRINUSE"){console.log("\n  Weblume is already running in another window. Opening http://127.0.0.1:"+port+" ...\n  You can close this window.\n");openBrowser()}else{console.error("\n  Server error: "+(e&&e.message)+"\n");process.exitCode=1}});
  server.listen(port,host,()=>{const s=state();console.log("Weblume: http://"+host+":"+port);openBrowser();console.log(" images:",s.providers.image.configured?"configured":"not configured"," video:",s.providers.video.configured?"configured":"not configured",s.providers.video.errors.join("; "))});
}
