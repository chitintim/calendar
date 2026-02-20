const SYSTEM_PROMPT = `You are a travel booking email parser. Extract structured event data from booking confirmation emails.

RULES:
- Extract ALL events from the email (a single email may contain multiple flight legs, hotel stays, etc.)
- For flights: departure time MUST be in the departure airport's LOCAL timezone. Arrival time MUST be in the arrival airport's LOCAL timezone. Use IANA timezone identifiers (e.g., "Asia/Hong_Kong", "Europe/London", "America/New_York").
- For hotels: check-in and check-out times in the hotel's LOCAL timezone. If only dates are given (no times), use 15:00 for check-in and 11:00 for check-out as defaults, and set isAllDay to false.
- For trains/buses: use the LOCAL timezone of the departure and arrival stations.
- For restaurants/activities: use the LOCAL timezone of the venue.
- For ferries: use the LOCAL timezone of the departure and arrival ports.
- NEVER convert times to UTC. Preserve local times exactly as shown in the booking.
- If a time is ambiguous, use context clues (airport codes, city names) to determine the correct timezone.
- The booking reference / confirmation number is critical — always extract it if present.
- For multi-leg flights, create a separate event for EACH leg.
- If the email is NOT a booking confirmation (e.g., marketing email, newsletter), return an empty events array.

TITLE FORMATS:
- Flight: "AIRLINE_CODE FLIGHT_NUM ORIGIN → DESTINATION" (e.g., "EY 871 HKG → AUH")
- Hotel: "HOTEL_NAME, CITY" (e.g., "Hilton Tower Bridge, London")
- Train: "OPERATOR ORIGIN → DESTINATION" (e.g., "Eurostar London → Paris")
- Car rental: "COMPANY PICKUP_LOCATION" (e.g., "Hertz Barcelona Airport")
- Restaurant: "RESTAURANT_NAME, CITY" (e.g., "Nobu, London")
- Activity: "EVENT_NAME, CITY" (e.g., "London Eye, London")
- Ferry: "OPERATOR ORIGIN → DESTINATION" (e.g., "Star Ferry HK Island → Kowloon")
- Bus: "OPERATOR ORIGIN → DESTINATION" (e.g., "FlixBus Munich → Vienna")
- Transfer: "TRANSFER ORIGIN → DESTINATION" (e.g., "Transfer CDG Airport → Hotel")

END TIME RULES:
- Flights, trains: always have explicit arrival times — use them.
- Hotels: check-out date/time. Default 11:00 if only dates given.
- If the booking does NOT state an explicit end time, make a sensible estimate:
  - Restaurant: start + 1.5-2h (reasonable meal duration)
  - Activity: start + 2-3h (depends on type — museum 2-3h, concert 2-3h, day trip longer)
  - Car rental pickup: start + 15min (just the handover process)
  - Car rental return: start + 15min
  - Ferry: estimate based on known route times
  - Bus: estimate based on known route times
  - Transfer: estimate based on route (30-90min typically)
- When end time is estimated (not from booking), add "End time estimated" to the notes field.

TRAVEL TIME ESTIMATION RULES:
For each event, you MUST estimate arrival and travel times.

- arriveByMinutes: How many minutes before the event start time the person should arrive.
  - International flights: 150-180 min (check-in + security + immigration)
  - Domestic/short-haul flights: 90-120 min
  - Trains requiring check-in (e.g., Eurostar): 45-60 min
  - Local trains with no check-in: 10-15 min
  - Restaurant: 5 min (just be on time)
  - Car rental pickup: 5-10 min
  - Activity/event: depends on venue — stadium/concert 30-60min, small venue 5-10min
  - Ferry with check-in: 30 min; walk-on ferry: 5-10 min
  - Bus: 10-15 min
  - Hotel check-in: 0 (no urgency)
  - Transfer pickup: 5 min

- travelFromPreviousMinutes: Estimated transit time from the previous known location to this event.
  - Use the KNOWN ITINERARY (provided below) to determine where the user likely is.
  - City centre to international airport: typically 45-90 min depending on city
  - Airport to city centre hotel: typically 30-60 min
  - Within same city: 20-40 min
  - If no previous location is known, estimate travel from the user's home base city.
  - Set to null only if estimation is truly impossible.

- leaveByNote: A brief one-sentence human-readable explanation.
  - Example: "Allow 75min taxi from Tower Bridge to Heathrow T2"
  - Example: "5min walk, restaurant is near your hotel"
  - Example: "From Hong Kong, allow time for airport arrival"

Respond with ONLY valid JSON matching the tool schema — no markdown, no explanation.`;

interface ParsedEvent {
  type: "flight" | "hotel" | "train" | "car_rental" | "activity" | "restaurant" | "ferry" | "bus" | "transfer";
  title: string;
  startDateTime: string;
  startTimezone: string;
  endDateTime: string;
  endTimezone: string;
  location: string;
  endLocation: string | null;
  bookingReference: string | null;
  notes: string;
  isAllDay: boolean;
  // New fields
  address: string | null;
  terminal: string | null;
  gate: string | null;
  passengerNames: string[];
  provider: string | null;
  arriveByMinutes: number;
  travelFromPreviousMinutes: number | null;
  leaveByNote: string | null;
}

interface ParseResult {
  events: ParsedEvent[];
}

const JSON_SCHEMA = {
  type: "object" as const,
  properties: {
    events: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          type: {
            type: "string" as const,
            enum: ["flight", "hotel", "train", "car_rental", "activity", "restaurant", "ferry", "bus", "transfer"],
          },
          title: { type: "string" as const },
          startDateTime: {
            type: "string" as const,
            description:
              "Local date-time at the start location, ISO 8601 without offset (e.g. 2026-03-15T23:35:00)",
          },
          startTimezone: {
            type: "string" as const,
            description: "IANA timezone of the start location (e.g. Asia/Hong_Kong)",
          },
          endDateTime: {
            type: "string" as const,
            description:
              "Local date-time at the end location, ISO 8601 without offset. If not explicit in booking, make a sensible estimate.",
          },
          endTimezone: {
            type: "string" as const,
            description: "IANA timezone of the end location (e.g. Europe/London)",
          },
          location: {
            type: "string" as const,
            description: "Start location (airport, hotel address, station, etc.)",
          },
          endLocation: {
            type: ["string", "null"] as const,
            description: "End location (arrival airport for flights, dropoff for car rental, null for single-location events)",
          },
          bookingReference: {
            type: ["string", "null"] as const,
            description: "Booking confirmation code / PNR",
          },
          notes: {
            type: "string" as const,
            description:
              "Additional info: seat numbers, meal plan, room type, etc. Include 'End time estimated' if end time was not explicit in the booking.",
          },
          isAllDay: { type: "boolean" as const },
          address: {
            type: ["string", "null"] as const,
            description: "Full street address if available (hotel address, restaurant address, venue address)",
          },
          terminal: {
            type: ["string", "null"] as const,
            description: "Airport terminal (e.g. 'Terminal 2', 'T5')",
          },
          gate: {
            type: ["string", "null"] as const,
            description: "Gate number if available",
          },
          passengerNames: {
            type: "array" as const,
            items: { type: "string" as const },
            description: "List of passenger/guest names from the booking",
          },
          provider: {
            type: ["string", "null"] as const,
            description: "Service provider name (airline, hotel chain, train operator, car rental company, etc.)",
          },
          arriveByMinutes: {
            type: "number" as const,
            description: "Estimated minutes to arrive before event start (e.g. 180 for international flight, 5 for restaurant)",
          },
          travelFromPreviousMinutes: {
            type: ["number", "null"] as const,
            description: "Estimated transit minutes from previous known location to this event",
          },
          leaveByNote: {
            type: ["string", "null"] as const,
            description: "Brief explanation of the travel estimate (e.g. 'Allow 75min taxi from Tower Bridge to Heathrow T2')",
          },
        },
        required: [
          "type",
          "title",
          "startDateTime",
          "startTimezone",
          "endDateTime",
          "endTimezone",
          "location",
          "endLocation",
          "bookingReference",
          "notes",
          "isAllDay",
          "address",
          "terminal",
          "gate",
          "passengerNames",
          "provider",
          "arriveByMinutes",
          "travelFromPreviousMinutes",
          "leaveByNote",
        ],
      },
    },
  },
  required: ["events"],
};

/**
 * Build the "KNOWN ITINERARY" context string from existing events.
 */
function buildItineraryContext(
  existingEvents: { event_type: string; title: string; start_at: string; start_timezone: string; end_at: string; end_timezone: string; location: string | null; end_location: string | null }[],
  userHomeBase: string | null
): string {
  let context = "";

  if (existingEvents.length > 0) {
    context += "\nKNOWN ITINERARY (user's existing events, for travel time context):\n";
    for (const e of existingEvents) {
      const loc = e.end_location ? `${e.location} → ${e.end_location}` : e.location || "unknown";
      context += `- ${e.start_at} ${e.event_type}: ${e.title} at ${loc}\n`;
    }
  }

  if (userHomeBase) {
    context += `\nUser's home base: ${userHomeBase}\n`;
  } else {
    context += "\nUser's home base: unknown\n";
  }

  return context;
}

export async function parseBookingEmail(
  emailSubject: string,
  emailBody: string,
  apiKey: string,
  existingEvents?: { event_type: string; title: string; start_at: string; start_timezone: string; end_at: string; end_timezone: string; location: string | null; end_location: string | null }[],
  userHomeBase?: string | null
): Promise<ParseResult> {
  const itineraryContext = buildItineraryContext(existingEvents ?? [], userHomeBase ?? null);

  const userMessage = `Parse this booking confirmation email and extract all travel events.
${itineraryContext}
Subject: ${emailSubject}

Body:
${emailBody}`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
      tools: [
        {
          name: "output_booking_events",
          description: "Output the parsed booking events as structured data",
          input_schema: JSON_SCHEMA,
        },
      ],
      tool_choice: { type: "tool", name: "output_booking_events" },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Claude API error (${response.status}): ${errText}`);
  }

  const data = await response.json();

  // Extract the tool use result
  const toolUse = data.content?.find(
    (block: { type: string }) => block.type === "tool_use"
  );
  if (!toolUse?.input) {
    throw new Error("Claude did not return structured tool output");
  }

  const result = toolUse.input as ParseResult;

  // Validate we got an events array
  if (!Array.isArray(result.events)) {
    throw new Error("Claude returned invalid structure: missing events array");
  }

  return result;
}

export type { ParsedEvent, ParseResult };
