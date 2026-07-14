/**
 * PR A géo — Référentiel STATIQUE des pays (ISO 3166-1 alpha-2) en français.
 *
 * Source de vérité versionnée dans le dépôt : aucun appel réseau au runtime,
 * aucune dépendance npm. Les libellés sont les noms usuels FRANÇAIS — ce sont
 * eux qui sont stockés dans `profiles.country` (colonne texte inchangée, comme
 * les valeurs Production existantes : « Cameroun », « Côte d’Ivoire »,
 * « Allemagne », « Gabon », « Belgique »). Le code ISO ne sert qu'à relier un
 * pays à sa liste de villes (cities-fr.ts) — il n'est jamais persisté.
 *
 * `normalizeGeo` sert UNIQUEMENT à la correspondance côté interface
 * (recherche, rapprochement des anciennes valeurs) : aucune donnée existante
 * n'est réécrite.
 */

export type Country = {
  /** Code ISO 3166-1 alpha-2 (jamais stocké en base). */
  code: string;
  /** Nom usuel français — la valeur réellement stockée dans profiles.country. */
  name: string;
};

/**
 * Normalisation de rapprochement : minuscules, diacritiques supprimés,
 * apostrophes typographiques et tirets harmonisés, espaces réduits.
 * « Côte d’Ivoire » ≡ « cote d'ivoire » ≡ « COTE D IVOIRE ».
 */
export function normalizeGeo(value: string): string {
  return value
    .normalize("NFD")
    // Diacritiques combinants (U+0300..U+036F) issus de la décomposition NFD.
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[’‘ʼ]/g, "'")
    .replace(/[-–—_]/g, " ")
    .replace(/'/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Les 249 pays et territoires ISO 3166-1 alpha-2 officiellement assignés. */
const COUNTRIES: Country[] = [
  { code: "AF", name: "Afghanistan" },
  { code: "ZA", name: "Afrique du Sud" },
  { code: "AL", name: "Albanie" },
  { code: "DZ", name: "Algérie" },
  { code: "DE", name: "Allemagne" },
  { code: "AD", name: "Andorre" },
  { code: "AO", name: "Angola" },
  { code: "AI", name: "Anguilla" },
  { code: "AQ", name: "Antarctique" },
  { code: "AG", name: "Antigua-et-Barbuda" },
  { code: "SA", name: "Arabie saoudite" },
  { code: "AR", name: "Argentine" },
  { code: "AM", name: "Arménie" },
  { code: "AW", name: "Aruba" },
  { code: "AU", name: "Australie" },
  { code: "AT", name: "Autriche" },
  { code: "AZ", name: "Azerbaïdjan" },
  { code: "BS", name: "Bahamas" },
  { code: "BH", name: "Bahreïn" },
  { code: "BD", name: "Bangladesh" },
  { code: "BB", name: "Barbade" },
  { code: "BE", name: "Belgique" },
  { code: "BZ", name: "Belize" },
  { code: "BJ", name: "Bénin" },
  { code: "BM", name: "Bermudes" },
  { code: "BT", name: "Bhoutan" },
  { code: "BY", name: "Biélorussie" },
  { code: "BO", name: "Bolivie" },
  { code: "BQ", name: "Bonaire, Saint-Eustache et Saba" },
  { code: "BA", name: "Bosnie-Herzégovine" },
  { code: "BW", name: "Botswana" },
  { code: "BR", name: "Brésil" },
  { code: "BN", name: "Brunei" },
  { code: "BG", name: "Bulgarie" },
  { code: "BF", name: "Burkina Faso" },
  { code: "BI", name: "Burundi" },
  { code: "KH", name: "Cambodge" },
  { code: "CM", name: "Cameroun" },
  { code: "CA", name: "Canada" },
  { code: "CV", name: "Cap-Vert" },
  { code: "CL", name: "Chili" },
  { code: "CN", name: "Chine" },
  { code: "CY", name: "Chypre" },
  { code: "CO", name: "Colombie" },
  { code: "KM", name: "Comores" },
  { code: "CG", name: "Congo" },
  { code: "KP", name: "Corée du Nord" },
  { code: "KR", name: "Corée du Sud" },
  { code: "CR", name: "Costa Rica" },
  { code: "CI", name: "Côte d’Ivoire" },
  { code: "HR", name: "Croatie" },
  { code: "CU", name: "Cuba" },
  { code: "CW", name: "Curaçao" },
  { code: "DK", name: "Danemark" },
  { code: "DJ", name: "Djibouti" },
  { code: "DM", name: "Dominique" },
  { code: "EG", name: "Égypte" },
  { code: "AE", name: "Émirats arabes unis" },
  { code: "EC", name: "Équateur" },
  { code: "ER", name: "Érythrée" },
  { code: "ES", name: "Espagne" },
  { code: "EE", name: "Estonie" },
  { code: "SZ", name: "Eswatini" },
  { code: "US", name: "États-Unis" },
  { code: "ET", name: "Éthiopie" },
  { code: "FJ", name: "Fidji" },
  { code: "FI", name: "Finlande" },
  { code: "FR", name: "France" },
  { code: "GA", name: "Gabon" },
  { code: "GM", name: "Gambie" },
  { code: "GE", name: "Géorgie" },
  { code: "GS", name: "Géorgie du Sud-et-les îles Sandwich du Sud" },
  { code: "GH", name: "Ghana" },
  { code: "GI", name: "Gibraltar" },
  { code: "GR", name: "Grèce" },
  { code: "GD", name: "Grenade" },
  { code: "GL", name: "Groenland" },
  { code: "GP", name: "Guadeloupe" },
  { code: "GU", name: "Guam" },
  { code: "GT", name: "Guatemala" },
  { code: "GG", name: "Guernesey" },
  { code: "GN", name: "Guinée" },
  { code: "GQ", name: "Guinée équatoriale" },
  { code: "GW", name: "Guinée-Bissau" },
  { code: "GY", name: "Guyana" },
  { code: "GF", name: "Guyane française" },
  { code: "HT", name: "Haïti" },
  { code: "HN", name: "Honduras" },
  { code: "HK", name: "Hong Kong" },
  { code: "HU", name: "Hongrie" },
  { code: "BV", name: "Île Bouvet" },
  { code: "CX", name: "Île Christmas" },
  { code: "IM", name: "Île de Man" },
  { code: "NF", name: "Île Norfolk" },
  { code: "AX", name: "Îles Åland" },
  { code: "KY", name: "Îles Caïmans" },
  { code: "CC", name: "Îles Cocos" },
  { code: "CK", name: "Îles Cook" },
  { code: "FO", name: "Îles Féroé" },
  { code: "HM", name: "Îles Heard-et-MacDonald" },
  { code: "FK", name: "Îles Malouines" },
  { code: "MP", name: "Îles Mariannes du Nord" },
  { code: "MH", name: "Îles Marshall" },
  { code: "UM", name: "Îles mineures éloignées des États-Unis" },
  { code: "PN", name: "Îles Pitcairn" },
  { code: "SB", name: "Îles Salomon" },
  { code: "TC", name: "Îles Turques-et-Caïques" },
  { code: "VG", name: "Îles Vierges britanniques" },
  { code: "VI", name: "Îles Vierges des États-Unis" },
  { code: "IN", name: "Inde" },
  { code: "ID", name: "Indonésie" },
  { code: "IQ", name: "Irak" },
  { code: "IR", name: "Iran" },
  { code: "IE", name: "Irlande" },
  { code: "IS", name: "Islande" },
  { code: "IL", name: "Israël" },
  { code: "IT", name: "Italie" },
  { code: "JM", name: "Jamaïque" },
  { code: "JP", name: "Japon" },
  { code: "JE", name: "Jersey" },
  { code: "JO", name: "Jordanie" },
  { code: "KZ", name: "Kazakhstan" },
  { code: "KE", name: "Kenya" },
  { code: "KG", name: "Kirghizistan" },
  { code: "KI", name: "Kiribati" },
  { code: "KW", name: "Koweït" },
  { code: "RE", name: "La Réunion" },
  { code: "LA", name: "Laos" },
  { code: "LS", name: "Lesotho" },
  { code: "LV", name: "Lettonie" },
  { code: "LB", name: "Liban" },
  { code: "LR", name: "Liberia" },
  { code: "LY", name: "Libye" },
  { code: "LI", name: "Liechtenstein" },
  { code: "LT", name: "Lituanie" },
  { code: "LU", name: "Luxembourg" },
  { code: "MO", name: "Macao" },
  { code: "MK", name: "Macédoine du Nord" },
  { code: "MG", name: "Madagascar" },
  { code: "MY", name: "Malaisie" },
  { code: "MW", name: "Malawi" },
  { code: "MV", name: "Maldives" },
  { code: "ML", name: "Mali" },
  { code: "MT", name: "Malte" },
  { code: "MA", name: "Maroc" },
  { code: "MQ", name: "Martinique" },
  { code: "MU", name: "Maurice" },
  { code: "MR", name: "Mauritanie" },
  { code: "YT", name: "Mayotte" },
  { code: "MX", name: "Mexique" },
  { code: "FM", name: "Micronésie" },
  { code: "MD", name: "Moldavie" },
  { code: "MC", name: "Monaco" },
  { code: "MN", name: "Mongolie" },
  { code: "ME", name: "Monténégro" },
  { code: "MS", name: "Montserrat" },
  { code: "MZ", name: "Mozambique" },
  { code: "MM", name: "Myanmar" },
  { code: "NA", name: "Namibie" },
  { code: "NR", name: "Nauru" },
  { code: "NP", name: "Népal" },
  { code: "NI", name: "Nicaragua" },
  { code: "NE", name: "Niger" },
  { code: "NG", name: "Nigeria" },
  { code: "NU", name: "Niue" },
  { code: "NO", name: "Norvège" },
  { code: "NC", name: "Nouvelle-Calédonie" },
  { code: "NZ", name: "Nouvelle-Zélande" },
  { code: "OM", name: "Oman" },
  { code: "UG", name: "Ouganda" },
  { code: "UZ", name: "Ouzbékistan" },
  { code: "PK", name: "Pakistan" },
  { code: "PW", name: "Palaos" },
  { code: "PS", name: "Palestine" },
  { code: "PA", name: "Panama" },
  { code: "PG", name: "Papouasie-Nouvelle-Guinée" },
  { code: "PY", name: "Paraguay" },
  { code: "NL", name: "Pays-Bas" },
  { code: "PE", name: "Pérou" },
  { code: "PH", name: "Philippines" },
  { code: "PL", name: "Pologne" },
  { code: "PF", name: "Polynésie française" },
  { code: "PR", name: "Porto Rico" },
  { code: "PT", name: "Portugal" },
  { code: "QA", name: "Qatar" },
  { code: "CF", name: "République centrafricaine" },
  { code: "CD", name: "République démocratique du Congo" },
  { code: "DO", name: "République dominicaine" },
  { code: "RO", name: "Roumanie" },
  { code: "GB", name: "Royaume-Uni" },
  { code: "RU", name: "Russie" },
  { code: "RW", name: "Rwanda" },
  { code: "EH", name: "Sahara occidental" },
  { code: "BL", name: "Saint-Barthélemy" },
  { code: "KN", name: "Saint-Christophe-et-Niévès" },
  { code: "SM", name: "Saint-Marin" },
  { code: "MF", name: "Saint-Martin" },
  { code: "SX", name: "Saint-Martin (partie néerlandaise)" },
  { code: "PM", name: "Saint-Pierre-et-Miquelon" },
  { code: "VC", name: "Saint-Vincent-et-les-Grenadines" },
  { code: "SH", name: "Sainte-Hélène, Ascension et Tristan da Cunha" },
  { code: "LC", name: "Sainte-Lucie" },
  { code: "SV", name: "Salvador" },
  { code: "WS", name: "Samoa" },
  { code: "AS", name: "Samoa américaines" },
  { code: "ST", name: "Sao Tomé-et-Principe" },
  { code: "SN", name: "Sénégal" },
  { code: "RS", name: "Serbie" },
  { code: "SC", name: "Seychelles" },
  { code: "SL", name: "Sierra Leone" },
  { code: "SG", name: "Singapour" },
  { code: "SK", name: "Slovaquie" },
  { code: "SI", name: "Slovénie" },
  { code: "SO", name: "Somalie" },
  { code: "SD", name: "Soudan" },
  { code: "SS", name: "Soudan du Sud" },
  { code: "LK", name: "Sri Lanka" },
  { code: "SE", name: "Suède" },
  { code: "CH", name: "Suisse" },
  { code: "SR", name: "Suriname" },
  { code: "SJ", name: "Svalbard et Jan Mayen" },
  { code: "SY", name: "Syrie" },
  { code: "TJ", name: "Tadjikistan" },
  { code: "TW", name: "Taïwan" },
  { code: "TZ", name: "Tanzanie" },
  { code: "TD", name: "Tchad" },
  { code: "CZ", name: "Tchéquie" },
  { code: "TF", name: "Terres australes françaises" },
  { code: "IO", name: "Territoire britannique de l’océan Indien" },
  { code: "TH", name: "Thaïlande" },
  { code: "TL", name: "Timor oriental" },
  { code: "TG", name: "Togo" },
  { code: "TK", name: "Tokelau" },
  { code: "TO", name: "Tonga" },
  { code: "TT", name: "Trinité-et-Tobago" },
  { code: "TN", name: "Tunisie" },
  { code: "TM", name: "Turkménistan" },
  { code: "TR", name: "Turquie" },
  { code: "TV", name: "Tuvalu" },
  { code: "UA", name: "Ukraine" },
  { code: "UY", name: "Uruguay" },
  { code: "VU", name: "Vanuatu" },
  { code: "VA", name: "Vatican" },
  { code: "VE", name: "Venezuela" },
  { code: "VN", name: "Viêt Nam" },
  { code: "WF", name: "Wallis-et-Futuna" },
  { code: "YE", name: "Yémen" },
  { code: "ZM", name: "Zambie" },
  { code: "ZW", name: "Zimbabwe" },
];

/** Collation française : ordre alphabétique correct (É ≡ E, œ, etc.). */
const collator = new Intl.Collator("fr", { sensitivity: "base" });

/** Liste officielle exportée, TRIÉE en ordre alphabétique français. */
export const COUNTRIES_FR: readonly Country[] = [...COUNTRIES].sort((a, b) =>
  collator.compare(a.name, b.name),
);

/** Index de rapprochement : nom normalisé → pays. */
const byNormalizedName = new Map<string, Country>(
  COUNTRIES.map((c) => [normalizeGeo(c.name), c]),
);

/**
 * Retrouve un pays à partir d'un libellé stocké (ancien ou nouveau), après
 * normalisation. `null` si aucun pays connu ne correspond — l'appelant doit
 * alors CONSERVER la valeur telle quelle (jamais d'effacement).
 */
export function findCountryByName(name: string | null | undefined): Country | null {
  if (!name) return null;
  return byNormalizedName.get(normalizeGeo(name)) ?? null;
}

/**
 * Filtre les pays par requête insensible à la casse et aux accents
 * (« cote » trouve « Côte d’Ivoire »). Requête vide → liste complète.
 */
export function filterCountries(query: string): readonly Country[] {
  const q = normalizeGeo(query);
  if (!q) return COUNTRIES_FR;
  return COUNTRIES_FR.filter((c) => normalizeGeo(c.name).includes(q));
}

/**
 * Rapproche une ville stockée d'une liste de villes connues (normalisation
 * identique). Renvoie le libellé CANONIQUE si trouvé, sinon `null` (l'appelant
 * bascule alors en « Autre ville » en conservant la valeur).
 */
export function matchCityInList(
  city: string | null | undefined,
  cities: readonly string[],
): string | null {
  if (!city) return null;
  const target = normalizeGeo(city);
  if (!target) return null;
  return cities.find((c) => normalizeGeo(c) === target) ?? null;
}
