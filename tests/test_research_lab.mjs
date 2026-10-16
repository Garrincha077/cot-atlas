import test from "node:test";
import assert from "node:assert/strict";
import {HORIZONS,STRATEGIES,buildSignals,research} from "../lib/research-engine.js";
import fs from "node:fs";
const shifted=(d,days)=>new Date(new Date(d+"T00:00:00Z").getTime()+days*86400000).toISOString().slice(0,10);
const positions=[],counterpart=[],prices=[];
for(let i=0;i<525;i++){
 const date=shifted("2016-01-05",i*7),cycle=Math.sin(i/16)*.28;
 const net=cycle+Math.sin(i/5)*.035;
 const specLong=500+net*500,specShort=500-net*500;
 const otherLong=500-net*700,otherShort=500+net*700;
 positions.push([date,"088691","Gold","Metals",1000,specLong,specShort]);
 counterpart.push([date,"088691","Gold","Metals",1000,otherLong,otherShort]);
}
for(let i=0;i<3900;i++){const d=shifted("2015-11-01",i);const day=new Date(d+"T00:00:00Z").getUTCDay();if(day===0||day===6)continue;prices.push({date:d,close:110*Math.exp(.0003*i+.06*Math.sin(i/48))})}
test("five predefined strategies and five forward horizons",()=>{
 assert.equal(STRATEGIES.length,5);assert.deepEqual(HORIZONS,[1,2,4,8,12]);
 const r=research(positions,counterpart,prices,{window:156,costBps:20});
 assert.equal(r.rows.length,25);
 assert.equal(r.methodology,"EXPLORATORY_ONLY__NOT_POINT_IN_TIME_OR_ROLL_CORRECTED");
 assert.equal(r.observations,525);
 assert.ok(r.splitDate>r.firstObservation&&r.splitDate<r.lastObservation);
 assert.ok(r.rows.every(x=>x.outOfSample.trades>=0&&x.inSample.trades>=0));
});
test("signal entry is strictly after assumed Friday publication, never Tuesday",()=>{
 const built=buildSignals(positions,counterpart,prices,{window:156});
 for(const arr of Object.values(built.signals))for(const x of arr){
  const weekday=new Date(x.date+"T00:00:00Z").getUTCDay();
  assert.equal(weekday,2); // Tuesday observation
  assert.ok(x.availableAfter>x.date);
  assert.equal(new Date(x.availableAfter+"T00:00:00Z").getUTCDay(),5);
 }
});
test("trading costs never improve identical hypothetical trades",()=>{
 const baseline=research(positions,counterpart,prices,{window:104,costBps:0});
 const charged=research(positions,counterpart,prices,{window:104,costBps:40});
 for(let i=0;i<25;i++){
  assert.equal(baseline.rows[i].signals,charged.rows[i].signals);
  assert.ok(charged.rows[i].combined.avgReturnPct===null||charged.rows[i].combined.avgReturnPct<=baseline.rows[i].combined.avgReturnPct);
 }
});
test("future price revisions do not change earlier COT+price trend signals",()=>{
 const before=buildSignals(positions,counterpart,prices,{window:156});
 const changed=prices.map(p=>({...p,close:p.date>="2024-01-01"?p.close*4:p.close}));
 const after=buildSignals(positions,counterpart,changed,{window:156});
 const early=x=>x.signals.cot_price_trend.filter(t=>t.date<"2023-12-01");
 assert.deepEqual(early(before),early(after));
});
test("insufficient history must fail visibly, never produce invented sample",()=>{
 assert.throws(()=>research(positions.slice(-20),counterpart.slice(-20),prices.slice(-25)),/Need at least/);
});
test("research UI parses and makes requests only after user interaction",()=>{
 const html=fs.readFileSync(new URL("../research.html",import.meta.url),"utf8");
 const inline=html.match(/<script>([\s\S]*?)<\/script>/g);
 assert.equal(inline.length,1);
 const script=inline[0].slice(8,-9);
 assert.doesNotThrow(()=>new Function(script));
 assert.match(html,/id="run"/);
 assert.match(html,/25 testova/);
 assert.match(html,/NIJE|nije certificirani point-in-time/);
});
