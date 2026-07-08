"use client";

import { useState, useEffect } from "react";

// ---- Design tokens ----
const INK = "#141414";
const PAPER = "#FCFBF6";
const GREEN = "#2F7D46";
const TINT = "#ECF4EE";
const RULE = "#DAD6CB";

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

const STORAGE_KEY = "evansmeals-data-v1";

export default function EvansMeals() {
  const [tab, setTab] = useState("import");
  const [recipes, setRecipes] = useState([]);
  const [selected, setSelected] = useState([]); // recipe ids in grocery list
  const [checked, setChecked] = useState({}); // grocery item -> bool
  const [videoUrl, setVideoUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [loaded, setLoaded] = useState(false);

  // ---- Load saved data ----
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        setRecipes(data.recipes || []);
        setSelected(data.selected || []);
        setChecked(data.checked || {});
      }
    } catch (e) {
      // first run, nothing saved yet
    }
    setLoaded(true);
  }, []);

  const persist = (nextRecipes, nextSelected, nextChecked) => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ recipes: nextRecipes, selected: nextSelected, checked: nextChecked })
      );
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
      persist(nextRecipes, nextSelected, checked);
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
    persist(nextRecipes, nextSelected, checked);
  };

  const toggleSelected = (id) => {
    const nextSelected = selected.includes(id)
      ? selected.filter((s) => s !== id)
      : [...selected, id];
    setSelected(nextSelected);
    persist(recipes, nextSelected, checked);
  };

  // ---- Grocery list consolidation ----
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
    persist(recipes, selected, nextChecked);
  };

  const clearChecked = () => {
    setChecked({});
    persist(recipes, selected, {});
  };

  const fmtAmount = (amounts) => {
    if (!amounts.length) return "";
    return amounts
      .map((a) => `${Math.round(a.amount * 100) / 100}${a.unit ? " " + a.unit : ""}`)
      .join(" + ");
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
    padding: "10px 4px",
    fontWeight: 900,
    fontSize: 13,
    letterSpacing: 1,
    textTransform: "uppercase",
    background: tab === id ? INK : "transparent",
    color: tab === id ? PAPER : INK,
    border: "none",
    cursor: "pointer",
    fontFamily: "inherit",
  });

  return (
    <div style={{ minHeight: "100vh", background: PAPER, color: INK, fontFamily: "Helvetica, Arial, sans-serif" }}>
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "24px 16px 80px" }}>
        {/* Header */}
        <div style={{ borderBottom: `8px solid ${INK}`, paddingBottom: 8 }}>
          <div style={{ fontSize: 34, fontWeight: 900, letterSpacing: -1.5, lineHeight: 1 }}>
            evansmeals
          </div>
          <div style={{ fontSize: 12, marginTop: 4, color: "#555" }}>
            YouTube video → recipe → macros → grocery list
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
            <label style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>
              YouTube link
            </label>
            <input
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !loading && importVideo()}
              placeholder="https://www.youtube.com/watch?v=..."
              style={{ width: "100%", boxSizing: "border-box", padding: 12, border: `1.5px solid ${INK}`, background: "#fff", fontSize: 14, marginTop: 6, fontFamily: "inherit" }}
            />
            {error && (
              <div style={{ marginTop: 10, padding: "8px 10px", border: "1.5px solid #B3261E", color: "#B3261E", fontSize: 13, background: "#fff" }}>
                {error}
              </div>
            )}
            <button
              onClick={importVideo}
              disabled={loading}
              style={{
                marginTop: 14,
                width: "100%",
                padding: "14px 0",
                background: loading ? "#777" : GREEN,
                color: "#fff",
                border: "none",
                fontWeight: 900,
                fontSize: 15,
                letterSpacing: 1.5,
                textTransform: "uppercase",
                cursor: loading ? "wait" : "pointer",
                fontFamily: "inherit",
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
                      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                        <button
                          onClick={() => toggleSelected(r.id)}
                          style={{
                            flex: 1,
                            padding: "10px 0",
                            fontWeight: 900,
                            fontSize: 12,
                            letterSpacing: 1,
                            textTransform: "uppercase",
                            cursor: "pointer",
                            fontFamily: "inherit",
                            background: inList ? TINT : GREEN,
                            color: inList ? GREEN : "#fff",
                            border: `1.5px solid ${GREEN}`,
                          }}
                        >
                          {inList ? "✓ In grocery list" : "Add to grocery list"}
                        </button>
                        <button
                          onClick={() => deleteRecipe(r.id)}
                          style={{ padding: "10px 14px", background: "#fff", color: "#B3261E", border: "1.5px solid #B3261E", fontWeight: 900, fontSize: 12, textTransform: "uppercase", letterSpacing: 1, cursor: "pointer", fontFamily: "inherit" }}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
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
                    <div style={{ fontWeight: 900, fontSize: 12, textTransform: "uppercase", letterSpacing: 1.5, background: INK, color: PAPER, padding: "5px 10px" }}>
                      {CATEGORY_LABELS[cat]}
                    </div>
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
