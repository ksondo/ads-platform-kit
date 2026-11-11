import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read=p=>readFileSync(new URL(p,import.meta.url),"utf8");
const catalogue=JSON.parse(read("../catalogue.json"));
const activation=JSON.parse(read("../demo-activation.json"));
const main=read("../main.js");
const css=read("../styles.css");
const expected=["commerce","education","agriculture","fleet-guard","digital-tontine"];

test("five priority demos stand apart from the 25-platform catalogue",()=>{
 assert.equal(catalogue.platforms.length,25);
 assert.equal(new Set(catalogue.platforms.map(p=>p.id)).size,25);
 const priority=catalogue.platforms.filter(p=>Number.isInteger(p.demoPriority)).sort((a,b)=>a.demoPriority-b.demoPriority);
 assert.deepEqual(priority.map(p=>p.id),expected);
 assert.deepEqual(priority.map(p=>p.demoPriority),[1,2,3,4,5]);
 assert.ok(!catalogue.platforms.find(p=>p.id==="ventureworks").demoPriority);
});
test("Commerce alone is verified in the source; four priority activations fail closed",()=>{
 assert.equal(catalogue.platforms.find(p=>p.id==="commerce").demoUrl,"https://commerce.demo.africadigitalsynergy.com/commerce/demo");
 for(const id of expected.slice(1)){
  const p=catalogue.platforms.find(p=>p.id===id);
  assert.equal(p.demoUrl,null);
  assert.equal(activation.products[id],"preparing");
  assert.match(p.demoDestination,/^https:\/\/[a-z0-9-]+\.demo\.africadigitalsynergy\.com\/demo$/);
 }
 assert.equal(activation.products.ventureworks,"preparing");
 assert.equal(catalogue.publicDemoRequestsEnabled,false);
});
test("home, directory and demo-access guide all prioritize the five demos",()=>{
 assert.match(main,/function priorityDemoSection\(\)/);
 assert.match(main,/return hero\(\)\+priorityDemoSection\(\)\+opportunityDiscoveryPaths\(\)/);
 assert.match(main,/function demoAccessGuide\(\)[\s\S]*priorityDemoSection\(\)/);
 assert.match(main,/function platformDirectory\(\)[\s\S]*if\(!q\)return[\s\S]*priorityDemoSection\(\)/);
 assert.doesNotMatch(main,/const ready=items\.filter\(p=>\["live","open"\]\.includes\(demoStatus\(p\)\)\)\.length/);
 assert.match(main,/href=open\?destinationUrl\(p\):demo\?withLang\(demo\):url/);
 assert.doesNotMatch(main,/data-testid="priority-demo-count"/);
 assert.match(css,/@media\(max-width:520px\).*priority-demo-grid/);
});
test("private instructions in both languages never imply all 25 demos are open",()=>{
 for (const line of ["Five priority demos","Cinq démos prioritaires","Open an available demo","Ouvrez une démo disponible"]){
  assert.ok(main.includes(line),line);
 }
 assert.ok(!main.includes("Open Commerce and use your individual ADS account"));
 assert.ok(!main.includes("Ouvrez Commerce et utilisez votre compte ADS individuel"));
});
