// Replace these placeholder values with your Supabase project settings.
// Supabase Dashboard -> Project Settings -> API.
export const supabaseConfig = {
  url: "https://bemvoczmuuqlepsjvaup.supabase.co",
  anonKey: "sb_publishable_t1JilA2ZRa1EFmVqrt64OQ_UURVWRjm"
};

export function hasSupabaseConfig() {
  return Object.values(supabaseConfig).every((value) => value && !String(value).includes("REPLACE_WITH"));
}
