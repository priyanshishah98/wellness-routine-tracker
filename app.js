import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { hasSupabaseConfig, supabaseConfig } from "./supabase-config.js";

const defaultGoalWeight = 62;
const $ = (id) => document.getElementById(id);
const todayIso = () => new Date().toLocaleDateString("en-CA");

const routines = [
  {
    title: "Lower-body strength",
    workout: ["Goblet squats - 3 x 10", "Glute bridges - 3 x 15", "Step-ups - 3 x 10/side", "10-minute walk"],
    meals: ["Curd bowl: 200 g curd, 1 cup fruit, 1 tbsp chia", "Dal quinoa bowl: 3/4 cup dal, 100 g tofu/paneer, 1/2 cup quinoa", "Makhana: 1.5 cups", "Stir-fry: 100 g tofu/paneer, 2 cups non-root veg"],
    target: "Strength first, then an easy walk."
  },
  {
    title: "Low-impact cardio + core",
    workout: ["Dance cardio or cycling - 20 minutes", "Dead bugs - 3 x 10/side", "Bird dogs - 3 x 10/side", "Plank - 3 x 25 seconds"],
    meals: ["Curd bowl: 200 g curd, 1 small apple, 1 tbsp chia", "Moong chilla: 1/2 cup dry dal, 90 g paneer/tofu", "Roasted chana: 1/3 cup", "Millet roti: 1 with 100 g tofu/paneer and 2 cups veg"],
    target: "Keep the pace conversational."
  },
  {
    title: "Upper body + posture",
    workout: ["Incline pushups - 3 x 10", "Rows - 3 x 12", "Shoulder press - 3 x 10", "Chest and shoulder stretch"],
    meals: ["Greek yogurt: 200 g with berries", "Chickpea salad bowl: 3/4 cup chickpeas, 2 cups salad", "Fruit + 8 almonds", "Paneer/tofu bowl with 1/2 cup quinoa"],
    target: "Move with control; no rushed reps."
  },
  {
    title: "Active recovery",
    workout: ["Mobility flow - 20 minutes", "Easy walk - 25 minutes", "Breathing - 3 minutes"],
    meals: ["Milk smoothie: 1 cup milk, 1 fruit, 1 tbsp seeds", "Dal soup: 1.25 cups with salad", "Makhana: 1.5 cups", "Light khichdi-style bowl without root vegetables"],
    target: "Recovery still counts."
  },
  {
    title: "Full-body circuit",
    workout: ["Chair squats - 3 x 12", "Incline pushups - 3 x 10", "Step-ups - 3 x 10/side", "Glute bridges - 3 x 15"],
    meals: ["Curd bowl: 200 g", "Tofu/paneer wrap: 100 g protein, 1 roti", "Roasted chana: 1/3 cup", "Vegetable stir-fry with 1/2 cup cooked grain"],
    target: "Finish one full round even if the day is busy."
  },
  {
    title: "Fun movement",
    workout: ["Dance workout - 20 minutes", "Walk outside - 20 minutes", "Gentle stretch - 5 minutes"],
    meals: ["Protein curd bowl", "Moong chilla plate", "Fruit + nut butter: 1 tbsp", "Paneer/tofu veggie bowl"],
    target: "Choose the movement you will actually do."
  },
  {
    title: "Reset + prep",
    workout: ["Gentle stretching - 20 minutes", "Meal prep walk break - 10 minutes", "Breathing - 3 minutes"],
    meals: ["Curd bowl", "Dal bowl", "Makhana/chana portion", "Light tofu/paneer dinner"],
    target: "Prep one thing that makes tomorrow easier."
  }
];

let supabase;
let currentUser;
let currentProfile;
let cachedMyLogs = [];
let cachedFriendLogs = [];
let myLogChannel;
let friendLogChannel;

function setText(id, value) {
  $(id).textContent = value;
}

function show(id, visible) {
  $(id).classList.toggle("hidden", !visible);
}

function formatKg(value) {
  if (!value && value !== 0) return "-";
  return `${Number(value).toFixed(1).replace(/\.0$/, "")} kg`;
}

function makeFriendCode(userId) {
  return userId.replaceAll("-", "").slice(0, 8).toUpperCase();
}

function pairMembers(a, b) {
  return [a, b].sort();
}

function renderRoutine() {
  const day = new Date().getDay();
  const routine = routines[day === 0 ? 6 : day - 1];
  setText("todayLabel", new Date().toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" }));
  setText("workoutTitle", routine.title);
  $("workoutList").innerHTML = routine.workout.map((item) => `<li>${item}</li>`).join("");
  $("mealList").innerHTML = routine.meals.map((item) => `<li>${item}</li>`).join("");
  setText("dailyTarget", routine.target);
}

function getLatest(logs) {
  return [...logs].sort((a, b) => b.log_date.localeCompare(a.log_date))[0];
}

function renderProgress() {
  const myLatest = getLatest(cachedMyLogs);
  const friendLatest = getLatest(cachedFriendLogs);

  $("myProgress").innerHTML = myLatest
    ? `<strong>${formatKg(myLatest.weight_kg)}</strong><span>${myLatest.workout_status}</span><span>${myLatest.meal_status}</span><span>${myLatest.log_date}</span>`
    : "No logs yet.";

  $("friendProgress").innerHTML = friendLatest
    ? `<strong>${friendLatest.display_name || "Friend"}: ${formatKg(friendLatest.weight_kg)}</strong><span>${friendLatest.workout_status}</span><span>${friendLatest.meal_status}</span><span>${friendLatest.log_date}</span>`
    : "No friend logs yet.";

  const rows = [
    ...cachedMyLogs.map((log) => ({ ...log, person: "You" })),
    ...cachedFriendLogs.map((log) => ({ ...log, person: log.display_name || "Friend" }))
  ].sort((a, b) => b.log_date.localeCompare(a.log_date)).slice(0, 20);

  $("historyRows").innerHTML = rows.length
    ? rows.map((log) => `
      <tr>
        <td>${log.log_date}</td>
        <td>${log.person}</td>
        <td>${formatKg(log.weight_kg)}</td>
        <td>${log.workout_status || "-"}</td>
        <td>${log.meal_status || "-"}</td>
        <td>${log.water_intake || "-"}</td>
        <td>${log.energy || "-"}</td>
        <td>${log.notes || "-"}</td>
      </tr>
    `).join("")
    : `<tr><td colspan="8">No logs yet.</td></tr>`;
}

function throwIfError({ error }) {
  if (error) throw error;
}

async function ensureProfile(user) {
  const existing = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();
  throwIfError(existing);

  if (existing.data) return existing.data;

  const profile = {
    id: user.id,
    display_name: user.user_metadata?.full_name || user.email?.split("@")[0] || "User",
    friend_code: makeFriendCode(user.id),
    goal_weight_kg: defaultGoalWeight
  };

  const created = await supabase
    .from("profiles")
    .insert(profile)
    .select()
    .single();
  throwIfError(created);
  return created.data;
}

async function getFriendId(userId) {
  const result = await supabase
    .from("friendships")
    .select("requester_id, addressee_id")
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
    .limit(1)
    .maybeSingle();
  throwIfError(result);

  if (!result.data) return null;
  return result.data.requester_id === userId ? result.data.addressee_id : result.data.requester_id;
}

async function loadLogs() {
  if (!currentUser) return;

  const myLogs = await supabase
    .from("daily_logs")
    .select("*")
    .eq("user_id", currentUser.id)
    .order("log_date", { ascending: false })
    .limit(30);
  throwIfError(myLogs);
  cachedMyLogs = myLogs.data || [];

  const friendId = await getFriendId(currentUser.id);
  if (!friendId) {
    cachedFriendLogs = [];
    renderProgress();
    return;
  }

  const friendLogs = await supabase
    .from("daily_logs")
    .select("*")
    .eq("user_id", friendId)
    .order("log_date", { ascending: false })
    .limit(30);
  throwIfError(friendLogs);
  cachedFriendLogs = friendLogs.data || [];
  renderProgress();
}

function bindRealtime() {
  if (myLogChannel) supabase.removeChannel(myLogChannel);
  if (friendLogChannel) supabase.removeChannel(friendLogChannel);

  myLogChannel = supabase
    .channel(`daily-log-${currentUser.id}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "daily_logs", filter: `user_id=eq.${currentUser.id}` }, loadLogs)
    .subscribe();

  getFriendId(currentUser.id).then((friendId) => {
    if (!friendId) return;
    friendLogChannel = supabase
      .channel(`daily-log-${friendId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "daily_logs", filter: `user_id=eq.${friendId}` }, loadLogs)
      .subscribe();
  });
}

async function refreshSignedInState(user) {
  currentUser = user;
  currentProfile = await ensureProfile(user);
  setText("authStatus", `Signed in as ${currentProfile.display_name}`);
  $("displayName").value = currentProfile.display_name || "";
  $("goalWeight").value = currentProfile.goal_weight_kg || defaultGoalWeight;
  setText("myFriendCode", currentProfile.friend_code);
  show("authPanel", false);
  show("appPanel", true);
  show("signOutButton", true);
  await loadLogs();
  bindRealtime();
}

async function saveProfile(event) {
  event.preventDefault();
  const displayName = $("displayName").value.trim() || "User";
  const goalWeight = Number($("goalWeight").value) || defaultGoalWeight;

  const result = await supabase
    .from("profiles")
    .update({
      display_name: displayName,
      goal_weight_kg: goalWeight,
      updated_at: new Date().toISOString()
    })
    .eq("id", currentUser.id)
    .select()
    .single();
  throwIfError(result);

  currentProfile = result.data;
  setText("authStatus", `Signed in as ${displayName}`);
}

async function addFriend(event) {
  event.preventDefault();
  const code = $("friendCodeInput").value.trim().toUpperCase();
  if (!code || code === currentProfile.friend_code) {
    setText("friendMessage", "Enter your friend's code.");
    return;
  }

  const profileResult = await supabase
    .from("profiles")
    .select("id, display_name, friend_code")
    .eq("friend_code", code)
    .maybeSingle();
  throwIfError(profileResult);

  if (!profileResult.data) {
    setText("friendMessage", "No user found for that code.");
    return;
  }

  const friendProfile = profileResult.data;
  const [memberA, memberB] = pairMembers(currentUser.id, friendProfile.id);
  const result = await supabase
    .from("friendships")
    .upsert({
      requester_id: memberA,
      addressee_id: memberB
    }, { onConflict: "requester_id,addressee_id", ignoreDuplicates: true });
  throwIfError(result);

  $("friendCodeInput").value = "";
  setText("friendMessage", `Friend linked: ${friendProfile.display_name}`);
  await loadLogs();
  bindRealtime();
}

async function saveDailyLog(event) {
  event.preventDefault();
  const date = todayIso();
  const log = {
    user_id: currentUser.id,
    display_name: currentProfile.display_name,
    log_date: date,
    weight_kg: $("logWeight").value ? Number($("logWeight").value) : null,
    workout_status: $("workoutStatus").value,
    meal_status: $("mealStatus").value,
    water_intake: $("waterIntake").value,
    energy: $("energy").value,
    mood: $("mood").value,
    notes: $("notes").value.trim(),
    updated_at: new Date().toISOString()
  };

  const result = await supabase
    .from("daily_logs")
    .upsert(log, { onConflict: "user_id,log_date" });
  throwIfError(result);

  setText("logMessage", "Saved.");
  await loadLogs();
}

function exportMyCsv() {
  const headers = ["log_date", "weight_kg", "workout_status", "meal_status", "water_intake", "energy", "mood", "notes"];
  const csv = [
    headers.join(","),
    ...cachedMyLogs.map((log) => headers.map((key) => `"${String(log[key] ?? "").replaceAll('"', '""')}"`).join(","))
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "shared-wellness-log.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}

function initSupabase() {
  if (!hasSupabaseConfig()) {
    show("setupWarning", true);
    $("authPanel").classList.add("hidden");
    return false;
  }

  supabase = createClient(supabaseConfig.url, supabaseConfig.anonKey);
  return true;
}

function bindEvents() {
  $("emailAuthForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    setText("authMessage", "");
    if (!$("emailAuthForm").reportValidity()) return;

    const result = await supabase.auth.signInWithPassword({
      email: $("email").value.trim(),
      password: $("password").value
    });
    if (result.error) setText("authMessage", result.error.message);
  });

  $("createAccountButton").addEventListener("click", async () => {
    setText("authMessage", "");
    if (!$("emailAuthForm").reportValidity()) return;

    const result = await supabase.auth.signUp({
      email: $("email").value.trim(),
      password: $("password").value,
      options: {
        emailRedirectTo: window.location.href
      }
    });
    setText("authMessage", result.error ? result.error.message : "Account created. Check your email if confirmation is enabled.");
  });

  $("signOutButton").addEventListener("click", async () => {
    await supabase.auth.signOut();
  });

  $("copyCodeButton").addEventListener("click", async () => {
    await navigator.clipboard.writeText(currentProfile.friend_code);
  });

  $("profileForm").addEventListener("submit", saveProfile);
  $("friendForm").addEventListener("submit", addFriend);
  $("dailyLogForm").addEventListener("submit", saveDailyLog);
  $("exportCsvButton").addEventListener("click", exportMyCsv);
}

async function bindAuthState() {
  const sessionResult = await supabase.auth.getSession();
  const user = sessionResult.data.session?.user || null;
  if (user) await refreshSignedInState(user);

  supabase.auth.onAuthStateChange(async (_event, session) => {
    if (!session?.user) {
      currentUser = null;
      currentProfile = null;
      cachedMyLogs = [];
      cachedFriendLogs = [];
      if (myLogChannel) supabase.removeChannel(myLogChannel);
      if (friendLogChannel) supabase.removeChannel(friendLogChannel);
      setText("authStatus", "Not signed in");
      show("authPanel", true);
      show("appPanel", false);
      show("signOutButton", false);
      renderProgress();
      return;
    }
    await refreshSignedInState(session.user);
  });
}

renderRoutine();

if (initSupabase()) {
  bindEvents();
  bindAuthState();
}
