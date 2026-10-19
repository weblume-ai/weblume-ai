"use strict";
// Image adapter for OpenAI-compatible APIs: POST {IMAGE_API_URL}/images/generations (OpenAI Images API format).
const {callJson,mapError}=require("./http");
const configured=()=>!!(process.env.IMAGE_API_URL&&process.env.IMAGE_MODEL);
async function generate({prompt,size}){
  const e=process.env,body={model:e.IMAGE_MODEL,prompt,n:1};if(size)body.size=size;
  const headers={};if(e.IMAGE_API_KEY)headers.Authorization="Bearer "+e.IMAGE_API_KEY;
  const u=await callJson(e.IMAGE_API_URL.replace(/\/+$/,"")+"/images/generations",{method:"POST",headers,body,timeout:+e.IMAGE_TIMEOUT_MS||120000});
  if(!u.ok)return mapError(u);
  const it=u.json&&Array.isArray(u.json.data)&&u.json.data[0];
  if(it&&typeof it.b64_json==="string")return{code:200,body:{data:[{b64_json:it.b64_json}]}};
  if(it&&/^https?:\/\//.test(String(it.url)))return{code:200,body:{data:[{url:it.url}]}};
  return{code:502,body:{error:"رد المزود مفيهوش صورة (b64_json أو url). المزود ده غالبًا مش متوافق مع OpenAI Images."}};
}
module.exports={name:"openai-compatible",configured,generate};
