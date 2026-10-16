import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import fs from "node:fs";
import {PINNED,checkLockedFile,checkArchiveManifest} from "../scripts/check_source_integrity.mjs";
import {SOURCES} from "../api/community-expiries.js";
import {EXPECTED_SHA256} from "../api/nq-evaluation.js";

const now=Date.parse("2026-10-16T17:00:00Z");
const fixtureManifest={
 generated_at:"2026-10-16T09:59:32Z",point_in_time_verified:false,
 datasets:["disagg_fut","disagg_comb","tff_fut","tff_comb","legacy_fut","legacy_comb","supplemental"].map(report=>({report,latest_report:"2026-10-06"}))
};
test("source pins are a complete allowlist with SHA-256 for four ES expiries and NQ",()=>{
 assert.equal(SOURCES.length,4);assert.equal(PINNED.length,5);
 assert.equal(PINNED.filter(x=>x.id.startsWith("ES")).length,4);
 assert.ok(PINNED.every(x=>/^[0-9a-f]{64}$/.test(x.sha256)));
 assert.equal(PINNED.at(-1).sha256,EXPECTED_SHA256);
 const src=fs.readFileSync(new URL("../api/community-expiries.js",import.meta.url),"utf8");
 assert.match(src,/contract quarantined until reviewed/);
 assert.match(src,/actualSha256!==source.sha256/);
});
test("locked-source check accepts identical content, rejects changed bytes and bad status",async()=>{
 const content=Buffer.alloc(220,65);
 const item={id:"test",url:"https://example.invalid/a",sha256:createHash("sha256").update(content).digest("hex"),maxBytes:1000};
 const fetcher=async()=>({ok:true,headers:{get:()=>String(content.length)},arrayBuffer:async()=>content});
 let r=await checkLockedFile(item,fetcher);assert.equal(r.ok,true);
 r=await checkLockedFile({...item,sha256:"f".repeat(64)},fetcher);
 assert.equal(r.ok,false);assert.match(r.reason,/changed/);
 await assert.rejects(checkLockedFile(item,async()=>({ok:false,status:503})),/HTTP 503/);
});
test("CFTC historical archive watch correctly detects genuine lateness and missing feeds",()=>{
 const a=checkArchiveManifest(fixtureManifest,now);
 assert.equal(a.ok,true);assert.equal(a.datasets,7);assert.equal(a.oldestReport,"2026-10-06");
 const stale=checkArchiveManifest({...fixtureManifest,generated_at:"2026-09-20T09:59:32Z"},now);
 assert.equal(stale.ok,false);assert.ok(stale.issues.some(x=>/generation/.test(x)));
 const missing=checkArchiveManifest({...fixtureManifest,datasets:fixtureManifest.datasets.slice(0,6)},now);
 assert.equal(missing.ok,false);assert.ok(missing.issues.some(x=>/missing/.test(x)));
 const overdue=checkArchiveManifest({...fixtureManifest,datasets:fixtureManifest.datasets.map(x=>({...x,latest_report:"2026-09-01"}))},now);
 assert.equal(overdue.ok,false);assert.ok(overdue.issues.some(x=>/older than 21/.test(x)));
});
test("weekly health action alerts only on bad upstream health with no vendor quotes saved",()=>{
 const workflow=fs.readFileSync(new URL("../.github/workflows/source-watch.yml",import.meta.url),"utf8");
 assert.match(workflow,/workflow_dispatch/);
 assert.match(workflow,/issues: write/);
 assert.match(workflow,/gh issue create/);
 assert.match(workflow,/gh issue close/);
 assert.match(workflow,/source-health\.json/);
 assert.ok(!workflow.includes("git push"));
});
