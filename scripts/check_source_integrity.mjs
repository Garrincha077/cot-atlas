// COT Atlas source health: immutable on-demand input fingerprints, no vendor price rows persisted.
// Runs in a scheduled GitHub Action, independent of Vercel deployment quotas.
import {createHash} from "node:crypto";
import {readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {resolve} from "node:path";
import {SOURCES} from "../api/community-expiries.js";
import {EXPECTED_SHA256 as NQ_SHA256} from "../api/nq-evaluation.js";

const ES_BASE="https://raw.githubusercontent.com/kfccolonel1/BARS/main/raw/ES/1min/ib/";
const NQ_URL="https://huggingface.co/datasets/lynx1231/historical-equity-index-futures-data-sample/resolve/main/data/daily/part-00000.parquet";
export const PINNED=[
 ...SOURCES.map(x=>({id:"ES "+x.contract,url:ES_BASE+x.file,sha256:x.sha256,maxBytes:9500000})),
 {id:"NQ 2026 daily evaluation",url:NQ_URL,sha256:NQ_SHA256,maxBytes:250000}
];
export async function checkLockedFile(item,fetcher=fetch){
 const r=await fetcher(item.url,{headers:{Accept:"application/octet-stream","User-Agent":"COT-Atlas-Source-Integrity-Watch/1.5"},signal:AbortSignal.timeout(30000)});
 if(!r.ok)throw Error("Source HTTP "+r.status);
 const declared=Number(r.headers.get("content-length")||0);
 if(declared>item.maxBytes)throw Error("Source byte limit exceeded");
 const bytes=Buffer.from(await r.arrayBuffer());
 if(bytes.length<100||bytes.length>item.maxBytes)throw Error("Invalid source byte length");
 const actual=createHash("sha256").update(bytes).digest("hex");
 return {id:item.id,ok:actual===item.sha256,bytes:bytes.length,expected:item.sha256,actual,
   reason:actual!==item.sha256?"Source content changed; lock prevents using revised data until reviewed":null};
}
const elapsedDays=(d,now)=>Math.floor((now-Date.parse(d))/86400000);
export function checkArchiveManifest(manifest,now=Date.now()){
 const generated=manifest?.generated_at,generatedAge=elapsedDays(generated,now);
 const reports=Array.isArray(manifest?.datasets)?manifest.datasets:[];
 const dates=reports.map(x=>x.latest_report).filter(Boolean);
 const latest=dates.length===7?[...dates].sort().at(-1):null;
 const oldest=dates.length===7?[...dates].sort()[0]:null;
 const oldestAge=oldest?elapsedDays(oldest+"T00:00:00Z",now):null;
 const issues=[];
 if(!Number.isFinite(generatedAge)||generatedAge>12||generatedAge<0)issues.push("CFTC archive generation older than 12 days or invalid");
 if(reports.length!==7||!latest||!oldest)issues.push("CFTC archive missing one of seven datasets");
 if(oldestAge===null||oldestAge>21||oldestAge<0)issues.push("One or more CFTC dataset reports older than 21 days");
 if(manifest?.point_in_time_verified!==false)issues.push("PIT provenance flag unexpectedly changed");
 return {ok:issues.length===0,generated_at:generated||null,generatedAgeDays:generatedAge,
  latestReport:latest,oldestReport:oldest,oldestReportAgeDays:oldestAge,datasets:reports.length,issues};
}
export async function checkAll({fetcher=fetch,now=Date.now(),manifest}={}){
 const m=manifest??JSON.parse(await readFile(new URL("../data/manifest.json",import.meta.url),"utf8"));
 const results=[];
 // Fail independently: a missing vendor is reported but does not obscure other providers.
 for(const item of PINNED){
  try{results.push(await checkLockedFile(item,fetcher))}
  catch(e){results.push({id:item.id,ok:false,reason:String(e?.message||e).slice(0,240)})}
 }
 const archive=checkArchiveManifest(m,now),failed=results.filter(x=>!x.ok);
 return {status:failed.length===0&&archive.ok?"OK":"ALERT",checkedAt:new Date(now).toISOString(),
   sourceCount:results.length,failedSources:failed.length,sources:results,archive,
   notes:["Third-party inputs are research close proxies, not licensed CME settlement.",
     "This check detects bytes changing or becoming unavailable. It does NOT certify originating data, executions or original historical COT vintages.",
     "Historical ES/NQ evaluation datasets are static samples; an old last quote alone is not an outage."]};
}
const invoked=process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(invoked){
 const result=await checkAll();
 console.log(JSON.stringify(result,null,2));
 if(result.status!=="OK")process.exitCode=1;
}
