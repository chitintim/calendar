import type { EventType } from "./types";

/**
 * Emoji icons for event types.
 */
export function getEventIcon(type: EventType): string {
  switch (type) {
    case "flight":
      return "\u2708\uFE0F";
    case "hotel":
      return "\uD83C\uDFE8";
    case "train":
      return "\uD83D\uDE86";
    case "car_rental":
      return "\uD83D\uDE97";
    case "restaurant":
      return "\uD83C\uDF7D\uFE0F";
    case "activity":
      return "\uD83C\uDFAB";
    case "ferry":
      return "\u26F4\uFE0F";
    case "bus":
      return "\uD83D\uDE8C";
    case "transfer":
      return "\uD83D\uDE95";
    default:
      return "\uD83D\uDCC5";
  }
}

/**
 * Display name for event types.
 */
export function getEventTypeName(type: EventType): string {
  switch (type) {
    case "flight":
      return "Flight";
    case "hotel":
      return "Hotel";
    case "train":
      return "Train";
    case "car_rental":
      return "Car Rental";
    case "restaurant":
      return "Restaurant";
    case "activity":
      return "Activity";
    case "ferry":
      return "Ferry";
    case "bus":
      return "Bus";
    case "transfer":
      return "Transfer";
    default:
      return "Event";
  }
}
