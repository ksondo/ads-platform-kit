import * as ADSOpportunities from "./opportunities-v2.js";
const app = document.getElementById("root");
const i18n = {
  en: {
    home:"Home", platforms:"Platforms", opportunities:"Business Opportunities", cloud:"Cloud Services", about:"About ADS", partners:"Partners", contact:"Contact", demos:"Explore Demos", demoHelp:"How demo sign-in works", demoGuideTitle:"How to access ADS demos", demoGuideIntro:"Choose a platform. It opens in another browser tab while ADS stays open. All platforms share ADS sign-in and return you to your selected workspace.", demoGuideFirst:"Choose a platform", demoGuideFirstText:"Browse ADS platforms; the selected demo opens in another tab while this page stays available.", demoGuideSecond:"Sign in on the application", demoGuideSecondText:"The application opens the hosted ADS sign-in page. In an enabled demo environment, choose Use demo account; no password is stored on this portal.", demoGuideThird:"Explore your demo workspace", demoGuideThirdText:"The application returns you to the correct workspace based on your assigned role and organization.", demoGuideNotLive:"Demo launch links appear only after their deployed application and login flow have been verified.",
    kicker:"ADS DIGITAL ECOSYSTEM", heroA:"Real Solutions for", heroB:"a Brighter Africa", heroCopy:"Explore our platforms, discover digital business opportunities and experience working demonstrations.",
    search:"Search platforms, tools or business opportunities…", searchButton:"Search", popular:"Popular:", discover:"Explore Our Platforms", discoverCopy:"Discover integrated digital platforms built around real-world needs.", allPlatforms:"View all platforms",
    featured:"FEATURED PLATFORM", commerceCopy:"From e-commerce and point of sale to inventory, payments and customer management, Commerce connects tools that help businesses grow.",
    experience:"Experience Commerce Platform", commerceTools:"Digital Tools in Commerce", allTools:"View all Commerce tools", explore:"Explore", learn:"Learn More", tryDemo:"Try Demo", demoPending:"Demo being prepared", live:"Live Demo",
    platformsCount:"Platforms listed", toolsCount:"Digital tools listed", demosCount:"Verified demos", partnerships:"Partnership pathways", businessTitle:"Turn digital capabilities into businesses", businessCopy:"Every platform can offer several tools. Explore practical business models and discover ways to operate, adapt or offer these tools with ADS.", browseOpportunities:"Explore business opportunities",
    partnerTitle:"Build the next opportunity with ADS", partnerCopy:"Whether you are an entrepreneur, institution, technology provider, data centre or enterprise, discover how to become a partner.", becomePartner:"Be a Partner",
    catalogPlatforms:"Discover Platforms", catalogTools:"Explore Business Opportunities", catalogCopy:"Browse digital tools by platform and learn how they could serve a business or community.", all:"All sectors", noResults:"No matching entries. Try another search.", back:"Back to platforms", toolsInside:"Digital tools within this platform", howWorks:"Business model", audience:"Who it serves", visitPlatform:"Open platform demo", returnTools:"Back to opportunities",
    cloudTitle:"ADS Cloud Services", cloudText:"Hosting, deployment, managed operations and technical support for digital businesses and institutions.", cloudFeature1:"Application hosting", cloudFeature1Text:"Deploy approved applications on managed infrastructure.", cloudFeature2:"Maintenance & operations", cloudFeature2Text:"Monitoring, updates and technical assistance for hosted applications.", cloudFeature3:"Partner infrastructure", cloudFeature3Text:"Explore hosting and infrastructure partnerships with ADS.", askCloud:"Discuss Cloud Partnership", cloudNote:"Cloud packages and pricing will be published after operational verification.",
    footer:"Real platforms. Practical opportunities. Shared progress.", external:"Opens the Africa Digital Synergy company website", companyUpdating:"Company website being updated — link temporarily unavailable", statusNote:"Demo buttons become active only when a verified deployment URL is registered.", featuredSubtitle:"Integrated business solutions for modern trade", discoveryPaths:"Find your business opportunity", discoveryPathsCopy:"Start with your industry, local business type, or institutional service area.", industriesPath:"Browse 50 industries", industriesCopy:"Explore business sectors and the digital tools relevant to each activity.", businessesPath:"Find a local business type", businessesCopy:"Choose from 52 example business profiles and discover useful tools.", regulatorsPath:"Institutional & regulatory services", regulatorsCopy:"Explore proposed compliance and institutional support services. Official authorizations are still required."
  },
  fr: {
    home:"Accueil", platforms:"Plateformes", opportunities:"Opportunités d'affaires", cloud:"Services Cloud", about:"À propos d'ADS", partners:"Partenaires", contact:"Contact", demos:"Explorer les démos", demoHelp:"Comment accéder aux démos", demoGuideTitle:"Comment accéder aux démos ADS", demoGuideIntro:"Choisissez une plateforme. Elle s’ouvre dans un nouvel onglet pendant que la page d’accueil ADS reste ouverte. La connexion ADS partagée vous ramène ensuite à cette plateforme.", demoGuideFirst:"Choisir une plateforme", demoGuideFirstText:"Explorez les plateformes ADS : la démo choisie s’ouvre dans un autre onglet et cette page reste disponible.", demoGuideSecond:"Se connecter dans l’application", demoGuideSecondText:"L’application ouvre la page de connexion ADS. Dans un environnement démo activé, choisissez Utiliser le compte démo ; aucun mot de passe n’est stocké sur ce portail.", demoGuideThird:"Explorer votre espace démo", demoGuideThirdText:"L’application vous redirige vers votre espace selon votre rôle et votre organisation.", demoGuideNotLive:"Les liens des démos ne sont activés qu’après vérification de l’application et de son authentification.",
    kicker:"ÉCOSYSTÈME NUMÉRIQUE ADS", heroA:"Des solutions concrètes pour", heroB:"une Afrique meilleure", heroCopy:"Découvrez nos plateformes, les opportunités d'affaires numériques et les démonstrations disponibles.",
    search:"Rechercher plateformes, outils ou opportunités…", searchButton:"Rechercher", popular:"Populaire :", discover:"Explorez nos plateformes", discoverCopy:"Découvrez des plateformes numériques intégrées qui répondent à des besoins réels.", allPlatforms:"Toutes les plateformes",
    featured:"PLATEFORME À LA UNE", commerceCopy:"Du commerce en ligne et de la caisse à la gestion des stocks, aux paiements et aux clients, Commerce rassemble des outils pour faire grandir les entreprises.",
    experience:"Explorer la plateforme Commerce", commerceTools:"Outils numériques du Commerce", allTools:"Tous les outils Commerce", explore:"Explorer", learn:"En savoir plus", tryDemo:"Essayer la démo", demoPending:"Démo en préparation", live:"Démo en ligne",
    platformsCount:"Plateformes présentées", toolsCount:"Outils présentés", demosCount:"Démos vérifiées", partnerships:"Types de partenariat", businessTitle:"Transformez les outils en entreprises", businessCopy:"Chaque plateforme peut offrir plusieurs outils. Découvrez des modèles économiques et comment exploiter ces solutions avec ADS.", browseOpportunities:"Explorer les opportunités",
    partnerTitle:"Construisons ensemble avec ADS", partnerCopy:"Entrepreneur, institution, fournisseur technologique, centre de données ou entreprise : découvrez comment devenir partenaire.", becomePartner:"Devenir partenaire",
    catalogPlatforms:"Découvrir les plateformes", catalogTools:"Explorer les opportunités", catalogCopy:"Parcourez les outils par plateforme et découvrez leur modèle économique.", all:"Tous les secteurs", noResults:"Aucun résultat. Essayez une autre recherche.", back:"Retour aux plateformes", toolsInside:"Outils de cette plateforme", howWorks:"Modèle économique", audience:"Public concerné", visitPlatform:"Ouvrir la démo", returnTools:"Retour aux opportunités",
    cloudTitle:"Services Cloud ADS", cloudText:"Hébergement, déploiement, exploitation et assistance technique pour les entreprises et institutions.", cloudFeature1:"Hébergement d'applications", cloudFeature1Text:"Déployer des applications approuvées sur une infrastructure gérée.", cloudFeature2:"Maintenance et exploitation", cloudFeature2Text:"Supervision, mises à jour et assistance technique.", cloudFeature3:"Infrastructure partenaire", cloudFeature3Text:"Explorer des partenariats d'hébergement et d'infrastructure.", askCloud:"Parler de partenariat Cloud", cloudNote:"Les offres et prix Cloud seront publiés après validation opérationnelle.",
    footer:"Des plateformes réelles. Des opportunités concrètes. Un progrès partagé.", external:"Ouvre le site de l'entreprise Africa Digital Synergy", companyUpdating:"Site de l’entreprise en cours de mise à jour — lien temporairement indisponible", statusNote:"Les boutons de démo sont activés uniquement après validation de l'URL du déploiement.", featuredSubtitle:"Solutions intégrées pour le commerce moderne", discoveryPaths:"Trouvez votre opportunité d’affaires", discoveryPathsCopy:"Commencez par votre secteur, votre activité locale ou les services institutionnels.", industriesPath:"Explorer 50 secteurs", industriesCopy:"Découvrez les secteurs d’activité et les outils numériques associés.", businessesPath:"Trouver une activité locale", businessesCopy:"Choisissez parmi 52 profils d’entreprise et découvrez des outils utiles.", regulatorsPath:"Services institutionnels et réglementaires", regulatorsCopy:"Découvrez les services proposés pour la conformité et les institutions, sous réserve des autorisations officielles."
  }
};
const initialLanguage=()=>{
 const saved=localStorage.getItem("ads-portal-lang");
 if(saved==="en"||saved==="fr")return saved;
 return (navigator.language||"fr").toLowerCase().split("-")[0]==="en"?"en":"fr";
};
let lang=initialLanguage();
let catalogue = {platforms:[],tools:[],publicSite:"https://africadigitalsynergy.com",companySiteLinksEnabled:false};
const s = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const t = key => i18n[lang][key] || i18n.en[key] || key;
const site = path => catalogue.publicSite.replace(/\/$/,"") + path;
const photo = (id,w=800) => "https://images.unsplash.com/" + encodeURIComponent(id) + "?w=" + w + "&q=82&fit=crop";
const title = p => lang === "fr" && p.fr ? p.fr : p.name;
const summary=p=>lang==="fr"&&p.summary_fr?p.summary_fr:p.summary;
const model=p=>lang==="fr"&&p.model_fr?p.model_fr:p.model;
const countLabel=(n,item)=>{
 const names={tools:lang==="fr"?["outil","outils"]:["tool","tools"],
 platforms:lang==="fr"?["plateforme","plateformes"]:["platform","platforms"],
 demos:lang==="fr"?["démo","démos"]:["demo","demos"]}[item];
 return n+" "+names[n===1?0:1];
};
const safeDemo = url => typeof url === "string" && /^https:\/\//.test(url) ? url : null;
const link = (href, label, className="btn btn-ghost", extra="") => '<a class="'+className+'" href="'+s(href)+'" '+extra+'>'+label+'</a>';
// Company website navigation is suspended during the corporate-site upgrade.
// The flag is deliberately opt-in and reviewed in catalogue.json.
const companyNav = (path,label) => catalogue.companySiteLinksEnabled === true
  ? '<a href="'+s(site(path))+'" rel="noopener noreferrer" title="'+s(t("external"))+'">'+s(label)+'</a>'
  : '<span class="company-link-disabled" aria-disabled="true" title="'+s(t("companyUpdating"))+'">'+s(label)+'</span>';
const companyAction = (path,label,className) => path==="/partners" ?
  link("mailto:admin@africadigitalsynergy.com?subject=ADS%20Partnership",s(label),className) :
  catalogue.companySiteLinksEnabled === true
  ? link(site(path),s(label),className,'rel="noopener noreferrer"')
  : '<span class="'+s(className)+' company-action-disabled" aria-disabled="true" title="'+s(t("companyUpdating"))+'">'+s(label)+'</span>';
const whatsAppContact = (label, className="contact-link") => link("https://wa.me/237654035075",s(label),className,'target="_blank" rel="noopener noreferrer" aria-label="'+s(label)+" — WhatsApp"+'"');
const platformUrl = p => "/platforms/" + encodeURIComponent(p.id);
const toolUrl = p => "/opportunities/" + encodeURIComponent(p.id);
const matches = (v,q) => [v.name,v.fr,v.summary,v.model,v.sector].join(" ").toLowerCase().includes(q);
const pill = (text,kind="neutral") => '<span class="pill pill-'+kind+'">'+s(text)+'</span>';
function launch(target, label) {
  const url = safeDemo(target);
  // Keep the ADS portal open as the user's home base; each verified platform
  // opens from an explicit user click into a separate tab. Inside that tab,
  // ADS Identity redirects to sign-in and then back to the same platform.
  // noopener prevents the new tab from controlling the portal.
  return url ? link(url,s(label)+' ↗',"btn btn-gold",'target="_blank" rel="noopener noreferrer"') : pill(t("demoPending"),"muted");
}
function header() {
  const path=window.location.pathname;
  const nav=(url,label) => '<a href="'+s(url)+'" class="'+(path===url || (url!=="/"&&path.startsWith(url)) ? "active":"")+'">'+s(label)+'</a>';
  return '<header class="site-header"><div class="container head-inner">'+
    '<a class="brand" href="/" aria-label="Africa Digital Synergy Digital Ecosystem"><span class="brand-mark">✺</span><span class="brand-text"><span class="brand-full">AFRICA DIGITAL SYNERGY</span><span class="brand-short">ADS</span><small>PEOPLE · PLATFORMS · PROSPERITY</small></span></a>'+
    '<button class="menu-toggle" aria-label="Toggle navigation" aria-expanded="false" type="button">☰</button>'+
    '<nav class="nav-links" aria-label="Primary navigation">'+nav("/",t("home"))+nav("/platforms",t("platforms"))+nav("/opportunities",t("opportunities"))+nav("/cloud",t("cloud"))+companyNav("/about",t("about"))+companyNav("/partners",t("partners"))+link("mailto:admin@africadigitalsynergy.com",s(t("contact")),"contact-link")+'</nav>'+
    '<div class="head-actions"><div class="langs"><button data-lang="en" '+(lang==="en"?'aria-current="true"':'')+'>EN</button><span>|</span><button data-lang="fr" '+(lang==="fr"?'aria-current="true"':'')+'>FR</button></div>'+link("/platforms",s(t("demos"))+' →',"btn btn-gold header-cta")+'</div>'+
    '</div></header>';
}
function africaArt(){
  return '<svg class="africa-art" viewBox="0 0 490 470" role="img" aria-label="Stylized illuminated map of Africa"><defs><filter id="glow"><feGaussianBlur stdDeviation="5"/></filter><linearGradient id="afr" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#ffc76d"/><stop offset="1" stop-color="#b97522"/></linearGradient></defs>'+
  '<path d="M123 52 178 28 251 40 302 27 354 60 373 88 400 108 384 141 413 169 391 191 400 231 366 239 348 274 331 294 313 336 282 369 266 417 237 439 215 405 204 359 180 322 164 273 139 249 120 203 81 188 64 152 88 112 92 76Z" fill="#d48b3020" stroke="#ffcd76" stroke-width="4"/>'+
  '<path d="M123 52 178 28 251 40 302 27 354 60 373 88 400 108 384 141 413 169 391 191 400 231 366 239 348 274 331 294 313 336 282 369 266 417 237 439 215 405 204 359 180 322 164 273 139 249 120 203 81 188 64 152 88 112 92 76Z" fill="none" stroke="#ffb540" stroke-width="11" opacity=".36" filter="url(#glow)"/>'+
  '<g stroke="#eeb05a" stroke-width="1.1" opacity=".7"><path d="M120 151 172 119 220 142 290 128 350 158 320 216 255 238 185 226 120 151"/><path d="M172 119 203 75 290 128 318 78"/><path d="M220 142 255 238 221 310 282 369"/><path d="M185 226 164 273 221 310 320 216 340 288"/><path d="M120 151 220 142 318 78 350 158"/></g>'+
  '<g fill="#ffe4a3" stroke="#ffb940" stroke-width="2"><circle cx="120" cy="151" r="4"/><circle cx="172" cy="119" r="5"/><circle cx="220" cy="142" r="5"/><circle cx="290" cy="128" r="4"/><circle cx="350" cy="158" r="5"/><circle cx="320" cy="216" r="5"/><circle cx="255" cy="238" r="5"/><circle cx="185" cy="226" r="4"/><circle cx="221" cy="310" r="5"/><circle cx="282" cy="369" r="4"/><circle cx="203" cy="75" r="4"/><circle cx="318" cy="78" r="3"/></g></svg>';
}
function platformCard(p){
 const n=catalogue.tools.filter(x=>x.platformId===p.id).length;
 const demo=safeDemo(p.demoUrl),url=demo||platformUrl(p);
 const media=p.image?'<img src="'+s(photo(p.image))+'" alt="'+s(title(p))+'" loading="lazy" width="640" height="360"/>':'<span class="platform-placeholder" aria-hidden="true">◇</span>';
 return '<a class="platform-card" href="'+s(url)+'"'+(demo?' target="_blank" rel="noopener noreferrer"':'')+'><span class="platform-image">'+media+'</span>'+
 '<span class="platform-body"><h3>'+s(title(p))+'</h3><p>'+s(summary(p))+'</p><span class="card-spacer"></span>'+
 '<span class="platform-meta">'+(n?pill(countLabel(n,"tools")):pill(t("demoPending"),"muted"))+'</span>'+
 '<span class="btn btn-outline card-action">'+s(demo?t("tryDemo"):t("explore"))+' →</span></span></a>';
}
function toolCard(x){
 const media=x.image?'<img src="'+s(photo(x.image))+'" alt="'+s(title(x))+'" loading="lazy" width="560" height="315"/>':'<span class="tool-placeholder" aria-hidden="true">◇</span>';
 return '<a class="tool-card" href="'+toolUrl(x)+'"><span class="tool-photo">'+media+(safeDemo(x.demoUrl)?pill(t("live"),"online"):pill(t("demoPending"),"muted"))+'</span>'+
 '<span class="tool-body"><h3>'+s(title(x))+'</h3><p>'+s(summary(x))+'</p><span class="card-spacer"></span>'+
 '<span class="btn btn-outline card-action">'+s(t("learn"))+' →</span></span></a>';
}
function searchBar(value=""){
  return '<form class="search-bar" method="get" action="/platforms" role="search"><label class="sr-only" for="portal-search">'+s(t("search"))+'</label><span class="search-glyph">⌕</span><input id="portal-search" name="q" type="search" placeholder="'+s(t("search"))+'" value="'+s(value)+'"/><button class="btn btn-gold" type="submit">'+s(t("searchButton"))+'</button></form>';
}
function hero(){
  const demoCount=catalogue.platforms.filter(p=>safeDemo(p.demoUrl)).length;
  return '<section class="hero"><div class="container hero-grid"><div class="hero-copy"><span class="eyebrow">◈ &nbsp;'+s(t("kicker"))+'</span><h1>'+s(t("heroA"))+'<br><em>'+s(t("heroB"))+'</em></h1><p>'+s(t("heroCopy"))+'</p>'+searchBar()+'<div class="popular">'+s(t("popular"))+' <a href="/platforms?q=education">Education</a><a href="/platforms?q=commerce">Commerce</a><a href="/platforms?q=healthcare">Healthcare</a><a href="/platforms?q=transport">Transport</a></div></div>'+
   '<div class="hero-art">'+africaArt()+'</div>'+
   '<div class="hero-stats"><div><span class="stat-symbol">⬡</span><strong>'+catalogue.platforms.length+'</strong><small>'+s(t("platformsCount"))+'</small></div><div><span class="stat-symbol">▦</span><strong>'+catalogue.tools.length+'</strong><small>'+s(t("toolsCount"))+'</small></div><div><span class="stat-symbol">▷</span><strong>'+demoCount+'</strong><small>'+s(t("demosCount"))+'</small></div><div><span class="stat-symbol">♧</span><strong>ADS</strong><small>'+s(t("partnerships"))+'</small></div></div>'+
  '</div></section>';
}
function sectionTitle(title,href,label,subtitle=""){
  return '<div class="section-head"><div><h2>'+s(title)+'</h2>'+(subtitle?'<p>'+s(subtitle)+'</p>':'')+'</div>'+link(href,s(label)+' →',"text-link")+'</div>';
}
function opportunityDiscoveryPaths(){
 const cards=[
  ["/opportunities?view=tools",t("industriesPath"),t("industriesCopy"),"50"],
  ["/opportunities?view=tools",t("businessesPath"),t("businessesCopy"),"52"],
  ["/opportunities?family=institutional",t("regulatorsPath"),t("regulatorsCopy"),"8"]
 ];
 return '<section class="section ads-discovery-paths"><div class="container">'+
  '<div class="section-head"><div><h2>'+s(t("discoveryPaths"))+'</h2><p>'+s(t("discoveryPathsCopy"))+'</p></div></div>'+
  '<div class="ads-discovery-path-grid">'+cards.map(([url,title,description,count])=>
   '<article class="ads-discovery-path"><span class="ads-discovery-path-count">'+s(count)+'</span><h3>'+s(title)+'</h3><p>'+s(description)+'</p>'+
   link(url,s(t("explore"))+' →',"btn btn-navy")+'</article>').join('')+'</div></div></section>';
}
function landing(){
 const featured=catalogue.platforms.filter(p=>p.featured).slice(0,4);
 const commerce=catalogue.platforms.find(p=>p.id==="commerce");
 return hero()+opportunityDiscoveryPaths()+
 '<section class="section section-platforms"><div class="container">'+sectionTitle(t("discover"),"/platforms",t("allPlatforms"))+'<div class="platform-grid">'+featured.map(platformCard).join("")+'</div></div></section>'+
 '<section class="featured-commerce"><div class="featured-left"><img class="featured-commerce-photo" src="'+s(photo("photo-1556740738-b6a63e27c4df",1100))+'" alt="" loading="lazy" width="1000" height="560"/><div><span class="eyebrow">◈ '+s(t("featured"))+'</span>'+
 '<h2>'+s(title(commerce))+'</h2><h3>'+s(t("featuredSubtitle"))+'</h3><p>'+s(t("commerceCopy"))+'</p>'+
 link(platformUrl(commerce),s(t("experience"))+' →',"btn btn-gold")+'</div></div></section>'+
 '<section class="section why-section"><div class="container why-wrap"><div><h2>'+s(t("businessTitle"))+'</h2><p>'+s(t("businessCopy"))+'</p>'+
 link("/opportunities",s(t("browseOpportunities"))+' →',"btn btn-navy")+link("/demo-access",s(t("demoHelp"))+' →',"btn btn-ghost")+
 '</div></div></section>'+partnerBanner();
}
function demoAccessGuide() {
 const steps = [
   ["01",t("demoGuideFirst"),t("demoGuideFirstText")],
   ["02",t("demoGuideSecond"),t("demoGuideSecondText")],
   ["03",t("demoGuideThird"),t("demoGuideThirdText")]
 ];
 return '<section class="directory-intro"><div class="container"><span class="eyebrow">ADS DEMO ACCESS</span><h1>'+s(t("demoGuideTitle"))+'</h1><p>'+s(t("demoGuideIntro"))+'</p>'+link("/platforms",s(t("demos"))+' →',"btn btn-gold")+'</div></section>'+
 '<section class="section"><div class="container"><div class="cloud-grid">'+steps.map(([num,name,explain])=>
   '<article class="cloud-card"><span class="demo-step">'+s(num)+'</span><h2>'+s(name)+'</h2><p>'+s(explain)+'</p></article>'
 ).join("")+'</div><p class="detail-note">'+s(t("demoGuideNotLive"))+'</p></div></section>';
}
function partnerBanner(){return '<section class="partner-banner"><div class="container"><div><span class="eyebrow">ADS PARTNERSHIPS</span><h2 >'+s(t("partnerTitle"))+'</h2><p>'+s(t("partnerCopy"))+'</p></div>'+companyAction("/partners",t("becomePartner"),"btn btn-gold")+'</div></section>';}
function chip(href,text,active){return link(href,s(text),"filter-chip"+(active?" selected":""));}
function platformDirectory(){
  const q=(new URLSearchParams(location.search).get("q")||"").toLowerCase().trim();
  const items=catalogue.platforms.filter(p=>matches(p,q));
  return '<section class="directory-intro"><div class="container"><span class="eyebrow">ADS DIGITAL ECOSYSTEM</span><h1>'+s(t("catalogPlatforms"))+'</h1><p>'+s(t("discoverCopy"))+'</p>'+searchBar(q)+'</div></section>'+
  '<section class="section"><div class="container"><div class="section-head"><h2>'+items.length+' '+s(t("platformsCount"))+'</h2>'+link("/opportunities",s(t("catalogTools"))+' →',"text-link")+'</div>'+
   (items.length?'<div class="platform-grid">'+items.map(platformCard).join("")+'</div>':'<p class="empty">'+s(t("noResults"))+'</p>')+'</div></section>';
}
function toolDirectory(){
  const params=new URLSearchParams(location.search), platform=params.get("platform")||"all";
  const q=(params.get("q")||"").toLowerCase().trim();
  const items=catalogue.tools.filter(x=>(platform==="all"||x.platformId===platform)&&matches(x,q));
  const filters=chip("/opportunities",t("all"),platform==="all")+catalogue.platforms.filter(p=>catalogue.tools.some(x=>x.platformId===p.id)).map(p=>chip("/opportunities?platform="+encodeURIComponent(p.id),title(p),platform===p.id)).join("");
  return '<section class="directory-intro"><div class="container"><span class="eyebrow">BUSINESS DISCOVERY</span><h1>'+s(t("catalogTools"))+'</h1><p>'+s(t("catalogCopy"))+'</p></div></section>'+
    '<section class="section"><div class="container"><div class="filters">'+filters+'</div><div class="section-head"><h2>'+items.length+' '+s(t("toolsCount"))+'</h2></div>'+
   (items.length?'<div class="tool-grid directory-tools">'+items.map(toolCard).join("")+'</div>':'<p class="empty">'+s(t("noResults"))+'</p>')+'</div></section>';
}
function platformDetail(p){
  const items=catalogue.tools.filter(x=>x.platformId===p.id);
  return '<section class="detail-hero" data-portal-hero="platform"><img class="detail-hero-photo" src="'+s(photo(p.image,1300))+'" alt="" loading="lazy" width="1300" height="420"/><div class="container">'+link("/platforms","← "+s(t("back")),"back-link")+'<div class="eyebrow">'+s(t("platforms"))+'</div><h1>'+s(title(p))+'</h1><p>'+s(summary(p))+'</p><div class="detail-actions">'+launch(p.demoUrl,t("visitPlatform"))+companyAction("/partners",t("becomePartner"),"btn btn-outline-light")+link("/demo-access",s(t("demoHelp"))+" →","btn btn-outline-light")+'</div></div></section>'+
  '<section class="section"><div class="container">'+sectionTitle(t("toolsInside"),"/opportunities?platform="+encodeURIComponent(p.id),t("allTools"))+
  (items.length?'<div class="tool-grid directory-tools">'+items.map(toolCard).join("")+'</div>':'<p class="empty">'+s(t("noResults"))+'</p>')+
  '<p class="detail-note">'+s(t("statusNote"))+'</p></div></section>';
}
function toolDetail(x){
 const p=catalogue.platforms.find(p=>p.id===x.platformId);
 return '<section class="detail-hero" data-portal-hero="tool"><img class="detail-hero-photo" src="'+s(photo(x.image,1400))+'" alt="" loading="lazy" width="1300" height="420"/><div class="container">'+link("/opportunities","← "+s(t("returnTools")),"back-link")+'<div class="eyebrow">'+s(p?title(p):t("platforms"))+' / '+s(t("opportunities"))+'</div><h1>'+s(title(x))+'</h1><p>'+s(summary(x))+'</p><div class="detail-actions">'+launch(x.demoUrl,t("tryDemo"))+link(platformUrl(p),s(t("explore"))+' '+s(title(p))+' →',"btn btn-outline-light")+'</div></div></section>'+
 '<section class="section"><div class="container detail-content"><div><span class="kicker-dark">ADS BUSINESS OPPORTUNITY</span><h2>'+s(t("howWorks"))+'</h2><p>'+s(model(x))+'</p></div><aside class="detail-aside"><h3>'+s(t("audience"))+'</h3><p>'+s(summary(x))+'</p><div class="divider"></div><h3>'+s(t("demos"))+'</h3><p>'+s(t("statusNote"))+'</p></aside></div></section>';
}
function cloud(){
 const parts=[["☁",t("cloudFeature1"),t("cloudFeature1Text")],["⚙",t("cloudFeature2"),t("cloudFeature2Text")],["◇",t("cloudFeature3"),t("cloudFeature3Text")]];
 return '<section class="directory-intro cloud-top"><div class="container"><span class="eyebrow">ADS INFRASTRUCTURE</span><h1>'+s(t("cloudTitle"))+'</h1><p>'+s(t("cloudText"))+'</p>'+companyAction("/partners",t("askCloud"),"btn btn-gold")+'</div></section>'+
  '<section class="section"><div class="container"><div class="cloud-grid">'+parts.map(x=>'<article class="cloud-card"><span>'+x[0]+'</span><h2>'+s(x[1])+'</h2><p>'+s(x[2])+'</p></article>').join("")+'</div><p class="detail-note">'+s(t("cloudNote"))+'</p></div></section>';
}
function footer(){
 return '<footer class="footer"><div class="container footer-inner"><div><a class="brand" href="/"><span class="brand-mark">✺</span><span class="brand-text"><span class="brand-full">AFRICA DIGITAL SYNERGY</span><span class="brand-short">ADS</span><small>PEOPLE · PLATFORMS · PROSPERITY</small></span></a><p>'+s(t("footer"))+'</p><address>'+s(t("officePending"))+'</address></div><div class="footer-links">'+
 link("/platforms",s(t("platforms")),"footer-link")+link("/opportunities",s(t("opportunities")),"footer-link")+
 link("/cloud",s(t("cloud")),"footer-link")+companyNav("/about",t("about"))+
 companyAction("/partners",t("becomePartner"),"footer-link")+
 link("mailto:admin@africadigitalsynergy.com","admin@africadigitalsynergy.com","footer-link")+
 whatsAppContact("WhatsApp","footer-link")+'</div></div></footer>';
}
function render(){
 document.documentElement.lang=lang;
 const path=decodeURIComponent(location.pathname.replace(/\/+$/,"")||"/");
 let main;
 if(path==="/") main=landing();
 else if(path==="/platforms") main=platformDirectory();
 else if(path.startsWith("/platforms/")) {const p=catalogue.platforms.find(x=>x.id===path.split("/")[2]);main=p?platformDetail(p):platformDirectory();}
 else if(path==="/opportunities") main=ADSOpportunities.directoryShell();
 else if(path.startsWith("/opportunities/")) {const legacy=catalogue.tools.find(y=>y.id===path.split("/")[2]);main=legacy?toolDetail(legacy):ADSOpportunities.detailShell();}
 else if(path==="/demo-access") main=demoAccessGuide();
 else if(path==="/cloud") main=cloud();
 else main=platformDirectory();
 const sectionTitle=path==="/"?"ADS":path==="/platforms"?t("platforms"):path==="/opportunities"?t("opportunities"):path==="/cloud"?t("cloud"):path==="/demo-access"?t("demos"):path.includes("/platforms/")?title(catalogue.platforms.find(p=>p.id===path.split("/")[2])||{name:"ADS"}):path.includes("/opportunities/")?t("opportunities"):t("platforms");
 document.title=sectionTitle+" · ADS";
 app.innerHTML=header()+'<main id="main">'+main+'</main>'+footer();
 const menu=app.querySelector(".menu-toggle"),nav=app.querySelector(".nav-links");
 menu.addEventListener("click",()=>{const open=nav.classList.toggle("is-open");menu.setAttribute("aria-expanded",String(open));});
 app.querySelectorAll("[data-lang]").forEach(btn=>btn.addEventListener("click",()=>{lang=btn.dataset.lang;localStorage.setItem("ads-portal-lang",lang);render();}));
 if(path==="/opportunities" || path.startsWith("/opportunities/")) ADSOpportunities.hydrate(path,lang);
}
async function start(){
 try {
 const response=await fetch("/catalogue.json",{cache:"no-store"});
 if(!response.ok) throw new Error("catalogue unavailable");
 const data=await response.json();
 if(!Array.isArray(data.platforms)||!Array.isArray(data.tools)) throw new Error("invalid catalogue");
 catalogue=data;
 render();
 } catch(err) {
 app.innerHTML='<main class="error-page"><h1>ADS Digital Ecosystem</h1><p>Catalogue temporarily unavailable.</p><a href="/">Try again</a></main>';
 console.error(err);
 }
}
start();
