import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const root=new URL("../",import.meta.url);
const file=(p)=>fs.readFileSync(new URL(p,root),"utf8");
test("CFTC flagship historical downloader includes all seven official datasets",()=>{
 const script=file("scripts/build_core_history.py");
 for(const id of ["72hh-3qpy","kh3c-gbw2","gpe5-46if","yw9f-hn96","6dca-aqww","jun7-fc8e","4zgm-a668"])assert.ok(script.includes(id),id);
 assert.ok(script.includes('"1986-01-01"'));
 assert.ok(script.includes('"2006-01-01"'));
 assert.ok(script.includes("PRAGMA integrity_check"));
 assert.ok(script.includes("archive")||script.includes("ARCHIVE"));
});
test("public historical endpoint discloses current revised values and no bundled futures prices",()=>{
 const api=file("api/core-history.js");
 assert.ok(api.includes("asPublishedVintageVerified:false"));
 assert.ok(api.includes("pricesIncluded:false"));
 assert.ok(api.includes("archiveGeneratedAt"));
 assert.ok(api.includes("COLUMNS"));
 assert.ok(api.includes("maxOutputLength"));
});
test("archive explorer validates client Javascript, exposes years and source audit",()=>{
 const html=file("history.html");
 const inline=html.match(/<script>([\s\S]*?)<\/script>/);
 assert.ok(inline);
 assert.doesNotThrow(()=>new Function(inline[1]));
 assert.ok(html.includes('value="45"'));
 assert.ok(html.includes("/api/core-history?"));
 assert.ok(html.includes("snapshotSHA256"));
 assert.ok(html.includes("Izvezi CSV"));
});
test("downloaded historical positions never represented as a PIT release vintage",()=>{
 const api=file("api/core-history.js");
 const script=file("scripts/build_core_history.py");
 assert.ok(api.includes("not release vintages"));
 assert.ok(script.includes('"vintage_verified":False'));
});
