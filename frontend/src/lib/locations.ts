/**
 * Curated list of countries and timezones relevant for travel.
 * Each country has a default timezone and available timezones.
 */

export interface CountryOption {
  code: string;
  name: string;
  timezones: { value: string; label: string }[];
}

export const COUNTRIES: CountryOption[] = [
  {
    code: "HK",
    name: "Hong Kong",
    timezones: [{ value: "Asia/Hong_Kong", label: "Hong Kong (GMT+8)" }],
  },
  {
    code: "GB",
    name: "United Kingdom",
    timezones: [{ value: "Europe/London", label: "London (GMT/BST)" }],
  },
  {
    code: "US",
    name: "United States",
    timezones: [
      { value: "America/New_York", label: "Eastern (GMT-5)" },
      { value: "America/Chicago", label: "Central (GMT-6)" },
      { value: "America/Denver", label: "Mountain (GMT-7)" },
      { value: "America/Los_Angeles", label: "Pacific (GMT-8)" },
    ],
  },
  {
    code: "CN",
    name: "China",
    timezones: [{ value: "Asia/Shanghai", label: "China Standard (GMT+8)" }],
  },
  {
    code: "JP",
    name: "Japan",
    timezones: [{ value: "Asia/Tokyo", label: "Tokyo (GMT+9)" }],
  },
  {
    code: "KR",
    name: "South Korea",
    timezones: [{ value: "Asia/Seoul", label: "Seoul (GMT+9)" }],
  },
  {
    code: "TW",
    name: "Taiwan",
    timezones: [{ value: "Asia/Taipei", label: "Taipei (GMT+8)" }],
  },
  {
    code: "SG",
    name: "Singapore",
    timezones: [{ value: "Asia/Singapore", label: "Singapore (GMT+8)" }],
  },
  {
    code: "MY",
    name: "Malaysia",
    timezones: [{ value: "Asia/Kuala_Lumpur", label: "Kuala Lumpur (GMT+8)" }],
  },
  {
    code: "TH",
    name: "Thailand",
    timezones: [{ value: "Asia/Bangkok", label: "Bangkok (GMT+7)" }],
  },
  {
    code: "ID",
    name: "Indonesia",
    timezones: [{ value: "Asia/Jakarta", label: "Jakarta (GMT+7)" }],
  },
  {
    code: "PH",
    name: "Philippines",
    timezones: [{ value: "Asia/Manila", label: "Manila (GMT+8)" }],
  },
  {
    code: "IN",
    name: "India",
    timezones: [{ value: "Asia/Kolkata", label: "India (GMT+5:30)" }],
  },
  {
    code: "AE",
    name: "UAE",
    timezones: [{ value: "Asia/Dubai", label: "Dubai (GMT+4)" }],
  },
  {
    code: "FR",
    name: "France",
    timezones: [{ value: "Europe/Paris", label: "Paris (GMT+1/+2)" }],
  },
  {
    code: "DE",
    name: "Germany",
    timezones: [{ value: "Europe/Berlin", label: "Berlin (GMT+1/+2)" }],
  },
  {
    code: "IT",
    name: "Italy",
    timezones: [{ value: "Europe/Rome", label: "Rome (GMT+1/+2)" }],
  },
  {
    code: "ES",
    name: "Spain",
    timezones: [{ value: "Europe/Madrid", label: "Madrid (GMT+1/+2)" }],
  },
  {
    code: "NL",
    name: "Netherlands",
    timezones: [{ value: "Europe/Amsterdam", label: "Amsterdam (GMT+1/+2)" }],
  },
  {
    code: "CH",
    name: "Switzerland",
    timezones: [{ value: "Europe/Zurich", label: "Zurich (GMT+1/+2)" }],
  },
  {
    code: "PT",
    name: "Portugal",
    timezones: [{ value: "Europe/Lisbon", label: "Lisbon (GMT/+1)" }],
  },
  {
    code: "TR",
    name: "Turkey",
    timezones: [{ value: "Europe/Istanbul", label: "Istanbul (GMT+3)" }],
  },
  {
    code: "AU",
    name: "Australia",
    timezones: [
      { value: "Australia/Sydney", label: "Sydney (GMT+10/+11)" },
      { value: "Australia/Melbourne", label: "Melbourne (GMT+10/+11)" },
      { value: "Australia/Perth", label: "Perth (GMT+8)" },
    ],
  },
  {
    code: "NZ",
    name: "New Zealand",
    timezones: [{ value: "Pacific/Auckland", label: "Auckland (GMT+12/+13)" }],
  },
  {
    code: "CA",
    name: "Canada",
    timezones: [
      { value: "America/Toronto", label: "Toronto (GMT-5)" },
      { value: "America/Vancouver", label: "Vancouver (GMT-8)" },
    ],
  },
  {
    code: "BR",
    name: "Brazil",
    timezones: [{ value: "America/Sao_Paulo", label: "Sao Paulo (GMT-3)" }],
  },
  {
    code: "MX",
    name: "Mexico",
    timezones: [{ value: "America/Mexico_City", label: "Mexico City (GMT-6)" }],
  },
  {
    code: "ZA",
    name: "South Africa",
    timezones: [
      { value: "Africa/Johannesburg", label: "Johannesburg (GMT+2)" },
    ],
  },
  {
    code: "EG",
    name: "Egypt",
    timezones: [{ value: "Africa/Cairo", label: "Cairo (GMT+2)" }],
  },
  {
    code: "RU",
    name: "Russia",
    timezones: [{ value: "Europe/Moscow", label: "Moscow (GMT+3)" }],
  },
];

/**
 * Find a country by code.
 */
export function getCountryByCode(code: string): CountryOption | undefined {
  return COUNTRIES.find((c) => c.code === code);
}

/**
 * Get timezones for a country code.
 */
export function getTimezonesForCountry(
  code: string
): { value: string; label: string }[] {
  return getCountryByCode(code)?.timezones ?? [];
}
