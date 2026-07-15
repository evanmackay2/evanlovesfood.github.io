"use client";

import { useState, useEffect } from "react";

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

const STORAGE_KEY = "evansmeals-data-v1";

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
  const [tab, setTab] = useState("import");
  const [recipes, setRecipes] = useState([]);
  const [selected, setSelected] = useState([]);
  const [checked, setChecked] = useState({});
  const [log, setLog] = useState([]); // {id, date, mealType, title, servings, calories, protein_g, carbs_g, fat_g}
  const [goals, setGoals] = useState({ calories: 2200, protein: 150 });

  const [videoUrl, setVideoUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [loaded, setLoaded] = useState(false);

  // Log-meal panel state (per recipe)
  const [logPanel, setLogPanel] = useState(null); // recipe id or null
  const [logForm, setLogForm] = useState({ date: todayStr(), mealType: "dinner", servings: 1 });

  // Log tab state
  const [viewDate, setViewDate] = useState(todayStr());
  const [manualText, setManualText] = useState("");
  const [manualMeal, setManualMeal] = useState("dinner");
  const [manualLoading, setManualLoading] = useState(false);
  const [manualError, setManualError] = useState("");

  // ---- Load saved data ----
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        setRecipes(data.recipes || []);
        setSelected(data.selected || []);
        setChecked(data.checked || {});
        setLog(data.log || []);
        if (data.goals) setGoals(data.goals);
      }
    } catch (e) {
      // first run
    }
    setLoaded(true);
  }, []);

  const persist = (next) => {
    try {
      const current = { recipes, selected, checked, log, goals, ...next };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
    } catch (e) {
      console.error("Could not save:", e);
    }
  };

  // ---- Import a YouTube link ----
  const importVideo = async () => {
    if (!videoUrl.trim()) {
      setError("Paste a YouTube link first.");
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

      const recipe = {
        id: String(Date.now()),
        source: videoUrl.trim(),
        addedAt: new Date().toISOString(),
        ...data,
      };
      const nextRecipes = [recipe, ...recipes];
      const nextSelected = [recipe.id, ...selected];
      setRecipes(nextRecipes);
      setSelected(nextSelected);
      persist({ recipes: nextRecipes, selected: nextSelected });
      setVideoUrl("");
      setTab("recipes");
      setExpanded(recipe.id);
    } catch (e) {
      setError(e.message || "Something went wrong. Try another video.");
    }
    setLoading(false);
  };

  // ---- Recipe actions ----
  const deleteRecipe = (id) => {
    const nextRecipes = recipes.filter((r) => r.id !== id);
    const nextSelected = selected.filter((s) => s !== id);
    setRecipes(nextRecipes);
    setSelected(nextSelected);
    persist({ recipes: nextRecipes, selected: nextSelected });
  };

  const toggleSelected = (id) => {
    const nextSelected = selected.includes(id)
      ? selected.filter((s) => s !== id)
      : [...selected, id];
    setSelected(nextSelected);
    persist({ selected: nextSelected });
  };

  // ---- Logging meals ----
  const openLogPanel = (recipeId) => {
    setLogPanel(logPanel === recipeId ? null : recipeId);
    setLogForm({ date: todayStr(), mealType: "dinner", servings: 1 });
  };

  const logRecipe = (recipe) => {
    const s = Number(logForm.servings) || 1;
    const entry = {
      id: String(Date.now()),
      date: logForm.date,
      mealType: logForm.mealType,
      title: recipe.title,
      servings: s,
      calories: Math.round((recipe.perServing?.calories ?? 0) * s),
      protein_g: Math.round((recipe.perServing?.protein_g ?? 0) * s),
      carbs_g: Math.round((recipe.perServing?.carbs_g ?? 0) * s),
      fat_g: Math.round((recipe.perServing?.fat_g ?? 0) * s),
    };
    const nextLog = [...log, entry];
    setLog(nextLog);
    persist({ log: nextLog });
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

      const entry = {
        id: String(Date.now()),
        date: viewDate,
        mealType: manualMeal,
        title: data.title || manualText.slice(0, 60),
        servings: 1,
        calories: Math.round(data.calories ?? 0),
        protein_g: Math.round(data.protein_g ?? 0),
        carbs_g: Math.round(data.carbs_g ?? 0),
        fat_g: Math.round(data.fat_g ?? 0),
      };
      const nextLog = [...log, entry];
      setLog(nextLog);
      persist({ log: nextLog });
      setManualText("");
    } catch (e) {
      setManualError(e.message || "Something went wrong.");
    }
    setManualLoading(false);
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

  // Average across all days that have at least one entry
  const dayMap = {};
  log.forEach((e) => {
    dayMap[e.date] = (dayMap[e.date] || 0) + (e.calories || 0);
  });
  const loggedDays = Object.keys(dayMap).length;
  const avgCalories = loggedDays ? Math.round(Object.values(dayMap).reduce((a, b) => a + b, 0) / loggedDays) : 0;

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
            const existing = items[key].amounts.find((a) => a.unit === (ing.unit || ""));
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
    CATEGORIES.forEach((c) => grouped[c].sort((a, b) => a.name.localeCompare(b.name)));
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
      .map((a) => `${Math.round(a.amount * 100) / 100}${a.unit ? " " + a.unit : ""}`)
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
  const sectionHead = {
    fontWeight: 900,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1.5,
    background: INK,
    color: PAPER,
    padding: "5px 10px",
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
    fontSize: 12,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    background: tab === id ? INK : "transparent",
    color: tab === id ? PAPER : INK,
    border: "none",
    cursor: "pointer",
    fontFamily: "inherit",
  });

  const calRemaining = goals.calories - dayTotals.calories;

  return (
    <div style={{ minHeight: "100vh", background: PAPER, color: INK, fontFamily: "Helvetica, Arial, sans-serif" }}>
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "24px 16px 80px" }}>
        {/* Header */}
        <div style={{ borderBottom: `8px solid ${INK}`, paddingBottom: 8 }}>
          <div style={{ fontSize: 34, fontWeight: 900, letterSpacing: -1.5, lineHeight: 1 }}>
            evansmeals
          </div>
          <div style={{ fontSize: 12, marginTop: 4, color: "#555" }}>
            YouTube video → recipe → macros → daily log
          </div>
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
          <button onClick={() => setTab("grocery")} style={tabStyle("grocery")}>
            Grocery ({groceryCount})
          </button>
        </div>

        {/* ---- IMPORT ---- */}
        {tab === "import" && (
          <div>
            <div style={{ background: TINT, border: `1.5px solid ${GREEN}`, padding: "10px 12px", fontSize: 13, marginBottom: 16, lineHeight: 1.5 }}>
              <b>How it works:</b> paste a link to any YouTube cooking video. The
              transcript gets pulled automatically, and AI turns it into a full
              recipe with estimated macros and a grocery list.
            </div>
            <label style={labelStyle}>YouTube link</label>
            <input
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !loading && importVideo()}
              placeholder="https://www.youtube.com/watch?v=..."
              style={{ ...inputStyle, width: "100%", marginTop: 6 }}
            />
            {error && (
              <div style={{ marginTop: 10, padding: "8px 10px", border: `1.5px solid ${RED}`, color: RED, fontSize: 13, background: "#fff" }}>
                {error}
              </div>
            )}
            <button
              onClick={importVideo}
              disabled={loading}
              style={{
                marginTop: 14, width: "100%", padding: "14px 0",
                background: loading ? "#777" : GREEN, color: "#fff", border: "none",
                fontWeight: 900, fontSize: 15, letterSpacing: 1.5, textTransform: "uppercase",
                cursor: loading ? "wait" : "pointer", fontFamily: "inherit",
              }}
            >
              {loading ? "Watching the video for you..." : "Import recipe"}
            </button>
          </div>
        )}

        {/* ---- RECIPES ---- */}
        {tab === "recipes" && (
          <div>
            {loaded && recipes.length === 0 && (
              <div style={{ textAlign: "center", padding: "48px 16px", border: `1.5px dashed ${RULE}`, fontSize: 14, color: "#666" }}>
                No recipes yet. Head to <b>Import</b> and paste your first YouTube link.
              </div>
            )}
            {recipes.map((r) => {
              const isOpen = expanded === r.id;
              const inList = selected.includes(r.id);
              const showLogPanel = logPanel === r.id;
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

                  {isOpen && (
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
                            Watch the original video
                          </a>
                        </div>
                      )}

                      {/* Action buttons */}
                      <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
                        <button
                          onClick={() => openLogPanel(r.id)}
                          style={{
                            flex: 1, minWidth: 130, padding: "10px 0", fontWeight: 900, fontSize: 12,
                            letterSpacing: 1, textTransform: "uppercase", cursor: "pointer", fontFamily: "inherit",
                            background: INK, color: "#fff", border: `1.5px solid ${INK}`,
                          }}
                        >
                          {showLogPanel ? "Close" : "Log meal"}
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
                          {inList ? "✓ In grocery list" : "Add to grocery list"}
                        </button>
                        <button
                          onClick={() => deleteRecipe(r.id)}
                          style={{ padding: "10px 14px", background: "#fff", color: RED, border: `1.5px solid ${RED}`, fontWeight: 900, fontSize: 12, textTransform: "uppercase", letterSpacing: 1, cursor: "pointer", fontFamily: "inherit" }}
                        >
                          Delete
                        </button>
                      </div>

                      {/* Log meal panel */}
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

            {/* Day totals vs goals */}
            <div style={{ border: `1.5px solid ${INK}`, background: "#fff", padding: "10px 12px", marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderBottom: `6px solid ${INK}`, paddingBottom: 6 }}>
                <span style={{ fontWeight: 900, fontSize: 16 }}>Day total</span>
                <span style={{ fontWeight: 900, fontSize: 26 }}>
                  {dayTotals.calories}
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#555" }}> / {goals.calories} cal</span>
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "6px 0", borderBottom: `1px solid ${RULE}` }}>
                <span style={{ fontWeight: 700, color: GREEN }}>Protein</span>
                <span style={{ fontWeight: 700 }}>{dayTotals.protein}g / {goals.protein}g</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "6px 0", borderBottom: `1px solid ${RULE}` }}>
                <span style={{ fontWeight: 700 }}>Carbs</span>
                <span style={{ fontWeight: 700 }}>{dayTotals.carbs}g</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "6px 0" }}>
                <span style={{ fontWeight: 700 }}>Fat</span>
                <span style={{ fontWeight: 700 }}>{dayTotals.fat}g</span>
              </div>
              <div style={{ fontSize: 12, marginTop: 4, padding: "6px 8px", background: calRemaining >= 0 ? TINT : "#FDECEA", border: `1px solid ${calRemaining >= 0 ? GREEN : RED}`, color: calRemaining >= 0 ? GREEN : RED, fontWeight: 700 }}>
                {calRemaining >= 0
                  ? `${calRemaining} calories left today`
                  : `${Math.abs(calRemaining)} calories over target`}
              </div>
            </div>

            {/* Meals for the day */}
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

            {/* Manual meal entry */}
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
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 160, border: `1.5px solid ${INK}`, background: "#fff", padding: "10px 12px" }}>
                <div style={{ fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: 1, borderBottom: `3px solid ${INK}`, paddingBottom: 3, marginBottom: 6 }}>
                  Your average
                </div>
                <div style={{ fontSize: 24, fontWeight: 900 }}>
                  {avgCalories}
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#555" }}> cal/day</span>
                </div>
                <div style={{ fontSize: 12, color: "#555", marginTop: 2 }}>
                  across {loggedDays} logged day{loggedDays === 1 ? "" : "s"}
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
                    <label style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase" }}>Calories</label>
                    <input
                      type="number"
                      value={goals.calories}
                      onChange={(e) => updateGoals("calories", e.target.value)}
                      style={{ ...inputStyle, width: "100%", padding: 6, fontSize: 13 }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase" }}>Protein (g)</label>
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
