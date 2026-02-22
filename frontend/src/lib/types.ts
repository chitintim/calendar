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
  display_name: string;
  avatar_url: string | null;
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

// Urgency status for events (null = too far away to be relevant)
export type UrgencyStatus = "green" | "amber" | "red" | "past" | null;

// Supabase Database type — generated from schema, allows proper insert/update/rpc inference
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      events: {
        Row: {
          address: string | null;
          arrive_by_minutes: number | null;
          booking_reference: string | null;
          created_at: string;
          email_id: string | null;
          end_at: string;
          end_location: string | null;
          end_timezone: string;
          event_type: string;
          gate: string | null;
          id: string;
          is_all_day: boolean;
          leave_by_note: string | null;
          location: string | null;
          notes: string | null;
          passenger_names: string[] | null;
          provider: string | null;
          start_at: string;
          start_timezone: string;
          terminal: string | null;
          title: string;
          travel_from_previous_minutes: number | null;
          trip_id: string | null;
          user_id: string | null;
        };
        Insert: {
          address?: string | null;
          arrive_by_minutes?: number | null;
          booking_reference?: string | null;
          created_at?: string;
          email_id?: string | null;
          end_at: string;
          end_location?: string | null;
          end_timezone: string;
          event_type: string;
          gate?: string | null;
          id?: string;
          is_all_day?: boolean;
          leave_by_note?: string | null;
          location?: string | null;
          notes?: string | null;
          passenger_names?: string[] | null;
          provider?: string | null;
          start_at: string;
          start_timezone: string;
          terminal?: string | null;
          title: string;
          travel_from_previous_minutes?: number | null;
          trip_id?: string | null;
          user_id?: string | null;
        };
        Update: {
          address?: string | null;
          arrive_by_minutes?: number | null;
          booking_reference?: string | null;
          created_at?: string;
          email_id?: string | null;
          end_at?: string;
          end_location?: string | null;
          end_timezone?: string;
          event_type?: string;
          gate?: string | null;
          id?: string;
          is_all_day?: boolean;
          leave_by_note?: string | null;
          location?: string | null;
          notes?: string | null;
          passenger_names?: string[] | null;
          provider?: string | null;
          start_at?: string;
          start_timezone?: string;
          terminal?: string | null;
          title?: string;
          travel_from_previous_minutes?: number | null;
          trip_id?: string | null;
          user_id?: string | null;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          base_city: string | null;
          base_country: string | null;
          base_timezone: string | null;
          created_at: string;
          display_name: string;
          id: string;
          preferences: Json | null;
          updated_at: string;
        };
        Insert: {
          avatar_url?: string | null;
          base_city?: string | null;
          base_country?: string | null;
          base_timezone?: string | null;
          created_at?: string;
          display_name: string;
          id: string;
          preferences?: Json | null;
          updated_at?: string;
        };
        Update: {
          avatar_url?: string | null;
          base_city?: string | null;
          base_country?: string | null;
          base_timezone?: string | null;
          created_at?: string;
          display_name?: string;
          id?: string;
          preferences?: Json | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      user_emails: {
        Row: {
          created_at: string;
          email: string;
          id: string;
          is_primary: boolean;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          email: string;
          id?: string;
          is_primary?: boolean;
          user_id: string;
        };
        Update: {
          created_at?: string;
          email?: string;
          id?: string;
          is_primary?: boolean;
          user_id?: string;
        };
        Relationships: [];
      };
      groups: {
        Row: {
          created_at: string;
          created_by: string;
          id: string;
          invite_code: string | null;
          invite_expires_at: string | null;
          max_members: number;
          name: string;
        };
        Insert: {
          created_at?: string;
          created_by: string;
          id?: string;
          invite_code?: string | null;
          invite_expires_at?: string | null;
          max_members?: number;
          name: string;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          id?: string;
          invite_code?: string | null;
          invite_expires_at?: string | null;
          max_members?: number;
          name?: string;
        };
        Relationships: [];
      };
      group_members: {
        Row: {
          group_id: string;
          id: string;
          joined_at: string;
          role: string;
          user_id: string;
        };
        Insert: {
          group_id: string;
          id?: string;
          joined_at?: string;
          role?: string;
          user_id: string;
        };
        Update: {
          group_id?: string;
          id?: string;
          joined_at?: string;
          role?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      received_emails: {
        Row: {
          created_at: string;
          error_message: string | null;
          event_count: number;
          ics_sent: boolean;
          id: string;
          raw_body: string | null;
          resend_email_id: string | null;
          sender: string;
          status: string;
          subject: string;
          user_id: string | null;
        };
        Insert: {
          created_at?: string;
          error_message?: string | null;
          event_count?: number;
          ics_sent?: boolean;
          id?: string;
          raw_body?: string | null;
          resend_email_id?: string | null;
          sender: string;
          status?: string;
          subject: string;
          user_id?: string | null;
        };
        Update: {
          created_at?: string;
          error_message?: string | null;
          event_count?: number;
          ics_sent?: boolean;
          id?: string;
          raw_body?: string | null;
          resend_email_id?: string | null;
          sender?: string;
          status?: string;
          subject?: string;
          user_id?: string | null;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      get_my_group_ids: { Args: Record<string, never>; Returns: string[] };
      join_group_by_invite: { Args: { p_invite_code: string }; Returns: string };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
