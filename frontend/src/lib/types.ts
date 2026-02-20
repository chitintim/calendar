// Database types matching Supabase schema

export type EventType =
  | "flight"
  | "hotel"
  | "train"
  | "car_rental"
  | "activity"
  | "restaurant"
  | "ferry"
  | "bus"
  | "transfer";

export interface CalendarEvent {
  id: string;
  email_id: string | null;
  user_id: string;
  event_type: EventType;
  title: string;
  start_at: string; // UTC timestamptz
  start_timezone: string;
  end_at: string;
  end_timezone: string;
  location: string | null;
  end_location: string | null;
  is_all_day: boolean;
  booking_reference: string | null;
  notes: string | null;
  address: string | null;
  terminal: string | null;
  gate: string | null;
  passenger_names: string[] | null;
  provider: string | null;
  arrive_by_minutes: number | null;
  travel_from_previous_minutes: number | null;
  leave_by_note: string | null;
  created_at: string;
}

export interface Profile {
  id: string;
  display_name: string | null;
  base_city: string | null;
  base_timezone: string | null;
  base_country: string | null;
  preferences: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface UserEmail {
  id: string;
  user_id: string;
  email: string;
  is_primary: boolean;
  created_at: string;
}

export interface Group {
  id: string;
  name: string;
  invite_code: string | null;
  invite_expires_at: string | null;
  created_by: string;
  max_members: number;
  created_at: string;
}

export interface GroupMember {
  id: string;
  group_id: string;
  user_id: string;
  role: "owner" | "member";
  joined_at: string;
  profiles?: Profile;
}

export interface ReceivedEmail {
  id: string;
  resend_email_id: string;
  subject: string;
  sender: string;
  status: string;
  event_count: number | null;
  error_message: string | null;
  ics_sent: boolean;
  user_id: string;
  created_at: string;
}

// Urgency status for events
export type UrgencyStatus = "green" | "amber" | "red" | "past";

// Supabase generated Database type (minimal for client usage)
export interface Database {
  public: {
    Tables: {
      events: {
        Row: CalendarEvent;
      };
      profiles: {
        Row: Profile;
      };
      user_emails: {
        Row: UserEmail;
      };
      groups: {
        Row: Group;
      };
      group_members: {
        Row: GroupMember;
      };
      received_emails: {
        Row: ReceivedEmail;
      };
    };
  };
}
