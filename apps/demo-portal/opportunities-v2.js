// ADS Business Opportunities v2: only /opportunities routes.
// All listings, families, groups, solutions and module tags come from PostgreSQL API.
const BASE='/api/opportunities/v1';
const wa='https://wa.me/237654035075';
const escapeHtml=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const langText={
en:{
 title:'Business Opportunities',desc:'Explore digital business possibilities and reusable tools for your industry. Discover how complementary modules can work together.',
 business:'Business Sectors',institutional:'Institutional & Regulatory Services',
 businessSub:'Opportunities by industry and business type',institutionalSub:'Opportunities connecting businesses to institutions',
 search:'Search opportunities',searchPlaceholder:'e.g. sawmill, packaging, export, tax…',searchHelp:'Search by business activity, sector or digital tool',filters:'Filters',reset:'Clear filters',
 category:'Sector or service',all:'All categories',view:'Explore',bundles:'Complete business solutions',tools:'Individual digital tools',module:'Tools & modules',allModules:'Any module',sort:'Sort',relevance:'Catalogue order',alphabetical:'Name A–Z',status:'Availability',allStatus:'All proposed opportunities',
 results:'Opportunities',summary:'Business idea summary',ideal:'Relevant businesses',suggested:'Recommended digital tools',disclaimer:'This is an introduction to a potential digital solution, not a complete implementation blueprint. ADS can discuss availability and integration requirements.',
 proposed:'Concept / proposed',see:'View details',contact:'Contact ADS on WhatsApp',platforms:'Explore platforms and demos',back:'Back to catalogue',close:'Close',more:'Next',previous:'Previous',empty:'No matching opportunities. Try another activity or clear the filters.',error:'The opportunity catalogue is temporarily unavailable. Other ADS pages remain accessible.',loading:'Loading opportunities…',step:'Explore ideas here, then visit Platforms to try verified demos using shared ADS sign-in.',english:'Descriptions are in English while the French catalogue is reviewed.',noCopy:'This public preview intentionally shares only the business summary.',allFamilies:'Discover digital opportunities',example:'Example businesses',requirements:'Institutional activity is subject to authorization and approved partner arrangements.'
},
fr:{
 title:"Opportunités d'affaires",desc:"Explorez les possibilités d'activités numériques et les outils réutilisables adaptés à votre secteur.",
 business:"Secteurs d'activité",institutional:'Services institutionnels et réglementaires',
 businessSub:"Opportunités par industrie et activité",institutionalSub:"Services reliant les entreprises aux institutions",
 search:'Rechercher',searchPlaceholder:'ex. scierie, emballage, export, impôts…',searchHelp:"Rechercher par activité, secteur ou outil numérique",filters:'Filtres',reset:'Effacer',
 category:'Secteur ou service',all:'Toutes les catégories',view:'Explorer',bundles:"Solutions d'entreprise complètes",tools:'Outils numériques individuels',module:'Outils et modules',allModules:'Tous les modules',sort:'Trier',relevance:'Ordre du catalogue',alphabetical:'Nom A–Z',status:'Disponibilité',allStatus:'Toutes les propositions',
 results:'Opportunités',summary:"Résumé de l'idée",ideal:'Entreprises concernées',suggested:'Outils numériques recommandés',disclaimer:"Ceci est une présentation de l'idée, et non un plan de réalisation complet. ADS peut préciser les possibilités et les conditions d'intégration.",
 proposed:'Concept / proposition',see:'Voir le résumé',contact:'Contacter ADS sur WhatsApp',platforms:'Voir les plateformes et les démos',back:'Retour au catalogue',close:'Fermer',more:'Suivant',previous:'Précédent',empty:'Aucun résultat. Essayez une autre activité ou effacez les filtres.',error:'Le catalogue est momentanément indisponible. Les autres pages ADS restent accessibles.',loading:'Chargement des opportunités…',step:"Explorez les idées puis ouvrez une démo vérifiée dans Plateformes avec la connexion ADS.",english:'Les descriptions restent en anglais en attendant la validation française.',noCopy:'Seul un résumé public est présenté.',allFamilies:'Découvrez les opportunités numériques',example:"Exemples d'entreprises",requirements:'Les services institutionnels exigent les autorisations appropriées.'
}};
const familyIcons={'business':'▦','institutional':'▤'};
const categoryIcons={
'business-agriculture':'🌱','business-processing':'🏭','business-commerce':'🛒','business-construction':'🏗️','business-mobility':'🚚','business-tourism':'🏨','business-education':'🎓','business-health':'🏥','business-services':'🛠️','business-finance':'🏦','business-communities':'🤝','business-technology':'💻','business-environment':'♻️',
'institutional-formalities':'🏢','institutional-tax':'📑','institutional-trade':'🚢','institutional-banking':'🏦','institutional-standards':'🛡️','institutional-licensing':'📋','institutional-insurance':'🔒','institutional-multiagency':'🌐'};
const photos={
'business-processing':'photo-1532601224476-15c79f2f7a51','business-agriculture':'photo-1500382017468-9049fed747ef','business-commerce':'photo-1556742049-0cfed4f6a45d',
'business-construction':'photo-1486406146926-c627a92ad1ab','business-mobility':'photo-1519003722824-194d4455a60c','business-tourism':'photo-1517841905240-472988babdf9',
'business-education':'photo-1509062522246-3755977927d7','business-health':'photo-1576091160399-112ba8d25d1d','business-finance':'photo-1611974789855-9c2a0a7236a3',
'institutional-trade':'photo-1578575437130-527eed3abbec','institutional-tax':'photo-1454165804606-c3d57bc86b40','institutional-banking':'photo-1541354329998-f4d9a9f9297f'
};
let seq=0,returnFocus=null,modalRestoreUrl='';
const fetchJSON=async path=>{
 const response=await fetch(BASE+path,{headers:{accept:'application/json'},credentials:'omit',cache:'no-store'});
 if(!response.ok)throw Error('Catalog response '+response.status);
 return response.json();
};
const L=x=>escapeHtml(x);
const tFor=lang=>langText[lang]||langText.en;
const photo=id=>'https://images.unsplash.com/'+(photos[id]||'photo-1497366811353-6870744d04b2')+'?auto=format&fit=crop&w=740&q=70';
const button=(label,action,cls='',attrs='')=>'<button type="button" class="'+L(cls)+'" data-action="'+L(action)+'" '+attrs+'>'+L(label)+'</button>';
const contact=t=>'<a class="btn btn-gold opp-whatsapp" href="'+wa+'" rel="noopener noreferrer" target="_blank">'+L(t.contact)+' ↗</a>';
export const directoryShell=()=>'<div id="opportunities-app"></div>';
export const detailShell=directoryShell;
function stateFromURL(){
 const p=new URLSearchParams(location.search);
 const family=p.get('family')==='institutional'?'institutional':'business';
 const platform=p.get('platform')||'';
 const platformCategory={commerce:'business-commerce',education:'business-education',healthcare:'business-health',agriculture:'business-agriculture',finance:'business-finance',transport:'business-mobility',ventureworks:'business-technology',morphoo:'business-communities'}[platform]||'';
 return {family,category:p.get('category')||platformCategory,view:p.get('view')==='tools'&&family==='business'?'tools':'bundles',
  q:p.get('q')||'',module:p.get('module')||'',sort:p.get('sort')==='name'?'name':'relevance',
  page:Math.max(1,Math.min(1000,Number(p.get('page'))||1))};
}
function goto(update){
 const current=stateFromURL(),s={...current,...update};if(s.family==='institutional')s.view='bundles';
 const p=new URLSearchParams();
 if(s.family==='institutional')p.set('family','institutional');
 if(s.category)p.set('category',s.category);
 if(s.view==='tools')p.set('view','tools');
 if(s.q)p.set('q',s.q);
 if(s.module)p.set('module',s.module);
 if(s.sort==='name')p.set('sort','name');
 if(s.page>1)p.set('page',String(s.page));
 const url='/opportunities'+(p.toString()?'?'+p.toString():'');
 history.pushState({},'',url);
 hydrate('/opportunities',window.document.documentElement.lang||'en');
}
const opts=(items,selected)=>items.map(x=>'<option value="'+L(x.id)+'"'+(x.id===selected?' selected':'')+'>'+L(x.name)+'</option>').join('');
function frame(t,body){
 return '<section class="opp-hero"><div class="container opp-hero-body"><div class="opp-hero-copy"><h1>'+L(t.title)+'</h1><h2>'+L(t.allFamilies)+'</h2><p>'+L(t.desc)+'</p><div class="opp-hero-facts"><span>◈ '+L(t.business)+'</span><span>▦ '+L(t.suggested)+'</span><span>✦ '+L(t.institutional)+'</span></div></div><div class="opp-hero-image" aria-hidden="true"></div><div class="opp-hero-pathways"><div><span>↗</span><strong>Digitalize Your Business</strong><small>Explore tools that support your organisation</small></div><div><span>▥</span><strong>Start a Digital Business</strong><small>Discover reusable digital service opportunities</small></div><div><span>♧</span><strong>Partner with ADS</strong><small>Partnership enquiries via WhatsApp for now</small></div></div></div></section>'+body;
}
function families(t,state){
 return '<div class="opp-families container" role="group" aria-label="Discovery families">'+
 ['business','institutional'].map(f=>'<button type="button" data-family="'+f+'" aria-pressed="'+String(state.family===f)+'" class="opp-family '+(state.family===f?'active':'')+'"><span class="opp-family-icon">'+familyIcons[f]+'</span><span><strong>'+L(t[f])+'</strong><small>'+L(t[f+'Sub'])+'</small></span></button>').join('')+'</div>';
}
function categoryCards(cats,state,t){
 return '<div class="opp-category-top"><h2>'+L(state.family==='business'?t.business:t.institutional)+'</h2><span>'+cats.length+' '+L(t.category.toLowerCase())+'</span></div>'+
 '<div class="opp-category-rail" role="group" aria-label="'+L(t.category)+'">'+cats.map(c=>
 '<button type="button" class="opp-category '+(c.id===state.category?'selected':'')+'" data-category="'+L(c.id)+'" aria-pressed="'+String(c.id===state.category)+'">'+
 '<span class="opp-category-photo" style="background-image:url('+photo(c.id)+')"><span>'+L(categoryIcons[c.id]||'◈')+'</span></span><strong>'+L(c.name)+'</strong><small>'+c.opportunity_count+' '+L(t.results.toLowerCase())+'</small></button>').join('')+'</div>';
}
function aside(cats,state,modules,t){
 return '<aside class="opp-aside"><form id="opp-search-form" role="search"><label for="opp-search">'+L(t.search)+'</label><input type="search" id="opp-search" maxlength="100" autocomplete="off" placeholder="'+L(t.searchPlaceholder)+'" value="'+L(state.q)+'"/><button class="btn btn-navy" type="submit">'+L(t.search)+' →</button><small>'+L(t.searchHelp)+'</small><div id="opp-suggestions" role="listbox"></div></form>'+
 '<div class="opp-filter-head"><h2>'+L(t.filters)+'</h2>'+button(t.reset,'reset','opp-reset')+'</div>'+
 '<label for="opp-select-category">'+L(t.category)+'</label><select id="opp-select-category">'+opts([{id:'',name:t.all},...cats],state.category)+'</select>'+
 '<label for="opp-module">'+L(t.module)+'</label><select id="opp-module">'+opts([{id:'',name:t.allModules},...modules.map(m=>({id:m,name:m}))],state.module)+'</select>'+
 '<p class="opp-sidebar-help">'+L(t.step)+'</p></aside>';
}
function pillTags(items){return '<div class="opp-tags">'+(items||[]).slice(0,5).map(x=>'<span>'+L(x)+'</span>').join('')+'</div>'}
function solutionCard(x,t,view){
 const kind=view==='tools'?'tool':'solution';
 const tags=view==='tools'?[]:x.tools;
 return '<article class="opp-solution"><div class="opp-solution-cover" style="background-image:url('+photo(x.category_id||'business-processing')+')"><span>'+L(x.readiness==='verified_demo'?'Verified demo':t.proposed)+'</span></div>'+
 '<div class="opp-solution-body"><small>'+L(x.sector_name||x.category_name||t.results)+'</small><h3>'+L(x.title)+'</h3><p>'+L(x.summary)+'</p>'+
 pillTags(tags)+'<div class="opp-card-actions">'+button(t.see+' →','detail','btn btn-outline opp-detail-open','data-id="'+L(x.id)+'" data-kind="'+kind+'"')+
 '<a class="btn btn-navy" href="'+wa+'" target="_blank" rel="noopener noreferrer">'+L(t.contact)+'</a></div></div></article>';
}
function pagination(state,pageInfo,t){
 const last=Math.max(1,Math.ceil(pageInfo.total/pageInfo.limit));
 return '<nav class="opp-pages" aria-label="Pagination">'+(state.page>1?button('← '+t.previous,'previous','opp-page'):'')+'<span>'+state.page+' / '+last+'</span>'+(state.page<last?button(t.more+' →','next','opp-page'):'')+'</nav>';
}
function resultBody(data,state,t,cats,modules){
 const title=cats.find(x=>x.id===state.category)?.name||t.results;
 const filtered=state.sort==='name'?[...data.data].sort((a,b)=>a.title.localeCompare(b.title)):data.data;
 return '<div class="container opp-layout">'+aside(cats,state,modules,t)+'<section class="opp-content">'+
 categoryCards(cats,state,t)+'<div class="opp-results-bar"><div><h2>'+data.total+' '+L(t.results)+' · '+L(title)+'</h2><p>'+L(t.english)+'</p></div><div class="opp-result-tools">'+
 (state.family==='business'?'<select id="opp-view" aria-label="'+L(t.view)+'">'+opts([{id:'bundles',name:t.bundles},{id:'tools',name:t.tools}],state.view)+'</select>':'')+
 '<select id="opp-sort" aria-label="'+L(t.sort)+'">'+opts([{id:'relevance',name:t.relevance},{id:'name',name:t.alphabetical}],state.sort)+'</select></div></div>'+
 (filtered.length?'<div class="opp-solutions">'+filtered.map(x=>solutionCard(x,t,state.view)).join('')+'</div>':'<div class="opp-empty">'+L(t.empty)+'</div>')+
 pagination(state,data,t)+'<div class="opp-end-note"><p>'+L(t.step)+'</p><a class="btn btn-outline" href="/platforms">'+L(t.platforms)+' →</a></div></section></div>';
}
const formatModules=(items)=>Array.isArray(items)?items:[];
function closeModal(){
 const host=document.querySelector('#opp-dialog-host');
 if(host)host.replaceChildren();
 document.body.classList.remove('opp-modal-open');
 if(location.pathname.startsWith('/opportunities/')&&modalRestoreUrl)history.replaceState({},'',modalRestoreUrl);
 if(returnFocus?.isConnected)returnFocus.focus();
 returnFocus=null;
}
async function openModal(id,kind,t,opts={}){
 const el=document.querySelector('#opp-dialog-host');
 if(!el)return;
 const restore=opts.restore||location.pathname+location.search;
 let data;
 try{
   const path=kind==='tool'?'/opportunities/':'/discovery/solutions/';
   data=(await fetchJSON(path+encodeURIComponent(id))).data;
 }catch{el.textContent=t.error;return}
 if(!data)return;
 returnFocus=opts.focus||document.activeElement;
 modalRestoreUrl=restore;
 if(!opts.deepLink)history.pushState({},'', '/opportunities/'+encodeURIComponent(id)+location.search);
 const tags=formatModules(data.tools);
 el.innerHTML='<div class="opp-scrim" data-action="dismiss"><div role="dialog" aria-modal="true" aria-labelledby="opp-dialog-title" class="opp-dialog"><div class="opp-dialog-heading"><span>'+L(data.sector_name||data.category_name||t.title)+'</span>'+button('×','dismiss','opp-x')+'</div><div class="opp-dialog-cover" style="background-image:url('+photo(data.category_id||'business-processing')+')"></div>'+
 '<div class="opp-dialog-content"><h2 id="opp-dialog-title">'+L(data.title)+'</h2><p class="opp-dialog-state">'+L(t.proposed)+'</p><h3>'+L(t.summary)+'</h3><p>'+L(data.summary)+'</p>'+
 (tags.length?'<h3>'+L(t.suggested)+'</h3>'+pillTags(tags):'')+
 (formatModules(data.examples||data.business_examples).length?'<h3>'+L(t.example)+'</h3><p>'+L(formatModules(data.examples||data.business_examples).slice(0,6).join(', '))+'</p>':'')+
 (data.required_permission_summary?'<p class="opp-permit">'+L(t.requirements)+'</p>':'')+
 '<p class="opp-preview-note">'+L(t.disclaimer)+'</p>'+
 '<div class="opp-dialog-actions">'+button(t.close,'dismiss','btn btn-outline')+contact(t)+'<a class="btn btn-outline" href="/platforms">'+L(t.platforms)+' →</a></div></div></div></div>';
 document.body.classList.add('opp-modal-open');
 const dialog=el.querySelector('[role=dialog]');
 dialog.querySelector('.opp-x').focus();
 dialog.addEventListener('keydown',event=>{
   if(event.key==='Escape'){event.preventDefault();closeModal()}
   if(event.key==='Tab'){
     const controls=[...dialog.querySelectorAll('button,a[href]')].filter(x=>!x.hasAttribute('disabled'));
     if(!controls.length)return;
     const first=controls[0],last=controls[controls.length-1];
     if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}
     else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
   }
 });
 el.querySelector('.opp-scrim').addEventListener('click',event=>{
   if(event.target===el.querySelector('.opp-scrim')||event.target.closest('button[data-action=dismiss]'))closeModal();
 });
}
function wire(el,state,cats,modules,t){
 el.querySelectorAll('[data-family]').forEach(b=>b.addEventListener('click',()=>goto({family:b.dataset.family,category:'',view:'bundles',page:1,q:'',module:''})));
 el.querySelectorAll('[data-category]').forEach(b=>b.addEventListener('click',()=>goto({category:b.dataset.category,page:1,module:''})));
 el.querySelector('#opp-select-category').addEventListener('change',e=>goto({category:e.target.value,page:1,module:''}));
 el.querySelector('#opp-module').addEventListener('change',e=>goto({module:e.target.value,page:1}));
 const view=el.querySelector('#opp-view');if(view)view.addEventListener('change',e=>goto({view:e.target.value,page:1,module:''}));
 el.querySelector('#opp-sort').addEventListener('change',e=>goto({sort:e.target.value,page:1}));
 el.querySelector('[data-action=reset]').addEventListener('click',()=>goto({q:'',module:'',category:'',page:1,sort:'relevance'}));
 el.querySelector('#opp-search-form').addEventListener('submit',e=>{e.preventDefault();goto({q:el.querySelector('#opp-search').value,category:'',page:1})});
 el.querySelectorAll('[data-action=detail]').forEach(b=>b.addEventListener('click',()=>openModal(b.dataset.id,b.dataset.kind,t,{focus:b})));
 el.querySelectorAll('[data-action=next]').forEach(b=>b.addEventListener('click',()=>goto({page:state.page+1})));
 el.querySelectorAll('[data-action=previous]').forEach(b=>b.addEventListener('click',()=>goto({page:Math.max(1,state.page-1)})));
 const search=el.querySelector('#opp-search'),suggestions=el.querySelector('#opp-suggestions');
 let generation=0;
 search.addEventListener('input',async()=>{
   const q=search.value.trim(),n=++generation;suggestions.innerHTML='';
   if(q.length<2)return;
   try{
     const r=await fetchJSON('/discovery/suggest?family='+state.family+'&q='+encodeURIComponent(q));
     if(n!==generation)return;
     suggestions.innerHTML=r.data.slice(0,7).map(s=>'<button type="button" data-suggestion="'+L(s.name)+'">'+L(s.name)+'</button>').join('');
     suggestions.querySelectorAll('[data-suggestion]').forEach(b=>b.addEventListener('click',()=>goto({q:b.dataset.suggestion,category:'',page:1})));
   }catch{suggestions.innerHTML=''}
 });
}
export async function hydrate(path,lang){
 const el=document.getElementById('opportunities-app');
 if(!el)return;
 const requestId=++seq,t=tFor(lang),state=stateFromURL();
 el.innerHTML=frame(t,families(t,state)+'<div class="container opp-loading" role="status">'+L(t.loading)+'</div>');
 try{
  const categories=(await fetchJSON('/discovery/categories?family='+state.family)).data;
  if(requestId!==seq)return;
  if(state.category&&!categories.some(c=>c.id===state.category))state.category='';
  const p=new URLSearchParams({page:String(state.page),limit:'12'});
  if(state.q)p.set('q',state.q);
  if(state.sort==='name')p.set('sort','name');
  if(state.category)p.set('category',state.category);
  if(state.module)p.set('tool',state.module);
  const isTools=state.view==='tools';
  const endpoint=isTools?'/opportunities?':'/discovery/solutions?family='+state.family+'&';
  const result=await fetchJSON(endpoint+p.toString());
  const modules=isTools?[]:(await fetchJSON('/discovery/modules?family='+state.family+(state.category?'&category='+encodeURIComponent(state.category):''))).data;
  if(requestId!==seq)return;
  el.innerHTML=frame(t,families(t,state)+resultBody(result,state,t,categories,modules)+'<div id="opp-dialog-host"></div>');
  wire(el,state,categories,modules,t);
  if(path.startsWith('/opportunities/')){
    const id=decodeURIComponent(path.slice('/opportunities/'.length));
    await openModal(id,state.view==='tools'?'tool':'solution',t,{deepLink:true,restore:'/opportunities'+location.search});
  }
 }catch(e){
  if(requestId!==seq)return;
  el.innerHTML=frame(t,families(t,state)+'<div class="container opp-empty" role="status">'+L(t.error)+' <a href="/platforms">'+L(t.platforms)+'</a></div>');
  el.querySelectorAll('[data-family]').forEach(b=>b.addEventListener('click',()=>goto({family:b.dataset.family,category:'',view:'bundles',page:1})));
 }
}
if(typeof window!=='undefined'){
 window.addEventListener('popstate',()=>{if(document.getElementById('opportunities-app'))hydrate(location.pathname,document.documentElement.lang||'en')});
}
