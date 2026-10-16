// COT Atlas Research Lab — per-contract historical comparison (NOT production-grade PIT).
import historical from "./historical.js";
import prices from "./prices.js";
import {research,STRATEGIES,HORIZONS} from "../lib/research-engine.mjs";
const counterparts={
 disagg:{managed_money:"producer_merchant",producer_merchant:"managed_money",swap_dealer:"managed_money",other_reportable:"producer_merchant",nonreportable:"producer_merchant"},
 tff:{leveraged_funds:"asset_managers",asset_managers:"leveraged_funds",dealers:"leveraged_funds",other_reportable:"asset_managers",nonreportable:"asset_managers"},
 legacy:{noncommercial:"commercial",commercial:"noncommercial",nonreportable:"commercial"},
 supplemental:{index_traders:"commercial",commercial:"index_traders",nonreportable:"commercial"}
};
function receiver(){return {statusCode:200,headers:{},status(code){this.statusCode=code;return this},setHeader(key,val){this.headers[key]=val},json(data){this.data=data;return data}}}
async function invoke(handler,query){
 const res=receiver();
 await handler({method:"GET",query},res);
 if(res.statusCode!==200||res.data?.error)throw new Error(String(res.data?.error||"Upstream error").slice(0,180));
 return res.data;
}
export default async function handler(req,res){
 if(req.method!=="GET")return res.status(405).json({error:"GET only"});
 const code=String(req.query.code||""),report=String(req.query.report||"disagg_fut");
 const category=String(req.query.category||"managed_money"),family=report.split("_")[0];
 const years=Number(req.query.years||10),window=Number(req.query.window||156),costBps=Number(req.query.costBps??20);
 const comparisonCategory=counterparts[family]?.[category];
 if(!/^[A-Za-z0-9+]{3,10}$/.test(code)||!["disagg_fut","disagg_comb","tff_fut","tff_comb","legacy_fut","legacy_comb","supplemental"].includes(report)||!comparisonCategory||![5,10].includes(years)||![52,104,156].includes(window)||!Number.isFinite(costBps)||costBps<0||costBps>500){
  return res.status(400).json({error:"Invalid report/category/code, history window or fee assumption"});
 }
 try{
  // Run all three independent upstream requests simultaneously but do not cache failed responses.
  const [primary,counter,price]=await Promise.all([
   invoke(historical,{report,category,code,years}),
   invoke(historical,{report,category:comparisonCategory,code,years}),
   invoke(prices,{code,years})
  ]);
  const result=research(primary.rows,counter.rows,price.rows,{window,costBps,horizons:HORIZONS});
  res.setHeader("Cache-Control","public,s-maxage=14400,stale-while-revalidate=28800");
  return res.status(200).json({
   source:"CFTC historical API (potentially revised) + Yahoo Finance continuous futures",
   report,category,comparisonCategory,comparisonInterpretation:family==="disagg"?"Producer/Merchant vs Managed Money when chosen":family==="tff"?"Asset managers vs leveraged funds: NOT a commercial/non-commercial split":family==="legacy"?"Commercial vs non-commercial positioning": "Index trader vs commercial positions",
   code,years,priceTicker:price.symbol,priceProvider:price.provider,
   priceType:price.priceSeries,pricesRollAdjusted:false,asPublishedCotVerified:false,
   fetchedAt:new Date().toISOString(),...result
  });
 }catch(e){
  console.error("Research Lab",code,report,category,e);
  return res.status(502).json({error:"Research unavailable: "+String(e.message).slice(0,190),
   guidance:"Select one of the price-mapped CFTC contracts, or use Market Explorer and CSV for unsupported instruments."});
 }
}
