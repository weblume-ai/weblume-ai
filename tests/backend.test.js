// Backend tests. Providers are LOCAL MOCKS (clearly labelled); nothing here proves a real provider works.
const http=require("http"),fs=require("fs"),path=require("path");
let pass=0,fail=0;const T=(n,c)=>{c?pass++:fail++;console.log((c?"PASS ":"FAIL ")+n)};
const ID="abcdefghij1234567890abcdef",TOKEN="r8_MOCKTOKEN123456",KEY="sk-MOCKIMAGEKEY999";
const seen=[];let mode={};
const mock=http.createServer((q,r)=>{let b="";q.on("data",d=>b+=d);q.on("end",()=>{
  const j=(c,o,h)=>{r.writeHead(c,{"Content-Type":"application/json",...(h||{})});r.end(JSON.stringify(o))};
  const u=q.url;seen.push({m:q.method,u,h:q.headers,b});
  if(u.startsWith("/nv/")){ if(q.headers.authorization!=="Bearer nvapi-MOCKKEY123")return j(401,{error:{message:"bad key"}});
    if(u==="/nv/models")return j(200,{data:[{id:"nvidia/mock-model"}]});
    if(u==="/nv/chat/completions"){r.writeHead(200,{"Content-Type":"text/event-stream"});r.write('data: {"choices":[{"delta":{"content":"hi"}}]}\n\n');setTimeout(()=>{r.end("data: [DONE]\n\n")},30);return}}
  if(u.startsWith("/img/")){ if(q.headers.authorization!=="Bearer "+KEY)return j(401,{error:{message:"Incorrect API key provided: "+KEY}});
    if(mode.imgHang)return; if(mode.imgBad)return j(200,{data:[{}]});
    return j(200,{data:[{b64_json:"iVBORw0KGgo="}],extra:"dropped"})}
  if(u.startsWith("/out/")){ if(q.headers.authorization!=="Bearer "+TOKEN)return j(401,{});
    const buf=Buffer.from("0123456789");if(q.headers.range){r.writeHead(206,{"Content-Type":"video/mp4","Content-Range":"bytes 0-3/10","Content-Length":4,"Accept-Ranges":"bytes"});return r.end(buf.slice(0,4))}
    r.writeHead(200,{"Content-Type":"text/html","Content-Length":10});return r.end(buf)}
  if(q.headers.authorization!=="Bearer "+TOKEN)return j(401,{title:"Unauthenticated",detail:"bad token "+TOKEN});
  if(mode.status)return j(mode.status,{detail:"mock "+mode.status});
  if(u==="/rep/models/acme/vid/predictions"||u==="/rep/predictions"&&q.method==="POST")return j(201,{id:ID,status:"starting"});
  if(u==="/rep/account")return j(200,{username:"mock-user"});
  if(u==="/rep/predictions/"+ID+"/cancel")return j(200,{id:ID,status:"canceled"});
  if(u==="/rep/predictions/"+ID)return j(200,mode.pred||{id:ID,status:"processing"});
  j(404,{detail:"not found"})})});
const call=(port,method,p,body,o={})=>new Promise(res=>{const d=o.raw!==undefined?o.raw:(body?JSON.stringify(body):undefined);
  const q=http.request({port,method,path:p,headers:{"Content-Type":o.ct||"application/json",...(o.h||{})}},r=>{let t="";r.on("data",x=>t+=x);r.on("end",()=>{let j=null;try{j=JSON.parse(t)}catch(e){}res({s:r.statusCode,j,t,h:r.headers})})});
  q.on("error",()=>res({s:0,t:""}));q.end(d)});
(async()=>{
  await new Promise(r=>mock.listen(0,r));const mp=mock.address().port;
  const E=process.env;for(const k of Object.keys(E))if(/^(REPLICATE|IMAGE)_/.test(k))delete E[k];
  const {server}=require("../server/proxy.js");await new Promise(r=>server.listen(0,r));const p=server.address().port;
  let r=await call(p,"GET","/api/health");
  T("health: nothing configured",r.s===200&&r.j.image===false&&r.j.video===false&&r.j.providers.video.provider==="replicate");
  T("security headers present",r.h["x-content-type-options"]==="nosniff"&&r.h["x-frame-options"]==="DENY");
  r=await call(p,"POST","/api/images",{prompt:"x"});T("images unconfigured -> 503",r.s===503);
  r=await call(p,"POST","/api/video/jobs",{prompt:"x"});T("video unconfigured -> 503",r.s===503);
  r=await call(p,"GET","/api/providers/video/check");T("video check unconfigured -> 503",r.s===503);
  // config validation
  Object.assign(E,{REPLICATE_API_TOKEN:TOKEN,REPLICATE_VIDEO_MODEL:"not a model"});
  r=await call(p,"GET","/api/health");T("bad model name reported, video not usable",r.j.video===false&&r.j.providers.video.errors.length===1);
  E.REPLICATE_VIDEO_MODEL="acme/vid";E.REPLICATE_VIDEO_EXTRA_INPUT="[1]";r=await call(p,"GET","/api/health");T("bad EXTRA_INPUT reported",r.j.video===false);
  Object.assign(E,{REPLICATE_VIDEO_EXTRA_INPUT:'{"duration":5,"prompt":"HIJACK"}',REPLICATE_CANCEL_AFTER:"10m",REPLICATE_API_BASE:`http://127.0.0.1:${mp}/rep`,REPLICATE_OUTPUT_HOST_ALLOWLIST:`127.0.0.1:${mp}`,
    IMAGE_API_URL:`http://127.0.0.1:${mp}/img`,IMAGE_API_KEY:KEY,IMAGE_MODEL:"m",UPSTREAM_TIMEOUT_MS:"400",IMAGE_TIMEOUT_MS:"400"});
  r=await call(p,"GET","/api/health");T("health: both configured",r.j.image&&r.j.video&&r.j.providers.video.errors.length===0);
  // images
  r=await call(p,"POST","/api/images",{prompt:"cat",size:"512x512"});T("image ok, response normalized",r.s===200&&r.j.data[0].b64_json&&!r.t.includes("dropped"));
  const ib=JSON.parse(seen.filter(x=>x.u==="/img/images/generations").pop().b);T("image request body matches OpenAI format",ib.model==="m"&&ib.prompt==="cat"&&ib.size==="512x512"&&ib.n===1);
  r=await call(p,"POST","/api/images",{prompt:""});T("image empty prompt -> 400",r.s===400);
  r=await call(p,"POST","/api/images",{prompt:"a",size:"9;x"});T("image bad size -> 400",r.s===400);
  r=await call(p,"POST","/api/images",null,{raw:"{nope"});T("invalid JSON -> 400",r.s===400);
  r=await call(p,"POST","/api/images",null,{raw:"prompt=a",ct:"application/x-www-form-urlencoded"});T("wrong content-type -> 415",r.s===415);
  r=await call(p,"POST","/api/images",{prompt:"a".repeat(120000)});T("oversize body rejected (413 or reset)",r.s===413||r.s===0);
  r=await call(p,"POST","/api/images",{prompt:"a"},{h:{Origin:"http://evil.example"}});T("foreign Origin -> 403",r.s===403);
  mode={imgBad:1};r=await call(p,"POST","/api/images",{prompt:"a"});T("provider returns no image -> 502",r.s===502);
  mode={imgHang:1};r=await call(p,"POST","/api/images",{prompt:"a"});T("provider timeout -> 504",r.s===504);mode={};
  const keep=E.IMAGE_API_KEY;E.IMAGE_API_KEY="wrong-key-value";r=await call(p,"POST","/api/images",{prompt:"a"});
  T("image 401 mapped, no key material in reply",r.s===502&&/401/.test(r.j.error)&&!r.t.includes(KEY)&&!r.t.includes("wrong-key-value"));E.IMAGE_API_KEY=keep;
  // video: create (official model endpoint)
  r=await call(p,"POST","/api/video/jobs",{prompt:"sea waves"});T("video create ok",r.s===200&&r.j.id===ID&&r.j.status==="queued");
  let rq=seen.filter(x=>x.u==="/rep/models/acme/vid/predictions").pop(),rb=JSON.parse(rq.b);
  T("create uses Bearer + Cancel-After + models endpoint",rq.h.authorization==="Bearer "+TOKEN&&rq.h["cancel-after"]==="10m");
  T("input = extra + prompt, prompt cannot be overridden",rb.input.duration===5&&rb.input.prompt==="sea waves"&&!("version" in rb));
  const V="a".repeat(64);E.REPLICATE_VIDEO_MODEL="acme/vid:"+V;await call(p,"POST","/api/video/jobs",{prompt:"x"});
  rq=seen.filter(x=>x.u==="/rep/predictions"&&x.m==="POST").pop();rb=JSON.parse(rq.b);T("community model uses /predictions with version",rb.version==="acme/vid:"+V&&rb.input.prompt==="x");E.REPLICATE_VIDEO_MODEL="acme/vid";
  r=await call(p,"POST","/api/video/jobs",{prompt:""});T("video empty prompt -> 400",r.s===400);
  // status mapping
  const st=async o=>{mode={pred:o};return(await call(p,"GET","/api/video/jobs/"+ID)).j};
  T("status starting -> queued",(await st({status:"starting"})).status==="queued");
  T("status processing -> running",(await st({status:"processing"})).status==="running");
  let s=await st({status:"succeeded",output:["https://replicate.delivery/x/out.mp4"]});T("succeeded -> same-origin file url",s.status==="succeeded"&&s.url==="/api/video/jobs/"+ID+"/file");
  s=await st({status:"failed",error:"NSFW detected "+TOKEN});T("failed -> error text, token redacted",s.status==="failed"&&/NSFW/.test(s.error)&&!s.error.includes(TOKEN));
  T("canceled -> canceled",(await st({status:"canceled"})).status==="canceled");
  mode={pred:{status:"succeeded",output:null}};r=await call(p,"GET","/api/video/jobs/"+ID);T("succeeded without output -> 502 explained",r.s===502&&/ناتج|رابط/.test(r.j.error));
  mode={pred:{status:"weird"}};r=await call(p,"GET","/api/video/jobs/"+ID);T("unknown provider status -> 502",r.s===502);
  mode={status:429};r=await call(p,"GET","/api/video/jobs/"+ID);T("quota 429 forwarded as 429",r.s===429&&/429/.test(r.j.error));
  mode={status:402};r=await call(p,"POST","/api/video/jobs",{prompt:"x"});T("402 payment error explained",r.s===502&&/402/.test(r.j.error));
  mode={status:404};r=await call(p,"GET","/api/video/jobs/"+ID);T("404 explained",r.s===502&&/404/.test(r.j.error));mode={};
  r=await call(p,"GET","/api/video/jobs/..%2Fetc");T("bad job id -> 400",r.s===400);
  // file streaming
  const out=`http://127.0.0.1:${mp}/out/v.mp4`;
  mode={pred:{status:"succeeded",output:out}};r=await call(p,"GET","/api/video/jobs/"+ID+"/file");
  T("file streamed with provider auth, non-video type forced to video/mp4",r.s===200&&r.t==="0123456789"&&r.h["content-type"]==="video/mp4");
  r=await call(p,"GET","/api/video/jobs/"+ID+"/file",null,{h:{Range:"bytes=0-3"}});T("Range request passed through (206)",r.s===206&&r.t==="0123");
  mode={pred:{status:"succeeded",output:"https://evil.example/v.mp4"}};r=await call(p,"GET","/api/video/jobs/"+ID+"/file");T("output host not allowlisted -> blocked",r.s===502);
  mode={pred:{status:"processing"}};r=await call(p,"GET","/api/video/jobs/"+ID+"/file");T("file before ready -> 409",r.s===409);mode={};
  // cancel + check
  r=await call(p,"DELETE","/api/video/jobs/"+ID);T("cancel ok",r.s===200&&r.j.status==="canceled");
  mode={status:422};r=await call(p,"DELETE","/api/video/jobs/"+ID);T("cancel failure surfaced",r.s===502);mode={};
  r=await call(p,"GET","/api/providers/video/check");T("token check ok (mock /account)",r.s===200&&r.j.account==="mock-user");
  E.REPLICATE_API_TOKEN="r8_WRONGTOKEN12345";r=await call(p,"GET","/api/providers/video/check");T("token check 401 mapped, no token echo",r.s===502&&/401/.test(r.j.error)&&!r.t.includes("WRONGTOKEN")&&!r.t.includes(TOKEN));E.REPLICATE_API_TOKEN=TOKEN;
  r=await call(p,"GET","/nope");T("unknown route -> 404",r.s===404);
  r=await call(p,"GET","/");T("serves index.html",r.s===200&&/<html/.test(r.t));
  // frontend <-> backend contract
  const html=fs.readFileSync(path.join(__dirname,"..","index.html"),"utf8");
  T("frontend calls only routes the backend implements",["/api/health","/api/images","/api/video/jobs"].every(x=>html.includes('"'+x))&&!/\/api\/(?!health|images|video\/jobs|items|llm\/|settings)/.test(html.replace(/\/api\/items/g,"").replace(/https:\/\/[\w.-]+\/api\/v1/g,"")));
  T("frontend polls with fields backend returns (status/url/error/id)",/j\.status==="succeeded"/.test(html)&&/j\.url/.test(html)&&/j\.error/.test(html)&&/vid=j\.id/.test(html)&&/j\.status==="canceled"/.test(html));
  // LLM relay (providers that block browser CORS), against a LOCAL MOCK upstream
  E.LLM_NVIDIA_BASE="http://127.0.0.1:"+mp+"/nv";
  r=await call(p,"GET","/api/llm/nvidia/models",null,{h:{Authorization:"Bearer nvapi-MOCKKEY123"}});
  T("llm relay: models forwarded with user key",r.s===200&&r.j&&r.j.data[0].id==="nvidia/mock-model");
  r=await call(p,"POST","/api/llm/nvidia/chat/completions",{model:"m",messages:[{role:"user",content:"x"}],stream:true},{h:{Authorization:"Bearer nvapi-MOCKKEY123"}});
  T("llm relay: SSE stream passed through",r.s===200&&/text\/event-stream/.test(r.h["content-type"])&&/"hi"/.test(r.t)&&/\[DONE\]/.test(r.t));
  r=await call(p,"POST","/api/llm/nvidia/chat/completions",{model:"m"},{h:{Authorization:"Bearer nvapi-WRONGKEY99"}});
  T("llm relay: upstream 401 returned as-is",r.s===401);
  r=await call(p,"POST","/api/llm/nvidia/chat/completions",{model:"m"});
  T("llm relay: no key -> 401 without calling upstream",r.s===401&&/مفتاح/.test(r.j.error));
  r=await call(p,"POST","/api/llm/evil/chat/completions",{model:"m"},{h:{Authorization:"Bearer nvapi-MOCKKEY123"}});
  T("llm relay: unknown provider rejected",r.s===404);
  r=await call(p,"POST","/api/llm/nvidia/chat/completions",{model:"m"},{h:{Authorization:"Bearer nvapi-MOCKKEY123",Origin:"https://evil.example"}});
  T("llm relay: foreign Origin rejected",r.s===403);
  r=await call(p,"GET","/api/llm/nvidia/chat/completions",null,{h:{Authorization:"Bearer nvapi-MOCKKEY123"}});
  T("llm relay: wrong method rejected",r.s===405);
  r=await call(p,"POST","/api/llm/nvidia/chat/completions",null,{raw:"[1,2]",h:{Authorization:"Bearer nvapi-MOCKKEY123"}});
  T("llm relay: non-object JSON rejected",r.s===400);
  // local settings file
  const SF=require("path").join(require("os").tmpdir(),"wl-settings-test-"+process.pid+".json");E.WEBLUME_SETTINGS_FILE=SF;try{fs.unlinkSync(SF)}catch(e){}
  r=await call(p,"GET","/api/settings",null,{h:{Host:"127.0.0.1:"+p}});T("settings: empty when no file",r.s===200&&r.j&&Object.keys(r.j).length===0);
  r=await call(p,"POST","/api/settings",{keys:{groq:"gsk_x1234567",evil$:"no"},pm:{groq:"m"},smart:true,junk:"drop"},{h:{Host:"127.0.0.1:"+p}});
  r=await call(p,"GET","/api/settings",null,{h:{Host:"localhost:"+p}});T("settings: saved, cleaned, readable",r.s===200&&r.j.keys.groq==="gsk_x1234567"&&!("evil$" in r.j.keys)&&r.j.smart===true&&!("junk" in r.j));
  r=await call(p,"GET","/api/settings",null,{h:{Host:"attacker.example:"+p}});T("settings: foreign Host rejected (DNS rebinding)",r.s===403);
  r=await call(p,"POST","/api/settings",{keys:{groq:"x"}},{h:{Host:"127.0.0.1:"+p,Origin:"https://evil.example"}});T("settings: foreign Origin cannot write",r.s===403);
  try{fs.unlinkSync(SF)}catch(e){}
  console.log("RESULT pass="+pass+" fail="+fail);server.close();mock.close();process.exit(fail?1:0);
})();
