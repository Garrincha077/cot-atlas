/* COT Atlas v1.2 — evidence quality gates for exploratory futures studies.
 * This module NEVER labels current-revision COT + Yahoo close proxies PIT-validated.
 */
(function(root){"use strict";
const MS=86400000;
const diff=(a,b)=>a&&b?Math.round((Date.parse(b+"T00:00:00Z")-Date.parse(a+"T00:00:00Z"))/MS):0;
const months=t=>new Set(t.map(x=>x.entry.slice(0,7)));
function assess({train=[],holdout=[],boundaryExcluded=[],splitDate,priceDates=[]}={}){
 if(typeof splitDate!=="string")throw Error("Split date is required");
 const out=holdout.slice().sort((a,b)=>a.entry.localeCompare(b.entry));
 const inside=train.slice().sort((a,b)=>a.entry.localeCompare(b.entry));
 if(inside.some(x=>x.exit>=splitDate))throw Error("Leakage: training trade exits on or after holdout split");
 if(out.some(x=>x.entry<splitDate))throw Error("Leakage: holdout trade enters before holdout split");
 const total=inside.length+out.length,monthsHoldout=months(out).size;
 const first=out[0]?.entry||null,last=out.at(-1)?.exit||null;
 const span=first&&last?diff(first,last):0;
 const prices=priceDates.filter(x=>typeof x==="string").sort();
 const priceSpan=prices.length>1?diff(prices[0],prices.at(-1)):0;
 const years=new Set(out.map(x=>x.entry.slice(0,4))).size;
 const reasons=[];
 if(inside.length<8)reasons.push("TRAIN_FEWER_THAN_8");
 if(out.length<8)reasons.push("HOLDOUT_FEWER_THAN_8");
 if(monthsHoldout<4)reasons.push("HOLDOUT_FEWER_THAN_4_DISTINCT_MONTHS");
 if(span<120)reasons.push("HOLDOUT_SPAN_LESS_THAN_120_DAYS");
 if(priceSpan<365)reasons.push("PRICE_SPAN_LESS_THAN_365_DAYS");
 // Trade windows straddling the chronological boundary are purged, not placed in either sample.
 return {classification:reasons.length?"INSUFFICIENT":"EXPLORATORY_ONLY",
  reasonCodes:reasons,trainTrades:inside.length,holdoutTrades:out.length,
  excludedCrossSplit:boundaryExcluded.length,holdoutDistinctMonths:monthsHoldout,
  holdoutDistinctYears:years,holdoutSpanDays:span,observedPriceSpanDays:priceSpan,
  comparisonEligible:reasons.length===0,
  vintagePITCertified:false,exchangeSettlementCertified:false,
  caution:"Even EXPLORATORY_ONLY is not an investable COT edge. CFTC revisions, publication-time assumptions, Yahoo close proxies, order execution and multiple testing are not independently validated."};
}
root.COT_QUALITY={assess};
})(typeof window!=="undefined"?window:globalThis);
