import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read=p=>fs.readFileSync(new URL("../"+p,import.meta.url),"utf8");

test("free per-expiry feed is strictly limited to named verified symbols",()=>{
 const api=read("api/free-contracts.js");
 for(const x of ["GCZ25.CMX","GCZ26.CMX","GCG27.CMX","ESZ26.CME","ESH27.CME","CLZ26.NYM","CLF27.NYM"])assert.ok(api.includes(x),x);
 for(const x of ['expiry:"2025-12-29"','expiry:"2026-12-29"','expiry:"2026-12-18"','expiry:"2026-11-20"'])assert.ok(api.includes(x),x);
 assert.ok(api.includes('Cache-Control","private,no-store'));
 assert.ok(api.includes("YAHOO_DAILY_CLOSE_PROXY__NOT_EXCHANGE_SETTLEMENT"));
});
test("free contract feed excludes post-expiry prices and volume-zero quotes",()=>{
 const api=read("api/free-contracts.js");
 assert.match(api,/x\.date<=c\.expiry/);
 assert.match(api,/x\.volume>0/);
 assert.match(api,/if\(!conf\)return res\.status\(400\)/);
 assert.match(api,/licensedExchangeSettlements:false/);
});
test("free contract UI retains manual local file import with unambiguous provenance",()=>{
 const html=read("roll-lab.html"),inline=html.match(/<script>([\s\S]*?)<\/script>/);
 assert.ok(inline);
 assert.doesNotThrow(()=>new Function(inline[1]));
 for(const id of ['id="freeLoad"','id="freeRoot"','id="csv"','id="simulate"','id="sourceStatus"'])assert.ok(html.includes(id),id);
 assert.ok(html.includes("NE službeni settlementi"));
 assert.ok(html.includes("crypto.subtle.digest"));
});
