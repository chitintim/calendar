import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

export const supabaseUrl = "https://wwpmmkudqeqpbtezfupa.supabase.co";
export const supabaseAnonKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind3cG1ta3VkcWVxcGJ0ZXpmdXBhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA3NTY1NzgsImV4cCI6MjA4NjMzMjU3OH0.6R111F49xptd5wCwDMn_ECglbZ2RzyqOxKYjS2SbnCQ";

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);
