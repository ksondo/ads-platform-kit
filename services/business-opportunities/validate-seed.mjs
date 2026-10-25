import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
const file=fileURLToPath(new URL('./seed/opportunities.v1.json',import.meta.url));
export function loadAndValidate(){
  const data=JSON.parse(fs.readFileSync(file,'utf8'));
  const unique=(a,field)=>new Set(a.map(x=>x[field])).size===a.length;
  if(data.schemaVersion!==1 || data.sectors.length!==49 || data.opportunities.length!==328 || data.businesses.length!==52) throw Error('Expected 49 sectors, 328 sector-to-tool opportunities and 52 business profiles');
  if(!unique(data.sectors,'id')||!unique(data.capabilities,'id')||!unique(data.opportunities,'id')||!unique(data.businesses,'id'))throw Error('Duplicate catalogue identifiers');
  const sectorIds=new Set(data.sectors.map(x=>x.id)), capIds=new Set(data.capabilities.map(x=>x.id));
  for(const x of data.opportunities){
    if(!sectorIds.has(x.sectorId)||!capIds.has(x.capabilityId)||!x.summaryEn?.trim()||!x.modelEn?.trim()||x.status!=='discovery_only')throw Error('Invalid opportunity '+x.id);
  }
  return data;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const data=loadAndValidate();
 console.log('ADS_OPPORTUNITIES_SEED_VALID=PASS sectors='+data.sectors.length+' entries='+data.opportunities.length+' businesses='+data.businesses.length);
}
