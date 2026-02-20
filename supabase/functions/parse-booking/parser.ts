const SYSTEM_PROMPT = `You are a travel booking email parser. Extract structured event data from booking confirmation emails.

RULES:
- Extract ALL events from the email (a single email may contain multiple flight legs, hotel stays, etc.)
- For flights: departure time MUST be in the departure airport's LOCAL timezone. Arrival time MUST be in the arrival airport's LOCAL timezone. Use IANA timezone identifiers (e.g., "Asia/Hong_Kong", "Europe/London", "America/New_York").
- For hotels: check-in and check-out times in the hotel's LOCAL timezone. If only dates are given (no times), use 15:00 for check-in and 11:00 for check-out as defaults, and set isAllDay to false.
- For trains/buses: use the LOCAL timezone of the departure and arrival stations.
- For restaurants/activities: use the LOCAL timezone of the venue.
- NEVER convert times to UTC. Preserve local times exactly as shown in the booking.
- If a time is ambiguous, use context clues (airport codes, city names) to determine the correct timezone.
- The booking reference / confirmation number is critical — always extract it if present.
- For flight titles, use format: "AIRLINE CODE FLIGHT_NUM ORIGIN → DESTINATION" (e.g., "CX 251 HKG → LHR")
- For hotel titles, use format: "HOTEL_NAME, CITY" (e.g., "Hilton Tower Bridge, London")
- For multi-leg flights, create a separate event for EACH leg.
- If the email is NOT a booking confirmation (e.g., marketing email, newsletter), return an empty events array.

Respond with ONLY valid JSON matching this exact schema — no markdown, no explanation.`;

interface ParsedEvent {
  type: "flight" | "hotel" | "train" | "car_rental" | "activity" | "restaurant";
  title: string;
  startDateTime: string; // local time without offset, e.g. "2026-03-15T23:35:00"
  startTimezone: string; // IANA timezone, e.g. "Asia/Hong_Kong"
  endDateTime: string;
  endTimezone: string;
  location: string;
  endLocation: string | null;
  bookingReference: string | null;
  notes: string;
  isAllDay: boolean;
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
            enum: ["flight", "hotel", "train", "car_rental", "activity", "restaurant"],
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
              "Local date-time at the end location, ISO 8601 without offset (e.g. 2026-03-16T05:30:00)",
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
            description: "End location (arrival airport for flights, null for others)",
          },
          bookingReference: {
            type: ["string", "null"] as const,
            description: "Booking confirmation code / PNR",
          },
          notes: {
            type: "string" as const,
            description:
              "Additional useful info: passenger names, seat numbers, terminal, gate, meal plan, room type, etc.",
          },
          isAllDay: { type: "boolean" as const },
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
        ],
      },
    },
  },
  required: ["events"],
};

export async function parseBookingEmail(
  emailSubject: string,
  emailBody: string,
  apiKey: string
): Promise<ParseResult> {
  const userMessage = `Parse this booking confirmation email and extract all travel events.

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
      max_tokens: 4096,
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
