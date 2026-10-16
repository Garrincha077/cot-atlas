// COT Atlas official CFTC proxy; seven report datasets, no simulated positions.
const IDS={disagg_fut:"72hh-3qpy",disagg_comb:"kh3c-gbw2",tff_fut:"gpe5-46if",tff_comb:"yw9f-hn96",legacy_fut:"6dca-aqww",legacy_comb:"jun7-fc8e",supplemental:"4zgm-a668"};
const COLUMNS={"disagg":{"managed_money":["m_money_positions_long_all","m_money_positions_short_all"],"producer_merchant":["prod_merc_positions_long","prod_merc_positions_short"],"swap_dealer":["swap_positions_long_all","swap__positions_short_all"],"other_reportable":["other_rept_positions_long","other_rept_positions_short"],"nonreportable":["nonrept_positions_long_all","nonrept_positions_short_all"]},"tff":{"leveraged_funds":["lev_money_positions_long","lev_money_positions_short"],"asset_managers":["asset_mgr_positions_long","asset_mgr_positions_short"],"dealers":["dealer_positions_long_all","dealer_positions_short_all"],"other_reportable":["other_rept_positions_long","other_rept_positions_short"],"nonreportable":["nonrept_positions_long_all","nonrept_positions_short_all"]},"legacy":{"noncommercial":["noncomm_positions_long_all","noncomm_positions_short_all"],"commercial":["comm_positions_long_all","comm_positions_short_all"],"nonreportable":["nonrept_positions_long_all","nonrept_positions_short_all"]},"supplemental":{"index_traders":["cit_positions_long_all","cit_positions_short_all"],"commercial":["comm_positions_long_all_nocit","Comm_Positions_Short_All_NoCIT"],"nonreportable":["nonrept_positions_long_all","nonrept_positions_short_all"]}};
async function getJSON(url) {
  const c=new AbortController(), timeout=setTimeout(()=>c.abort(),23000);
  try{
    const r=await fetch(url,{headers:{Accept:"application/json","User-Agent":"COT-Atlas/0.3 (public futures research)"},signal:c.signal});
    if(!r.ok)throw Error("CFTC "+r.status+": "+(await r.text()).slice(0,140));
    return await r.json();
  }finally{clearTimeout(timeout)}
}
export default async function handler(req,res){
  if(req.method!=="GET")return res.status(405).json({error:"GET only"});
  const report=String(req.query.report||"disagg_fut"),family=report.split("_")[0],category=String(req.query.category||"managed_money");
  const cols=COLUMNS[family]?.[category];
  if(!IDS[report]||!cols)return res.status(400).json({error:"Invalid report or category"});
  const weeks=Math.min(180,Math.max(52,Math.floor(Number(req.query.weeks)||104)));
  const since=new Date(Date.now()-(weeks+10)*7*86400000).toISOString().slice(0,10);
  const fields=["report_date_as_yyyy_mm_dd","cftc_contract_market_code","market_and_exchange_names","commodity_group_name","open_interest_all",...cols];
  let rows=[],offset=0,seen=0;
  try{
    for(let page=0;page<10;page++){
      const p=new URLSearchParams({"$select":fields.join(","),"$where":"report_date_as_yyyy_mm_dd >= '"+since+"T00:00:00'","$order":"report_date_as_yyyy_mm_dd ASC","$limit":"12000","$offset":String(offset)});
      const result=await getJSON("https://publicreporting.cftc.gov/resource/"+IDS[report]+".json?"+p);
      if(!Array.isArray(result))throw Error("Unexpected CFTC response shape");
      for(const r of result){
        const oi=Number(r.open_interest_all),lng=Number(r[cols[0]]),sht=Number(r[cols[1]]);
        if(!r.cftc_contract_market_code||!r.report_date_as_yyyy_mm_dd||!(oi>0)||!Number.isFinite(lng)||!Number.isFinite(sht))continue;
        rows.push([r.report_date_as_yyyy_mm_dd.slice(0,10),r.cftc_contract_market_code,r.market_and_exchange_names||r.cftc_contract_market_code,r.commodity_group_name||"Other",oi,lng,sht]);
      }
      seen+=result.length;offset+=result.length;
      if(result.length<12000){
        res.setHeader("Cache-Control","public,s-maxage=10800,stale-while-revalidate=21600");
        return res.status(200).json({source:"CFTC Public Reporting API",dataset:IDS[report],report,category,since,rows,rawRows:seen,fetchedAt:new Date().toISOString(),complete:true});
      }
    }
    return res.status(503).json({error:"Coverage limit exceeded; refused partial CFTC result"});
  }catch(e){return res.status(502).json({error:"CFTC feed unavailable: "+String(e.message).slice(0,180),dataset:IDS[report]})}
}
