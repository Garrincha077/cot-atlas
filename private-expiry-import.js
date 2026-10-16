/* COT Atlas v1.6 — local-only expiry CSV validation and price/COT coverage by year.
 * No uploads, no network, no persistence; validator rejects inferred/continuous ES/NQ.
 */
(function(root){"use strict";
const QUARTERS={H:3,M:6,U:9,Z:12};
const day=/^\d{4}-\d\d-\d\d$/;
function validDate(s){return typeof s==="string"&&day.test(s)&&Number.isFinite(Date.parse(s+"T00:00:00Z"))&&new Date(Date.parse(s+"T00:00:00Z")).toISOString().slice(0,10)===s}
function futureContractIsExplicit(rootName,contract,expiry){
 if(!["ES","NQ"].includes(rootName))return true;
 const rx=new RegExp("^"+rootName+"([HMUZ])(\\d{2})$");
 const hit=rx.exec(contract);
 if(!hit)return false;
 const year=2000+Number(hit[2]),month=QUARTERS[hit[1]];
 if(Number(expiry.slice(0,4))!==year||Number(expiry.slice(5,7))!==month)return false;
 // Quarterly equity futures last-trading days occur around the third Friday
 // (Thursday on certain exchange holidays). Flag impossible expiry metadata.
 const d=Number(expiry.slice(8,10));
 return d>=14&&d<=23;
}
function validate(text,rollEngine,{selectedRoot,minimumVolume=10,maxBytes=30*1024*1024}={}){
 if(!rollEngine?.parseCSV)throw Error("Ugovorni roll engine nije učitan");
 if(typeof text!=="string"||text.length>maxBytes)throw Error("CSV datoteka je prevelika (najviše 30 MB)");
 if(!selectedRoot||!["ES","NQ","GC","SI","HG","PL","CL","NG","ZN","ZB","ZC","ZS","ZW"].includes(selectedRoot))throw Error("Nepoznat osnovni futures ugovor");
 if(![1,10,100].includes(minimumVolume))throw Error("Volumen mora biti 1, 10 ili 100");
 // Preserve the original strict CSV parser's date, duplicates, expiry & multiplier checks.
 const parsed=rollEngine.parseCSV(text);
 if(parsed.marketRoot!==selectedRoot)throw Error("Root u CSV-u ("+parsed.marketRoot+") ne odgovara odabranom tržištu ("+selectedRoot+")");
 let rejected=0,earliest=null;
 const seenContracts=new Set(),filtered=[];
 for(const p of parsed.bars){
  if(!futureContractIsExplicit(selectedRoot,p.contract,p.expiry))throw Error(
   "Pojedinačno dospijeće nije dokazano iz ugovorne oznake: "+p.contract+" / "+p.expiry+
   ". ES/NQ zahtijeva izričiti H/M/U/Z i dvogodišnju oznaku (npr. NQZ24), ne kontinuirani ticker.");
  if(!(p.settle>0)||!Number.isFinite(p.settle))throw Error("Nevaljana cijena za "+p.contract+" na "+p.date);
  if(!Number.isFinite(p.volume))throw Error("CSV mora sadržavati volumen svakog pojedinačnog ugovora — nije dovoljan kontinuirani indeks");
  if(p.volume<minimumVolume){rejected++;continue}
  // Contract-specific observed close prices must have quoted tick steps;
  // cash final settlement can be off grid and is not an executable close.
  if(["ES","NQ"].includes(selectedRoot)&&Math.abs(p.settle/parsed.tickSize-Math.round(p.settle/parsed.tickSize))>1e-6)
   throw Error("Cijena izvan futures tick koraka u "+p.contract+" ("+p.date+"); ne zaokružavamo final settlement");
  seenContracts.add(p.contract);filtered.push(p);if(earliest===null||p.date<earliest)earliest=p.date;
 }
 const dates=[...new Set(filtered.map(p=>p.date))].sort();
 if(dates.length<3)throw Error("Nedovoljno datuma s provjerenim volumenom");
 if(["ES","NQ"].includes(selectedRoot)&&parsed.multiplier!==(selectedRoot==="ES"?50:20))
  throw Error("Pogrešan multiplier "+selectedRoot+": očekuje se "+(selectedRoot==="ES"?"50":"20")+" USD po indeksnom bodu");
 if(["ES","NQ"].includes(selectedRoot)&&parsed.tickSize!==0.25)
  throw Error("Nevažeći korak cijene: ES/NQ zahtijeva 0,25 boda");
 return {...parsed,bars:filtered,dates,contracts:seenContracts.size,firstDate:dates[0],lastDate:dates.at(-1),
  source:"Private in-browser explicit-contract CSV import; source provenance not verified",
  proxyPriceBasis:"PRIVATE_USER_SUPPLIED_EXPLICIT_EXPIRY_CLOSE_PROXY_NOT_CME_SETTLEMENT",
  localAudit:{inputRows:parsed.bars.length,acceptedRows:filtered.length,rejectedLowVolume:rejected,
    explicitContractLabels:true,selectedRoot,minimumVolume,earliest}};
}
function annual(cotRaw,priceData){
 if(!Array.isArray(cotRaw)||!priceData?.bars||!priceData?.dates)throw Error("Missing data to audit yearly coverage");
 const seenYears=new Set(cotRaw.map(x=>String(x[0]||"").slice(0,4)).filter(x=>/^\d{4}$/.test(x)));
 const yearlyCOT={};
 for(const row of cotRaw){let y=String(row[0]||"").slice(0,4);if(/^\d{4}$/.test(y))yearlyCOT[y]=(yearlyCOT[y]||0)+1}
 const annualPrices={},contractDates={};
 for(const p of priceData.bars){
  if(!validDate(p.date))throw Error("Unparseable futures quote date");
  const y=p.date.slice(0,4);
  annualPrices[y]=(annualPrices[y]||0)+1;
  if(!contractDates[y])contractDates[y]={contracts:new Set(),dates:new Set()};
  contractDates[y].contracts.add(p.contract);contractDates[y].dates.add(p.date);
 }
 for(const y of Object.keys(annualPrices))seenYears.add(y);
 return [...seenYears].sort().map(year=>{
  const o=contractDates[year],unique=o?.dates.size||0;
  const cot=yearlyCOT[year]||0;
  // Classification is ONLY quote availability, not trade-signal viability.
  return {year,cotReports:cot,contractDayQuotes:annualPrices[year]||0,
   uniquePriceDates:unique,individualContracts:o?.contracts.size||0,
   quoteAvailability:unique===0?"NO_PRICE_SOURCE":unique<40?"SPARSE":unique<160?"PARTIAL":"OBSERVED_160_PLUS",
   caution:"Quote counts measure coverage, not executable sessions, PIT vintages, or valid independent COT trades."};
 });
}
root.COT_LOCAL_PRICES={validate,annual,futureContractIsExplicit};
})(typeof window!=="undefined"?window:globalThis);
