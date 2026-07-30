# Graph Report - .  (2026-07-30)

## Corpus Check
- 294 files · ~277,213 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1537 nodes · 2839 edges · 148 communities (118 shown, 30 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 51 edges (avg confidence: 0.83)
- Token cost: 827,132 input · 0 output

## Community Hubs (Navigation)
- Brand & PWA Icons
- Admin Audit Journal
- Admin Promotion UI
- Vitrine publique candidats
- Admin Analytics Dashboard
- Onboarding Wizard Components
- Member Share Link Actions
- SebPay Payment Foundation
- Auth Pages
- Admin Safety Reports
- Admin Member Actions
- Gouvernance projet (CLAUDE.md)
- Landing Page
- TypeScript Config
- Admin Members List
- Admin Verification Actions
- Analytics Collect Endpoint
- Messaging & Matches UI
- Discovery Feed
- Member Dashboard
- Profile Visibility Widget
- Database Types
- Geo Country-City Fields
- Onboarding Steps
- Runtime Dependencies
- Dev Dependencies
- Admin Home & Layouts
- Promo Public Page
- Shared Profile Page /p
- Discover Criteria Page
- Premium Page
- Admin Verification Page
- Member Profile Page
- Promotion Consent Card
- Candidate Showcase Backend
- Messaging Safety Backend
- Analytics SQL Backend
- npm Scripts
- Premium Placeholder Pages
- Discover Universe Pages
- Matches View Components
- Identity Correction
- Core Mariage Schema
- Icon Generation Script
- Social OG Images
- Admin Audit Log SQL
- Identity Fields Guard SQL
- Promotion Share Links SQL
- Maskable Icon Source
- Account Moderation Backend
- Onboarding Completion SQL
- Profile Share Links SQL
- Premium Source of Truth
- Safety Report Actions SQL
- Acquisition Source SQL
- Premium Audit & RLS
- Notifications & Messaging Docs
- Package Metadata
- Apple Touch Icon
- Maskable Icon 192
- QR Acquisition Small
- Hero Couple Image
- Verification Status SQL
- Share Consents SQL
- Religion Field SQL
- App Icon 192
- App Icon 512
- Maskable Icon 512
- QR Inscription PNG
- QR Inscription SVG
- Vercel Logo Asset
- Partager Layout
- Extended Matrimonial Fields
- Origin City SQL
- Event Acquisition Source
- ESLint Config
- ESLint Next Preset
- Next Config
- React Types
- PostCSS Config
- File Icon Boilerplate
- Globe Icon Boilerplate
- Next.js Logo
- Window Icon Boilerplate
- Member Notifications Table
- Onboarding Fields Migration
- Discovery Universe Migration
- Photos Storage Migration
- Premium Catalog
- Premium Subscriptions
- Vercel Cron Config
- OG Image Meta
- OG Image Meta 2
- OG Image Meta 3
- Twitter Image Meta
- Twitter Image Meta 2
- Twitter Image Meta 3

## God Nodes (most connected - your core abstractions)
1. `createAdminClient()` - 47 edges
2. `cn()` - 37 edges
3. `createClient()` - 30 edges
4. `isUuid()` - 23 edges
5. `createClient()` - 23 edges
6. `resolveAdminActor()` - 22 edges
7. `requireAdmin()` - 21 edges
8. `Logo()` - 18 edges
9. `compilerOptions` - 16 edges
10. `Label()` - 14 edges

## Surprising Connections (you probably didn't know these)
- `Logo()` --conceptually_related_to--> `KASSALAFAM Brand Identity`  [INFERRED]
  src/components/landing/logo.tsx → public/brand/icon-source.svg
- `Next.js` --semantically_similar_to--> `Next.js App Router`  [INFERRED] [semantically similar]
  README.md → CLAUDE.md
- `Vercel Platform` --semantically_similar_to--> `Vercel deployment`  [INFERRED] [semantically similar]
  README.md → CLAUDE.md
- `KASSALAFAM PWA Icon Source SVG` --references--> `Logo()`  [EXTRACTED]
  public/brand/icon-source.svg → src/components/landing/logo.tsx
- `Liens promotionnels administrateur (backend Draft)` --implements--> `Partage de profils (consentement, révocation)`  [INFERRED]
  docs/sharing/admin-profile-promotion-links.md → CLAUDE.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Admin promotion share link lifecycle (RPCs + consent + eligibility)** — docs_sharing_admin_profile_promotion_links_create_profile_promotion_share_link, docs_sharing_admin_profile_promotion_links_revoke_profile_promotion_share_link, docs_sharing_admin_profile_promotion_links_resolve_profile_promotion_share_link, docs_sharing_admin_profile_promotion_links_admin_list_profile_promotion_share_links, docs_sharing_admin_profile_promotion_links_admin_get_profile_promotion_share_status, docs_sharing_admin_profile_promotion_links_profile_promotion_share_eligibility_reason, docs_sharing_admin_profile_promotion_links_profile_promotion_consents [EXTRACTED 1.00]
- **SebPay locked secure foundation** — docs_payments_sebpay_foundation_sebpay, docs_payments_sebpay_foundation_sebpay_payments_enabled, docs_payments_sebpay_foundation_api_origin_allowlist, docs_payments_sebpay_foundation_security_invariants [EXTRACTED 1.00]
- **KASSALAFAM technical stack** — claude_kassalafam, claude_nextjs, claude_supabase, claude_vercel [EXTRACTED 1.00]

## Communities (148 total, 30 thin omitted)

### Community 0 - "Brand & PWA Icons"
Cohesion: 0.05
Nodes (46): Choco / Champagne Gold Brand Palette, KASSALAFAM Brand Identity, Playfair Display Font, KASSALAFAM PWA Icon Source SVG, generate-icons.mjs PNG Renderer Script, AccountSuspendedPage(), metadata, AdminLayout() (+38 more)

### Community 1 - "Admin Audit Journal"
Cohesion: 0.06
Nodes (52): AdminAuditPage(), DATE_FMT, flatten(), fmt(), metadata, SOURCE_META, AdminMemberDetailPage(), DATE_FMT (+44 more)

### Community 2 - "Admin Promotion UI"
Cohesion: 0.08
Nodes (40): clientComponents, NOW, createPromotionLinkAction(), CreatePromotionLinkState, revokePromotionLinkAction(), RevokePromotionLinkState, ALLOWED_PHOTO_MIME_TYPES, HistoryRow() (+32 more)

### Community 3 - "Vitrine publique candidats"
Cohesion: 0.09
Nodes (42): CandidatesPage(), LEGAL_LINKS, metadata, CandidatePage(), CandidatePageProps, generateMetadata(), LEGAL_LINKS, BASE_HEADERS (+34 more)

### Community 4 - "Admin Analytics Dashboard"
Cohesion: 0.07
Nodes (46): AdminAnalyticsPage(), DECLARED_SOURCE_LABELS, fmtRate(), metadata, PERIOD_LABEL, PERIOD_TO_DAYS, BarList(), fmt() (+38 more)

### Community 5 - "Onboarding Wizard Components"
Cohesion: 0.10
Nodes (35): ChoiceCard(), MultiChoiceChips(), toggle(), OnboardingConfirmation(), OnboardingIntro(), OnboardingNavigation(), OnboardingWizard(), Phase (+27 more)

### Community 6 - "Member Share Link Actions"
Cohesion: 0.08
Nodes (32): authenticatedClient(), createMyProfileShareLinkAction(), DURATION_MS, ERROR_MESSAGES, expiresAt(), getMyProfileShareLinkAction(), isUuid(), mapError() (+24 more)

### Community 7 - "SebPay Payment Foundation"
Cohesion: 0.07
Nodes (25): cancelResponseBodySilently(), CONFIRMED_SEBPAY_API_ORIGINS, EnvironmentSource, FORBIDDEN_REQUEST_HEADERS, GuardedJsonTransport, GuardedJsonTransportOptions, GuardedJsonTransportRequest, InternalPaymentStatus (+17 more)

### Community 8 - "Auth Pages"
Cohesion: 0.14
Nodes (26): ForgotPasswordPage(), isValidEmail(), LoginForm(), Phase, ResetPasswordPage(), AuthShell(), AuthShellProps, NAV_LINKS (+18 more)

### Community 9 - "Admin Safety Reports"
Cohesion: 0.10
Nodes (32): transitionSafetyReportAction(), AdminReportsPage(), metadata, SafetyReportActions(), TONE_ACCENT, DATE_FMT, SafetyReportHistory(), statusLabel() (+24 more)

### Community 10 - "Admin Member Actions"
Cohesion: 0.13
Nodes (32): setAccountStatusAction(), GET(), mapAccountError(), isUuid(), resolveAdminActor(), CHANNELS, createProfilePromotionShareLink(), CreateProfilePromotionShareLinkResult (+24 more)

### Community 11 - "Gouvernance projet (CLAUDE.md)"
Cohesion: 0.07
Nodes (36): Principes de sécurité des données, Workflow Git (branche dédiée, PR merge commit, autorisation explicite), KASSALAFAM — Mariage à tout prix, Next.js App Router, Liens opaques sécurisés et révocables, pgTAP PostgreSQL tests, Paiements et formule Premium (priorité produit 4), Partage de profils (consentement, révocation) (+28 more)

### Community 12 - "Landing Page"
Cohesion: 0.11
Nodes (22): Home(), Cta(), Faq(), FAQ_ITEMS, Features, Footer(), FOOTER_COLUMNS, BADGES (+14 more)

### Community 13 - "TypeScript Config"
Cohesion: 0.07
Nodes (28): dom, dom.iterable, esnext, **/*.mts, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, node_modules (+20 more)

### Community 14 - "Admin Members List"
Cohesion: 0.15
Nodes (25): AdminMembersPage(), flatten(), metadata, MembersFilters(), ACCOUNT_FILTERS, asAccount(), asCompleteness(), asPhoto() (+17 more)

### Community 15 - "Admin Verification Actions"
Cohesion: 0.12
Nodes (21): applyVerification(), approveProfileAction(), createVerificationNotification(), pauseProfileAction(), rejectProfileAction(), revalidateVerificationPaths(), validateReason(), Accent (+13 more)

### Community 16 - "Analytics Collect Endpoint"
Cohesion: 0.14
Nodes (20): CollectBody, finalize(), lastSeenBySession, POST(), tooFrequent(), inter, metadata, playfair (+12 more)

### Community 17 - "Messaging & Matches UI"
Cohesion: 0.12
Nodes (14): ConversationPage(), MatchesFeed(), PRINCIPLES, ConversationView(), Relation, REPORT_REASONS, Toast, MatchesView() (+6 more)

### Community 18 - "Discovery Feed"
Cohesion: 0.13
Nodes (18): GET(), privateJson(), DiscoverFeed(), DiscoverFeedView(), InterestButton(), InterestState, MARITAL_LABEL, attachSignedPhotos() (+10 more)

### Community 19 - "Member Dashboard"
Cohesion: 0.12
Nodes (16): DAILY_ADVICES, DailyAdvice, DashboardGuidance(), getAdviceIndex(), SHORTCUTS, DashboardNextSteps(), Props, TRUST_COPY (+8 more)

### Community 20 - "Profile Visibility Widget"
Cohesion: 0.11
Nodes (16): DashboardProfileVisibility(), DashboardProfileVisibilityProps, getVisibilityPresentation(), VERIFICATION_LABEL, VisibilityPresentation, DashboardSelection(), GuardSelectionResponse, GuardSelectionStatus (+8 more)

### Community 21 - "Database Types"
Cohesion: 0.09
Nodes (22): AdminAuditActionType, AdminProfileShareLinkItem, GrantProfileShareConsentResult, MemberActivitySummaryRow, MemberNotificationInsert, PaymentTransactionRow, PaymentTransactionStatus, PremiumActionType (+14 more)

### Community 22 - "Geo Country-City Fields"
Cohesion: 0.19
Nodes (16): citiesOf(), PRIORITY_CODES, CountryCityFields(), SearchableCombobox(), CITIES_FR, getCitiesForCountry(), UNINHABITED_TERRITORIES, byNormalizedName (+8 more)

### Community 23 - "Onboarding Steps"
Cohesion: 0.16
Nodes (18): EMPTY_PROFILE, firstNameSuggestionFromMetadata(), OnboardingPage(), BirthDateStep(), computeProfileCompletionPercentage(), computeProfileCompletionSummary(), computeStepCompletion(), isAdultBirthDate() (+10 more)

### Community 24 - "Runtime Dependencies"
Cohesion: 0.10
Nodes (21): clsx, framer-motion, lucide-react, next, dependencies, clsx, framer-motion, lucide-react (+13 more)

### Community 25 - "Dev Dependencies"
Cohesion: 0.10
Nodes (21): eslint, @fontsource/playfair-display, devDependencies, eslint, @fontsource/playfair-display, png-to-ico, @resvg/resvg-js, tailwindcss (+13 more)

### Community 26 - "Admin Home & Layouts"
Cohesion: 0.18
Nodes (16): AdminCard, AdminHomePage(), CARDS, metadata, MemberLayout(), getAdminUserIds(), getSuperAdminUserIds(), AdminActorResult (+8 more)

### Community 27 - "Promo Public Page"
Cohesion: 0.16
Nodes (17): generateMetadata(), LEGAL_LINKS, metadataDescription(), PublicPromotionProfilePage(), BASE_HEADERS, emptyNotFound(), GET(), ALLOWED_PHOTO_MIME_TYPES (+9 more)

### Community 28 - "Shared Profile Page /p"
Cohesion: 0.18
Nodes (15): LEGAL_LINKS, metadata, SharedProfilePage(), BASE_HEADERS, emptyNotFound(), GET(), intentionLabel(), SharedProfileCard() (+7 more)

### Community 29 - "Discover Criteria Page"
Cohesion: 0.14
Nodes (11): PRINCIPLES, Criterion, DiscoverCriteria(), MARITAL_LABELS, State, buttonLabel(), DiscoverUniverses(), Universe (+3 more)

### Community 31 - "Premium Page"
Cohesion: 0.18
Nodes (12): PremiumPage(), BENEFITS, DURATIONS, FAQS, PremiumExperience(), PremiumExperienceProps, TRUST_ITEMS, buildHeadline() (+4 more)

### Community 32 - "Admin Verification Page"
Cohesion: 0.18
Nodes (13): AdminVerificationPage(), FilterKey, FILTERS, isFilterKey(), metadata, AdminStatusBadge(), CONFIG, AdminProfileRow (+5 more)

### Community 33 - "Member Profile Page"
Cohesion: 0.15
Nodes (11): ADULT_BIRTH_DATE_MAX, EMPTY_FORM, FormState, ALLOWED_TYPES, EXT, PhotoItem, ProfilePhotos(), ProfilePhotosState (+3 more)

### Community 34 - "Promotion Consent Card"
Cohesion: 0.16
Nodes (13): ActiveConsent, CHANNEL_LABELS, CHANNEL_OPTIONS, ConsentState, DATE_FORMAT, DURATION_OPTIONS, formatDate(), isDurationDays() (+5 more)

### Community 35 - "Candidate Showcase Backend"
Cohesion: 0.19
Nodes (8): public.candidate_showcase_consents, public.candidate_showcase_eligibility_reason(), public.candidate_showcase_events_no_mutation(), public.candidate_showcase_publication_events, public.candidate_showcase_publications, public.unpublish_my_candidate_showcase(), trg_candidate_showcase_events_no_mutation, trg_candidate_showcase_publications_updated_at

### Community 36 - "Messaging Safety Backend"
Cohesion: 0.21
Nodes (5): public.blocking_exists(), public.list_my_relationships(), public.profile_blocks, public.report_message(), public.safety_reports

### Community 37 - "Analytics SQL Backend"
Cohesion: 0.26
Nodes (7): public.admin_get_acquisition_breakdown(), public.admin_get_analytics_overview(), public.admin_get_member_activity(), public.analytics_events, public.analytics_record_event(), public.analytics_sessions, public.member_activity

### Community 38 - "npm Scripts"
Cohesion: 0.17
Nodes (12): scripts, build, dev, generate:icons, lint, start, test:admin-profile-promotion-ui, test:analytics (+4 more)

### Community 40 - "Discover Universe Pages"
Cohesion: 0.25
Nodes (3): DiscoverFeedSkeleton(), DiscoverUniversePage(), PRINCIPLES

### Community 41 - "Matches View Components"
Cohesion: 0.20
Nodes (8): intentionLabel(), MARITAL_LABEL, ProfileBody(), TabKey, Toast, RelationshipItemWithPhoto, RelationshipKind, RespondInterestResult

### Community 42 - "Identity Correction"
Cohesion: 0.47
Nodes (8): correctProfileIdentityAction(), adultCutoffIsoDate(), IdentityCorrectionActionState, isIdentityGender(), isIdentityUuid(), isValidIsoDate(), mapIdentityCorrectionError(), resolveSuperAdminActor()

### Community 43 - "Core Mariage Schema"
Cohesion: 0.38
Nodes (9): public.is_match_participant(), public.matches, public.messages, public.photos, public.profiles, public.set_updated_at(), trg_matches_updated_at, trg_photos_updated_at (+1 more)

### Community 44 - "Icon Generation Script"
Cohesion: 0.32
Nodes (7): FONT_WOFF2, main(), pngSize(), renderPng(), root, SOURCE_ICON, SOURCE_MASKABLE

### Community 45 - "Social OG Images"
Cohesion: 0.46
Nodes (5): OpenGraphImage(), TwitterImage(), createSocialImage(), PILLARS, SOCIAL_IMAGE_SIZE

### Community 46 - "Admin Audit Log SQL"
Cohesion: 0.36
Nodes (5): public.admin_audit_actors(), public.admin_audit_log, public.admin_audit_log_no_mutation(), public.admin_list_audit_events(), trg_admin_audit_log_append_only

### Community 47 - "Identity Fields Guard SQL"
Cohesion: 0.32
Nodes (5): kassalafam_private.profile_identity_correction_context, public.admin_audit_log, public.guard_profile_identity_fields(), public.profiles, trg_profiles_guard_identity_fields

### Community 48 - "Promotion Share Links SQL"
Cohesion: 0.36
Nodes (4): public.admin_get_profile_promotion_share_status(), public.admin_list_profile_promotion_share_links(), public.profile_promotion_share_links, public.resolve_profile_promotion_share_link()

### Community 49 - "Maskable Icon Source"
Cohesion: 0.33
Nodes (7): Chocolate Gold Palette, K Monogram, KASSALAFAM Brand, Maskable Icon, Playfair Display Font, PWA Manifest, Standard Icon

### Community 50 - "Account Moderation Backend"
Cohesion: 0.38
Nodes (4): public.account_moderation_actions, public.guard_profiles_admin_fields(), public.profiles, trg_profiles_guard_admin_fields

### Community 51 - "Onboarding Completion SQL"
Cohesion: 0.38
Nodes (4): public.complete_member_onboarding(), public.guard_profile_onboarding_completion(), public.profiles, trg_profiles_guard_onboarding_completion

### Community 52 - "Profile Share Links SQL"
Cohesion: 0.38
Nodes (3): public.admin_list_profile_share_links(), public.profile_share_links, public.resolve_profile_share_link()

### Community 54 - "Safety Report Actions SQL"
Cohesion: 0.53
Nodes (5): public.admin_transition_safety_report(), public.safety_report_actions, public.safety_report_actions_no_mutation(), public.safety_reports, trg_safety_report_actions_append_only

### Community 64 - "Acquisition Source SQL"
Cohesion: 0.60
Nodes (4): public.guard_profile_acquisition_fields(), public.profiles, public.record_acquisition_source(), trg_profiles_guard_acquisition_fields

### Community 65 - "Premium Audit & RLS"
Cohesion: 0.60
Nodes (4): public.payment_transactions, public.premium_plans, public.premium_subscription_actions, public.premium_subscriptions

### Community 71 - "Notifications & Messaging Docs"
Cohesion: 0.50
Nodes (4): member_notifications table (source de vérité), Messagerie entre matchs acceptés, Notifications Push (feuille de route), send_message functions

### Community 72 - "Package Metadata"
Cohesion: 0.50
Nodes (3): name, private, version

### Community 73 - "Apple Touch Icon"
Cohesion: 0.67
Nodes (4): Apple Touch Icon — K Monogram, Brown and Gold Visual Palette, KASSALAFAM Brand Identity, PWA / iOS Home Screen Icon Role

### Community 74 - "Maskable Icon 192"
Cohesion: 0.67
Nodes (4): KASSALAFAM Brand Identity, Gold K Monogram, Maskable Icon 192, PWA Manifest Icon Set

### Community 75 - "QR Acquisition Small"
Cohesion: 0.67
Nodes (4): KASSALAFAM Matrimonial Platform, Member Acquisition / Onboarding Funnel, KASSALAFAM Inscription QR Code (Small), KASSALAFAM Registration Page (kassalafam.com/register)

### Community 76 - "Hero Couple Image"
Cohesion: 0.67
Nodes (4): Kassalafam Hero Couple Image, Landing Page Hero Section, KASSALAFAM Marriage Brand Theme, Wedding Couple Subject (bride and groom, bouquet, veil)

### Community 77 - "Verification Status SQL"
Cohesion: 0.67
Nodes (3): public.guard_profile_verification(), public.profiles, trg_profiles_guard_verification

### Community 83 - "App Icon 192"
Cohesion: 0.67
Nodes (3): KASSALAFAM App Icon 192x192, KASSALAFAM Brand Identity, PWA Manifest Icons

### Community 84 - "App Icon 512"
Cohesion: 0.67
Nodes (3): App Icon 512 (Gold K on Brown Rounded Square), KASSALAFAM Brand Identity, PWA App Icon Purpose

### Community 85 - "Maskable Icon 512"
Cohesion: 0.67
Nodes (3): KASSALAFAM Brand Identity (Gold K Monogram on Brown), KASSALAFAM Maskable App Icon 512x512, PWA Manifest Icon Set

### Community 86 - "QR Inscription PNG"
Cohesion: 1.00
Nodes (3): KASSALAFAM Matrimonial Platform, KASSALAFAM Inscription QR Code, kassalafam.com/register Registration URL

### Community 87 - "QR Inscription SVG"
Cohesion: 0.67
Nodes (3): KASSALAFAM Platform, KASSALAFAM Inscription QR Code (SVG), KASSALAFAM Registration Page (kassalafam.com/register)

### Community 88 - "Vercel Logo Asset"
Cohesion: 0.67
Nodes (3): Next.js Framework Boilerplate Asset, Vercel Logo SVG, Vercel Logo (White Triangle)

## Knowledge Gaps
- **379 isolated node(s):** `eslintConfig`, `nextConfig`, `name`, `version`, `private` (+374 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **30 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `createAdminClient()` connect `Admin Member Actions` to `Admin Verification Page`, `Admin Audit Journal`, `Admin Promotion UI`, `Vitrine publique candidats`, `Admin Analytics Dashboard`, `Admin Safety Reports`, `Identity Correction`, `Admin Members List`, `Admin Verification Actions`, `Analytics Collect Endpoint`, `Discovery Feed`, `Promo Public Page`, `Shared Profile Page /p`?**
  _High betweenness centrality (0.031) - this node is a cross-community bridge._
- **Why does `cn()` connect `Auth Pages` to `Brand & PWA Icons`, `Member Profile Page`, `Admin Promotion UI`, `Onboarding Wizard Components`, `Member Share Link Actions`, `Landing Page`, `Geo Country-City Fields`?**
  _High betweenness centrality (0.019) - this node is a cross-community bridge._
- **Why does `Logo()` connect `Brand & PWA Icons` to `Vitrine publique candidats`, `Member Share Link Actions`, `Auth Pages`, `Landing Page`, `Promo Public Page`, `Shared Profile Page /p`?**
  _High betweenness centrality (0.018) - this node is a cross-community bridge._
- **What connects `eslintConfig`, `nextConfig`, `name` to the rest of the system?**
  _379 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Brand & PWA Icons` be split into smaller, more focused modules?**
  _Cohesion score 0.050724637681159424 - nodes in this community are weakly interconnected._
- **Should `Admin Audit Journal` be split into smaller, more focused modules?**
  _Cohesion score 0.0597567424643046 - nodes in this community are weakly interconnected._
- **Should `Admin Promotion UI` be split into smaller, more focused modules?**
  _Cohesion score 0.07764876632801161 - nodes in this community are weakly interconnected._