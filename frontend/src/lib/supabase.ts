import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

export const supabaseUrl = "https://jldehgilcwusrpgrctwf.supabase.co";
export const supabaseAnonKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpsZGVoZ2lsY3d1c3JwZ3JjdHdmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE0OTU5MjEsImV4cCI6MjA4NzA3MTkyMX0.E413prtDK6LnVda21pHswfQS1Z6cQ_Kj8gHCcsWLbuk";

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);
