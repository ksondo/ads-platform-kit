// This module owns only /opportunities and /opportunities/:id.
// The existing ADS homepage, platform pages and header/footer are untouched.
const API='/api/opportunities/v1';
const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ui={
 en:{title:'Explore Digital Business Opportunities',sub:'Find digital tools by sector or by the type of business you operate or want to start.',sector:'Browse by sector',all:'All sectors',business:'Search your business type',placeholder:'e.g. sawmill, poultry farm, restaurant, school…',search:'Search tools',searchTip:'Type a business name to see relevant suggestions.',loading:'Loading business opportunities…',empty:'No matching opportunities. Try another sector or search.',error:'The opportunity catalogue is temporarily unavailable. Other ADS pages remain available.',details:'Explore opportunity',tools:'digital tool opportunities',discovery:'Opportunity concept — contact ADS for availability',contact:'Discuss with ADS',more:'Next page',previous:'Previous page',back:'Back to opportunities',model:'How it can become a business',examples:'Example businesses',pathway:'Business discovery',businessOptions:'Tools relevant to',relevant:'Additional tools in this sector',login:'Sign-in is handled by the individual ADS platform when you open a verified demo.',demoGuide:'Demo access guidance',language:'Detailed descriptions currently available in English while French editorial review is in progress.'},
 fr:{title:'Découvrez les opportunités numériques',sub:"Explorez les outils par secteur ou par type d'activité que vous exercez ou souhaitez créer.",sector:'Parcourir par secteur',all:'Tous les secteurs',business:"Rechercher votre activité",placeholder:'ex. scierie, élevage, restaurant, école…',search:'Rechercher des outils',searchTip:"Saisissez une activité pour voir des suggestions.",loading:'Chargement des opportunités…',empty:'Aucune opportunité trouvée. Modifiez le secteur ou la recherche.',error:"Le catalogue n'est pas disponible actuellement. Les autres pages ADS restent accessibles.",details:"Explorer l'opportunité",tools:'outils numériques',discovery:'Opportunité à étudier — contactez ADS pour connaître sa disponibilité',contact:'Contacter ADS',more:'Page suivante',previous:'Page précédente',back:'Retour aux opportunités',model:'Comment en faire une activité',examples:"Exemples d'entreprises",pathway:"Découverte de l'activité",businessOptions:'Outils pour',relevant:"Autres outils du secteur",login:'La connexion se fait sur la plateforme ADS choisie pour une démo vérifiée.',demoGuide:"Guide d'accès aux démos",language:'Les descriptions détaillées sont actuellement en anglais, avant validation éditoriale française.'}
};
let generation=0;
const labels=lang=>ui[lang]||ui.en;
const request=async path=>{
 const response=await fetch(API+path,{headers:{accept:'application/json'},credentials:'omit'});
 if(!response.ok)throw Error('Catalogue HTTP '+response.status);
 return response.json();
};
export const directoryShell=()=>'<div id="opportunities-app" aria-live="polite"></div>';
export const detailShell=directoryShell;
const link=(href,label,style='btn btn-outline')=>'<a class="'+style+'" href="'+esc(href)+'">'+esc(label)+'</a>';
const note=t=>'<p class="opp-notice">'+esc(t.discovery)+'</p>';
const card=(x,t)=>'<article class="opp-card"><span class="opp-sector">'+esc(x.sector_name)+'</span><h3>'+esc(x.title)+'</h3><p>'+esc(x.summary)+'</p>'+note(t)+link('/opportunities/'+encodeURIComponent(x.id),t.details+' →','text-link')+'</article>';
const contact=t=>'<a class="btn btn-gold" href="https://wa.me/237654035075" target="_blank" rel="noopener noreferrer">'+esc(t.contact)+' ↗</a>';
const frame=(inner,t)=>'<section class="directory-intro"><div class="container"><span class="eyebrow">ADS BUSINESS DISCOVERY</span><h1>'+esc(t.title)+'</h1><p>'+esc(t.sub)+'</p></div></section><section class="section"><div class="container">'+inner+'</div></section>';
function renderMessage(el,t,text){el.innerHTML=frame('<p class="opp-message" role="status">'+esc(text)+'</p>'+link('/platforms','Platforms →'),t)}
function controls(sectors,params,t){
 const current=params.get('sector')||'',search=params.get('q')||'',selectedBusiness=params.get('business')||'';
 return '<div class="opp-controls"><label>'+esc(t.sector)+'<select id="opp-sector"><option value="">'+esc(t.all)+'</option>'+sectors.map(x=>'<option value="'+esc(x.id)+'"'+(x.id===current?' selected':'')+'>'+esc(x.name)+' ('+x.opportunity_count+')</option>').join('')+'</select></label><div class="opp-business"><label for="opp-business-query">'+esc(t.business)+'</label><input type="search" id="opp-business-query" autocomplete="off" maxlength="100" placeholder="'+esc(t.placeholder)+'" aria-controls="opp-suggestions" aria-autocomplete="list"/><div id="opp-suggestions" role="listbox"></div><small>'+esc(t.searchTip)+'</small></div><form id="opp-tool-search"><label for="opp-q">'+esc(t.search)+'</label><input id="opp-q" maxlength="100" name="q" value="'+esc(search)+'" type="search"/><button class="btn btn-navy" type="submit">'+esc(t.search)+'</button></form></div>';
}
function results(items,total,page,limit,t){
 if(!items.length)return '<p class="opp-message">'+esc(t.empty)+'</p>';
 return '<div class="opp-results-head"><h2>'+total+' '+esc(t.tools)+'</h2><p>'+esc(t.language)+'</p></div><div class="opp-grid">'+items.map(x=>card(x,t)).join('')+'</div>'+
 '<nav class="opp-pagination" aria-label="Opportunity pages">'+(page>1?'<button data-page="'+(page-1)+'" type="button">'+esc(t.previous)+'</button>':'')+'<span>'+page+' / '+Math.ceil(total/limit)+'</span>'+(page*limit<total?'<button data-page="'+(page+1)+'" type="button">'+esc(t.more)+'</button>':'')+'</nav>';
}
function replaceParams(changes){
 const p=new URLSearchParams(location.search);
 for(const [k,v] of Object.entries(changes)){if(v)p.set(k,v);else p.delete(k)}
 location.assign('/opportunities'+(p.toString()?'?'+p.toString():''));
}
async function showDirectory(el,lang,seq){
 const t=labels(lang),params=new URLSearchParams(location.search);
 try{
  const s=await request('/sectors');
  let listing,profile=null;
  if(params.get('business')){
   const data=await request('/businesses/'+encodeURIComponent(params.get('business')));
   profile=data.business;
   listing={data:data.opportunities,total:data.opportunities.length,page:1,limit:80};
  }else{
   const q=new URLSearchParams({page:params.get('page')||'1',limit:'24'});
   if(params.get('sector'))q.set('sector',params.get('sector'));
   if(params.get('q'))q.set('q',params.get('q'));
   listing=await request('/opportunities?'+q.toString());
  }
  if(seq!==generation)return;
  const profileBox=profile?'<div class="opp-selected-business"><h2>'+esc(t.businessOptions)+' '+esc(profile.name)+'</h2><p>'+esc(profile.visitor_pathway||'')+'</p><p>'+esc(t.relevant)+'</p></div>':'';
  el.innerHTML=frame(controls(s.data,params,t)+profileBox+results(listing.data,listing.total,listing.page,listing.limit,t)+
  '<div class="opp-footer-cta">'+contact(t)+link('/demo-access',t.demoGuide,'btn btn-outline')+'<p>'+esc(t.login)+'</p></div>',t);
  const sector=el.querySelector('#opp-sector');
  sector.addEventListener('change',()=>replaceParams({sector:sector.value,business:'',page:''}));
  el.querySelector('#opp-tool-search').addEventListener('submit',e=>{e.preventDefault();replaceParams({q:el.querySelector('#opp-q').value,business:'',page:''})});
  el.querySelectorAll('[data-page]').forEach(b=>b.addEventListener('click',()=>replaceParams({page:b.dataset.page})));
  const input=el.querySelector('#opp-business-query'),suggestions=el.querySelector('#opp-suggestions');
  let searchId=0;
  input.addEventListener('input',async()=>{
   const requestId=++searchId,q=input.value.trim();suggestions.innerHTML='';
   if(q.length<2)return;
   try{
    const r=await request('/businesses/suggest?q='+encodeURIComponent(q));
    if(requestId!==searchId||seq!==generation)return;
    suggestions.innerHTML=r.data.map(b=>link('/opportunities?business='+encodeURIComponent(b.id),b.name+' — '+b.sector_name,'opp-suggestion')).join('');
   }catch{suggestions.textContent=t.error}
  });
 }catch{if(seq===generation)renderMessage(el,t,t.error)}
}
async function showDetail(el,path,lang,seq){
 const t=labels(lang);
 try{
  const id=path.slice('/opportunities/'.length);
  const result=await request('/opportunities/'+encodeURIComponent(id));
  if(seq!==generation)return;
  const x=result.data;
  el.innerHTML=frame(link('/opportunities','← '+t.back,'back-link')+
  '<div class="opp-detail"><span class="opp-sector">'+esc(x.sector_name)+'</span><h2>'+esc(x.title)+'</h2><p>'+esc(x.summary)+'</p>'+note(t)+
  '<h3>'+esc(t.model)+'</h3><p>'+esc(x.business_model)+'</p><h3>'+esc(t.examples)+'</h3><p>'+esc((x.business_examples||[]).join(', '))+'</p>'+
  '<div class="opp-actions">'+contact(t)+link('/opportunities?sector='+encodeURIComponent(x.sector_id),t.relevant,'btn btn-outline')+'</div><p>'+esc(t.login)+'</p></div>',t);
 }catch{if(seq===generation)renderMessage(el,t,t.error)}
}
export function hydrate(path,lang){
 const el=document.getElementById('opportunities-app');
 if(!el)return;
 const seq=++generation,t=labels(lang);
 renderMessage(el,t,t.loading);
 if(path==='/opportunities')showDirectory(el,lang,seq);
 else showDetail(el,path,lang,seq);
}
