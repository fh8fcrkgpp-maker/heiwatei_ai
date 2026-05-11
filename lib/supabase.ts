import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type Race = {
  race_no: number;
  race_date: string;
  deadline: string;
  race_name: string;
  weather: string;
  wind_speed: number;
  wave_height: number;
  result_1st: number | null;
  result_2nd: number | null;
  result_3rd: number | null;
};

export type Racer = {
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
