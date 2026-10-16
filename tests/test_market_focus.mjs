import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
const html=fs.readFileSync(new URL("../index.html",import.meta.url),"utf8");
const catalog=fs.readFileSync(new URL("../core-markets.js",import.meta.url),"utf8");
const context={window:{}};
vm.runInNewContext(catalog,context);
const core=context.window.COT_MAJOR_MARKETS;
test("core CFTC markets are explicit, unique and ordered",()=>{
 assert.equal(core.length,34);
 const ids=core.map(x=>x.code);
 assert.equal(new Set(ids).size,ids.length);
 for(let i=0;i<core.length;i++){
  assert.match(core[i].code,/^[A-Za-z0-9+]{3,10}$/);
  assert.equal(core[i].order,i+1);
  assert.ok(core[i].sector && core[i].label);
 }
});
test("curated universe includes all key cross-asset examples",()=>{
 const ids=new Set(core.map(x=>x.code));
 for(const code of ["13874A","209742","043602","042601","088691","084691","067651","023651","099741","002602","005602","133741"])assert.ok(ids.has(code),code);
 assert.ok(new Set(core.map(x=>x.sector)).size>=7);
});
test("UI scripts parse and major/secondary/history controls exist",()=>{
 assert.ok(html.includes('<script src="/core-markets.js"></script>'));
 const scripts=html.match(/<script>([\s\S]*?)<\/script>/);
 assert.ok(scripts);
 assert.doesNotThrow(()=>new Function(scripts[1]));
 for(const token of ['data-focus="major"','data-focus="other"','data-focus="all"','id="coreSector"','loadHistorical(years)','data-years="10"','feeBps'])assert.ok(html.includes(token),token);
});
test("legacy/main prices remain linked with ten-year option",()=>{
 const p=fs.readFileSync(new URL("../api/prices.js",import.meta.url),"utf8");
 const h=fs.readFileSync(new URL("../api/historical.js",import.meta.url),"utf8");
 assert.ok(p.includes("years")&&p.includes("10"));
 assert.ok(h.includes("years")&&h.includes("pointInTimeVintageVerified:false"));
});
