import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type Race = {
  id: number;
  race_no: number;
  race_date: string;
  deadline: string | null;
  race_name: string | null;
  weather: string | null;
  wind_speed: number | null;
  wave_height: number | null;
  result_1st: number | null;
  result_2nd: number | null;
  result_3rd: number | null;
};

export type Racer = {
  id: number;
  race_id: number;
  boat_no: number;
  racer_name: string;
  racer_no: string;
  grade: string;
  weight: number;
  national_win_rate: number;
  local_win_rate: number;
  motor_rate: number;
  boat_rate: number;
  f_count: number;
  l_count: number;
  avg_st: number;
  season_avg_rank: number;
  win_odds: number;
  exhibition_time: number;
  prediction_score: number;
};
