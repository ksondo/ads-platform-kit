// Opportunity-level editorial imagery, keyed to the stable API solution IDs.
// Source-of-truth solution titles and results still come from PostgreSQL.
// Distinct photographs within each visible sector group; these are illustrative,
// not photos of ADS deployments, partner businesses, or customer records.
import {imageUrl, groupImage} from './image-library.js';

const extraCommons = Object.freeze({
  "supermarket": {
    "file": "Mahima Supermarket Yaoundé 2014.JPG",
    "author": "Bdx",
    "en": "Supermarket in Yaoundé",
    "fr": "Supermarché à Yaoundé",
    "license": "https://creativecommons.org/licenses/by-sa/4.0/"
  },
  "shelves": {
    "file": "Rayon serviettes hygienique et papier toilette Supermarché Cameroun 04.jpg",
    "author": "Minette Lontsie",
    "en": "Supermarket inventory shelves in Douala",
    "fr": "Rayon de produits dans un supermarché à Douala",
    "license": "https://creativecommons.org/licenses/by-sa/4.0/"
  },
  "pharmacy": {
    "file": "Pharmacy in cameroun.jpg",
    "author": "Minette Lontsie",
    "en": "Pharmacy product shelves in Douala",
    "fr": "Rayons de pharmacie à Douala",
    "license": "https://creativecommons.org/licenses/by-sa/4.0/"
  },
  "pharmacist": {
    "file": "Pharmacienne Cameroon.jpg",
    "author": "Minette Lontsie",
    "en": "Pharmacy counter and worker in Cameroon",
    "fr": "Personnel et comptoir d’une pharmacie au Cameroun",
    "license": "https://creativecommons.org/licenses/by-sa/4.0/"
  },
  "breadstall": {
    "file": "Baguettes stall, Dschang, Cameroon.jpg",
    "author": "SarahTz",
    "en": "Bread stall in Dschang",
    "fr": "Étal de pains à Dschang",
    "license": "https://creativecommons.org/licenses/by/2.0/"
  },
  "breadcart": {
    "file": "Vendeur ambulant de Pain et Gateau.jpg",
    "author": "Minette Lontsie",
    "en": "Bread-and-cake distribution in Cameroon",
    "fr": "Vendeur de pains et gâteaux au Cameroun",
    "license": "https://creativecommons.org/licenses/by-sa/4.0/"
  },
  "coffee": {
    "file": "Vendeur ambulant de café à Douala.jpg",
    "author": "Minette Lontsie",
    "en": "Coffee seller in Douala",
    "fr": "Vendeur de café à Douala",
    "license": "https://creativecommons.org/licenses/by-sa/4.0/"
  },
  "kitchen": {
    "file": "Open air kitchen, Yaounde, Cameroon.jpg",
    "author": "Albert Bergonzo",
    "en": "Street-food kitchen in Yaoundé",
    "fr": "Cuisine de rue à Yaoundé",
    "license": "https://creativecommons.org/licenses/by-sa/4.0/"
  },
  "waiter": {
    "file": "Serveur.jpg",
    "author": "Hnkamwa",
    "en": "Restaurant waiter in Douala",
    "fr": "Serveur dans un restaurant à Douala",
    "license": "https://creativecommons.org/licenses/by-sa/4.0/"
  },
  "restaurant": {
    "file": "Interior of the Restaurant 00.jpg",
    "author": "Alangi Derick",
    "en": "Restaurant interior in Buea",
    "fr": "Salle de restaurant à Buea",
    "license": "https://creativecommons.org/licenses/by-sa/4.0/"
  },
  "hardware": {
    "file": "African Street vendor selling buckets.jpg",
    "author": "Minette Lontsie",
    "en": "Household goods seller in Douala",
    "fr": "Vente d’articles ménagers à Douala",
    "license": "https://creativecommons.org/licenses/by-sa/4.0/"
  },
  "quarry": {
    "file": "Work in a sand quarry.jpg",
    "author": "Minette Lontsie",
    "en": "Sand-quarry production work in Douala",
    "fr": "Travaux d’une carrière de sable à Douala",
    "license": "https://creativecommons.org/licenses/by-sa/4.0/"
  },
  "joiner": {
    "file": "Menuisier 01.jpg",
    "author": "Minette Lontsie",
    "en": "Joiner shaping timber in Cameroon",
    "fr": "Menuisier rabotant du bois au Cameroun",
    "license": "https://creativecommons.org/licenses/by-sa/4.0/"
  },
  "furniture": {
    "file": "Atelier de fabrication.jpg",
    "author": "Franco237",
    "en": "Furniture production workshop in Cameroon",
    "fr": "Atelier de fabrication de mobilier au Cameroun",
    "license": "https://creativecommons.org/licenses/by-sa/4.0/"
  },
  "cocoa": {
    "file": "Drying cocoa.jpg",
    "author": "Otuo-Akyampong Boakye",
    "en": "Cocoa beans drying before processing",
    "fr": "Séchage des fèves de cacao avant transformation",
    "license": "https://creativecommons.org/licenses/by-sa/4.0/"
  },
  "cassava": {
    "file": "Cassava processing to garri.jpg",
    "author": "Ei'eke",
    "en": "Cassava preparation into garri in Nigeria",
    "fr": "Préparation du manioc pour le gari au Nigéria",
    "license": "https://creativecommons.org/licenses/by-sa/4.0/"
  },
  "roasting": {
    "file": "A man selling roasted chicken of different sizes.jpg",
    "author": "Sunday Glory",
    "en": "Prepared poultry food products in Nigeria",
    "fr": "Produits à base de poulet grillé au Nigéria",
    "license": "https://creativecommons.org/licenses/by-sa/4.0/"
  },
  "carpenter": {
    "file": "Carpenter at working.jpg",
    "author": "Hajjare",
    "en": "Carpenter at work in Nigeria",
    "fr": "Menuisier au travail au Nigéria",
    "license": "https://creativecommons.org/licenses/by-sa/4.0/"
  }
});

export const solutionPhotoKeys = Object.freeze({
  "sector-agriculture-crop-farming": "crop",
  "sector-livestock-poultry": "roasting",
  "business-poultry-farm": "harvest",
  "business-crop-cooperative": "tomatoes",
  "sector-food-agricultural-processing": "cocoa",
  "sector-wood-forest-processing": "workshop",
  "sector-animal-products-processing": "roasting",
  "sector-industrial-manufacturing": "furniture",
  "sector-mineral-processing": "quarry",
  "sector-recycling-circular-economy": "waste",
  "business-wood-processor-sawmill": "joiner",
  "business-furniture-manufacturer": "carpenter",
  "business-carpentry-workshop": "plumbing",
  "business-cocoa-processor": "crop",
  "business-cassava-processor": "cassava",
  "sector-retail-neighborhood-shops": "supermarket",
  "sector-wholesale-distribution": "shelves",
  "sector-e-commerce-marketplaces": "computers",
  "sector-food-service-restaurants": "kitchen",
  "sector-pharmacies-medical-retail": "pharmacy",
  "business-bakery": "breadstall",
  "business-grocery-store": "tomatoes",
  "business-pharmacy": "pharmacist",
  "business-hardware-shop": "hardware",
  "business-wholesaler": "market",
  "business-online-store-operator": "photo-1454165804606-c3d57bc86b40",
  "business-restaurant": "waiter",
  "business-coffee-shop": "coffee",
  "sector-construction-contractors": "site",
  "sector-real-estate-property": "building",
  "business-property-manager": "quarry",
  "business-building-contractor": "photo-1581092160607-ee22621dd758",
  "sector-passenger-transport": "transit",
  "sector-logistics-courier-warehousing": "delivery",
  "sector-fleet-services-equipment": "mechanic",
  "sector-car-sales-dealerships": "photo-1578575437130-527eed3abbec",
  "business-bus-operator": "photo-1506784983877-45594efa4cbe",
  "business-courier-company": "photo-1497366754035-f200968a6e72",
  "business-fleet-owner": "photo-1541354329998-f4d9a9f9297f",
  "business-car-dealership": "photo-1563013544-824ae1b704d3",
  "sector-tourism-hospitality": "lodge",
  "sector-events-recreation-entertainment": "photo-1492684223066-81342ee5ff30",
  "sector-sports-gyms-fitness": "photo-1529156069898-49953e39b3ac",
  "business-hotel": "restaurant",
  "business-tour-guide": "site",
  "business-event-organizer": "waiter",
  "business-gym": "photo-1490730141103-6cac27aaab94",
  "sector-schools-education": "photo-1509062522246-3755977927d7",
  "sector-training-certification": "computers",
  "sector-careers-employment-skills": "photo-1503676260728-1c00da094a0b",
  "business-primary-school": "photo-1454165804606-c3d57bc86b40",
  "business-secondary-school": "photo-1497366754035-f200968a6e72",
  "business-private-tutor": "photo-1506784983877-45594efa4cbe",
  "business-vocational-training-centre": "photo-1581092160607-ee22621dd758",
  "business-recruitment-agency": "photo-1611974789855-9c2a0a7236a3",
  "sector-healthcare-clinics": "clinic",
  "sector-maternal-newborn-family-care": "maternity",
  "sector-mental-wellness-counselling": "photo-1529156069898-49953e39b3ac",
  "sector-nutrition-food-planning-dietetics": "tomatoes",
  "business-clinic": "pharmacy",
  "business-maternity-clinic": "pharmacist",
  "business-nutritionist": "harvest",
  "business-meal-preparation-business": "kitchen",
  "sector-home-domestic-services": "plumbing",
  "sector-beauty-personal-services": "shelves",
  "sector-legal-professional-services": "photo-1589829545856-d10d557cf95f",
  "sector-family-heritage-ancestry": "photo-1529156069898-49953e39b3ac",
  "sector-creative-industries-media": "photo-1492684223066-81342ee5ff30",
  "business-cleaning-service": "waste",
  "business-plumber": "joiner",
  "business-hair-salon": "photo-1490730141103-6cac27aaab94",
  "business-law-firm": "photo-1454165804606-c3d57bc86b40",
  "business-accounting-firm": "photo-1554224155-6726b3ff858f",
  "business-photographer": "photo-1506784983877-45594efa4cbe",
  "sector-banking-credit-facilitation": "photo-1611974789855-9c2a0a7236a3",
  "sector-cooperatives-tontines": "stall",
  "sector-insurance-risk-services": "photo-1563013544-824ae1b704d3",
  "sector-personal-household-finance": "photo-1554224155-6726b3ff858f",
  "sector-investment-preparation-opportunities": "photo-1541354329998-f4d9a9f9297f",
  "business-microfinance-institution": "photo-1454165804606-c3d57bc86b40",
  "business-tontine-group": "market",
  "business-insurance-broker": "photo-1497366754035-f200968a6e72",
  "business-savings-advisor": "computers",
  "business-startup-investor-network": "photo-1506784983877-45594efa4cbe",
  "sector-ngos-charities-social-projects": "harvest",
  "sector-community-services-public-infrastructure": "site",
  "sector-churches-faith-communities": "photo-1490730141103-6cac27aaab94",
  "business-ngo": "crop",
  "business-municipal-service-team": "building",
  "business-church": "photo-1529156069898-49953e39b3ac",
  "sector-software-it-services": "computers",
  "sector-cloud-managed-operations": "photo-1497366754035-f200968a6e72",
  "sector-business-formation-advisory": "photo-1454165804606-c3d57bc86b40",
  "sector-project-organizational-management": "photo-1506784983877-45594efa4cbe",
  "sector-telecom-digital-communications": "photo-1581092160607-ee22621dd758",
  "sector-regulatory-compliance-service-providers": "photo-1554224155-6726b3ff858f",
  "business-venture-incubator": "photo-1611974789855-9c2a0a7236a3",
  "business-software-developer-agency": "photo-1563013544-824ae1b704d3",
  "business-cloud-reseller": "photo-1578575437130-527eed3abbec",
  "sector-waste-collection-environmental-services": "waste",
  "business-waste-collector": "harvest",
  "aggregation-institutional-onboarding": "photo-1454165804606-c3d57bc86b40",
  "aggregation-tax-readiness": "photo-1554224155-6726b3ff858f",
  "aggregation-fiscal-gateway": "photo-1611974789855-9c2a0a7236a3",
  "aggregation-customs-case": "delivery",
  "aggregation-guce-integration": "photo-1578575437130-527eed3abbec",
  "aggregation-landed-cost": "photo-1541354329998-f4d9a9f9297f",
  "aggregation-export-readiness": "photo-1506784983877-45594efa4cbe",
  "aggregation-goods-provenance": "photo-1581092160607-ee22621dd758",
  "aggregation-standards-readiness": "furniture",
  "aggregation-agri-permits": "crop",
  "aggregation-environmental-compliance": "waste",
  "aggregation-construction-approvals": "site",
  "aggregation-health-licenses": "clinic",
  "aggregation-transport-licenses": "transit",
  "aggregation-bank-finance-broker": "photo-1611974789855-9c2a0a7236a3",
  "aggregation-trade-domiciliation": "photo-1541354329998-f4d9a9f9297f",
  "aggregation-payments-merchant-onboarding": "photo-1563013544-824ae1b704d3",
  "aggregation-insurance-intermediation": "photo-1563013544-824ae1b704d3",
  "aggregation-regulatory-monitoring": "photo-1454165804606-c3d57bc86b40",
  "aggregation-institutional-service-desk": "photo-1506784983877-45594efa4cbe"
});

// Return one of the explicitly curated opportunity photographs; never use a
// category-wide picture for every row in the same category.
function fromKey(key, width){
 if(Object.hasOwn(extraCommons,key)){
  return 'https://commons.wikimedia.org/wiki/Special:FilePath/' +
    encodeURIComponent(extraCommons[key].file.replaceAll(' ','_')) +
    '?width='+Math.max(320,Math.min(1400,width));
 }
 return imageUrl(key,width);
}

export function opportunityImage(item,width=740,index=0){
 const id=item?.id||'';
 const photoKey=solutionPhotoKeys[id];
 if(photoKey)return fromKey(photoKey,width);
 // Tool view is a different, larger catalogue (328 mappings). For tools that
 // have no hand-picked photo yet, rotate the category's curated visual pool
 // by the visible card index, rather than repeating the category cover.
 const category=item?.category_id||'';
 const palette=categoryPalettes[category];
 if(palette?.length)return fromKey(palette[index%palette.length],width);
 return groupImage(category,width);
}

// Explicit, reviewed pools. Stable order avoids flicker when filtering.
const categoryPalettes=Object.freeze({
  "business-agriculture": [
    "crop",
    "roasting",
    "harvest",
    "tomatoes"
  ],
  "business-processing": [
    "cocoa",
    "workshop",
    "roasting",
    "furniture",
    "quarry",
    "waste",
    "joiner",
    "carpenter",
    "plumbing",
    "crop",
    "cassava"
  ],
  "business-commerce": [
    "supermarket",
    "shelves",
    "computers",
    "kitchen",
    "pharmacy",
    "breadstall",
    "tomatoes",
    "pharmacist",
    "hardware",
    "market",
    "photo-1454165804606-c3d57bc86b40",
    "waiter",
    "coffee"
  ],
  "business-construction": [
    "site",
    "building",
    "quarry",
    "photo-1581092160607-ee22621dd758"
  ],
  "business-mobility": [
    "transit",
    "delivery",
    "mechanic",
    "photo-1578575437130-527eed3abbec",
    "photo-1506784983877-45594efa4cbe",
    "photo-1497366754035-f200968a6e72",
    "photo-1541354329998-f4d9a9f9297f",
    "photo-1563013544-824ae1b704d3"
  ],
  "business-tourism": [
    "lodge",
    "photo-1492684223066-81342ee5ff30",
    "photo-1529156069898-49953e39b3ac",
    "restaurant",
    "site",
    "waiter",
    "photo-1490730141103-6cac27aaab94"
  ],
  "business-education": [
    "photo-1509062522246-3755977927d7",
    "computers",
    "photo-1503676260728-1c00da094a0b",
    "photo-1454165804606-c3d57bc86b40",
    "photo-1497366754035-f200968a6e72",
    "photo-1506784983877-45594efa4cbe",
    "photo-1581092160607-ee22621dd758",
    "photo-1611974789855-9c2a0a7236a3"
  ],
  "business-health": [
    "clinic",
    "maternity",
    "photo-1529156069898-49953e39b3ac",
    "tomatoes",
    "pharmacy",
    "pharmacist",
    "harvest",
    "kitchen"
  ],
  "business-services": [
    "plumbing",
    "shelves",
    "photo-1589829545856-d10d557cf95f",
    "photo-1529156069898-49953e39b3ac",
    "photo-1492684223066-81342ee5ff30",
    "waste",
    "joiner",
    "photo-1490730141103-6cac27aaab94",
    "photo-1454165804606-c3d57bc86b40",
    "photo-1554224155-6726b3ff858f",
    "photo-1506784983877-45594efa4cbe"
  ],
  "business-finance": [
    "photo-1611974789855-9c2a0a7236a3",
    "stall",
    "photo-1563013544-824ae1b704d3",
    "photo-1554224155-6726b3ff858f",
    "photo-1541354329998-f4d9a9f9297f",
    "photo-1454165804606-c3d57bc86b40",
    "market",
    "photo-1497366754035-f200968a6e72",
    "computers",
    "photo-1506784983877-45594efa4cbe"
  ],
  "business-communities": [
    "harvest",
    "site",
    "photo-1490730141103-6cac27aaab94",
    "crop",
    "building",
    "photo-1529156069898-49953e39b3ac"
  ],
  "business-technology": [
    "computers",
    "photo-1497366754035-f200968a6e72",
    "photo-1454165804606-c3d57bc86b40",
    "photo-1506784983877-45594efa4cbe",
    "photo-1581092160607-ee22621dd758",
    "photo-1554224155-6726b3ff858f",
    "photo-1611974789855-9c2a0a7236a3",
    "photo-1563013544-824ae1b704d3",
    "photo-1578575437130-527eed3abbec"
  ],
  "business-environment": [
    "waste",
    "harvest"
  ],
  "institutional-formalities": [
    "photo-1454165804606-c3d57bc86b40"
  ],
  "institutional-tax": [
    "photo-1554224155-6726b3ff858f",
    "photo-1611974789855-9c2a0a7236a3"
  ],
  "institutional-trade": [
    "delivery",
    "photo-1578575437130-527eed3abbec",
    "photo-1541354329998-f4d9a9f9297f",
    "photo-1506784983877-45594efa4cbe"
  ],
  "institutional-standards": [
    "photo-1581092160607-ee22621dd758",
    "furniture"
  ],
  "institutional-licensing": [
    "crop",
    "waste",
    "site",
    "clinic",
    "transit"
  ],
  "institutional-banking": [
    "photo-1611974789855-9c2a0a7236a3",
    "photo-1541354329998-f4d9a9f9297f",
    "photo-1563013544-824ae1b704d3"
  ],
  "institutional-insurance": [
    "photo-1563013544-824ae1b704d3"
  ],
  "institutional-multiagency": [
    "photo-1454165804606-c3d57bc86b40",
    "photo-1506784983877-45594efa4cbe"
  ]
});

const sourcePage=file=>'https://commons.wikimedia.org/wiki/File:'+encodeURIComponent(file.replaceAll(' ','_'));
export const opportunityCredits=Object.freeze(Object.entries(extraCommons).map(([id,p])=>({
 id, ...p, source:sourcePage(p.file)
})));
export const mappedOpportunityCount=Object.keys(solutionPhotoKeys).length;
