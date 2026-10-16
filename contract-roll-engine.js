/* Contract Roll Lab v0.5 — settlement-to-settlement, contract-specific hypothetical P&L.
 * This DOES NOT provide independently sourced price data, audited executions,
 * a PIT COT backtest, margin accounting, or financial advice.
 * Browser-only user CSV; no network upload and no persistence. */
(function(root){"use strict";
const dayRe=/^\d{4}-\d{2}-\d{2}$/,MS=86400000;
const dateMs=x=>Date.parse(x+"T00:00:00Z");
function dateOK(x){return dayRe.test(x)&&Number.isFinite(dateMs(x))&&new Date(dateMs(x)).toISOString().slice(0,10)===x}
function days(a,b){return Math.round((dateMs(b)-dateMs(a))/MS)}
function csvFields(line){
 const a=[];let out="",quote=false;
 for(let i=0;i<line.length;i++){const c=line[i];
  if(c==='"'){if(quote&&line[i+1]==='"'){out+='"';i++}else quote=!quote}
  else if(c===","&&!quote){a.push(out.trim());out=""}
  else out+=c}
 if(quote)throw Error("Unclosed CSV quote");
 a.push(out.trim());return a;
}
function parseCSV(content,{maxRows=400000}={}){
 if(typeof content!=="string")throw Error("CSV must be text");
 const lines=content.replace(/^\uFEFF/,"").split(/\r?\n/).filter(x=>x.trim());
 if(lines.length<3)throw Error("CSV must contain at least two settlement bars and a header");
 if(lines.length-1>maxRows)throw Error("CSV exceeds per-file safety limit");
 const headers=csvFields(lines.shift()).map(h=>h.toLowerCase().replace(/\s+/g,"_"));
 const needed=["date","contract","expiry","settle","multiplier","tick_size"];
 for(const k of needed)if(!headers.includes(k))throw Error("Missing column: "+k);
 if(new Set(headers).size!==headers.length)throw Error("Repeated CSV header");
 const idx=name=>headers.indexOf(name);
 let bars=[],known=new Set(),contractExpiry=new Map(),multiplier=null,tickSize=null;
 for(let i=0;i<lines.length;i++){
  let row=csvFields(lines[i]);
  if(row.length!==headers.length)throw Error("CSV row "+(i+2)+": expected "+headers.length+" columns");
  const date=row[idx("date")],contract=row[idx("contract")],expiry=row[idx("expiry")];
  const settle=Number(row[idx("settle")]),m=Number(row[idx("multiplier")]),tick=Number(row[idx("tick_size")]);
  if(!dateOK(date)||!dateOK(expiry)||days(date,expiry)<0)throw Error("Invalid trade date or expiry on row "+(i+2));
  if(!/^[A-Za-z0-9_.-]{1,32}$/.test(contract))throw Error("Invalid contract identifier on row "+(i+2));
  if(!Number.isFinite(settle)||!Number.isFinite(m)||m<=0||!Number.isFinite(tick)||tick<=0)throw Error("Bad settlement, multiplier or tick size on row "+(i+2));
  if(multiplier!==null&&(m!==multiplier||tick!==tickSize))throw Error("Mixed contract specifications; upload one underlying/multiplier/tick size per file");
  multiplier=m;tickSize=tick;
  if(contractExpiry.has(contract)&&contractExpiry.get(contract)!==expiry)throw Error("Expiry date changed for "+contract);
  contractExpiry.set(contract,expiry);
  const key=date+"|"+contract;if(known.has(key))throw Error("Duplicate contract+date: "+key);known.add(key);
  let volume=null;
  if(idx("volume")>=0&&row[idx("volume")]!==""){
   volume=Number(row[idx("volume")]);if(!Number.isFinite(volume)||volume<0)throw Error("Bad volume on row "+(i+2));
  }
  bars.push({date,contract,expiry,settle,volume});
 }
 bars.sort((a,b)=>a.date.localeCompare(b.date)||a.expiry.localeCompare(b.expiry)||a.contract.localeCompare(b.contract));
 const dates=[...new Set(bars.map(x=>x.date))];
 if(dates.length<3)throw Error("At least three distinct settlement dates required");
 return {bars,dates,multiplier,tickSize,contracts:contractExpiry.size,firstDate:dates[0],lastDate:dates.at(-1),source:"User-imported CSV. Provenance NOT verified."}
}
function prepare(data){
 const byDate=new Map(),byKey=new Map();
 for(const bar of data.bars){
  if(!byDate.has(bar.date))byDate.set(bar.date,[]);
  byDate.get(bar.date).push(bar);byKey.set(bar.date+"|"+bar.contract,bar);
 }
 return {byDate,byKey};
}
function firstEligible(quotes,date,rollDays){
 return quotes.filter(q=>days(date,q.expiry)>rollDays).sort((a,b)=>a.expiry.localeCompare(b.expiry)||a.contract.localeCompare(b.contract))[0]||null;
}
function simulate(data,opts={}){
 if(!data?.bars?.length||!data?.dates?.length)throw Error("First import valid settlement records");
 const {start,end,side="long",rollDays=5,method="fixed",commissionPerSide=0,slippageTicks=0,contracts=1}=opts;
 if(!dateOK(start)||!dateOK(end)||start>end)throw Error("Choose valid entry and exit dates");
 if(!["long","short"].includes(side)||!["fixed","volume2"].includes(method))throw Error("Invalid position direction/roll mode");
 if(!Number.isInteger(rollDays)||rollDays<1||rollDays>45)throw Error("Roll lead must be 1–45 calendar days");
 if(!Number.isInteger(contracts)||contracts<1||contracts>10000)throw Error("Contracts must be a positive integer");
 if(!Number.isFinite(commissionPerSide)||commissionPerSide<0||commissionPerSide>10000||!Number.isFinite(slippageTicks)||slippageTicks<0||slippageTicks>100)throw Error("Invalid cost assumptions");
 const dates=data.dates.filter(d=>d>=start&&d<=end);
 if(dates.length<3)throw Error("Need at least three settlement sessions inside the requested period");
 if(days(start,dates[0])>7||days(dates.at(-1),end)>7)throw Error("Entry or exit date is too far from an available settlement bar");
 const {byDate,byKey}=prepare(data),direction=side==="long"?1:-1;
 const oneSideCost=contracts*(commissionPerSide+slippageTicks*data.tickSize*data.multiplier);
 const transactions=[],equity=[],anomalies=[];let pnl=0,fees=0,held=null,previousBar=null,rolls=0,gross=0;
 function charge(date,event,from,to,count){
  const cost=oneSideCost*count;fees+=cost;transactions.push({date,event,from:from||"",to:to||"",costUSD:+cost.toFixed(2)});
 }
 for(let index=0;index<dates.length;index++){
  const date=dates[index],quotes=byDate.get(date);
  if(index>0&&days(dates[index-1],date)>6)anomalies.push("Gap of "+days(dates[index-1],date)+" calendar days before "+date);
  if(index===0){
   held=firstEligible(quotes,date,rollDays);
   if(!held)throw Error("No eligible contract with expiry more than "+rollDays+" days away on entry date");
   previousBar=held;charge(date,"entry","",held.contract,1);
   equity.push({date,held:held.contract,dailyGrossUSD:0,cumulativeGrossUSD:0,cumulativeNetUSD:+(gross-fees).toFixed(2)});
   continue;
  }
  const current=byKey.get(date+"|"+held.contract);
  if(!current)throw Error("Missing settlement for HELD contract "+held.contract+" on "+date+" — simulation stopped (no forward fill)");
  const diff=current.settle-previousBar.settle;
  const dailyGross=direction*contracts*diff*data.multiplier;
  if(!Number.isFinite(dailyGross))throw Error("Non-finite contract P&L on "+date);
  gross+=dailyGross;
  if(Math.abs(diff)>=Math.max(data.tickSize*1000,Math.abs(previousBar.settle)*.2))anomalies.push("Large same-contract settlement change on "+date+" for "+held.contract);
  let newHeld=current;
  if(index<dates.length-1){
   const forced=days(date,current.expiry)<=rollDays;
   let next=null;
   if(forced){
    next=firstEligible(quotes,date,rollDays);
    if(!next||next.contract===current.contract)throw Error("Roll required but next eligible contract missing on "+date);
   }else if(method==="volume2"){
    const list=quotes.filter(q=>days(date,q.expiry)>rollDays&&q.expiry>current.expiry).sort((a,b)=>a.expiry.localeCompare(b.expiry));
    const candidate=list[0];
    if(candidate&&current.volume!=null&&candidate.volume!=null&&candidate.volume>current.volume){
     const prevDate=dates[index-1],pv=byKey.get(prevDate+"|"+candidate.contract),pf=byKey.get(prevDate+"|"+current.contract);
     if(pv&&pf&&pv.volume!=null&&pf.volume!=null&&pv.volume>pf.volume)next=candidate;
    }
   }
   if(next&&next.contract!==current.contract){
    charge(date,"roll",current.contract,next.contract,2);
    transactions[transactions.length-1].oldSettle=current.settle;
    transactions[transactions.length-1].newSettle=next.settle;
    rolls++;newHeld=next;
   }
  }
  if(index===dates.length-1)charge(date,"exit",current.contract,"",1);
  const cumulativeGrossUSD=+gross.toFixed(2),cumulativeNetUSD=+(gross-fees).toFixed(2);
  equity.push({date,held:newHeld.contract,dailyGrossUSD:+dailyGross.toFixed(2),cumulativeGrossUSD,cumulativeNetUSD});
  held=newHeld;previousBar=newHeld;
 }
 const net=gross-fees,peak=Math.max(0,...equity.map(x=>x.cumulativeNetUSD));let runningPeak=0,drawdown=0;
 for(const r of equity){runningPeak=Math.max(runningPeak,r.cumulativeNetUSD);drawdown=Math.min(drawdown,r.cumulativeNetUSD-runningPeak)}
 const metadata={source:data.source,priceRows:data.bars.length,contractsInFile:data.contracts,
  firstDate:data.firstDate,lastDate:data.lastDate,multiplier:data.multiplier,tickSize:data.tickSize};
 return {status:"CONTRACT_SETTLEMENT_RESEARCH_ONLY",verifiedVendorSource:false,
  methodology:"P&L = position direction × (today settlement − previous settlement OF THE SAME HELD CONTRACT) × contract multiplier × contracts; roll close/open at same-day settlements; no cross-contract price gap booked as P&L.",
  metadata,parameters:{start,end,side,rollDays,method,commissionPerSide,slippageTicks,contracts},
  result:{grossUSD:+gross.toFixed(2),costsUSD:+fees.toFixed(2),netUSD:+net.toFixed(2),maxDrawdownUSD:+drawdown.toFixed(2),rolls,sessionCount:dates.length,entryDate:dates[0],exitDate:dates.at(-1)},
  transactions,equity,anomalies};
}
root.COT_ROLL_ENGINE={parseCSV,simulate};
})(typeof window!=="undefined"?window:globalThis);
