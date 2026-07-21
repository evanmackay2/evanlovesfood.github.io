"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "./lib/supabase";

// ---- Design tokens ----
const INK = "#141414";
const PAPER = "#FCFBF6";
const GREEN = "#2F7D46";
const TINT = "#ECF4EE";
const RULE = "#DAD6CB";
const RED = "#B3261E";

const CATEGORIES = ["produce", "protein", "dairy", "grains", "pantry", "spices", "other"];
const CATEGORY_LABELS = {
  produce: "Produce",
  protein: "Meat & Protein",
  dairy: "Dairy & Eggs",
  grains: "Grains & Bread",
  pantry: "Pantry",
  spices: "Spices & Seasoning",
  other: "Other",
};

const MEALS = ["breakfast", "lunch", "dinner", "snack"];
const MEAL_LABELS = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner", snack: "Snacks" };

const ACTIVITY_LEVELS = [
  { key: "sedentary", label: "Sedentary (little or no exercise)", mult: 1.2 },
  { key: "light", label: "Lightly active (1-3 workouts/week)", mult: 1.375 },
  { key: "moderate", label: "Moderately active (3-5 workouts/week)", mult: 1.55 },
  { key: "very", label: "Very active (6-7 workouts/week)", mult: 1.725 },
  { key: "extreme", label: "Extremely active (physical job + training)", mult: 1.9 },
];

const STORAGE_KEY = "evansmeals-data-v1";

// Older workout sets were plain rep counts; normalize them to {weight, reps}
const normalizeSets = (sets) =>
  (sets || []).map((s) =>
    s !== null && typeof s === "object"
      ? { weight: s.weight ?? "", reps: s.reps ?? "" }
      : { weight: "", reps: s === undefined || s === null ? "" : String(s) }
  );

// ---- Date helpers (local time, not UTC) ----
const toDateStr = (d) => {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
const todayStr = () => toDateStr(new Date());
const shiftDate = (dateStr, days) => {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return toDateStr(dt);
};
const prettyDate = (dateStr) => {
  if (dateStr === todayStr()) return "Today";
  if (dateStr === shiftDate(todayStr(), -1)) return "Yesterday";
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
};

export default function EvansMeals() {
  // ---- Auth state ----
  const [session, setSession] = useState(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [authMode, setAuthMode] = useState("signin");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  // ---- App state ----
  const [tab, setTab] = useState("import");
  const [recipes, setRecipes] = useState([]);
  const [selected, setSelected] = useState([]);
  const [checked, setChecked] = useState({});
  const [log, setLog] = useState([]);
  const [workouts, setWorkouts] = useState([]);
  const [newExercise, setNewExercise] = useState("");
  const [sessions, setSessions] = useState({}); // { "2026-07-21": {start, end} }
  const [templates, setTemplates] = useState([]);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [progressOpen, setProgressOpen] = useState(false);
  const [progressExercise, setProgressExercise] = useState("");
  const [progressMetric, setProgressMetric] = useState("max"); // "max" | "volume"
  const [nowTick, setNowTick] = useState(Date.now());
  const [burnLoading, setBurnLoading] = useState(false);

  // Progress photos
  const [progressPhotos, setProgressPhotos] = useState([]); // {id, date, path, note}
  const [ppPreview, setPpPreview] = useState(null);
  const [ppNote, setPpNote] = useState("");
  const [ppBusy, setPpBusy] = useState(false);
  const [ppError, setPpError] = useState("");
  const [signedUrls, setSignedUrls] = useState({});
  const ppCameraRef = useRef(null);
  const ppGalleryRef = useRef(null);
  const [goals, setGoals] = useState({ calories: 2200, protein: 150 });
  const [profile, setProfile] = useState({
    gender: "male",
    age: "",
    weightLb: "",
    heightFt: "",
    heightIn: "",
    activity: "moderate",
  });
  const [dataLoaded, setDataLoaded] = useState(false);

  const [videoUrl, setVideoUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(null);

  const [writeText, setWriteText] = useState("");
  const [writeLoading, setWriteLoading] = useState(false);
  const [writeError, setWriteError] = useState("");

  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState(null);

  const [logPanel, setLogPanel] = useState(null);
  const [logForm, setLogForm] = useState({ date: todayStr(), mealType: "dinner", servings: 1 });

  const [viewDate, setViewDate] = useState(todayStr());
  const [manualText, setManualText] = useState("");
  const [manualMeal, setManualMeal] = useState("dinner");
  const [manualLoading, setManualLoading] = useState(false);
  const [manualError, setManualError] = useState("");
  const [showCalc, setShowCalc] = useState(false);

  // Photo logging state
  const [photoData, setPhotoData] = useState(null);
  const [photoBusy, setPhotoBusy] = useState(null); // null | "meal" | "recipe" | "both"
  const [photoError, setPhotoError] = useState("");
  const cameraInputRef = useRef(null);
  const galleryInputRef = useRef(null);

  // Suggestions state
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestMeal, setSuggestMeal] = useState("dinner");
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestError, setSuggestError] = useState("");
  const [suggestions, setSuggestions] = useState([]);

  // Refs for debounced cloud saving
  const saveTimer = useRef(null);
  const pendingData = useRef(null);

  // ---- Watch the auth session ----
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setSessionChecked(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  // ---- Load this user's data once signed in ----
  useEffect(() => {
    if (!session) {
      setDataLoaded(false);
      return;
    }
    (async () => {
      try {
        const { data: row, error: readError } = await supabase
          .from("user_data")
          .select("data")
          .eq("id", session.user.id)
          .maybeSingle();
        if (readError) throw readError;

        let data = row?.data;

        if (!data || Object.keys(data).length === 0) {
          try {
            const legacy = localStorage.getItem(STORAGE_KEY);
            if (legacy) data = JSON.parse(legacy);
          } catch (e) {
            // no legacy data
          }
          if (data && Object.keys(data).length > 0) {
            await supabase.from("user_data").upsert({
              id: session.user.id,
              data,
              updated_at: new Date().toISOString(),
            });
          }
        }

        if (data) {
          setRecipes(data.recipes || []);
          setSelected(data.selected || []);
          setChecked(data.checked || {});
          setLog(data.log || []);
          setWorkouts((data.workouts || []).map((wk) => ({ ...wk, sets: normalizeSets(wk.sets) })));
          setSessions(data.sessions || {});
          setTemplates(data.templates || []);
          setProgressPhotos(data.progressPhotos || []);
          if (data.goals) setGoals(data.goals);
          if (data.profile) setProfile(data.profile);
        } else {
          setRecipes([]);
          setSelected([]);
          setChecked({});
          setLog([]);
          setWorkouts([]);
          setSessions({});
          setTemplates([]);
          setProgressPhotos([]);
        }
      } catch (e) {
        console.error("Could not load your data:", e);
      }
      setDataLoaded(true);
    })();
  }, [session]);

  // ---- Live timer tick while a workout is running for the viewed day ----
  useEffect(() => {
    const sess = sessions[viewDate];
    if (sess && sess.start && !sess.end) {
      const t = setInterval(() => setNowTick(Date.now()), 1000);
      return () => clearInterval(t);
    }
  }, [sessions, viewDate]);

  // ---- Fetch signed URLs for progress photos when viewing that tab ----
  useEffect(() => {
    if (tab !== "progress" || !session) return;
    const missing = progressPhotos.filter((p) => !signedUrls[p.path]);
    if (missing.length === 0) return;
    (async () => {
      const updates = {};
      for (const p of missing) {
        try {
          const { data } = await supabase.storage
            .from("progress-photos")
            .createSignedUrl(p.path, 3600);
          if (data?.signedUrl) updates[p.path] = data.signedUrl;
        } catch (e) {
          // skip; will retry next time
        }
      }
      if (Object.keys(updates).length > 0) {
        setSignedUrls((u) => ({ ...u, ...updates }));
      }
    })();
  }, [tab, progressPhotos, session]);

  // ---- Persist: instant local cache + debounced cloud write ----
  const persist = (next) => {
    const current = { recipes, selected, checked, log, workouts, sessions, templates, progressPhotos, goals, profile, ...next };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
    } catch (e) {
      // cache write failed; cloud still saves
    }
    if (!session) return;
    pendingData.current = current;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await supabase.from("user_data").upsert({
          id: session.user.id,
          data: pendingData.current,
          updated_at: new Date().toISOString(),
        });
      } catch (e) {
        console.error("Cloud save failed:", e);
      }
    }, 800);
  };

  // ---- Auth actions ----
  const handleAuth = async () => {
    if (!authEmail.trim() || !authPassword) {
      setAuthError("Enter your email and a password.");
      return;
    }
    setAuthError("");
    setAuthLoading(true);
    try {
      if (authMode === "signup") {
        const { error: e } = await supabase.auth.signUp({
          email: authEmail.trim(),
          password: authPassword,
        });
        if (e) throw e;
      } else {
        const { error: e } = await supabase.auth.signInWithPassword({
          email: authEmail.trim(),
          password: authPassword,
        });
        if (e) throw e;
      }
      setAuthEmail("");
      setAuthPassword("");
    } catch (e) {
      setAuthError(e.message || "Something went wrong. Try again.");
    }
    setAuthLoading(false);
  };

  const signOut = async () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      // fine
    }
    await supabase.auth.signOut();
    setTab("import");
  };

  // ---- TDEE math (Harris-Benedict, imperial) ----
  const num = (v) => Number(v) || 0;
  const heightInches = num(profile.heightFt) * 12 + num(profile.heightIn);
  const w = num(profile.weightLb);
  const a = num(profile.age);
  const profileComplete = w > 0 && heightInches > 0 && a > 0;

  const bmr = profileComplete
    ? profile.gender === "male"
      ? 66 + 6.23 * w + 12.7 * heightInches - 6.8 * a
      : 655 + 4.35 * w + 4.7 * heightInches - 4.7 * a
    : 0;

  const activityMult = ACTIVITY_LEVELS.find((l) => l.key === profile.activity)?.mult ?? 1.55;
  const tdee = Math.round(bmr * activityMult);
  const proteinSuggestion = Math.round(w * 0.8);

  const updateProfile = (field, value) => {
    const nextProfile = { ...profile, [field]: value };
    setProfile(nextProfile);
    persist({ profile: nextProfile });
  };

  const setCalorieGoal = (cal) => {
    const nextGoals = { ...goals, calories: cal };
    setGoals(nextGoals);
    persist({ goals: nextGoals });
  };

  const setProteinGoal = (g) => {
    const nextGoals = { ...goals, protein: g };
    setGoals(nextGoals);
    persist({ goals: nextGoals });
  };

  // ---- Save a recipe object into the library ----
  const addRecipe = (data, source) => {
    const recipe = {
      id: String(Date.now()),
      source: source || "",
      addedAt: new Date().toISOString(),
      ...data,
    };
    const nextRecipes = [recipe, ...recipes];
    const nextSelected = [recipe.id, ...selected];
    setRecipes(nextRecipes);
    setSelected(nextSelected);
    persist({ recipes: nextRecipes, selected: nextSelected });
    setTab("recipes");
    setExpanded(recipe.id);
  };

  // ---- Import from any link ----
  const importVideo = async () => {
    if (!videoUrl.trim()) {
      setError("Paste a link first.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: videoUrl.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed");
      addRecipe(data, videoUrl.trim());
      setVideoUrl("");
    } catch (e) {
      setError(e.message || "Something went wrong. Try another link.");
    }
    setLoading(false);
  };

  // ---- Structure a user-written recipe ----
  const parseWritten = async () => {
    if (!writeText.trim()) {
      setWriteError("Write your recipe first.");
      return;
    }
    setWriteError("");
    setWriteLoading(true);
    try {
      const res = await fetch("/api/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: writeText.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't structure that recipe");
      addRecipe(data, "");
      setWriteText("");
    } catch (e) {
      setWriteError(e.message || "Something went wrong.");
    }
    setWriteLoading(false);
  };

  // ---- Recipe actions ----
  const deleteRecipe = (id) => {
    const nextRecipes = recipes.filter((r) => r.id !== id);
    const nextSelected = selected.filter((s) => s !== id);
    setRecipes(nextRecipes);
    setSelected(nextSelected);
    persist({ recipes: nextRecipes, selected: nextSelected });
    if (editingId === id) setEditingId(null);
  };

  const toggleSelected = (id) => {
    const nextSelected = selected.includes(id)
      ? selected.filter((s) => s !== id)
      : [...selected, id];
    setSelected(nextSelected);
    persist({ selected: nextSelected });
  };

  // ---- Recipe editing ----
  const startEdit = (r) => {
    setEditingId(r.id);
    setDraft({
      title: r.title || "",
      servings: r.servings || 1,
      prepMinutes: r.prepMinutes || "",
      calories: Math.round(r.perServing?.calories ?? 0),
      protein_g: Math.round(r.perServing?.protein_g ?? 0),
      carbs_g: Math.round(r.perServing?.carbs_g ?? 0),
      fat_g: Math.round(r.perServing?.fat_g ?? 0),
      ingredients: (r.ingredients || []).map((ing) => ({
        name: ing.name || "",
        amount: ing.amount ?? "",
        unit: ing.unit || "",
        category: CATEGORIES.includes(ing.category) ? ing.category : "other",
      })),
      stepsText: (r.steps || []).join("\n"),
    });
  };

  const updateDraft = (field, value) => setDraft({ ...draft, [field]: value });

  const updateDraftIng = (i, field, value) => {
    const ings = draft.ingredients.map((ing, idx) => (idx === i ? { ...ing, [field]: value } : ing));
    setDraft({ ...draft, ingredients: ings });
  };

  const addDraftIng = () =>
    setDraft({
      ...draft,
      ingredients: [...draft.ingredients, { name: "", amount: "", unit: "", category: "other" }],
    });

  const removeDraftIng = (i) =>
    setDraft({ ...draft, ingredients: draft.ingredients.filter((_, idx) => idx !== i) });

  const saveEdit = () => {
    const nextRecipes = recipes.map((r) => {
      if (r.id !== editingId) return r;
      return {
        ...r,
        title: draft.title.trim() || r.title,
        servings: Number(draft.servings) || 1,
        prepMinutes: Number(draft.prepMinutes) || null,
        perServing: {
          calories: Number(draft.calories) || 0,
          protein_g: Number(draft.protein_g) || 0,
          carbs_g: Number(draft.carbs_g) || 0,
          fat_g: Number(draft.fat_g) || 0,
        },
        ingredients: draft.ingredients
          .filter((ing) => ing.name.trim())
          .map((ing) => ({
            name: ing.name.trim(),
            amount: ing.amount === "" ? null : Number(ing.amount) || null,
            unit: ing.unit.trim() || null,
            category: ing.category,
          })),
        steps: draft.stepsText
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
      };
    });
    setRecipes(nextRecipes);
    persist({ recipes: nextRecipes });
    setEditingId(null);
    setDraft(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft(null);
  };

  // ---- Logging meals ----
  const openLogPanel = (recipeId) => {
    setLogPanel(logPanel === recipeId ? null : recipeId);
    setLogForm({ date: todayStr(), mealType: "dinner", servings: 1 });
  };

  const addLogEntry = (entry) => {
    const nextLog = [...log, entry];
    setLog(nextLog);
    persist({ log: nextLog });
  };

  const logRecipe = (recipe) => {
    const s = Number(logForm.servings) || 1;
    addLogEntry({
      id: String(Date.now()),
      date: logForm.date,
      mealType: logForm.mealType,
      title: recipe.title,
      servings: s,
      calories: Math.round((recipe.perServing?.calories ?? 0) * s),
      protein_g: Math.round((recipe.perServing?.protein_g ?? 0) * s),
      carbs_g: Math.round((recipe.perServing?.carbs_g ?? 0) * s),
      fat_g: Math.round((recipe.perServing?.fat_g ?? 0) * s),
    });
    setLogPanel(null);
    setViewDate(logForm.date);
    setTab("log");
  };

  const logManualMeal = async () => {
    if (!manualText.trim()) {
      setManualError("Describe what you ate first.");
      return;
    }
    setManualError("");
    setManualLoading(true);
    try {
      const res = await fetch("/api/estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: manualText.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Estimate failed");

      addLogEntry({
        id: String(Date.now()),
        date: viewDate,
        mealType: manualMeal,
        title: data.title || manualText.slice(0, 60),
        servings: 1,
        calories: Math.round(data.calories ?? 0),
        protein_g: Math.round(data.protein_g ?? 0),
        carbs_g: Math.round(data.carbs_g ?? 0),
        fat_g: Math.round(data.fat_g ?? 0),
      });
      setManualText("");
    } catch (e) {
      setManualError(e.message || "Something went wrong.");
    }
    setManualLoading(false);
  };

  // ---- Photo logging ----
  const handlePhotoSelect = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setPhotoError("");
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        // Downscale so uploads are fast and within API limits
        const maxDim = 1024;
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const scale = maxDim / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        setPhotoData(canvas.toDataURL("image/jpeg", 0.8));
      };
      img.onerror = () => setPhotoError("Couldn't read that image. Try another photo.");
      img.src = reader.result;
    };
    reader.onerror = () => setPhotoError("Couldn't read that file.");
    reader.readAsDataURL(file);
    // allow selecting the same file again later
    e.target.value = "";
  };

  // Photo → log as a meal
  const photoAsMeal = async () => {
    if (!photoData) return;
    setPhotoError("");
    setPhotoBusy("meal");
    try {
      const res = await fetch("/api/photo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: photoData, mode: "meal" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Analysis failed");
      if (!data.calories && data.title === "Couldn't identify food") {
        throw new Error("Couldn't identify any food in that photo. Try a clearer shot.");
      }

      addLogEntry({
        id: String(Date.now()),
        date: todayStr(),
        mealType: manualMeal,
        title: `📷 ${data.title || "Photo meal"}`,
        servings: 1,
        calories: Math.round(data.calories ?? 0),
        protein_g: Math.round(data.protein_g ?? 0),
        carbs_g: Math.round(data.carbs_g ?? 0),
        fat_g: Math.round(data.fat_g ?? 0),
      });
      setPhotoData(null);
      setViewDate(todayStr());
      setTab("log");
    } catch (e) {
      setPhotoError(e.message || "Something went wrong.");
    }
    setPhotoBusy(null);
  };

  // Photo → save as recipe (optionally also log 1 serving)
  const photoAsRecipe = async (alsoLog) => {
    if (!photoData) return;
    setPhotoError("");
    setPhotoBusy(alsoLog ? "both" : "recipe");
    try {
      const res = await fetch("/api/photo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: photoData, mode: "recipe" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Analysis failed");
      if (data.title === "Couldn't read a recipe") {
        throw new Error("Couldn't find a recipe in that photo. Try a clearer shot of the recipe or dish.");
      }

      // Build everything, then save state + cloud in ONE update so the
      // recipe and the log entry can't overwrite each other.
      const recipe = {
        id: String(Date.now()),
        source: "",
        addedAt: new Date().toISOString(),
        ...data,
      };
      const nextRecipes = [recipe, ...recipes];
      const nextSelected = [recipe.id, ...selected];
      let nextLog = log;

      if (alsoLog) {
        nextLog = [
          ...log,
          {
            id: String(Date.now() + 1),
            date: todayStr(),
            mealType: manualMeal,
            title: recipe.title,
            servings: 1,
            calories: Math.round(recipe.perServing?.calories ?? 0),
            protein_g: Math.round(recipe.perServing?.protein_g ?? 0),
            carbs_g: Math.round(recipe.perServing?.carbs_g ?? 0),
            fat_g: Math.round(recipe.perServing?.fat_g ?? 0),
          },
        ];
      }

      setRecipes(nextRecipes);
      setSelected(nextSelected);
      setLog(nextLog);
      persist({ recipes: nextRecipes, selected: nextSelected, log: nextLog });
      setPhotoData(null);

      if (alsoLog) {
        setViewDate(todayStr());
        setTab("log");
      } else {
        setTab("recipes");
        setExpanded(recipe.id);
      }
    } catch (e) {
      setPhotoError(e.message || "Something went wrong.");
    }
    setPhotoBusy(null);
  };

  const deleteEntry = (id) => {
    const nextLog = log.filter((e) => e.id !== id);
    setLog(nextLog);
    persist({ log: nextLog });
  };

  const updateGoals = (field, value) => {
    const nextGoals = { ...goals, [field]: Number(value) || 0 };
    setGoals(nextGoals);
    persist({ goals: nextGoals });
  };

  // ---- Daily math ----
  const dayEntries = log.filter((e) => e.date === viewDate);
  const dayTotals = dayEntries.reduce(
    (t, e) => ({
      calories: t.calories + (e.calories || 0),
      protein: t.protein + (e.protein_g || 0),
      carbs: t.carbs + (e.carbs_g || 0),
      fat: t.fat + (e.fat_g || 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );

  const fatTarget = Math.max(1, Math.round((goals.calories * 0.3) / 9));
  const carbTarget = Math.max(
    1,
    Math.round((goals.calories - goals.protein * 4 - fatTarget * 9) / 4)
  );

  const pct = (val, target) => (target > 0 ? Math.round((val / target) * 100) : 0);

  // Average counts only COMPLETED days (before today), so a half-logged
  // morning doesn't drag the number down.
  const dayMap = {};
  log.forEach((e) => {
    if (e.date >= todayStr()) return;
    dayMap[e.date] = (dayMap[e.date] || 0) + (e.calories || 0);
  });
  const loggedDays = Object.keys(dayMap).length;
  const avgCalories = loggedDays
    ? Math.round(Object.values(dayMap).reduce((x, y) => x + y, 0) / loggedDays)
    : 0;

  // ---- Meal suggestions ----
  const getSuggestions = async () => {
    setSuggestError("");
    setSuggestLoading(true);
    setSuggestions([]);
    try {
      const remaining = {
        calories: goals.calories - dayTotals.calories,
        protein: Math.max(0, goals.protein - dayTotals.protein),
        carbs: Math.max(0, carbTarget - dayTotals.carbs),
        fat: Math.max(0, fatTarget - dayTotals.fat),
      };
      const savedRecipes = recipes.map((r) => ({
        title: r.title,
        calories: Math.round(r.perServing?.calories ?? 0),
        protein_g: Math.round(r.perServing?.protein_g ?? 0),
      }));
      const res = await fetch("/api/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ remaining, mealType: MEAL_LABELS[suggestMeal], savedRecipes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't get suggestions");
      setSuggestions(data.suggestions || []);
      if (!data.suggestions || data.suggestions.length === 0) {
        throw new Error("No suggestions came back. Try again.");
      }
    } catch (e) {
      setSuggestError(e.message || "Something went wrong.");
    }
    setSuggestLoading(false);
  };

  const logSuggestion = (s) => {
    addLogEntry({
      id: String(Date.now()),
      date: viewDate,
      mealType: suggestMeal,
      title: s.title,
      servings: 1,
      calories: Math.round(s.calories ?? 0),
      protein_g: Math.round(s.protein_g ?? 0),
      carbs_g: Math.round(s.carbs_g ?? 0),
      fat_g: Math.round(s.fat_g ?? 0),
    });
    setSuggestions(suggestions.filter((x) => x !== s));
  };

  // ---- Workout tracking ----
  const dayWorkouts = workouts.filter((wk) => wk.date === viewDate);

  const addExercise = () => {
    const name = newExercise.trim();
    if (!name) return;
    const entry = {
      id: String(Date.now()),
      date: viewDate,
      exercise: name,
      sets: [{ weight: "", reps: "" }],
    };
    const nextWorkouts = [...workouts, entry];
    setWorkouts(nextWorkouts);
    persist({ workouts: nextWorkouts });
    setNewExercise("");
  };

  const changeSets = (id, delta) => {
    const nextWorkouts = workouts.map((wk) => {
      if (wk.id !== id) return wk;
      let sets = [...wk.sets];
      if (delta > 0) sets.push({ weight: "", reps: "" });
      else if (sets.length > 1) sets.pop();
      return { ...wk, sets };
    });
    setWorkouts(nextWorkouts);
    persist({ workouts: nextWorkouts });
  };

  const updateSet = (id, setIdx, field, value) => {
    const nextWorkouts = workouts.map((wk) => {
      if (wk.id !== id) return wk;
      const sets = wk.sets.map((s, i) => (i === setIdx ? { ...s, [field]: value } : s));
      return { ...wk, sets };
    });
    setWorkouts(nextWorkouts);
    persist({ workouts: nextWorkouts });
  };

  const deleteExercise = (id) => {
    const nextWorkouts = workouts.filter((wk) => wk.id !== id);
    setWorkouts(nextWorkouts);
    persist({ workouts: nextWorkouts });
  };

  const setVolume = (s) => (Number(s.weight) || 0) * (Number(s.reps) || 0);

  const workoutTotals = dayWorkouts.reduce(
    (t, wk) => ({
      sets: t.sets + wk.sets.length,
      reps: t.reps + wk.sets.reduce((s, r) => s + (Number(r.reps) || 0), 0),
      volume: t.volume + wk.sets.reduce((s, r) => s + setVolume(r), 0),
    }),
    { sets: 0, reps: 0, volume: 0 }
  );

  // ---- Workout session (start / end / duration) ----
  const workoutSession = sessions[viewDate];
  const sessionRunning = !!(workoutSession && workoutSession.start && !workoutSession.end);
  const sessionDone = !!(workoutSession && workoutSession.start && workoutSession.end);

  const fmtDuration = (ms) => {
    const totalSec = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  const sessionElapsed = sessionRunning
    ? fmtDuration(nowTick - new Date(workoutSession.start).getTime())
    : sessionDone
    ? fmtDuration(new Date(workoutSession.end).getTime() - new Date(workoutSession.start).getTime())
    : null;

  const startWorkout = () => {
    const nextSessions = { ...sessions, [viewDate]: { start: new Date().toISOString() } };
    setSessions(nextSessions);
    persist({ sessions: nextSessions });
  };

  const endWorkout = async () => {
    if (!workoutSession || !workoutSession.start) return;
    const endIso = new Date().toISOString();
    const durationMinutes = Math.max(
      1,
      Math.round((new Date(endIso).getTime() - new Date(workoutSession.start).getTime()) / 60000)
    );

    // Ask the AI how many calories this session burned
    let burned = null;
    if (dayWorkouts.length > 0) {
      setBurnLoading(true);
      try {
        const res = await fetch("/api/burn", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            exercises: dayWorkouts.map((wk) => ({ exercise: wk.exercise, sets: wk.sets })),
            durationMinutes,
            profile: { weightLb: profile.weightLb, age: profile.age, gender: profile.gender },
          }),
        });
        const data = await res.json();
        if (res.ok && data.calories) burned = Math.round(data.calories);
      } catch (e) {
        // burn estimate is best-effort; the workout still ends
      }
      setBurnLoading(false);
    }

    const nextSessions = {
      ...sessions,
      [viewDate]: { ...workoutSession, end: endIso, burned },
    };
    setSessions(nextSessions);
    persist({ sessions: nextSessions });
  };

  // ---- Templates ----
  const saveTemplate = () => {
    if (dayWorkouts.length === 0) return;
    const name = newTemplateName.trim() || `Workout ${templates.length + 1}`;
    const template = {
      id: String(Date.now()),
      name,
      exercises: dayWorkouts.map((wk) => ({ exercise: wk.exercise, setCount: wk.sets.length })),
    };
    const nextTemplates = [...templates, template];
    setTemplates(nextTemplates);
    persist({ templates: nextTemplates });
    setNewTemplateName("");
  };

  const loadTemplate = (t) => {
    const stamp = Date.now();
    const entries = t.exercises.map((ex, i) => ({
      id: String(stamp + i),
      date: viewDate,
      exercise: ex.exercise,
      sets: Array.from({ length: ex.setCount || 1 }, () => ({ weight: "", reps: "" })),
    }));
    const nextWorkouts = [...workouts, ...entries];
    setWorkouts(nextWorkouts);
    persist({ workouts: nextWorkouts });
  };

  const deleteTemplate = (id) => {
    const nextTemplates = templates.filter((t) => t.id !== id);
    setTemplates(nextTemplates);
    persist({ templates: nextTemplates });
  };

  // ---- Workout history ----
  const historyByDate = {};
  workouts.forEach((wk) => {
    if (!historyByDate[wk.date]) {
      historyByDate[wk.date] = { exercises: 0, sets: 0, volume: 0 };
    }
    historyByDate[wk.date].exercises += 1;
    historyByDate[wk.date].sets += wk.sets.length;
    historyByDate[wk.date].volume += wk.sets.reduce((s, r) => s + setVolume(r), 0);
  });
  const historyDates = Object.keys(historyByDate).sort().reverse();

  // ---- Progress chart data ----
  const exerciseNames = [];
  const seenNames = new Set();
  workouts.forEach((wk) => {
    const key = wk.exercise.trim().toLowerCase();
    if (key && !seenNames.has(key)) {
      seenNames.add(key);
      exerciseNames.push(wk.exercise.trim());
    }
  });

  // Epley formula: estimated one-rep max from a set's weight and reps.
  // A true single counts as itself; the formula gets optimistic past ~10 reps.
  const estimate1RM = (s) => {
    const wgt = Number(s.weight) || 0;
    const reps = Number(s.reps) || 0;
    if (wgt <= 0) return 0;
    if (reps <= 1) return wgt;
    return wgt * (1 + reps / 30);
  };

  const buildProgressSeries = () => {
    if (!progressExercise) return [];
    const key = progressExercise.trim().toLowerCase();
    const byDate = {};
    workouts.forEach((wk) => {
      if (wk.exercise.trim().toLowerCase() !== key) return;
      wk.sets.forEach((s) => {
        const e1rm = estimate1RM(s);
        const vol = setVolume(s);
        if (!byDate[wk.date]) byDate[wk.date] = { max: 0, volume: 0 };
        byDate[wk.date].max = Math.max(byDate[wk.date].max, e1rm);
        byDate[wk.date].volume += vol;
      });
    });
    return Object.keys(byDate)
      .sort()
      .map((d) => ({ date: d, value: byDate[d][progressMetric] }))
      .filter((p) => p.value > 0);
  };

  const progressSeries = buildProgressSeries();
  const shortDate = (dateStr) => {
    const [, m, d] = dateStr.split("-").map(Number);
    return `${m}/${d}`;
  };

  // ---- Progress photos ----
  const handleProgressPhotoSelect = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setPpError("");
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxDim = 1000;
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const scale = maxDim / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        setPpPreview(canvas.toDataURL("image/jpeg", 0.8));
      };
      img.onerror = () => setPpError("Couldn't read that image.");
      img.src = reader.result;
    };
    reader.onerror = () => setPpError("Couldn't read that file.");
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const saveProgressPhoto = async () => {
    if (!ppPreview || !session) return;
    setPpError("");
    setPpBusy(true);
    try {
      const blob = await (await fetch(ppPreview)).blob();
      const path = `${session.user.id}/${Date.now()}.jpg`;
      const { error: upErr } = await supabase.storage
        .from("progress-photos")
        .upload(path, blob, { contentType: "image/jpeg" });
      if (upErr) {
        throw new Error(
          "Upload failed. Make sure the progress-photos bucket exists in Supabase Storage."
        );
      }
      const meta = {
        id: String(Date.now()),
        date: todayStr(),
        path,
        note: ppNote.trim(),
      };
      const nextPhotos = [meta, ...progressPhotos];
      setProgressPhotos(nextPhotos);
      persist({ progressPhotos: nextPhotos });
      setPpPreview(null);
      setPpNote("");
    } catch (e) {
      setPpError(e.message || "Something went wrong.");
    }
    setPpBusy(false);
  };

  const deleteProgressPhoto = async (photo) => {
    try {
      await supabase.storage.from("progress-photos").remove([photo.path]);
    } catch (e) {
      // metadata cleanup happens regardless
    }
    const nextPhotos = progressPhotos.filter((p) => p.id !== photo.id);
    setProgressPhotos(nextPhotos);
    persist({ progressPhotos: nextPhotos });
  };

  // ---- Grocery list ----
  const buildGroceryList = () => {
    const items = {};
    recipes
      .filter((r) => selected.includes(r.id))
      .forEach((r) => {
        (r.ingredients || []).forEach((ing) => {
          const key = (ing.name || "").toLowerCase().trim();
          if (!key) return;
          if (!items[key]) {
            items[key] = { name: ing.name, category: ing.category || "other", amounts: [] };
          }
          if (ing.amount) {
            const existing = items[key].amounts.find((x) => x.unit === (ing.unit || ""));
            if (existing) existing.amount += ing.amount;
            else items[key].amounts.push({ amount: ing.amount, unit: ing.unit || "" });
          }
        });
      });
    const grouped = {};
    CATEGORIES.forEach((c) => (grouped[c] = []));
    Object.values(items).forEach((item) => {
      const cat = CATEGORIES.includes(item.category) ? item.category : "other";
      grouped[cat].push(item);
    });
    CATEGORIES.forEach((c) => grouped[c].sort((x, y) => x.name.localeCompare(y.name)));
    return grouped;
  };

  const toggleChecked = (name) => {
    const nextChecked = { ...checked, [name]: !checked[name] };
    setChecked(nextChecked);
    persist({ checked: nextChecked });
  };

  const clearChecked = () => {
    setChecked({});
    persist({ checked: {} });
  };

  const fmtAmount = (amounts) => {
    if (!amounts.length) return "";
    return amounts
      .map((x) => `${Math.round(x.amount * 100) / 100}${x.unit ? " " + x.unit : ""}`)
      .join(" + ");
  };

  // ---- Small shared styles ----
  const inputStyle = {
    boxSizing: "border-box",
    padding: 10,
    border: `1.5px solid ${INK}`,
    background: "#fff",
    fontSize: 14,
    fontFamily: "inherit",
  };
  const labelStyle = { fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 };
  const smallLabel = { fontSize: 10, fontWeight: 700, textTransform: "uppercase" };
  const sectionHead = {
    fontWeight: 900,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1.5,
    background: INK,
    color: PAPER,
    padding: "5px 10px",
  };
  const bigButton = (bg, disabled) => ({
    width: "100%",
    padding: "14px 0",
    background: disabled ? "#777" : bg,
    color: "#fff",
    border: "none",
    fontWeight: 900,
    fontSize: 15,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    cursor: disabled ? "wait" : "pointer",
    fontFamily: "inherit",
  });

  // ---- Progress bar ----
  const Bar = ({ value, target }) => {
    const p = pct(value, target);
    const over = p > 100;
    return (
      <div style={{ height: 5, background: RULE, marginTop: 3 }}>
        <div
          style={{
            height: "100%",
            width: `${Math.min(p, 100)}%`,
            background: over ? RED : GREEN,
            transition: "width 0.3s",
          }}
        />
      </div>
    );
  };

  const MacroRow = ({ label, value, target, unit, color, estimated }) => {
    const p = pct(value, target);
    return (
      <div style={{ padding: "6px 0", borderBottom: `1px solid ${RULE}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
          <span style={{ fontWeight: 700, color: color || INK }}>
            {label}
            {estimated && <span style={{ fontWeight: 400, fontSize: 10, color: "#888" }}> (est. target)</span>}
          </span>
          <span style={{ fontWeight: 700 }}>
            {value}{unit} / {target}{unit}
            <span style={{ color: p > 100 ? RED : "#555", marginLeft: 6, fontSize: 12 }}>{p}%</span>
          </span>
        </div>
        <Bar value={value} target={target} />
      </div>
    );
  };

  // ---- Nutrition label ----
  const MacroLabel = ({ macros, servings }) => (
    <div style={{ border: `1.5px solid ${INK}`, padding: "8px 10px", background: "#fff", minWidth: 180 }}>
      <div style={{ fontWeight: 900, fontSize: 20, letterSpacing: -0.5, borderBottom: `8px solid ${INK}`, paddingBottom: 4 }}>
        Per Serving
      </div>
      <div style={{ fontSize: 11, borderBottom: `4px solid ${INK}`, padding: "3px 0" }}>
        Makes {servings || "?"} servings
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderBottom: `4px solid ${INK}`, padding: "4px 0" }}>
        <span style={{ fontWeight: 900, fontSize: 14 }}>Calories</span>
        <span style={{ fontWeight: 900, fontSize: 24 }}>{Math.round(macros?.calories ?? 0)}</span>
      </div>
      {[
        ["Protein", macros?.protein_g, GREEN],
        ["Carbs", macros?.carbs_g, INK],
        ["Fat", macros?.fat_g, INK],
      ].map(([label, val, color], i) => (
        <div key={label} style={{ display: "flex", justifyContent: "space-between", borderBottom: i === 2 ? "none" : `1px solid ${INK}`, padding: "3px 0", fontSize: 13 }}>
          <span style={{ fontWeight: 700, color }}>{label}</span>
          <span style={{ fontWeight: 700 }}>{Math.round(val ?? 0)}g</span>
        </div>
      ))}
    </div>
  );

  const grocery = buildGroceryList();
  const groceryCount = Object.values(grocery).reduce((n, arr) => n + arr.length, 0);

  const tabStyle = (id) => ({
    flex: 1,
    padding: "10px 2px",
    fontWeight: 900,
    fontSize: 10.5,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    background: tab === id ? INK : "transparent",
    color: tab === id ? PAPER : INK,
    border: "none",
    cursor: "pointer",
    fontFamily: "inherit",
  });

  const burnedToday = (sessions[viewDate] && sessions[viewDate].burned) || 0;
  const calRemaining = goals.calories - dayTotals.calories + burnedToday;
  const proteinRemaining = Math.max(0, goals.protein - dayTotals.protein);

  const TargetRow = ({ label, cal, note }) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: `1px solid ${RULE}` }}>
      <div>
        <div style={{ fontWeight: 700, fontSize: 13 }}>{label}</div>
        <div style={{ fontSize: 11, color: "#555" }}>{note}</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontWeight: 900, fontSize: 16 }}>{cal}</span>
        <button
          onClick={() => setCalorieGoal(cal)}
          style={{
            padding: "6px 10px", fontSize: 10, fontWeight: 900, textTransform: "uppercase",
            letterSpacing: 1, cursor: "pointer", fontFamily: "inherit",
            background: goals.calories === cal ? TINT : GREEN,
            color: goals.calories === cal ? GREEN : "#fff",
            border: `1.5px solid ${GREEN}`,
          }}
        >
          {goals.calories === cal ? "✓ Goal" : "Set as goal"}
        </button>
      </div>
    </div>
  );

  // ================= RENDER =================

  if (!sessionChecked) {
    return (
      <div style={{ minHeight: "100vh", background: PAPER, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Helvetica, Arial, sans-serif" }}>
        <div style={{ fontWeight: 900, fontSize: 18, color: INK }}>evansmeals</div>
      </div>
    );
  }

  if (!session) {
    return (
      <div style={{ minHeight: "100vh", background: PAPER, color: INK, fontFamily: "Helvetica, Arial, sans-serif" }}>
        <div style={{ maxWidth: 420, margin: "0 auto", padding: "60px 16px" }}>
          <div style={{ borderBottom: `8px solid ${INK}`, paddingBottom: 8 }}>
            <div style={{ fontSize: 40, fontWeight: 900, letterSpacing: -2, lineHeight: 1 }}>
              evansmeals
            </div>
            <div style={{ fontSize: 12, marginTop: 4, color: "#555" }}>
              Any recipe → macros → daily log
            </div>
          </div>

          <div style={{ border: `1.5px solid ${INK}`, borderTop: "none", background: "#fff", padding: 16 }}>
            <div style={{ display: "flex", marginBottom: 16, border: `1.5px solid ${INK}` }}>
              <button
                onClick={() => { setAuthMode("signin"); setAuthError(""); }}
                style={{
                  flex: 1, padding: "9px 0", fontWeight: 900, fontSize: 12, letterSpacing: 1,
                  textTransform: "uppercase", border: "none", cursor: "pointer", fontFamily: "inherit",
                  background: authMode === "signin" ? INK : "transparent",
                  color: authMode === "signin" ? PAPER : INK,
                }}
              >
                Sign in
              </button>
              <button
                onClick={() => { setAuthMode("signup"); setAuthError(""); }}
                style={{
                  flex: 1, padding: "9px 0", fontWeight: 900, fontSize: 12, letterSpacing: 1,
                  textTransform: "uppercase", border: "none", borderLeft: `1.5px solid ${INK}`,
                  cursor: "pointer", fontFamily: "inherit",
                  background: authMode === "signup" ? INK : "transparent",
                  color: authMode === "signup" ? PAPER : INK,
                }}
              >
                Create account
              </button>
            </div>

            <label style={labelStyle}>Email</label>
            <input
              type="email"
              value={authEmail}
              onChange={(e) => setAuthEmail(e.target.value)}
              placeholder="you@example.com"
              style={{ ...inputStyle, width: "100%", marginTop: 6, marginBottom: 12 }}
            />
            <label style={labelStyle}>Password</label>
            <input
              type="password"
              value={authPassword}
              onChange={(e) => setAuthPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !authLoading && handleAuth()}
              placeholder={authMode === "signup" ? "At least 6 characters" : "Your password"}
              style={{ ...inputStyle, width: "100%", marginTop: 6 }}
            />

            {authError && (
              <div style={{ marginTop: 12, padding: "8px 10px", border: `1.5px solid ${RED}`, color: RED, fontSize: 13, background: "#fff" }}>
                {authError}
              </div>
            )}

            <button onClick={handleAuth} disabled={authLoading} style={{ ...bigButton(GREEN, authLoading), marginTop: 14 }}>
              {authLoading
                ? "One moment..."
                : authMode === "signup"
                ? "Create my account"
                : "Sign in"}
            </button>

            <div style={{ fontSize: 11, color: "#555", marginTop: 12, lineHeight: 1.5 }}>
              Your recipes, log, and goals are private to your account and sync
              across all your devices.
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!dataLoaded) {
    return (
      <div style={{ minHeight: "100vh", background: PAPER, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Helvetica, Arial, sans-serif" }}>
        <div style={{ fontWeight: 900, fontSize: 15, color: INK }}>Loading your kitchen...</div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: PAPER, color: INK, fontFamily: "Helvetica, Arial, sans-serif" }}>
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "24px 16px 80px" }}>
        {/* Header */}
        <div style={{ borderBottom: `8px solid ${INK}`, paddingBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div>
            <div style={{ fontSize: 34, fontWeight: 900, letterSpacing: -1.5, lineHeight: 1 }}>
              evansmeals
            </div>
            <div style={{ fontSize: 12, marginTop: 4, color: "#555" }}>
              {session.user.email}
            </div>
          </div>
          <button
            onClick={signOut}
            style={{ background: "none", border: `1.5px solid ${INK}`, padding: "6px 10px", fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: 1, cursor: "pointer", fontFamily: "inherit" }}
          >
            Sign out
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", border: `1.5px solid ${INK}`, borderTop: "none", marginBottom: 24, background: "#fff" }}>
          <button onClick={() => setTab("import")} style={{ ...tabStyle("import"), borderRight: `1.5px solid ${INK}` }}>
            Import
          </button>
          <button onClick={() => setTab("recipes")} style={{ ...tabStyle("recipes"), borderRight: `1.5px solid ${INK}` }}>
            Recipes ({recipes.length})
          </button>
          <button onClick={() => setTab("log")} style={{ ...tabStyle("log"), borderRight: `1.5px solid ${INK}` }}>
            Log
          </button>
          <button onClick={() => setTab("workout")} style={{ ...tabStyle("workout"), borderRight: `1.5px solid ${INK}` }}>
            Workout
          </button>
          <button onClick={() => setTab("progress")} style={{ ...tabStyle("progress"), borderRight: `1.5px solid ${INK}` }}>
            Progress
          </button>
          <button onClick={() => setTab("grocery")} style={tabStyle("grocery")}>
            Grocery ({groceryCount})
          </button>
        </div>

        {/* ---- IMPORT ---- */}
        {tab === "import" && (
          <div>
            <div style={{ background: TINT, border: `1.5px solid ${GREEN}`, padding: "10px 12px", fontSize: 13, marginBottom: 16, lineHeight: 1.5 }}>
              <b>Import from anywhere:</b> paste a link to a YouTube, TikTok, or
              Instagram cooking video, or any recipe website. AI turns it into a
              full recipe with estimated macros and a grocery list.
            </div>
            <label style={labelStyle}>Video or recipe link</label>
            <input
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !loading && importVideo()}
              placeholder="YouTube, TikTok, Instagram, or recipe site URL..."
              style={{ ...inputStyle, width: "100%", marginTop: 6 }}
            />
            {error && (
              <div style={{ marginTop: 10, padding: "8px 10px", border: `1.5px solid ${RED}`, color: RED, fontSize: 13, background: "#fff" }}>
                {error}
              </div>
            )}
            <button onClick={importVideo} disabled={loading} style={{ ...bigButton(GREEN, loading), marginTop: 14 }}>
              {loading ? "Reading the recipe..." : "Import recipe"}
            </button>

            <div style={{ textAlign: "center", margin: "22px 0 14px", fontWeight: 900, fontSize: 12, letterSpacing: 2, color: "#888" }}>
              — OR —
            </div>
            <div style={{ border: `1.5px solid ${INK}`, background: "#fff", padding: 12 }}>
              <div style={{ fontWeight: 900, fontSize: 13, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
                Write your own recipe
              </div>
              <textarea
                value={writeText}
                onChange={(e) => setWriteText(e.target.value)}
                placeholder={"Type or paste your recipe in plain words - ingredients and steps.\n\ne.g. \"Grandma's chicken soup: 1 whole chicken, 2 carrots, 2 celery stalks, 1 onion... Boil the chicken for an hour, then...\""}
                rows={7}
                style={{ ...inputStyle, width: "100%", resize: "vertical" }}
              />
              {writeError && (
                <div style={{ marginTop: 10, padding: "8px 10px", border: `1.5px solid ${RED}`, color: RED, fontSize: 13, background: "#fff" }}>
                  {writeError}
                </div>
              )}
              <button onClick={parseWritten} disabled={writeLoading} style={{ ...bigButton(INK, writeLoading), marginTop: 10, fontSize: 13 }}>
                {writeLoading ? "Structuring your recipe..." : "Save to my recipes"}
              </button>
              <div style={{ fontSize: 11, color: "#555", marginTop: 8 }}>
                AI will structure it, estimate the macros, and file the ingredients
                for your grocery list. You can edit everything afterwards.
              </div>
            </div>

            <div style={{ textAlign: "center", margin: "22px 0 14px", fontWeight: 900, fontSize: 12, letterSpacing: 2, color: "#888" }}>
              — OR —
            </div>
            {/* Photo section */}
            <div style={{ border: `1.5px solid ${INK}`, background: "#fff", padding: 12 }}>
                <div style={{ fontWeight: 900, fontSize: 13, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>
                  📷 Snap or upload a photo
                </div>
                <div style={{ fontSize: 12, color: "#555", marginBottom: 8, lineHeight: 1.4 }}>
                  A plate of food to log, or a recipe to save - cookbook page,
                  recipe card, screenshot, or a dish you want the recipe for.
                </div>
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handlePhotoSelect}
                  style={{ display: "none" }}
                />
                <input
                  ref={galleryInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoSelect}
                  style={{ display: "none" }}
                />

                {!photoData ? (
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={() => cameraInputRef.current && cameraInputRef.current.click()}
                      style={{
                        flex: 1, padding: "12px 0", background: "#fff", color: INK,
                        border: `1.5px dashed ${INK}`, fontWeight: 900, fontSize: 12, letterSpacing: 1,
                        textTransform: "uppercase", cursor: "pointer", fontFamily: "inherit",
                      }}
                    >
                      📷 Take photo
                    </button>
                    <button
                      onClick={() => galleryInputRef.current && galleryInputRef.current.click()}
                      style={{
                        flex: 1, padding: "12px 0", background: "#fff", color: INK,
                        border: `1.5px dashed ${INK}`, fontWeight: 900, fontSize: 12, letterSpacing: 1,
                        textTransform: "uppercase", cursor: "pointer", fontFamily: "inherit",
                      }}
                    >
                      🖼 Upload photo
                    </button>
                  </div>
                ) : (
                  <div>
                    <img
                      src={photoData}
                      alt="Your photo"
                      style={{ width: "100%", maxHeight: 220, objectFit: "cover", border: `1.5px solid ${INK}` }}
                    />
                    <div style={{ fontSize: 12, fontWeight: 700, margin: "8px 0 4px" }}>
                      What would you like to do with this photo?
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase" }}>If logging:</span>
                      <select
                        value={manualMeal}
                        onChange={(e) => setManualMeal(e.target.value)}
                        style={{ ...inputStyle, flex: 1, padding: 7, fontSize: 13 }}
                      >
                        {MEALS.map((m) => (
                          <option key={m} value={m}>{MEAL_LABELS[m]}</option>
                        ))}
                      </select>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button
                        onClick={photoAsMeal}
                        disabled={!!photoBusy}
                        style={{
                          flex: 1, minWidth: 140, padding: "10px 4px",
                          background: photoBusy === "meal" ? "#777" : INK, color: "#fff",
                          border: "none", fontWeight: 900, fontSize: 11, letterSpacing: 0.5,
                          textTransform: "uppercase", cursor: photoBusy ? "wait" : "pointer", fontFamily: "inherit",
                        }}
                      >
                        {photoBusy === "meal" ? "Analyzing..." : `Log as ${MEAL_LABELS[manualMeal]}`}
                      </button>
                      <button
                        onClick={() => photoAsRecipe(false)}
                        disabled={!!photoBusy}
                        style={{
                          flex: 1, minWidth: 140, padding: "10px 4px",
                          background: photoBusy === "recipe" ? "#777" : GREEN, color: "#fff",
                          border: "none", fontWeight: 900, fontSize: 11, letterSpacing: 0.5,
                          textTransform: "uppercase", cursor: photoBusy ? "wait" : "pointer", fontFamily: "inherit",
                        }}
                      >
                        {photoBusy === "recipe" ? "Reading recipe..." : "Save as recipe"}
                      </button>
                      <button
                        onClick={() => photoAsRecipe(true)}
                        disabled={!!photoBusy}
                        style={{
                          flex: 1, minWidth: 140, padding: "10px 4px",
                          background: photoBusy === "both" ? "#777" : "#fff",
                          color: photoBusy === "both" ? "#fff" : GREEN,
                          border: `1.5px solid ${GREEN}`, fontWeight: 900, fontSize: 11, letterSpacing: 0.5,
                          textTransform: "uppercase", cursor: photoBusy ? "wait" : "pointer", fontFamily: "inherit",
                        }}
                      >
                        {photoBusy === "both" ? "Working..." : "Save + log 1 serving"}
                      </button>
                    </div>
                    <button
                      onClick={() => setPhotoData(null)}
                      disabled={!!photoBusy}
                      style={{
                        marginTop: 8, width: "100%", padding: "8px 0", background: "#fff", color: INK,
                        border: `1.5px solid ${INK}`, fontWeight: 900, fontSize: 11, letterSpacing: 1,
                        textTransform: "uppercase", cursor: "pointer", fontFamily: "inherit",
                      }}
                    >
                      Choose a different photo
                    </button>
                  </div>
                )}
                {photoError && (
                  <div style={{ marginTop: 8, padding: "8px 10px", border: `1.5px solid ${RED}`, color: RED, fontSize: 13, background: "#fff" }}>
                    {photoError}
                  </div>
                )}
                <div style={{ fontSize: 11, color: "#555", marginTop: 8, lineHeight: 1.4 }}>
                  Meal photo estimates are rough (±25%) since portion sizes are hard
                  to judge from one angle. Recipe photos work best when the text is
                  clear and well-lit.
                </div>
            </div>
          </div>
        )}

        {/* ---- RECIPES ---- */}
        {tab === "recipes" && (
          <div>
            {recipes.length === 0 && (
              <div style={{ textAlign: "center", padding: "48px 16px", border: `1.5px dashed ${RULE}`, fontSize: 14, color: "#666" }}>
                No recipes yet. Head to <b>Import</b> to paste a link or write your own.
              </div>
            )}
            {recipes.map((r) => {
              const isOpen = expanded === r.id;
              const inList = selected.includes(r.id);
              const showLogPanel = logPanel === r.id;
              const isEditing = editingId === r.id;
              return (
                <div key={r.id} style={{ border: `1.5px solid ${INK}`, background: "#fff", marginBottom: 16 }}>
                  <div
                    style={{ padding: "12px 14px", display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start", cursor: "pointer" }}
                    onClick={() => setExpanded(isOpen ? null : r.id)}
                  >
                    <div>
                      <div style={{ fontWeight: 900, fontSize: 17, letterSpacing: -0.3 }}>{r.title}</div>
                      <div style={{ fontSize: 12, color: "#555", marginTop: 2 }}>
                        {Math.round(r.perServing?.calories ?? 0)} cal · {Math.round(r.perServing?.protein_g ?? 0)}g protein
                        {r.prepMinutes ? ` · ${r.prepMinutes} min` : ""}
                      </div>
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 900 }}>{isOpen ? "–" : "+"}</div>
                  </div>

                  {isOpen && !isEditing && (
                    <div style={{ borderTop: `1.5px solid ${INK}`, padding: 14 }}>
                      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                        <MacroLabel macros={r.perServing} servings={r.servings} />
                        <div style={{ flex: 1, minWidth: 200 }}>
                          <div style={{ fontWeight: 900, fontSize: 12, textTransform: "uppercase", letterSpacing: 1, borderBottom: `3px solid ${INK}`, paddingBottom: 3, marginBottom: 6 }}>
                            Ingredients
                          </div>
                          {(r.ingredients || []).map((ing, i) => (
                            <div key={i} style={{ fontSize: 13, padding: "3px 0", borderBottom: `1px solid ${RULE}` }}>
                              {ing.amount ? `${ing.amount}${ing.unit ? " " + ing.unit : ""} ` : ""}
                              {ing.name}
                            </div>
                          ))}
                        </div>
                      </div>

                      <div style={{ fontWeight: 900, fontSize: 12, textTransform: "uppercase", letterSpacing: 1, borderBottom: `3px solid ${INK}`, paddingBottom: 3, margin: "16px 0 6px" }}>
                        Steps
                      </div>
                      {(r.steps || []).map((s, i) => (
                        <div key={i} style={{ display: "flex", gap: 10, fontSize: 13, padding: "5px 0", lineHeight: 1.5 }}>
                          <span style={{ fontWeight: 900, color: GREEN }}>{i + 1}</span>
                          <span>{s}</span>
                        </div>
                      ))}
                      {r.source && (
                        <div style={{ fontSize: 12, marginTop: 10, wordBreak: "break-all" }}>
                          <a href={r.source} target="_blank" rel="noreferrer" style={{ color: GREEN }}>
                            View the original source
                          </a>
                        </div>
                      )}

                      <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
                        <button
                          onClick={() => openLogPanel(r.id)}
                          style={{
                            flex: 1, minWidth: 110, padding: "10px 0", fontWeight: 900, fontSize: 12,
                            letterSpacing: 1, textTransform: "uppercase", cursor: "pointer", fontFamily: "inherit",
                            background: INK, color: "#fff", border: `1.5px solid ${INK}`,
                          }}
                        >
                          {showLogPanel ? "Close" : "Log meal"}
                        </button>
                        <button
                          onClick={() => startEdit(r)}
                          style={{
                            flex: 1, minWidth: 90, padding: "10px 0", fontWeight: 900, fontSize: 12,
                            letterSpacing: 1, textTransform: "uppercase", cursor: "pointer", fontFamily: "inherit",
                            background: "#fff", color: INK, border: `1.5px solid ${INK}`,
                          }}
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => toggleSelected(r.id)}
                          style={{
                            flex: 1, minWidth: 130, padding: "10px 0", fontWeight: 900, fontSize: 12,
                            letterSpacing: 1, textTransform: "uppercase", cursor: "pointer", fontFamily: "inherit",
                            background: inList ? TINT : GREEN, color: inList ? GREEN : "#fff",
                            border: `1.5px solid ${GREEN}`,
                          }}
                        >
                          {inList ? "✓ In grocery" : "Add to grocery"}
                        </button>
                        <button
                          onClick={() => deleteRecipe(r.id)}
                          style={{ padding: "10px 14px", background: "#fff", color: RED, border: `1.5px solid ${RED}`, fontWeight: 900, fontSize: 12, textTransform: "uppercase", letterSpacing: 1, cursor: "pointer", fontFamily: "inherit" }}
                        >
                          Delete
                        </button>
                      </div>

                      {showLogPanel && (
                        <div style={{ marginTop: 12, border: `1.5px solid ${INK}`, background: TINT, padding: 12 }}>
                          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                            <div style={{ flex: 1, minWidth: 130 }}>
                              <label style={labelStyle}>Date</label>
                              <input
                                type="date"
                                value={logForm.date}
                                onChange={(e) => setLogForm({ ...logForm, date: e.target.value })}
                                style={{ ...inputStyle, width: "100%", marginTop: 4 }}
                              />
                            </div>
                            <div style={{ flex: 1, minWidth: 120 }}>
                              <label style={labelStyle}>Meal</label>
                              <select
                                value={logForm.mealType}
                                onChange={(e) => setLogForm({ ...logForm, mealType: e.target.value })}
                                style={{ ...inputStyle, width: "100%", marginTop: 4 }}
                              >
                                {MEALS.map((m) => (
                                  <option key={m} value={m}>{MEAL_LABELS[m]}</option>
                                ))}
                              </select>
                            </div>
                            <div style={{ width: 100 }}>
                              <label style={labelStyle}>Servings</label>
                              <input
                                type="number"
                                min="0.25"
                                step="0.25"
                                value={logForm.servings}
                                onChange={(e) => setLogForm({ ...logForm, servings: e.target.value })}
                                style={{ ...inputStyle, width: "100%", marginTop: 4 }}
                              />
                            </div>
                          </div>
                          <div style={{ fontSize: 12, marginTop: 8, color: "#555" }}>
                            = {Math.round((r.perServing?.calories ?? 0) * (Number(logForm.servings) || 1))} cal,{" "}
                            {Math.round((r.perServing?.protein_g ?? 0) * (Number(logForm.servings) || 1))}g protein
                          </div>
                          <button
                            onClick={() => logRecipe(r)}
                            style={{
                              marginTop: 10, width: "100%", padding: "12px 0", background: GREEN, color: "#fff",
                              border: "none", fontWeight: 900, fontSize: 13, letterSpacing: 1.5,
                              textTransform: "uppercase", cursor: "pointer", fontFamily: "inherit",
                            }}
                          >
                            Log it
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ---- EDIT MODE ---- */}
                  {isOpen && isEditing && draft && (
                    <div style={{ borderTop: `1.5px solid ${INK}`, padding: 14, background: TINT }}>
                      <div style={{ fontWeight: 900, fontSize: 13, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>
                        Editing recipe
                      </div>

                      <label style={smallLabel}>Title</label>
                      <input
                        value={draft.title}
                        onChange={(e) => updateDraft("title", e.target.value)}
                        style={{ ...inputStyle, width: "100%", marginTop: 4, marginBottom: 10 }}
                      />

                      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                        <div style={{ flex: 1 }}>
                          <label style={smallLabel}>Servings</label>
                          <input
                            type="number"
                            value={draft.servings}
                            onChange={(e) => updateDraft("servings", e.target.value)}
                            style={{ ...inputStyle, width: "100%", marginTop: 4 }}
                          />
                        </div>
                        <div style={{ flex: 1 }}>
                          <label style={smallLabel}>Prep (min)</label>
                          <input
                            type="number"
                            value={draft.prepMinutes}
                            onChange={(e) => updateDraft("prepMinutes", e.target.value)}
                            style={{ ...inputStyle, width: "100%", marginTop: 4 }}
                          />
                        </div>
                      </div>

                      <label style={smallLabel}>Per-serving macros</label>
                      <div style={{ display: "flex", gap: 8, marginTop: 4, marginBottom: 12, flexWrap: "wrap" }}>
                        {[
                          ["calories", "Cal"],
                          ["protein_g", "Protein g"],
                          ["carbs_g", "Carbs g"],
                          ["fat_g", "Fat g"],
                        ].map(([field, label]) => (
                          <div key={field} style={{ flex: 1, minWidth: 70 }}>
                            <label style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", color: "#555" }}>{label}</label>
                            <input
                              type="number"
                              value={draft[field]}
                              onChange={(e) => updateDraft(field, e.target.value)}
                              style={{ ...inputStyle, width: "100%", padding: 7, fontSize: 13 }}
                            />
                          </div>
                        ))}
                      </div>

                      <label style={smallLabel}>Ingredients</label>
                      {draft.ingredients.map((ing, i) => (
                        <div key={i} style={{ display: "flex", gap: 6, marginTop: 6, alignItems: "center" }}>
                          <input
                            type="number"
                            value={ing.amount}
                            onChange={(e) => updateDraftIng(i, "amount", e.target.value)}
                            placeholder="#"
                            style={{ ...inputStyle, width: 62, padding: 7, fontSize: 13 }}
                          />
                          <input
                            value={ing.unit}
                            onChange={(e) => updateDraftIng(i, "unit", e.target.value)}
                            placeholder="unit"
                            style={{ ...inputStyle, width: 62, padding: 7, fontSize: 13 }}
                          />
                          <input
                            value={ing.name}
                            onChange={(e) => updateDraftIng(i, "name", e.target.value)}
                            placeholder="ingredient"
                            style={{ ...inputStyle, flex: 1, padding: 7, fontSize: 13 }}
                          />
                          <select
                            value={ing.category}
                            onChange={(e) => updateDraftIng(i, "category", e.target.value)}
                            style={{ ...inputStyle, width: 92, padding: 7, fontSize: 12 }}
                          >
                            {CATEGORIES.map((c) => (
                              <option key={c} value={c}>{c}</option>
                            ))}
                          </select>
                          <button
                            onClick={() => removeDraftIng(i)}
                            style={{ background: "none", border: "none", color: RED, fontWeight: 900, fontSize: 16, cursor: "pointer", fontFamily: "inherit" }}
                            title="Remove ingredient"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                      <button
                        onClick={addDraftIng}
                        style={{ marginTop: 8, background: "#fff", border: `1.5px dashed ${INK}`, padding: "8px 12px", fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: 1, cursor: "pointer", fontFamily: "inherit", width: "100%" }}
                      >
                        + Add ingredient
                      </button>

                      <div style={{ marginTop: 12 }}>
                        <label style={smallLabel}>Steps (one per line)</label>
                        <textarea
                          value={draft.stepsText}
                          onChange={(e) => updateDraft("stepsText", e.target.value)}
                          rows={Math.max(4, draft.stepsText.split("\n").length + 1)}
                          style={{ ...inputStyle, width: "100%", marginTop: 4, resize: "vertical", lineHeight: 1.5 }}
                        />
                      </div>

                      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                        <button
                          onClick={saveEdit}
                          style={{
                            flex: 2, padding: "12px 0", background: GREEN, color: "#fff", border: "none",
                            fontWeight: 900, fontSize: 13, letterSpacing: 1.5, textTransform: "uppercase",
                            cursor: "pointer", fontFamily: "inherit",
                          }}
                        >
                          Save changes
                        </button>
                        <button
                          onClick={cancelEdit}
                          style={{
                            flex: 1, padding: "12px 0", background: "#fff", color: INK, border: `1.5px solid ${INK}`,
                            fontWeight: 900, fontSize: 13, letterSpacing: 1.5, textTransform: "uppercase",
                            cursor: "pointer", fontFamily: "inherit",
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ---- LOG ---- */}
        {tab === "log" && (
          <div>
            {/* Date navigator */}
            <div style={{ display: "flex", alignItems: "stretch", border: `1.5px solid ${INK}`, background: "#fff", marginBottom: 16 }}>
              <button
                onClick={() => setViewDate(shiftDate(viewDate, -1))}
                style={{ padding: "10px 16px", border: "none", borderRight: `1.5px solid ${INK}`, background: "transparent", fontWeight: 900, fontSize: 16, cursor: "pointer", fontFamily: "inherit" }}
              >
                ‹
              </button>
              <div style={{ flex: 1, textAlign: "center", padding: "10px 4px", fontWeight: 900, fontSize: 15 }}>
                {prettyDate(viewDate)}
                {viewDate !== todayStr() && (
                  <button
                    onClick={() => setViewDate(todayStr())}
                    style={{ marginLeft: 10, fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: 1, background: TINT, border: `1px solid ${GREEN}`, color: GREEN, padding: "2px 6px", cursor: "pointer", fontFamily: "inherit" }}
                  >
                    Today
                  </button>
                )}
              </div>
              <button
                onClick={() => setViewDate(shiftDate(viewDate, 1))}
                style={{ padding: "10px 16px", border: "none", borderLeft: `1.5px solid ${INK}`, background: "transparent", fontWeight: 900, fontSize: 16, cursor: "pointer", fontFamily: "inherit" }}
              >
                ›
              </button>
            </div>

            {/* Day totals with percentages */}
            <div style={{ border: `1.5px solid ${INK}`, background: "#fff", padding: "10px 12px", marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderBottom: `6px solid ${INK}`, paddingBottom: 6 }}>
                <span style={{ fontWeight: 900, fontSize: 16 }}>Day total</span>
                <span style={{ fontWeight: 900, fontSize: 26 }}>
                  {pct(dayTotals.calories, goals.calories)}
                  <span style={{ fontSize: 14 }}>%</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#555" }}> of goal</span>
                </span>
              </div>
              <MacroRow label="Calories" value={dayTotals.calories} target={goals.calories} unit="" />
              <MacroRow label="Protein" value={dayTotals.protein} target={goals.protein} unit="g" color={GREEN} />
              <MacroRow label="Carbs" value={dayTotals.carbs} target={carbTarget} unit="g" estimated />
              <div style={{ borderBottom: "none" }}>
                <MacroRow label="Fat" value={dayTotals.fat} target={fatTarget} unit="g" estimated />
              </div>
              <div style={{ fontSize: 12, marginTop: 8, padding: "6px 8px", background: calRemaining >= 0 ? TINT : "#FDECEA", border: `1px solid ${calRemaining >= 0 ? GREEN : RED}`, color: calRemaining >= 0 ? GREEN : RED, fontWeight: 700 }}>
                {calRemaining >= 0
                  ? `${calRemaining} calories left today`
                  : `${Math.abs(calRemaining)} calories over target`}
                {burnedToday > 0 && ` (incl. ${burnedToday} burned in your workout 🔥)`}
              </div>
            </div>

            {/* ---- WHAT SHOULD I EAT? ---- */}
            <button
              onClick={() => setSuggestOpen(!suggestOpen)}
              style={{
                width: "100%", padding: "12px 0", background: suggestOpen ? GREEN : "#fff",
                color: suggestOpen ? "#fff" : GREEN, border: `1.5px solid ${GREEN}`,
                fontWeight: 900, fontSize: 13, letterSpacing: 1.5, textTransform: "uppercase",
                cursor: "pointer", fontFamily: "inherit", marginBottom: suggestOpen ? 0 : 16,
              }}
            >
              {suggestOpen ? "▲ Hide suggestions" : "🍽 What should I eat?"}
            </button>

            {suggestOpen && (
              <div style={{ border: `1.5px solid ${GREEN}`, borderTop: "none", background: "#fff", padding: 12, marginBottom: 16 }}>
                <div style={{ fontSize: 13, marginBottom: 10, lineHeight: 1.5 }}>
                  You have <b>{calRemaining} cal</b> and <b>{proteinRemaining}g protein</b> left
                  for {prettyDate(viewDate).toLowerCase()}. Pick which meal you're planning:
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <select
                    value={suggestMeal}
                    onChange={(e) => setSuggestMeal(e.target.value)}
                    style={{ ...inputStyle, flex: 1 }}
                  >
                    {MEALS.map((m) => (
                      <option key={m} value={m}>{MEAL_LABELS[m]}</option>
                    ))}
                  </select>
                  <button
                    onClick={getSuggestions}
                    disabled={suggestLoading}
                    style={{
                      flex: 2, padding: "10px 0", background: suggestLoading ? "#777" : GREEN, color: "#fff",
                      border: "none", fontWeight: 900, fontSize: 13, letterSpacing: 1, textTransform: "uppercase",
                      cursor: suggestLoading ? "wait" : "pointer", fontFamily: "inherit",
                    }}
                  >
                    {suggestLoading ? "Thinking..." : "Get suggestions"}
                  </button>
                </div>

                {suggestError && (
                  <div style={{ marginTop: 10, padding: "8px 10px", border: `1.5px solid ${RED}`, color: RED, fontSize: 13, background: "#fff" }}>
                    {suggestError}
                  </div>
                )}

                {suggestions.map((s, i) => (
                  <div key={i} style={{ marginTop: 10, border: `1.5px solid ${INK}`, padding: "10px 12px" }}>
                    <div style={{ fontWeight: 900, fontSize: 14 }}>{s.title}</div>
                    <div style={{ fontSize: 12, color: "#555", margin: "3px 0 6px", lineHeight: 1.4 }}>
                      {s.detail}
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                      <div style={{ fontSize: 12, fontWeight: 700 }}>
                        {Math.round(s.calories)} cal · {Math.round(s.protein_g)}g P · {Math.round(s.carbs_g)}g C · {Math.round(s.fat_g)}g F
                      </div>
                      <button
                        onClick={() => logSuggestion(s)}
                        style={{
                          padding: "6px 12px", fontSize: 10, fontWeight: 900, textTransform: "uppercase",
                          letterSpacing: 1, cursor: "pointer", fontFamily: "inherit",
                          background: GREEN, color: "#fff", border: `1.5px solid ${GREEN}`,
                        }}
                      >
                        Log it
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Meals */}
            {MEALS.map((m) => {
              const entries = dayEntries.filter((e) => e.mealType === m);
              if (entries.length === 0) return null;
              return (
                <div key={m} style={{ marginBottom: 14 }}>
                  <div style={sectionHead}>{MEAL_LABELS[m]}</div>
                  <div style={{ border: `1.5px solid ${INK}`, borderTop: "none", background: "#fff" }}>
                    {entries.map((e) => (
                      <div key={e.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "9px 10px", borderBottom: `1px solid ${RULE}` }}>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 700 }}>
                            {e.title}
                            {e.servings !== 1 ? ` ×${e.servings}` : ""}
                          </div>
                          <div style={{ fontSize: 12, color: "#555" }}>
                            {e.calories} cal · {e.protein_g}g protein · {e.carbs_g}g carbs · {e.fat_g}g fat
                          </div>
                        </div>
                        <button
                          onClick={() => deleteEntry(e.id)}
                          style={{ background: "none", border: "none", color: RED, fontWeight: 900, fontSize: 16, cursor: "pointer", fontFamily: "inherit" }}
                          title="Remove entry"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
            {dayEntries.length === 0 && (
              <div style={{ textAlign: "center", padding: "28px 16px", border: `1.5px dashed ${RULE}`, fontSize: 14, color: "#666", marginBottom: 14 }}>
                Nothing logged for {prettyDate(viewDate).toLowerCase()} yet.
              </div>
            )}

            {/* Manual + photo meal entry */}
            <div style={{ border: `1.5px solid ${INK}`, background: TINT, padding: 12, marginBottom: 16 }}>
              <div style={{ fontWeight: 900, fontSize: 13, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
                Log a meal by describing it
              </div>
              <textarea
                value={manualText}
                onChange={(e) => setManualText(e.target.value)}
                placeholder={'e.g. "6 oz filet, mashed potatoes, house salad, 12 fl oz coca cola"'}
                rows={2}
                style={{ ...inputStyle, width: "100%", resize: "vertical" }}
              />
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <select
                  value={manualMeal}
                  onChange={(e) => setManualMeal(e.target.value)}
                  style={{ ...inputStyle, flex: 1 }}
                >
                  {MEALS.map((m) => (
                    <option key={m} value={m}>{MEAL_LABELS[m]}</option>
                  ))}
                </select>
                <button
                  onClick={logManualMeal}
                  disabled={manualLoading}
                  style={{
                    flex: 2, padding: "10px 0", background: manualLoading ? "#777" : GREEN, color: "#fff",
                    border: "none", fontWeight: 900, fontSize: 13, letterSpacing: 1, textTransform: "uppercase",
                    cursor: manualLoading ? "wait" : "pointer", fontFamily: "inherit",
                  }}
                >
                  {manualLoading ? "Estimating..." : `Estimate & log to ${prettyDate(viewDate)}`}
                </button>
              </div>
              {manualError && (
                <div style={{ marginTop: 8, padding: "8px 10px", border: `1.5px solid ${RED}`, color: RED, fontSize: 13, background: "#fff" }}>
                  {manualError}
                </div>
              )}
            </div>

            {/* Stats + goals */}
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
              <div style={{ flex: 1, minWidth: 160, border: `1.5px solid ${INK}`, background: "#fff", padding: "10px 12px" }}>
                <div style={{ fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: 1, borderBottom: `3px solid ${INK}`, paddingBottom: 3, marginBottom: 6 }}>
                  Your average
                </div>
                <div style={{ fontSize: 24, fontWeight: 900 }}>
                  {avgCalories}
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#555" }}> cal/day</span>
                </div>
                <div style={{ fontSize: 12, color: "#555", marginTop: 2 }}>
                  across {loggedDays} completed day{loggedDays === 1 ? "" : "s"}
                  {loggedDays > 0 && (
                    <span style={{ fontWeight: 700, color: avgCalories <= goals.calories ? GREEN : RED }}>
                      {" "}· {avgCalories <= goals.calories ? "on track" : "over goal"}
                    </span>
                  )}
                </div>
              </div>
              <div style={{ flex: 1, minWidth: 160, border: `1.5px solid ${INK}`, background: "#fff", padding: "10px 12px" }}>
                <div style={{ fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: 1, borderBottom: `3px solid ${INK}`, paddingBottom: 3, marginBottom: 6 }}>
                  Daily goals
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <label style={smallLabel}>Calories</label>
                    <input
                      type="number"
                      value={goals.calories}
                      onChange={(e) => updateGoals("calories", e.target.value)}
                      style={{ ...inputStyle, width: "100%", padding: 6, fontSize: 13 }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={smallLabel}>Protein (g)</label>
                    <input
                      type="number"
                      value={goals.protein}
                      onChange={(e) => updateGoals("protein", e.target.value)}
                      style={{ ...inputStyle, width: "100%", padding: 6, fontSize: 13 }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* ---- TDEE CALCULATOR ---- */}
            <button
              onClick={() => setShowCalc(!showCalc)}
              style={{
                width: "100%", padding: "12px 0", background: showCalc ? INK : "#fff", color: showCalc ? PAPER : INK,
                border: `1.5px solid ${INK}`, fontWeight: 900, fontSize: 13, letterSpacing: 1.5,
                textTransform: "uppercase", cursor: "pointer", fontFamily: "inherit", marginBottom: showCalc ? 0 : 16,
              }}
            >
              {showCalc ? "▲ Hide calorie calculator" : "▼ Calculate my calorie target (TDEE)"}
            </button>

            {showCalc && (
              <div style={{ border: `1.5px solid ${INK}`, borderTop: "none", background: "#fff", padding: 14, marginBottom: 16 }}>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 110 }}>
                    <label style={smallLabel}>Gender</label>
                    <select
                      value={profile.gender}
                      onChange={(e) => updateProfile("gender", e.target.value)}
                      style={{ ...inputStyle, width: "100%", marginTop: 4 }}
                    >
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                    </select>
                  </div>
                  <div style={{ flex: 1, minWidth: 80 }}>
                    <label style={smallLabel}>Age</label>
                    <input
                      type="number"
                      value={profile.age}
                      onChange={(e) => updateProfile("age", e.target.value)}
                      placeholder="21"
                      style={{ ...inputStyle, width: "100%", marginTop: 4 }}
                    />
                  </div>
                  <div style={{ flex: 1, minWidth: 100 }}>
                    <label style={smallLabel}>Weight (lb)</label>
                    <input
                      type="number"
                      value={profile.weightLb}
                      onChange={(e) => updateProfile("weightLb", e.target.value)}
                      placeholder="180"
                      style={{ ...inputStyle, width: "100%", marginTop: 4 }}
                    />
                  </div>
                </div>
                <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
                  <div style={{ width: 90 }}>
                    <label style={smallLabel}>Height (ft)</label>
                    <input
                      type="number"
                      value={profile.heightFt}
                      onChange={(e) => updateProfile("heightFt", e.target.value)}
                      placeholder="5"
                      style={{ ...inputStyle, width: "100%", marginTop: 4 }}
                    />
                  </div>
                  <div style={{ width: 90 }}>
                    <label style={smallLabel}>+ (in)</label>
                    <input
                      type="number"
                      value={profile.heightIn}
                      onChange={(e) => updateProfile("heightIn", e.target.value)}
                      placeholder="11"
                      style={{ ...inputStyle, width: "100%", marginTop: 4 }}
                    />
                  </div>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <label style={smallLabel}>Daily activity</label>
                    <select
                      value={profile.activity}
                      onChange={(e) => updateProfile("activity", e.target.value)}
                      style={{ ...inputStyle, width: "100%", marginTop: 4 }}
                    >
                      {ACTIVITY_LEVELS.map((l) => (
                        <option key={l.key} value={l.key}>{l.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {profileComplete ? (
                  <div style={{ marginTop: 14 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", borderBottom: `6px solid ${INK}`, paddingBottom: 6 }}>
                      <span style={{ fontWeight: 900, fontSize: 14 }}>
                        BMR: {Math.round(bmr)} cal
                      </span>
                      <span style={{ fontWeight: 900, fontSize: 14 }}>
                        TDEE: {tdee} cal
                      </span>
                    </div>
                    <TargetRow label="Maintain weight" cal={tdee} note="Eat at your TDEE" />
                    <TargetRow label="Moderate fat loss" cal={tdee - 250} note="−250/day ≈ 0.5 lb/week" />
                    <TargetRow label="Fast fat loss" cal={tdee - 500} note="−500/day ≈ 1 lb/week" />
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "8px 0" }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>Protein suggestion</div>
                        <div style={{ fontSize: 11, color: "#555" }}>0.8g per lb of body weight</div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontWeight: 900, fontSize: 16 }}>{proteinSuggestion}g</span>
                        <button
                          onClick={() => setProteinGoal(proteinSuggestion)}
                          style={{
                            padding: "6px 10px", fontSize: 10, fontWeight: 900, textTransform: "uppercase",
                            letterSpacing: 1, cursor: "pointer", fontFamily: "inherit",
                            background: goals.protein === proteinSuggestion ? TINT : GREEN,
                            color: goals.protein === proteinSuggestion ? GREEN : "#fff",
                            border: `1.5px solid ${GREEN}`,
                          }}
                        >
                          {goals.protein === proteinSuggestion ? "✓ Goal" : "Set as goal"}
                        </button>
                      </div>
                    </div>
                    <div style={{ fontSize: 11, color: "#555", marginTop: 6, lineHeight: 1.5 }}>
                      Estimates from the Harris-Benedict equation. Real-world needs vary —
                      if your weight isn't trending the way you expect after 2-3 weeks of
                      consistent logging, adjust your target by 100-200 cal.
                    </div>
                  </div>
                ) : (
                  <div style={{ marginTop: 14, fontSize: 13, color: "#666", textAlign: "center", padding: "10px 0" }}>
                    Fill in age, weight, and height to see your numbers.
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ---- WORKOUT ---- */}
        {tab === "workout" && (
          <div>
            {/* Date navigator (shared current day with the Log tab) */}
            <div style={{ display: "flex", alignItems: "stretch", border: `1.5px solid ${INK}`, background: "#fff", marginBottom: 16 }}>
              <button
                onClick={() => setViewDate(shiftDate(viewDate, -1))}
                style={{ padding: "10px 16px", border: "none", borderRight: `1.5px solid ${INK}`, background: "transparent", fontWeight: 900, fontSize: 16, cursor: "pointer", fontFamily: "inherit" }}
              >
                ‹
              </button>
              <div style={{ flex: 1, textAlign: "center", padding: "10px 4px", fontWeight: 900, fontSize: 15 }}>
                {prettyDate(viewDate)}
                {viewDate !== todayStr() && (
                  <button
                    onClick={() => setViewDate(todayStr())}
                    style={{ marginLeft: 10, fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: 1, background: TINT, border: `1px solid ${GREEN}`, color: GREEN, padding: "2px 6px", cursor: "pointer", fontFamily: "inherit" }}
                  >
                    Today
                  </button>
                )}
              </div>
              <button
                onClick={() => setViewDate(shiftDate(viewDate, 1))}
                style={{ padding: "10px 16px", border: "none", borderLeft: `1.5px solid ${INK}`, background: "transparent", fontWeight: 900, fontSize: 16, cursor: "pointer", fontFamily: "inherit" }}
              >
                ›
              </button>
            </div>

            {/* Session timer */}
            <div style={{ border: `1.5px solid ${INK}`, background: "#fff", padding: "10px 12px", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              {!workoutSession && (
                <>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>Ready to train?</div>
                  <button
                    onClick={startWorkout}
                    style={{ padding: "10px 18px", background: GREEN, color: "#fff", border: "none", fontWeight: 900, fontSize: 12, letterSpacing: 1, textTransform: "uppercase", cursor: "pointer", fontFamily: "inherit" }}
                  >
                    ▶ Start workout
                  </button>
                </>
              )}
              {sessionRunning && (
                <>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: 1, color: GREEN }}>
                      Workout in progress
                    </div>
                    <div style={{ fontSize: 26, fontWeight: 900, fontVariantNumeric: "tabular-nums" }}>
                      {sessionElapsed}
                    </div>
                  </div>
                  <button
                    onClick={endWorkout}
                    disabled={burnLoading}
                    style={{ padding: "10px 18px", background: burnLoading ? "#777" : INK, color: "#fff", border: "none", fontWeight: 900, fontSize: 12, letterSpacing: 1, textTransform: "uppercase", cursor: burnLoading ? "wait" : "pointer", fontFamily: "inherit" }}
                  >
                    {burnLoading ? "Estimating burn..." : "■ Save & end"}
                  </button>
                </>
              )}
              {sessionDone && (
                <div style={{ fontSize: 13, fontWeight: 700 }}>
                  ✓ Workout complete — <span style={{ color: GREEN }}>{sessionElapsed}</span> ({Math.round((new Date(workoutSession.end).getTime() - new Date(workoutSession.start).getTime()) / 60000)} min
                  {workoutSession.burned ? ` · ~${workoutSession.burned} cal burned 🔥` : ""})
                </div>
              )}
            </div>

            {/* Add exercise */}
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <input
                value={newExercise}
                onChange={(e) => setNewExercise(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addExercise()}
                placeholder="Exercise name (e.g. Bench press)"
                style={{ ...inputStyle, flex: 1 }}
              />
              <button
                onClick={addExercise}
                style={{
                  padding: "0 18px", background: GREEN, color: "#fff", border: "none",
                  fontWeight: 900, fontSize: 13, letterSpacing: 1, textTransform: "uppercase",
                  cursor: "pointer", fontFamily: "inherit",
                }}
              >
                + Add
              </button>
            </div>

            {/* Templates */}
            {templates.length > 0 && dayWorkouts.length === 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
                  Or start from a template:
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {templates.map((t) => (
                    <div key={t.id} style={{ display: "flex", alignItems: "center", border: `1.5px solid ${GREEN}`, background: TINT }}>
                      <button
                        onClick={() => loadTemplate(t)}
                        style={{ padding: "8px 10px", background: "none", border: "none", fontWeight: 900, fontSize: 12, color: GREEN, cursor: "pointer", fontFamily: "inherit" }}
                      >
                        {t.name} ({t.exercises.length})
                      </button>
                      <button
                        onClick={() => deleteTemplate(t.id)}
                        style={{ padding: "8px 8px", background: "none", border: "none", color: RED, fontWeight: 900, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}
                        title="Delete template"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Day summary */}
            {dayWorkouts.length > 0 && (
              <div style={{ border: `1.5px solid ${INK}`, background: "#fff", padding: "8px 12px", marginBottom: 12, display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 700, flexWrap: "wrap", gap: 4 }}>
                <span>{dayWorkouts.length} exercise{dayWorkouts.length === 1 ? "" : "s"}</span>
                <span>{workoutTotals.sets} set{workoutTotals.sets === 1 ? "" : "s"}</span>
                <span>{workoutTotals.reps} reps</span>
                <span style={{ color: GREEN }}>{Math.round(workoutTotals.volume).toLocaleString()} lbs volume</span>
              </div>
            )}

            {/* Exercise "spreadsheet" */}
            {dayWorkouts.length === 0 ? (
              <div style={{ textAlign: "center", padding: "36px 16px", border: `1.5px dashed ${RULE}`, fontSize: 14, color: "#666", marginBottom: 12 }}>
                No exercises logged for {prettyDate(viewDate).toLowerCase()}. Add one above{templates.length > 0 ? " or load a template" : ""}.
              </div>
            ) : (
              <div style={{ border: `1.5px solid ${INK}`, background: "#fff", marginBottom: 12 }}>
                <div style={{ display: "flex", background: INK, color: PAPER, fontWeight: 900, fontSize: 11, textTransform: "uppercase", letterSpacing: 1 }}>
                  <div style={{ flex: 1, padding: "6px 10px" }}>Exercise</div>
                  <div style={{ width: 90, padding: "6px 4px", textAlign: "center" }}>Sets</div>
                  <div style={{ width: 34 }} />
                </div>
                {dayWorkouts.map((wk) => (
                  <div key={wk.id} style={{ borderTop: `1px solid ${RULE}` }}>
                    <div style={{ display: "flex", alignItems: "center" }}>
                      <div style={{ flex: 1, padding: "8px 10px", fontWeight: 700, fontSize: 14, wordBreak: "break-word" }}>
                        {wk.exercise}
                      </div>
                      <div style={{ width: 90, padding: "8px 4px", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                        <button
                          onClick={() => changeSets(wk.id, -1)}
                          style={{ width: 24, height: 24, background: "#fff", border: `1.5px solid ${INK}`, fontWeight: 900, fontSize: 14, cursor: "pointer", fontFamily: "inherit", lineHeight: 1 }}
                        >
                          −
                        </button>
                        <span style={{ fontWeight: 900, fontSize: 14, minWidth: 16, textAlign: "center" }}>
                          {wk.sets.length}
                        </span>
                        <button
                          onClick={() => changeSets(wk.id, 1)}
                          style={{ width: 24, height: 24, background: "#fff", border: `1.5px solid ${INK}`, fontWeight: 900, fontSize: 14, cursor: "pointer", fontFamily: "inherit", lineHeight: 1 }}
                        >
                          +
                        </button>
                      </div>
                      <div style={{ width: 34, textAlign: "center" }}>
                        <button
                          onClick={() => deleteExercise(wk.id)}
                          style={{ background: "none", border: "none", color: RED, fontWeight: 900, fontSize: 16, cursor: "pointer", fontFamily: "inherit" }}
                          title="Remove exercise"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                    <div style={{ padding: "0 10px 10px", display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {wk.sets.map((s, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 3, border: `1px solid ${RULE}`, padding: "4px 6px", background: PAPER }}>
                          <span style={{ fontSize: 9, fontWeight: 900, color: "#888" }}>{i + 1}</span>
                          <input
                            type="number"
                            min="0"
                            value={s.weight}
                            onChange={(e) => updateSet(wk.id, i, "weight", e.target.value)}
                            placeholder="lbs"
                            style={{ ...inputStyle, width: 52, padding: 5, fontSize: 13, textAlign: "center" }}
                          />
                          <span style={{ fontSize: 11, fontWeight: 700 }}>×</span>
                          <input
                            type="number"
                            min="0"
                            value={s.reps}
                            onChange={(e) => updateSet(wk.id, i, "reps", e.target.value)}
                            placeholder="reps"
                            style={{ ...inputStyle, width: 46, padding: 5, fontSize: 13, textAlign: "center" }}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Save as template */}
            {dayWorkouts.length > 0 && (
              <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                <input
                  value={newTemplateName}
                  onChange={(e) => setNewTemplateName(e.target.value)}
                  placeholder="Template name (e.g. Push day)"
                  style={{ ...inputStyle, flex: 1, padding: 8, fontSize: 13 }}
                />
                <button
                  onClick={saveTemplate}
                  style={{ padding: "0 14px", background: "#fff", color: INK, border: `1.5px solid ${INK}`, fontWeight: 900, fontSize: 11, letterSpacing: 1, textTransform: "uppercase", cursor: "pointer", fontFamily: "inherit" }}
                >
                  Save as template
                </button>
              </div>
            )}

            {/* Progress chart */}
            <button
              onClick={() => setProgressOpen(!progressOpen)}
              style={{
                width: "100%", padding: "12px 0", background: progressOpen ? GREEN : "#fff",
                color: progressOpen ? "#fff" : GREEN, border: `1.5px solid ${GREEN}`,
                fontWeight: 900, fontSize: 13, letterSpacing: 1.5, textTransform: "uppercase",
                cursor: "pointer", fontFamily: "inherit", marginBottom: progressOpen ? 0 : 12,
              }}
            >
              {progressOpen ? "▲ Hide progress" : "📈 My progress"}
            </button>

            {progressOpen && (
              <div style={{ border: `1.5px solid ${GREEN}`, borderTop: "none", background: "#fff", padding: 12, marginBottom: 12 }}>
                {exerciseNames.length === 0 ? (
                  <div style={{ fontSize: 13, color: "#666", textAlign: "center", padding: "10px 0" }}>
                    Log some exercises first, then track your progress here.
                  </div>
                ) : (
                  <div>
                    <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                      <select
                        value={progressExercise}
                        onChange={(e) => setProgressExercise(e.target.value)}
                        style={{ ...inputStyle, flex: 2, padding: 8, fontSize: 13 }}
                      >
                        <option value="">Choose an exercise...</option>
                        {exerciseNames.map((n) => (
                          <option key={n} value={n}>{n}</option>
                        ))}
                      </select>
                      <select
                        value={progressMetric}
                        onChange={(e) => setProgressMetric(e.target.value)}
                        style={{ ...inputStyle, flex: 1, padding: 8, fontSize: 13 }}
                      >
                        <option value="max">Est. 1-rep max</option>
                        <option value="volume">Total volume</option>
                      </select>
                    </div>

                    {!progressExercise ? (
                      <div style={{ fontSize: 13, color: "#666", textAlign: "center", padding: "10px 0" }}>
                        Pick an exercise to see its chart.
                      </div>
                    ) : progressSeries.length < 2 ? (
                      <div style={{ fontSize: 13, color: "#666", textAlign: "center", padding: "10px 0", lineHeight: 1.5 }}>
                        Log <b>{progressExercise}</b> with weights on at least 2 different
                        days and the chart will appear here.
                      </div>
                    ) : (
                      (() => {
                        const W = 320, H = 190, padL = 40, padR = 12, padT = 16, padB = 26;
                        const vals = progressSeries.map((p) => p.value);
                        let vMin = Math.min(...vals);
                        let vMax = Math.max(...vals);
                        if (vMin === vMax) { vMin -= 5; vMax += 5; }
                        const x = (i) => padL + (i * (W - padL - padR)) / (progressSeries.length - 1);
                        const y = (v) => padT + (1 - (v - vMin) / (vMax - vMin)) * (H - padT - padB);
                        const pts = progressSeries.map((p, i) => `${x(i)},${y(p.value)}`).join(" ");
                        const grid = [vMin, (vMin + vMax) / 2, vMax];
                        return (
                          <div>
                            <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", display: "block" }}>
                              {grid.map((g, gi) => (
                                <g key={gi}>
                                  <line x1={padL} y1={y(g)} x2={W - padR} y2={y(g)} stroke={RULE} strokeWidth="1" />
                                  <text x={padL - 5} y={y(g) + 3} textAnchor="end" fontSize="8" fill="#555" fontFamily="Helvetica, Arial, sans-serif">
                                    {Math.round(g).toLocaleString()}
                                  </text>
                                </g>
                              ))}
                              <line x1={padL} y1={H - padB} x2={W - padR} y2={H - padB} stroke={INK} strokeWidth="1.5" />
                              <line x1={padL} y1={padT} x2={padL} y2={H - padB} stroke={INK} strokeWidth="1.5" />
                              <polyline points={pts} fill="none" stroke={GREEN} strokeWidth="2" />
                              {progressSeries.map((p, i) => (
                                <g key={p.date}>
                                  <circle cx={x(i)} cy={y(p.value)} r="3.5" fill={GREEN} />
                                  {progressSeries.length <= 10 && (
                                    <text x={x(i)} y={y(p.value) - 7} textAnchor="middle" fontSize="8" fontWeight="bold" fill={INK} fontFamily="Helvetica, Arial, sans-serif">
                                      {Math.round(p.value).toLocaleString()}
                                    </text>
                                  )}
                                  {(i === 0 || i === progressSeries.length - 1 || progressSeries.length <= 6) && (
                                    <text x={x(i)} y={H - padB + 12} textAnchor="middle" fontSize="8" fill="#555" fontFamily="Helvetica, Arial, sans-serif">
                                      {shortDate(p.date)}
                                    </text>
                                  )}
                                </g>
                              ))}
                            </svg>
                            <div style={{ fontSize: 11, color: "#555", marginTop: 6, textAlign: "center" }}>
                              {progressExercise} — {progressMetric === "max" ? "estimated 1-rep max (lbs)" : "total volume (lbs)"} per workout
                            </div>
                            {progressMetric === "max" && (
                              <div style={{ fontSize: 10, color: "#888", marginTop: 3, textAlign: "center", lineHeight: 1.4 }}>
                                Estimated from your best set each day (Epley: weight × (1 + reps ÷ 30)).
                                E.g. 200 lbs × 10 reps ≈ 267 lbs. Less accurate above ~10 reps.
                              </div>
                            )}
                          </div>
                        );
                      })()
                    )}
                  </div>
                )}
              </div>
            )}

            {/* History */}
            <button
              onClick={() => setHistoryOpen(!historyOpen)}
              style={{
                width: "100%", padding: "12px 0", background: historyOpen ? INK : "#fff",
                color: historyOpen ? PAPER : INK, border: `1.5px solid ${INK}`,
                fontWeight: 900, fontSize: 13, letterSpacing: 1.5, textTransform: "uppercase",
                cursor: "pointer", fontFamily: "inherit", marginBottom: historyOpen ? 0 : 16,
              }}
            >
              {historyOpen ? "▲ Hide history" : "🗓 Workout history"}
            </button>

            {historyOpen && (
              <div style={{ border: `1.5px solid ${INK}`, borderTop: "none", background: "#fff", marginBottom: 16 }}>
                {historyDates.length === 0 ? (
                  <div style={{ fontSize: 13, color: "#666", textAlign: "center", padding: "16px 0" }}>
                    No workouts logged yet.
                  </div>
                ) : (
                  historyDates.slice(0, 21).map((d) => {
                    const h = historyByDate[d];
                    const sess = sessions[d];
                    const mins = sess && sess.start && sess.end
                      ? Math.round((new Date(sess.end).getTime() - new Date(sess.start).getTime()) / 60000)
                      : null;
                    return (
                      <div
                        key={d}
                        onClick={() => { setViewDate(d); setHistoryOpen(false); }}
                        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "9px 12px", borderBottom: `1px solid ${RULE}`, cursor: "pointer", background: d === viewDate ? TINT : "transparent" }}
                      >
                        <div style={{ fontWeight: 700, fontSize: 13 }}>{prettyDate(d)}</div>
                        <div style={{ fontSize: 12, color: "#555" }}>
                          {h.exercises} ex · {h.sets} sets · {Math.round(h.volume).toLocaleString()} lbs
                          {mins !== null ? ` · ${mins} min` : ""}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        )}

        {/* ---- PROGRESS PHOTOS ---- */}
        {tab === "progress" && (
          <div>
            <div style={{ background: TINT, border: `1.5px solid ${GREEN}`, padding: "10px 12px", fontSize: 13, marginBottom: 16, lineHeight: 1.5 }}>
              <b>Progress photos:</b> a picture every week or two tells you what the
              scale can't. Same pose, same lighting, same time of day works best.
              Photos are private to your account.
            </div>

            <input
              ref={ppCameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleProgressPhotoSelect}
              style={{ display: "none" }}
            />
            <input
              ref={ppGalleryRef}
              type="file"
              accept="image/*"
              onChange={handleProgressPhotoSelect}
              style={{ display: "none" }}
            />

            {!ppPreview ? (
              <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                <button
                  onClick={() => ppCameraRef.current && ppCameraRef.current.click()}
                  style={{
                    flex: 1, padding: "12px 0", background: "#fff", color: INK,
                    border: `1.5px dashed ${INK}`, fontWeight: 900, fontSize: 12, letterSpacing: 1,
                    textTransform: "uppercase", cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  📷 Take photo
                </button>
                <button
                  onClick={() => ppGalleryRef.current && ppGalleryRef.current.click()}
                  style={{
                    flex: 1, padding: "12px 0", background: "#fff", color: INK,
                    border: `1.5px dashed ${INK}`, fontWeight: 900, fontSize: 12, letterSpacing: 1,
                    textTransform: "uppercase", cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  🖼 Upload photo
                </button>
              </div>
            ) : (
              <div style={{ border: `1.5px solid ${INK}`, background: "#fff", padding: 12, marginBottom: 16 }}>
                <img
                  src={ppPreview}
                  alt="Progress preview"
                  style={{ width: "100%", maxHeight: 320, objectFit: "contain", border: `1.5px solid ${INK}`, background: PAPER }}
                />
                <input
                  value={ppNote}
                  onChange={(e) => setPpNote(e.target.value)}
                  placeholder="Note (optional) - e.g. 182 lbs, end of week 6"
                  style={{ ...inputStyle, width: "100%", marginTop: 8, padding: 8, fontSize: 13 }}
                />
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <button
                    onClick={saveProgressPhoto}
                    disabled={ppBusy}
                    style={{
                      flex: 2, padding: "10px 0", background: ppBusy ? "#777" : GREEN, color: "#fff",
                      border: "none", fontWeight: 900, fontSize: 12, letterSpacing: 1, textTransform: "uppercase",
                      cursor: ppBusy ? "wait" : "pointer", fontFamily: "inherit",
                    }}
                  >
                    {ppBusy ? "Uploading..." : "Save photo"}
                  </button>
                  <button
                    onClick={() => { setPpPreview(null); setPpNote(""); }}
                    disabled={ppBusy}
                    style={{
                      flex: 1, padding: "10px 0", background: "#fff", color: INK, border: `1.5px solid ${INK}`,
                      fontWeight: 900, fontSize: 12, letterSpacing: 1, textTransform: "uppercase",
                      cursor: "pointer", fontFamily: "inherit",
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {ppError && (
              <div style={{ marginBottom: 16, padding: "8px 10px", border: `1.5px solid ${RED}`, color: RED, fontSize: 13, background: "#fff" }}>
                {ppError}
              </div>
            )}

            {progressPhotos.length === 0 ? (
              <div style={{ textAlign: "center", padding: "48px 16px", border: `1.5px dashed ${RULE}`, fontSize: 14, color: "#666" }}>
                No progress photos yet. Take your first one today — future you will
                thank you.
              </div>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                {progressPhotos.map((p) => (
                  <div key={p.id} style={{ width: "calc(50% - 5px)", border: `1.5px solid ${INK}`, background: "#fff" }}>
                    {signedUrls[p.path] ? (
                      <img
                        src={signedUrls[p.path]}
                        alt={`Progress ${p.date}`}
                        onClick={() => window.open(signedUrls[p.path], "_blank")}
                        style={{ width: "100%", height: 200, objectFit: "cover", display: "block", cursor: "pointer" }}
                      />
                    ) : (
                      <div style={{ width: "100%", height: 200, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "#888" }}>
                        Loading...
                      </div>
                    )}
                    <div style={{ padding: "6px 8px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 4, borderTop: `1.5px solid ${INK}` }}>
                      <div>
                        <div style={{ fontWeight: 900, fontSize: 12 }}>{prettyDate(p.date)}</div>
                        {p.note && <div style={{ fontSize: 11, color: "#555" }}>{p.note}</div>}
                      </div>
                      <button
                        onClick={() => deleteProgressPhoto(p)}
                        style={{ background: "none", border: "none", color: RED, fontWeight: 900, fontSize: 15, cursor: "pointer", fontFamily: "inherit" }}
                        title="Delete photo"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ---- GROCERY ---- */}
        {tab === "grocery" && (
          <div>
            {groceryCount === 0 ? (
              <div style={{ textAlign: "center", padding: "48px 16px", border: `1.5px dashed ${RULE}`, fontSize: 14, color: "#666" }}>
                Your list is empty. Add recipes to the grocery list from the <b>Recipes</b> tab.
              </div>
            ) : (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <div style={{ fontSize: 13 }}>
                    From <b>{selected.length}</b> recipe{selected.length === 1 ? "" : "s"}
                  </div>
                  <button
                    onClick={clearChecked}
                    style={{ background: "none", border: `1.5px solid ${INK}`, padding: "6px 10px", fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: 1, cursor: "pointer", fontFamily: "inherit" }}
                  >
                    Uncheck all
                  </button>
                </div>
                {CATEGORIES.filter((c) => grocery[c].length > 0).map((cat) => (
                  <div key={cat} style={{ marginBottom: 18 }}>
                    <div style={sectionHead}>{CATEGORY_LABELS[cat]}</div>
                    <div style={{ border: `1.5px solid ${INK}`, borderTop: "none", background: "#fff" }}>
                      {grocery[cat].map((item) => {
                        const done = !!checked[item.name.toLowerCase()];
                        return (
                          <div
                            key={item.name}
                            onClick={() => toggleChecked(item.name.toLowerCase())}
                            style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 10px", borderBottom: `1px solid ${RULE}`, cursor: "pointer", opacity: done ? 0.45 : 1 }}
                          >
                            <div style={{ width: 16, height: 16, border: `1.5px solid ${INK}`, background: done ? GREEN : "#fff", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 11, fontWeight: 900 }}>
                              {done ? "✓" : ""}
                            </div>
                            <div style={{ fontSize: 14, textDecoration: done ? "line-through" : "none" }}>
                              {item.name}
                              {item.amounts.length > 0 && (
                                <span style={{ color: "#555", fontSize: 12 }}> — {fmtAmount(item.amounts)}</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}