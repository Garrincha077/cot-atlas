// Direct, report-specific historical CFTC records for ONE futures contract.
// 2/5/10-year views avoid bloating the core archive and disclose later revisions.
import {IDS,COLUMNS} from "./cot.js";
const allowedYears=new Set([2,5,10]);
export default async function handler(req,res){
 if(req.method!=="GET")return res.status(405).json({error:"GET only"});
 const report=String(req.query.report||"disagg_fut");
 const category=String(req.query.category||"managed_money");
 const code=String(req.query.code||"");
 const years=Number(req.query.years||10);
 const cols=COLUMNS[report.split("_")[0]]?.[category];
 if(!IDS[report]||!cols||!/^[A-Za-z0-9+]{3,10}$/.test(code)||!allowedYears.has(years))
  return res.status(400).json({error:"Invalid CFTC report, trader category, contract code or history window"});
 const d=new Date();d.setUTCFullYear(d.getUTCFullYear()-years);
 const since=d.toISOString().slice(0,10);
 const fields=["report_date_as_yyyy_mm_dd","cftc_contract_market_code","market_and_exchange_names","commodity_group_name","open_interest_all",...cols];
 const base="https://publicreporting.cftc.gov/resource/"+IDS[report]+".json";
 const rows=[];
 try{
   for(let page=0;page<5;page++){
     const query=new URLSearchParams({
       "$select":fields.join(","),
       "$where":"cftc_contract_market_code = '"+code+"' AND report_date_as_yyyy_mm_dd >= '"+since+"T00:00:00'",
       "$order":"report_date_as_yyyy_mm_dd ASC",
       "$limit":"1000","$offset":String(page*1000)
     });
     const c=new AbortController(),tid=setTimeout(()=>c.abort(),20000);let response;
     try{response=await fetch(base+"?"+query,{signal:c.signal,headers:{"Accept":"application/json","User-Agent":"COT-Atlas-Historical/0.3"}})}
     finally{clearTimeout(tid)}
     if(!response.ok)throw Error("CFTC historical API HTTP "+response.status);
     const batch=await response.json();if(!Array.isArray(batch))throw Error("Unrecognized CFTC historical response");
     for(const x of batch){
       const oi=Number(x.open_interest_all),lng=Number(x[cols[0]]),sht=Number(x[cols[1]]);
       if(!(oi>0)||!Number.isFinite(lng)||!Number.isFinite(sht)||!x.report_date_as_yyyy_mm_dd)continue;
       rows.push([x.report_date_as_yyyy_mm_dd.slice(0,10),code,x.market_and_exchange_names||code,x.commodity_group_name||"Other",oi,lng,sht]);
     }
     if(batch.length<1000)break;
     if(page===4)throw Error("CFTC contract exceeds safe pagination limit");
   }
   if(rows.length<52)throw Error("Insufficient history for this specific contract/category");
   res.setHeader("Cache-Control","public,s-maxage=14400,stale-while-revalidate=28800");
   return res.status(200).json({source:"CFTC Public Reporting API (current revised history)",sourceType:"historical",report,category,contractCode:code,years,since,rows,rawRows:rows.length,asOf:rows.at(-1)[0],fetchedAt:new Date().toISOString(),pointInTimeVintageVerified:false,publicationTimesVerified:false,complete:true});
 }catch(e){console.error("Historical CFTC",report,code,e);return res.status(502).json({error:String(e.message).slice(0,170),report,code})}
}
