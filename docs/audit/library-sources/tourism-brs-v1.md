# Library source extract: TourismCorestack_BRS_v1.docx

> For Claude review. Text extracted from the ChatGPT Library original. Preserve the original PDF/DOCX/MD as authoritative for page layout, tables and figures; this extraction may omit visual content. This is NOT an approved replacement BRS. Source file ID: `file_00000000b43471f4a3a2c9dd76a4bbda`. Extraction date: 2026-10-19.

---
















Africa Digital Synergy Ltd  |  AfriCorestack  |  TourismCorestack BRS v1.0


AFRICA DIGITAL SYNERGY LTD
AfriCorestack — Economic Operating System
TourismCorestack — Business Requirements Specification
Document Version: 1.0  |  Status: Draft for Developer Review
Prepared by: Kengjiseh Sondo  |  Founder & Project Coordinator, ADS
Module: TourismCorestack — Digital Tourism, Hospitality & Experience Platform
Yaounde, Cameroon  |  2026
Document Control
	Version
	Date
	Author
	Status
	Changes

	1.0
	2026
	Kengjiseh Sondo
	Draft
	Initial BRS — full specification for developer review





1. Executive Summary
TourismCorestack is the tourism and hospitality module of AfriCorestack — the Economic Operating System developed by Africa Digital Synergy Ltd. It provides a complete digital platform for tourism operators across Cameroon — hotels and guesthouses, tour guides and associations, cultural event organizers, adventure and eco-tourism operators, craft and souvenir sellers, water experience operators, and local photographers — to make their services discoverable, bookable, and payable by domestic visitors, international travellers, and the Cameroonian diaspora worldwide.
The platform serves two equally important audiences: the tourism operator who needs a digital front door to reach customers they cannot currently find through word of mouth alone, and the visitor — domestic, diaspora, or international — who needs a reliable, searchable, and bookable platform to discover Cameroon's extraordinary tourism offering.
This BRS defines the complete functional, technical, and integration requirements for the TourismCorestack module. It is the authoritative reference document for the development team and must be consulted before any architectural decision, database schema definition, or feature implementation.
2. Business Objectives
	#
	Objective
	Measurable Outcome

	BO-01
	Make Cameroonian tourism operators discoverable to domestic, diaspora, and international visitors through a single verified platform
	Number of operator listings active; percentage of listings with at least one booking per month

	BO-02
	Enable real-time online booking and secure payment for all tourism services
	Number of bookings per month; percentage of bookings paid digitally vs cash

	BO-03
	Serve domestic tourism demand — Cameroonians discovering Cameroon
	Percentage of bookings from domestic visitors; domestic vs international booking split

	BO-04
	Create a Diaspora Gateway serving Cameroonians abroad who want to book experiences, events, and craft products
	Number of diaspora bookings per month; geographic origin of diaspora users

	BO-05
	Enable international card payment and multi-currency settlement for international visitors
	Number of international card transactions; foreign currency settlement volume

	BO-06
	Build verifiable financial records for tourism operators enabling banking and credit access
	Number of operators with 6+ months of booking history; credit assessments initiated from platform data

	BO-07
	Integrate with financial institution core banking systems via GIMAC for direct revenue settlement
	Number of operators with core banking settlement active; GIMAC vs mobile money transaction split

	BO-08
	Connect tourism seamlessly with transport, commerce, and logistics modules in the AfriCorestack ecosystem
	Number of cross-module bookings — tourism + transport itineraries; craft sales linked to tourism listings




3. Stakeholders and Roles
	Role
	Description
	Interface
	Key Permissions

	Visitor
	Any person browsing and booking tourism experiences — domestic, diaspora, or international. May be registered or browsing anonymously.
	Visitor web platform / mobile app
	Search and browse listings, view profiles and reviews, book experiences, pay, build itineraries, leave reviews after verified stays

	Operator
	The owner or manager of a tourism business — hotel, guesthouse, tour guide, event organizer, activity provider, craft seller, restaurant.
	Operator web dashboard / mobile app
	Manage listing profile, set availability and pricing, view and confirm bookings, communicate with guests, view revenue records, request payouts

	Guide / Activity Provider
	An individual tour guide or activity specialist who manages their own listing independently or as part of an operator group.
	Guide mobile app / web
	Manage personal availability calendar, accept bookings, view upcoming guests, view earnings

	Event Manager
	Organizer of a cultural festival, market, or tourism event — manages event listings, ticket inventory, and sales.
	Event manager web dashboard
	Create event listings, set ticket tiers and quantities, view ticket sales, manage gate access via QR scanner, view revenue

	Accountant
	Professional managing operator financial records and producing monthly transaction summaries for accounting and tax declaration.
	Accountant web dashboard
	View all operator booking transactions, generate monthly summaries, flag data quality issues, produce tax-ready reports

	Bank Officer
	Staff from a connected financial institution managing their tourism operator portfolio.
	Bank officer web dashboard
	View operator booking history, revenue by season, loan eligibility flag, mobile money vs core banking split

	Auditor
	ADS or assigned partner monitoring loan-linked operator activity and compliance.
	Audit & control dashboard
	View active operator loans, compliance alerts, field visit scheduling and logging

	System Admin
	ADS internal staff managing operator verification, listing approval, dispute resolution, and platform configuration.
	Admin panel
	Full access, operator verification, listing approval, dispute resolution, system configuration




4. Business Rules
4.1  Operator and Listing Rules
	Rule ID
	Rule
	Enforcement Point

	BR-OP-01
	An operator must complete registration and admin verification before their listing is visible on the public discovery platform. Listings are not searchable until status=published.
	Listing management — published status blocked until admin verification complete

	BR-OP-02
	Operator profile must include at minimum: business name, category, at least one service description with pricing, operating city, GPS location (map pin), and at least one contact method. Incomplete profiles cannot be published.
	Profile management — completeness check before publish action

	BR-OP-03
	Operator pricing must be set in FCFA as the base currency. International display in USD or EUR is calculated by the platform using daily exchange rates — operators do not set international prices directly.
	Pricing module — international price display is calculated, not entered

	BR-OP-04
	A tour guide listing must include: guide certification number (if certified), languages spoken, areas of operation, and at least one package with description and price. Guide must have verified phone and CNI on file.
	Guide onboarding — certification field required for verified guide badge; CNI required for KYC

	BR-OP-05
	Guest reviews can only be submitted by visitors who completed a verified booking through the platform. Anonymous or unverified reviews are not permitted.
	Review module — review form only accessible from confirmed booking record with status=completed



4.2  Booking Rules
	Rule ID
	Rule
	Enforcement Point

	BR-BK-01
	A booking is confirmed only when payment is successfully collected. Unpaid bookings expire after 30 minutes and release held inventory back to available status.
	Booking module — payment timeout enforced, inventory released on expiry

	BR-BK-02
	Operator must respond to a booking request within 24 hours for non-instant-booking listings. Unresponded requests after 24 hours are automatically declined and visitor receives full refund.
	Booking module — 24-hour response timer enforced, auto-decline on timeout

	BR-BK-03
	Cancellation policy is set by the operator per listing: flexible (full refund up to 24 hours before), moderate (full refund up to 5 days before, 50% after), strict (50% refund up to 7 days before, no refund after). Platform enforces the policy set by the operator at booking.
	Booking module — cancellation refund calculated against operator-configured policy and booking date vs service date

	BR-BK-04
	A booking dispute can only be raised within 48 hours of the service date. After 48 hours, funds are released to the operator and the transaction is closed.
	Dispute module — dispute creation time-locked to within 48 hours of service_date

	BR-BK-05
	Commission is deducted from operator payout before disbursement. The visitor price is the full price. The operator receives the visitor price minus platform commission.
	Payment module — commission deduction applied before disbursement, not added on top of visitor price



4.3  Payment Rules
	Rule ID
	Rule
	Enforcement Point

	BR-PY-01
	Domestic visitor payments via MTN MoMo or Orange Money are collected through CinetPay/Notchpay integration. Funds held in escrow until service completion confirmation.
	Payment module — escrow hold on mobile money collection

	BR-PY-02
	International visitor payments via card (Stripe or equivalent) are collected in the visitor's currency and settled to the operator in FCFA at the daily exchange rate. Exchange rate applied at time of payment, not at time of payout.
	Payment module — exchange rate locked at payment time, not payout time

	BR-PY-03
	Funds are released to operator within 48 hours of service completion. Operator marks service as completed in their dashboard. For hotels, checkout date triggers completion. For tours, end of tour triggers completion.
	Payment module — release trigger = service_completed event. Hotels: checkout_date. Tours and activities: tour_end event.

	BR-PY-04
	For operators with a connected core banking account via GIMAC, settlement is routed to their bank account. For operators without core banking, settlement is via mobile money. If GIMAC settlement fails, system falls back to mobile money and logs the fallback.
	Payment router — payout_channel determines routing. GIMAC fallback logged and admin alerted.

	BR-PY-05
	Monthly transaction summaries auto-generated on the 1st of each month for all active operators. Includes all bookings, revenue, commission deducted, and net payout. Available as PDF and CSV.
	Reporting service — scheduled monthly job




5. System Architecture Overview
5.1  Technology Stack
	Layer
	Technology
	Notes

	Frontend — Web (Visitor-facing)
	Next.js + TypeScript + Tailwind CSS
	SEO-optimised for international discovery. Server-side rendering for fast initial load. Accessible from global browsers. Multilingual (French, English, expandable).

	Frontend — Web (Operator dashboard)
	React + TypeScript + Vite + Tailwind CSS
	Operator management interface. Consistent with AfriCorestack platform standard.

	Frontend — Mobile
	React Native (iOS and Android)
	Visitor app and guide/operator app. Offline-first for downloaded itineraries and maps. GPS-based nearby discovery.

	Backend
	Node.js + NestJS
	Modular RESTful API + WebSocket for real-time booking availability. Consistent with AfriCorestack standard.

	Database
	PostgreSQL + Supabase Pro + Row-Level Security
	Relational data with RLS enforcing role-based access. Real-time subscriptions for booking availability.

	File Storage
	Supabase Storage
	Operator photos, virtual tour media, event banners, QR codes, monthly summary PDFs, review photos.

	GPS and Mapping
	Google Maps API / OpenStreetMap (fallback)
	Discovery map, GPS-located operator pins, itinerary route generation, offline map caching.

	Payment — Mobile Money
	CinetPay / Notchpay
	MTN MoMo and Orange Money for domestic visitor payments and operator disbursement.

	Payment — International Card
	Stripe or equivalent
	Credit and debit card payments for international and diaspora visitors. Multi-currency with FCFA settlement.

	Payment — Core Banking
	GIMAC interoperability protocol
	Direct bank account settlement for connected operators. Mobile money fallback on failure.

	Search Engine
	PostgreSQL full-text search + PostGIS for geo queries
	Operator search by category, location, keyword, and proximity. Geo-radius search for 'near me' discovery.

	Email
	SendGrid or equivalent
	Booking confirmations, review requests, monthly summary notifications, operator alerts.

	Notifications
	FCM (push) + SMS gateway
	Booking alerts to operators, tour reminders to visitors, payment confirmations.

	Authentication
	Supabase Auth + JWT
	Phone + OTP for mobile users. Email + password for web dashboard users. Social login (Google) for international visitors.

	Internationalisation
	react-i18next (web), i18n (mobile)
	French and English UI strings. Operator content in both languages where provided.



5.2  Service Boundaries
The system is structured around the following service boundaries:
1. Auth Service — registration, OTP, KYC, role assignment, social login, session management
1. Operator Service — listing creation and management, profile completeness validation, publishing workflow
1. Discovery Service — search, geo-radius queries, category browse, featured experiences, destination portals
1. Availability Service — real-time inventory management, calendar availability, booking slot logic
1. Booking Service — booking creation, payment collection, operator notification, confirmation flow
1. Payment Service — mobile money collection, Stripe card processing, escrow management, GIMAC routing, disbursement, refund processing
1. Review Service — verified review creation, rating calculation, operator response, review moderation
1. Itinerary Service — multi-operator itinerary builder, route generation, PDF export, sharing
1. Event Service — event listing, ticket inventory, digital ticket generation, QR gate scanning, revenue tracking
1. Diaspora Gateway — curated diaspora content, homecoming packages, international craft shopping
1. Wallet Service — operator wallet management, escrow balance, commission deduction, monthly summary generation
1. Reporting Service — monthly transaction summaries, analytics dashboards, export tools
1. Notification Service — FCM push, SMS, email triggers
1. CRM Service — guest database, operator-guest messaging, loyalty point tracking


6. Entity Relationship Diagram — Full Data Model
All tables include created_at and updated_at (timestamptz, NOT NULL, default now()) unless noted. All IDs are UUID.

users
	Field
	Type
	Constraints
	Description

	id
	UUID
	PK, default gen_random_uuid()

	phone
	VARCHAR(20)
	UNIQUE, NULLABLE
	Primary for mobile auth

	email
	VARCHAR(255)
	UNIQUE, NULLABLE
	Primary for web / international users

	full_name
	VARCHAR(255)
	NOT NULL

	role
	ENUM
	NOT NULL — values: visitor, operator, guide, event_manager, accountant, auditor, bank_officer, admin

	kyc_status
	ENUM
	NOT NULL, default pending — values: pending, verified, rejected

	cni_number
	VARCHAR(50)
	NULLABLE
	For operator and guide KYC

	nui
	VARCHAR(50)
	NULLABLE, UNIQUE
	DGI tax identifier

	preferred_language
	VARCHAR(10)
	NOT NULL, default fr

	country_of_residence
	VARCHAR(100)
	NULLABLE
	Used for diaspora gateway personalisation

	is_active
	BOOLEAN
	NOT NULL, default true



operators
	Field
	Type
	Constraints
	Description

	id
	UUID
	PK

	user_id
	UUID
	FK → users.id, UNIQUE, NOT NULL

	business_name
	VARCHAR(255)
	NOT NULL

	category
	ENUM
	NOT NULL — values: hotel_guesthouse, tour_guide, event_organizer, adventure_eco, water_experience, craft_market, restaurant_culinary, photographer, shuttle_transport

	description_fr
	TEXT
	NULLABLE
	Description in French

	description_en
	TEXT
	NULLABLE
	Description in English

	mintoul_registration
	VARCHAR(100)
	NULLABLE
	Ministry of Tourism registration number

	nui
	VARCHAR(50)
	NULLABLE

	rccm
	VARCHAR(100)
	NULLABLE

	city
	VARCHAR(100)
	NOT NULL

	region
	VARCHAR(100)
	NOT NULL

	address
	TEXT
	NULLABLE

	lat
	DECIMAL(10,8)
	NOT NULL
	GPS latitude — required for map pin

	lng
	DECIMAL(11,8)
	NOT NULL
	GPS longitude

	phone
	VARCHAR(20)
	NOT NULL

	website
	TEXT
	NULLABLE

	languages_spoken
	TEXT[]
	NOT NULL, default '{}'

	photos
	TEXT[]
	NOT NULL, default '{}'
	Array of Supabase storage URLs

	cover_photo_url
	TEXT
	NULLABLE

	rating
	DECIMAL(3,2)
	NOT NULL, default 0.00

	total_reviews
	INTEGER
	NOT NULL, default 0

	total_bookings
	INTEGER
	NOT NULL, default 0

	status
	ENUM
	NOT NULL, default draft — values: draft, pending_review, published, suspended

	platform_commission_pct
	DECIMAL(5,2)
	NOT NULL, default 10.00

	payout_channel
	ENUM
	NOT NULL, default mobile_money — values: mobile_money, core_banking

	mobile_money_number
	VARCHAR(20)
	NULLABLE

	bank_account_id
	UUID
	NULLABLE, FK → bank_accounts.id

	subscription_tier
	ENUM
	NOT NULL, default basic — values: basic, standard, premium

	subscription_expires_at
	TIMESTAMPTZ
	NOT NULL

	is_instant_booking
	BOOLEAN
	NOT NULL, default false
	If true, bookings auto-confirm without operator approval

	cancellation_policy
	ENUM
	NOT NULL, default moderate — values: flexible, moderate, strict



listings (individual services/packages per operator)
	Field
	Type
	Constraints
	Description

	id
	UUID
	PK

	operator_id
	UUID
	FK → operators.id, NOT NULL

	title_fr
	VARCHAR(255)
	NOT NULL

	title_en
	VARCHAR(255)
	NULLABLE

	description_fr
	TEXT
	NOT NULL

	description_en
	TEXT
	NULLABLE

	listing_type
	ENUM
	NOT NULL — values: room, tour_package, activity, event_ticket, craft_product, culinary_experience, photo_package

	price_fcfa
	DECIMAL(10,2)
	NOT NULL

	price_unit
	ENUM
	NOT NULL — values: per_person, per_night, per_group, per_item, per_hour

	max_guests
	INTEGER
	NULLABLE
	For tours and activities

	min_guests
	INTEGER
	NOT NULL, default 1

	duration_hours
	DECIMAL(6,2)
	NULLABLE
	Duration for tours and activities

	includes
	TEXT[]
	NOT NULL, default '{}'
	What is included: breakfast, transport, guide fee etc.

	photos
	TEXT[]
	NOT NULL, default '{}'

	available_from
	DATE
	NULLABLE

	available_to
	DATE
	NULLABLE

	is_active
	BOOLEAN
	NOT NULL, default true

	total_bookings
	INTEGER
	NOT NULL, default 0

	average_rating
	DECIMAL(3,2)
	NOT NULL, default 0.00



rooms (for hotel and guesthouse operators)
	Field
	Type
	Constraints
	Description

	id
	UUID
	PK

	operator_id
	UUID
	FK → operators.id, NOT NULL

	listing_id
	UUID
	FK → listings.id, NOT NULL

	room_number
	VARCHAR(20)
	NOT NULL

	room_type
	ENUM
	NOT NULL — values: single, double, twin, suite, dormitory, bungalow

	capacity
	INTEGER
	NOT NULL

	price_per_night_fcfa
	DECIMAL(10,2)
	NOT NULL

	amenities
	TEXT[]
	NOT NULL, default '{}'

	photos
	TEXT[]
	NOT NULL, default '{}'

	is_available
	BOOLEAN
	NOT NULL, default true



availability (calendar slots for listings and rooms)
	Field
	Type
	Constraints
	Description

	id
	UUID
	PK

	operator_id
	UUID
	FK → operators.id, NOT NULL

	listing_id
	UUID
	FK → listings.id, NULLABLE

	room_id
	UUID
	FK → rooms.id, NULLABLE

	date
	DATE
	NOT NULL

	slots_total
	INTEGER
	NOT NULL
	Total capacity for this date (rooms or person-slots)

	slots_booked
	INTEGER
	NOT NULL, default 0

	slots_available
	INTEGER
	GENERATED ALWAYS AS (slots_total - slots_booked)

	is_blocked
	BOOLEAN
	NOT NULL, default false
	Operator can block dates manually

	block_reason
	TEXT
	NULLABLE



bookings
	Field
	Type
	Constraints
	Description

	id
	UUID
	PK

	booking_reference
	VARCHAR(20)
	UNIQUE, NOT NULL
	Format: TCK-YYYYMMDD-XXXXXX

	visitor_user_id
	UUID
	FK → users.id, NOT NULL

	operator_id
	UUID
	FK → operators.id, NOT NULL

	listing_id
	UUID
	FK → listings.id, NOT NULL

	room_id
	UUID
	NULLABLE, FK → rooms.id
	Set for hotel/room bookings

	service_date
	DATE
	NOT NULL
	Start date for hotels, date for tours/activities

	service_end_date
	DATE
	NULLABLE
	Checkout date for hotels

	num_guests
	INTEGER
	NOT NULL, default 1

	total_price_fcfa
	DECIMAL(12,2)
	NOT NULL

	currency_paid
	VARCHAR(10)
	NOT NULL, default FCFA
	Currency visitor paid in

	exchange_rate_at_payment
	DECIMAL(12,6)
	NULLABLE
	Exchange rate applied if non-FCFA payment

	payment_method
	ENUM
	NOT NULL — values: mtn_momo, orange_money, stripe_card, core_banking, wallet

	payment_status
	ENUM
	NOT NULL, default pending — values: pending, paid, refunded, partially_refunded, failed

	booking_status
	ENUM
	NOT NULL, default pending_confirmation — values: pending_confirmation, confirmed, completed, cancelled, disputed, no_show

	platform_commission_fcfa
	DECIMAL(10,2)
	NOT NULL

	operator_payout_fcfa
	DECIMAL(10,2)
	NOT NULL

	payout_released
	BOOLEAN
	NOT NULL, default false

	payout_released_at
	TIMESTAMPTZ
	NULLABLE

	visitor_notes
	TEXT
	NULLABLE

	operator_response
	TEXT
	NULLABLE

	is_diaspora_booking
	BOOLEAN
	NOT NULL, default false

	visitor_country
	VARCHAR(100)
	NULLABLE
	Country of origin of visitor

	confirmed_at
	TIMESTAMPTZ
	NULLABLE

	completed_at
	TIMESTAMPTZ
	NULLABLE

	cancelled_at
	TIMESTAMPTZ
	NULLABLE

	cancellation_reason
	TEXT
	NULLABLE

	refund_amount_fcfa
	DECIMAL(10,2)
	NULLABLE



reviews
	Field
	Type
	Constraints
	Description

	id
	UUID
	PK

	booking_id
	UUID
	FK → bookings.id, UNIQUE, NOT NULL
	One review per booking

	visitor_user_id
	UUID
	FK → users.id, NOT NULL

	operator_id
	UUID
	FK → operators.id, NOT NULL

	listing_id
	UUID
	FK → listings.id, NOT NULL

	overall_rating
	INTEGER
	NOT NULL — values: 1,2,3,4,5

	cleanliness_rating
	INTEGER
	NULLABLE — values: 1,2,3,4,5
	For accommodation

	value_rating
	INTEGER
	NULLABLE

	guide_quality_rating
	INTEGER
	NULLABLE
	For tour guides

	comment_fr
	TEXT
	NULLABLE

	comment_en
	TEXT
	NULLABLE

	photos
	TEXT[]
	NULLABLE, default '{}'

	operator_reply
	TEXT
	NULLABLE

	operator_replied_at
	TIMESTAMPTZ
	NULLABLE

	is_visible
	BOOLEAN
	NOT NULL, default true
	Admin can hide inappropriate reviews

	reviewed_at
	TIMESTAMPTZ
	NOT NULL



events
	Field
	Type
	Constraints
	Description

	id
	UUID
	PK

	operator_id
	UUID
	FK → operators.id, NOT NULL

	title_fr
	VARCHAR(255)
	NOT NULL

	title_en
	VARCHAR(255)
	NULLABLE

	description_fr
	TEXT
	NOT NULL

	description_en
	TEXT
	NULLABLE

	event_type
	ENUM
	NOT NULL — values: cultural_festival, craft_market, food_festival, music_event, sport_tourism, heritage_tour, religious_festival, other

	city
	VARCHAR(100)
	NOT NULL

	venue_name
	TEXT
	NOT NULL

	lat
	DECIMAL(10,8)
	NOT NULL

	lng
	DECIMAL(11,8)
	NOT NULL

	start_date
	TIMESTAMPTZ
	NOT NULL

	end_date
	TIMESTAMPTZ
	NOT NULL

	banner_url
	TEXT
	NULLABLE

	photos
	TEXT[]
	NULLABLE

	status
	ENUM
	NOT NULL, default draft — values: draft, published, ongoing, completed, cancelled

	is_diaspora_featured
	BOOLEAN
	NOT NULL, default false
	Featured on Diaspora Gateway

	is_free
	BOOLEAN
	NOT NULL, default false



event_tickets
	Field
	Type
	Constraints
	Description

	id
	UUID
	PK

	event_id
	UUID
	FK → events.id, NOT NULL

	ticket_type
	VARCHAR(100)
	NOT NULL
	e.g. General Admission, VIP, Student

	price_fcfa
	DECIMAL(10,2)
	NOT NULL, default 0.00
	0 for free events

	quantity_total
	INTEGER
	NOT NULL
