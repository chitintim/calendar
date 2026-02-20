/**
 * VTIMEZONE definitions for common travel timezones.
 * Ported from supabase/functions/parse-booking/timezones.ts for client-side ICS generation.
 */

interface VTimezoneRule {
  standard: {
    dtstart: string;
    tzoffsetfrom: string;
    tzoffsetto: string;
    tzname: string;
    rrule?: string;
  };
  daylight?: {
    dtstart: string;
    tzoffsetfrom: string;
    tzoffsetto: string;
    tzname: string;
    rrule?: string;
  };
}

const TIMEZONE_DEFINITIONS: Record<string, VTimezoneRule> = {
  // === Asia ===
  "Asia/Hong_Kong": {
    standard: {
      dtstart: "19700101T000000",
      tzoffsetfrom: "+0800",
      tzoffsetto: "+0800",
      tzname: "HKT",
    },
  },
  "Asia/Shanghai": {
    standard: {
      dtstart: "19700101T000000",
      tzoffsetfrom: "+0800",
      tzoffsetto: "+0800",
      tzname: "CST",
    },
  },
  "Asia/Taipei": {
    standard: {
      dtstart: "19700101T000000",
      tzoffsetfrom: "+0800",
      tzoffsetto: "+0800",
      tzname: "CST",
    },
  },
  "Asia/Singapore": {
    standard: {
      dtstart: "19700101T000000",
      tzoffsetfrom: "+0800",
      tzoffsetto: "+0800",
      tzname: "SGT",
    },
  },
  "Asia/Tokyo": {
    standard: {
      dtstart: "19700101T000000",
      tzoffsetfrom: "+0900",
      tzoffsetto: "+0900",
      tzname: "JST",
    },
  },
  "Asia/Seoul": {
    standard: {
      dtstart: "19700101T000000",
      tzoffsetfrom: "+0900",
      tzoffsetto: "+0900",
      tzname: "KST",
    },
  },
  "Asia/Bangkok": {
    standard: {
      dtstart: "19700101T000000",
      tzoffsetfrom: "+0700",
      tzoffsetto: "+0700",
      tzname: "ICT",
    },
  },
  "Asia/Ho_Chi_Minh": {
    standard: {
      dtstart: "19700101T000000",
      tzoffsetfrom: "+0700",
      tzoffsetto: "+0700",
      tzname: "ICT",
    },
  },
  "Asia/Kolkata": {
    standard: {
      dtstart: "19700101T000000",
      tzoffsetfrom: "+0530",
      tzoffsetto: "+0530",
      tzname: "IST",
    },
  },
  "Asia/Dubai": {
    standard: {
      dtstart: "19700101T000000",
      tzoffsetfrom: "+0400",
      tzoffsetto: "+0400",
      tzname: "GST",
    },
  },
  "Asia/Kuala_Lumpur": {
    standard: {
      dtstart: "19700101T000000",
      tzoffsetfrom: "+0800",
      tzoffsetto: "+0800",
      tzname: "MYT",
    },
  },
  "Asia/Jakarta": {
    standard: {
      dtstart: "19700101T000000",
      tzoffsetfrom: "+0700",
      tzoffsetto: "+0700",
      tzname: "WIB",
    },
  },
  "Asia/Manila": {
    standard: {
      dtstart: "19700101T000000",
      tzoffsetfrom: "+0800",
      tzoffsetto: "+0800",
      tzname: "PHT",
    },
  },

  // === Europe ===
  "Europe/London": {
    standard: {
      dtstart: "19701025T020000",
      tzoffsetfrom: "+0100",
      tzoffsetto: "+0000",
      tzname: "GMT",
      rrule: "FREQ=YEARLY;BYDAY=-1SU;BYMONTH=10",
    },
    daylight: {
      dtstart: "19700329T010000",
      tzoffsetfrom: "+0000",
      tzoffsetto: "+0100",
      tzname: "BST",
      rrule: "FREQ=YEARLY;BYDAY=-1SU;BYMONTH=3",
    },
  },
  "Europe/Paris": {
    standard: {
      dtstart: "19701025T030000",
      tzoffsetfrom: "+0200",
      tzoffsetto: "+0100",
      tzname: "CET",
      rrule: "FREQ=YEARLY;BYDAY=-1SU;BYMONTH=10",
    },
    daylight: {
      dtstart: "19700329T020000",
      tzoffsetfrom: "+0100",
      tzoffsetto: "+0200",
      tzname: "CEST",
      rrule: "FREQ=YEARLY;BYDAY=-1SU;BYMONTH=3",
    },
  },
  "Europe/Berlin": {
    standard: {
      dtstart: "19701025T030000",
      tzoffsetfrom: "+0200",
      tzoffsetto: "+0100",
      tzname: "CET",
      rrule: "FREQ=YEARLY;BYDAY=-1SU;BYMONTH=10",
    },
    daylight: {
      dtstart: "19700329T020000",
      tzoffsetfrom: "+0100",
      tzoffsetto: "+0200",
      tzname: "CEST",
      rrule: "FREQ=YEARLY;BYDAY=-1SU;BYMONTH=3",
    },
  },
  "Europe/Istanbul": {
    standard: {
      dtstart: "19700101T000000",
      tzoffsetfrom: "+0300",
      tzoffsetto: "+0300",
      tzname: "TRT",
    },
  },

  // === Americas ===
  "America/New_York": {
    standard: {
      dtstart: "19701101T020000",
      tzoffsetfrom: "-0400",
      tzoffsetto: "-0500",
      tzname: "EST",
      rrule: "FREQ=YEARLY;BYDAY=1SU;BYMONTH=11",
    },
    daylight: {
      dtstart: "19700308T020000",
      tzoffsetfrom: "-0500",
      tzoffsetto: "-0400",
      tzname: "EDT",
      rrule: "FREQ=YEARLY;BYDAY=2SU;BYMONTH=3",
    },
  },
  "America/Chicago": {
    standard: {
      dtstart: "19701101T020000",
      tzoffsetfrom: "-0500",
      tzoffsetto: "-0600",
      tzname: "CST",
      rrule: "FREQ=YEARLY;BYDAY=1SU;BYMONTH=11",
    },
    daylight: {
      dtstart: "19700308T020000",
      tzoffsetfrom: "-0600",
      tzoffsetto: "-0500",
      tzname: "CDT",
      rrule: "FREQ=YEARLY;BYDAY=2SU;BYMONTH=3",
    },
  },
  "America/Los_Angeles": {
    standard: {
      dtstart: "19701101T020000",
      tzoffsetfrom: "-0700",
      tzoffsetto: "-0800",
      tzname: "PST",
      rrule: "FREQ=YEARLY;BYDAY=1SU;BYMONTH=11",
    },
    daylight: {
      dtstart: "19700308T020000",
      tzoffsetfrom: "-0800",
      tzoffsetto: "-0700",
      tzname: "PDT",
      rrule: "FREQ=YEARLY;BYDAY=2SU;BYMONTH=3",
    },
  },
  "America/Sao_Paulo": {
    standard: {
      dtstart: "19700101T000000",
      tzoffsetfrom: "-0300",
      tzoffsetto: "-0300",
      tzname: "BRT",
    },
  },

  // === Oceania ===
  "Australia/Sydney": {
    standard: {
      dtstart: "19700405T030000",
      tzoffsetfrom: "+1100",
      tzoffsetto: "+1000",
      tzname: "AEST",
      rrule: "FREQ=YEARLY;BYDAY=1SU;BYMONTH=4",
    },
    daylight: {
      dtstart: "19701004T020000",
      tzoffsetfrom: "+1000",
      tzoffsetto: "+1100",
      tzname: "AEDT",
      rrule: "FREQ=YEARLY;BYDAY=1SU;BYMONTH=10",
    },
  },
  "Pacific/Auckland": {
    standard: {
      dtstart: "19700405T030000",
      tzoffsetfrom: "+1300",
      tzoffsetto: "+1200",
      tzname: "NZST",
      rrule: "FREQ=YEARLY;BYDAY=1SU;BYMONTH=4",
    },
    daylight: {
      dtstart: "19700927T020000",
      tzoffsetfrom: "+1200",
      tzoffsetto: "+1300",
      tzname: "NZDT",
      rrule: "FREQ=YEARLY;BYDAY=-1SU;BYMONTH=9",
    },
  },

  // === Africa ===
  "Africa/Johannesburg": {
    standard: {
      dtstart: "19700101T000000",
      tzoffsetfrom: "+0200",
      tzoffsetto: "+0200",
      tzname: "SAST",
    },
  },

  // === UTC ===
  UTC: {
    standard: {
      dtstart: "19700101T000000",
      tzoffsetfrom: "+0000",
      tzoffsetto: "+0000",
      tzname: "UTC",
    },
  },
};

export function getVTimezone(tzid: string): string | null {
  const def = TIMEZONE_DEFINITIONS[tzid];
  if (!def) return null;

  let vtimezone = `BEGIN:VTIMEZONE\r\nTZID:${tzid}\r\n`;

  vtimezone += `BEGIN:STANDARD\r\n`;
  vtimezone += `DTSTART:${def.standard.dtstart}\r\n`;
  vtimezone += `TZOFFSETFROM:${def.standard.tzoffsetfrom}\r\n`;
  vtimezone += `TZOFFSETTO:${def.standard.tzoffsetto}\r\n`;
  vtimezone += `TZNAME:${def.standard.tzname}\r\n`;
  if (def.standard.rrule) {
    vtimezone += `RRULE:${def.standard.rrule}\r\n`;
  }
  vtimezone += `END:STANDARD\r\n`;

  if (def.daylight) {
    vtimezone += `BEGIN:DAYLIGHT\r\n`;
    vtimezone += `DTSTART:${def.daylight.dtstart}\r\n`;
    vtimezone += `TZOFFSETFROM:${def.daylight.tzoffsetfrom}\r\n`;
    vtimezone += `TZOFFSETTO:${def.daylight.tzoffsetto}\r\n`;
    vtimezone += `TZNAME:${def.daylight.tzname}\r\n`;
    if (def.daylight.rrule) {
      vtimezone += `RRULE:${def.daylight.rrule}\r\n`;
    }
    vtimezone += `END:DAYLIGHT\r\n`;
  }

  vtimezone += `END:VTIMEZONE`;
  return vtimezone;
}

export function hasTimezoneDefinition(tzid: string): boolean {
  return tzid in TIMEZONE_DEFINITIONS;
}
