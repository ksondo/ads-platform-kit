// Public image curation for ADS business discovery.
// Commons images are attributed on the /photo-credits page. No image is a live product screenshot.
// Wikimedia Special:FilePath supplies a width-limited thumbnail (external CDN).
const commons = Object.freeze({
  crop: {file:'Cultivatrice camerounaise10.jpg', author:'Hnkamwa', en:'Farmer cultivating a field in Cameroon', fr:'Agricultrice travaillant dans un champ au Cameroun'},
  market: {file:'Food market 1.jpg', author:'AminouT', en:'Market seller in Bamenda, Cameroon', fr:'Vendeuse sur un marché à Bamenda'},
  clinic: {file:'Doctor and a nurse in a Hospital room Cameroun.jpg', author:'Happi Raphael', en:'Doctor and nurse in a hospital in Douala', fr:'Médecin et infirmière dans un hôpital à Douala'},
  transit: {file:'Groupe de mototaxi.jpg', author:'Happi Raphael', en:'Motorcycle taxis in Douala', fr:'Mototaxis dans une rue de Douala'},
  computers: {file:'African Women working on computers.jpg', author:'Minette Lontsie', en:'Women working with computers in Cameroon', fr:'Femmes travaillant sur des ordinateurs au Cameroun'},
  delivery: {file:'Mototaximan.jpg', author:'Minette Lontsie', en:'Motorcycle transport and deliveries in Cameroon', fr:'Mototaxi assurant le transport au Cameroun'},
  plumbing: {file:'Cameroon male plumbier at work 01.jpg', author:'Gatien TITCHO SEUMO', en:'Plumber installing pipes in Cameroon', fr:'Plombier installant des canalisations au Cameroun'},
  maternity: {file:'A l’hôpital au Cameroun - Obstétrique.jpg', author:'John Mbenguè', en:'Nurses caring for a pregnant woman in Cameroon', fr:'Sages-femmes accompagnant une femme enceinte au Cameroun'},
  mechanic: {file:'Mecanicien moto.jpg', author:'Nekisvincent', en:'Motorcycle mechanic at work in Cameroon', fr:'Mécanicien de motos au travail au Cameroun'},
  building: {file:'Construction of building.jpg', author:'EzekielFokam', en:'Construction works in Cameroon', fr:'Travaux de construction au Cameroun'},
  tomatoes: {file:'Lady selling tomatoes.jpg', author:'Black Lyn', en:'Tomato vendor at a market in Yaoundé', fr:'Vendeuse de tomates dans un marché à Yaoundé'},
  waste: {file:'Garbage Collector 03.jpg', author:'Minette Lontsie', en:'Municipal waste collection workers in Douala', fr:'Éboueurs au travail à Douala'},
  workshop: {file:'Carpenter at work 1.jpg', author:'Minette Lontsie', en:'Carpenter at work in Cameroon', fr:'Menuisier au travail au Cameroun'},
  lodge: {file:'Site éco-touristique dans le Centre Cameroun.jpg', author:'Fotsingboris', en:'Eco-tourism lodge in central Cameroon', fr:'Site écotouristique dans la région du Centre'},
  site: {file:'Ouvriers sur un chantier de construction.jpg', author:'Minette Lontsie', en:'Construction workers at a building site', fr:'Ouvriers sur un chantier de construction'},
  harvest: {file:'Women farmer harvesting vegetables.jpg', author:'Minette Lontsie', en:'Farm worker harvesting vegetables in Cameroon', fr:'Agricultrice récoltant des légumes au Cameroun'},
  stall: {file:'Market seller.jpg', author:'Daritdob', en:'Clothing seller in Yaoundé Central Market', fr:'Vendeur de vêtements au marché central de Yaoundé'}
});

// Images for the platform directory are intentionally distinct, not repeated placeholder backgrounds.
const platforms = Object.freeze({
  'education':'photo-1503676260728-1c00da094a0b',
  'commerce':'market', 'healthcare':'clinic', 'agriculture':'crop',
  'finance':'photo-1611974789855-9c2a0a7236a3',
  'transport':'transit', 'ventureworks':'computers',
  'morphoo':'photo-1490730141103-6cac27aaab94',
  'logistics':'delivery','home-services':'plumbing',
  'africover':'photo-1563013544-824ae1b704d3',
  'soulbridge':'photo-1529156069898-49953e39b3ac',
  'mama-care':'maternity','digital-tontine':'stall','fleet-guard':'mechanic',
  'real-estate':'building','nutrition':'tomatoes',
  'city-events':'photo-1492684223066-81342ee5ff30',
  'community-incidents':'waste','processing':'workshop','tourism':'lodge',
  'law-firms':'photo-1589829545856-d10d557cf95f',
  'hopebridge':'harvest','construction':'site',
  'project-management':'photo-1454165804606-c3d57bc86b40'
});
const groups = Object.freeze({
  'business-agriculture':'crop',
  'business-processing':'workshop',
  'business-commerce':'market',
  'business-construction':'site',
  'business-mobility':'transit',
  'business-tourism':'lodge',
  'business-education':'photo-1509062522246-3755977927d7',
  'business-health':'clinic',
  'business-services':'plumbing',
  'business-finance':'photo-1611974789855-9c2a0a7236a3',
  'business-communities':'harvest',
  'business-technology':'computers',
  'business-environment':'waste',
  'institutional-formalities':'photo-1454165804606-c3d57bc86b40',
  'institutional-tax':'photo-1554224155-6726b3ff858f',
  'institutional-trade':'photo-1578575437130-527eed3abbec',
  'institutional-banking':'photo-1541354329998-f4d9a9f9297f',
  'institutional-standards':'photo-1581092160607-ee22621dd758',
  'institutional-licensing':'photo-1506784983877-45594efa4cbe',
  'institutional-insurance':'photo-1563013544-824ae1b704d3',
  'institutional-multiagency':'photo-1497366754035-f200968a6e72'
});
const license = 'https://creativecommons.org/licenses/by-sa/4.0/';
const commonsPage = file => 'https://commons.wikimedia.org/wiki/File:' + encodeURIComponent(file.replaceAll(' ','_'));
export const credits = Object.freeze(Object.entries(commons).map(([key,entry])=>({
  id:key, ...entry, source:commonsPage(entry.file), license
})));

export function imageUrl(key, width=760){
  if(commons[key]) return 'https://commons.wikimedia.org/wiki/Special:FilePath/' +
    encodeURIComponent(commons[key].file.replaceAll(' ','_')) + '?width=' + Math.max(320,Math.min(1400,width));
  if(typeof key==='string' && /^photo-[a-zA-Z0-9-]+$/.test(key))
    return 'https://images.unsplash.com/' + encodeURIComponent(key) + '?auto=format&fit=crop&w=' +
      Math.max(320,Math.min(1400,width)) + '&q=72';
  return '';
}
export const platformImage = (p,width=760)=>imageUrl(platforms[p.id]||p.image,width);
export const groupImage = (id,width=600)=>imageUrl(groups[id],width);
export const curatedPlatformCount = Object.keys(platforms).length;
export const curatedGroupCount = Object.keys(groups).length;
