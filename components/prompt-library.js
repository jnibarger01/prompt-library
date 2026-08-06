"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getPromptById, searchPrompts } from "@/lib/client-store";

const PAGE_SIZE = 24;
const FAVORITES_KEY = "prompt-foundry:favorites";
const THEME_KEY = "prompt-foundry:theme";

function Icon({ name, size = 18 }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
  };

  const paths = {
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
    copy: <><rect x="8" y="8" width="11" height="11" rx="2" /><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" /></>,
    star: <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z" />,
    sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41" /></>,
    moon: <path d="M21 12.7A8.5 8.5 0 1 1 11.3 3 6.6 6.6 0 0 0 21 12.7Z" />,
    close: <><path d="m6 6 12 12M18 6 6 18" /></>,
    arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
    spark: <><path d="m12 3-1.4 4.1a5 5 0 0 1-3.1 3.1L3.5 12l4 1.8a5 5 0 0 1 3.1 3.1L12 21l1.4-4.1a5 5 0 0 1 3.1-3.1l4-1.8-4-1.8a5 5 0 0 1-3.1-3.1L12 3Z" /></>,
    check: <path d="m5 12 4 4L19 6" />,
  };

  return <svg {...common}>{paths[name]}</svg>;
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(value || 0);
}

function detectVariables(text) {
  const matches = String(text || "").match(/\$\{[^}]+\}/g) || [];
  return [...new Set(matches)];
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

export default function PromptLibrary({ meta }) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [sort, setSort] = useState("relevance");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(meta.total);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [favorites, setFavorites] = useState(new Set());
  const [favoritesReady, setFavoritesReady] = useState(false);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [theme, setTheme] = useState("dark");
  const [selectedId, setSelectedId] = useState(null);
  const [selectedPrompt, setSelectedPrompt] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [toast, setToast] = useState("");
  const searchRef = useRef(null);

  const favoriteIds = useMemo(() => [...favorites].join(","), [favorites]);
  const categories = useMemo(
    () => [{ name: "All", count: meta.total }, ...meta.categories],
    [meta],
  );

  useEffect(() => {
    const storedFavorites = JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]");
    setFavorites(new Set(Array.isArray(storedFavorites) ? storedFavorites : []));
    setFavoritesReady(true);

    const storedTheme = localStorage.getItem(THEME_KEY);
    const preferred = window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
    setTheme(storedTheme === "light" || storedTheme === "dark" ? storedTheme : preferred);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 260);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    setPage(1);
    setItems([]);
  }, [debouncedQuery, category, sort, favoritesOnly, favoritesOnly ? favoriteIds : ""]);

  useEffect(() => {
    function handleShortcut(event) {
      if (event.key === "/" && !["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName)) {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === "Escape") setSelectedId(null);
    }

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  useEffect(() => {
    if (!favoritesReady) return;

    if (favoritesOnly && !favoriteIds) {
      setItems([]);
      setTotal(0);
      setHasMore(false);
      setLoading(false);
      setLoadingMore(false);
      return;
    }

    let cancelled = false;

    if (page === 1) setLoading(true);
    else setLoadingMore(true);

    searchPrompts({
      query: debouncedQuery,
      category,
      sort,
      page,
      limit: PAGE_SIZE,
      ids: favoritesOnly ? favoriteIds.split(",") : [],
    })
      .then((data) => {
        if (cancelled) return;
        setItems((current) => (page === 1 ? data.items : [...current, ...data.items]));
        setTotal(data.total);
        setHasMore(data.hasMore);
      })
      .catch(() => {
        if (!cancelled) setToast("Could not load the library. Try again.");
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
          setLoadingMore(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, category, sort, page, favoritesOnly, favoriteIds, favoritesReady]);

  useEffect(() => {
    if (!selectedId) {
      setSelectedPrompt(null);
      return;
    }

    let cancelled = false;
    setDetailLoading(true);
    getPromptById(selectedId)
      .then((prompt) => {
        if (cancelled) return;
        if (!prompt) throw new Error("Prompt not found");
        setSelectedPrompt(prompt);
      })
      .catch(() => {
        if (!cancelled) setToast("Could not open that prompt.");
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [selectedId]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(""), 2200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const toggleFavorite = useCallback((id) => {
    setFavorites((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
        setToast("Removed from favorites");
      } else {
        next.add(id);
        setToast("Saved to favorites");
      }
      localStorage.setItem(FAVORITES_KEY, JSON.stringify([...next]));
      return next;
    });
  }, []);

  const handleCopy = useCallback(async (text) => {
    try {
      await copyText(text);
      setToast("Prompt copied");
    } catch {
      setToast("Copy failed");
    }
  }, []);

  const resetFilters = () => {
    setQuery("");
    setCategory("All");
    setSort("relevance");
    setFavoritesOnly(false);
  };

  const variables = detectVariables(selectedPrompt?.prompt);

  return (
    <main className="app-shell">
      <header className="site-header">
        <a className="brand" href="#top" aria-label="Prompt Foundry home">
          <span className="brand-mark"><Icon name="spark" size={20} /></span>
          <span>Prompt Foundry</span>
        </a>
        <div className="header-actions">
          <button
            className={`header-button ${favoritesOnly ? "active" : ""}`}
            type="button"
            onClick={() => setFavoritesOnly((value) => !value)}
            aria-pressed={favoritesOnly}
          >
            <Icon name="star" size={17} />
            <span>Favorites</span>
            <strong>{favorites.size}</strong>
          </button>
          <button
            className="theme-button"
            type="button"
            onClick={() => setTheme((value) => (value === "dark" ? "light" : "dark"))}
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
          >
            <Icon name={theme === "dark" ? "sun" : "moon"} />
          </button>
        </div>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow">A searchable prompt arsenal</p>
          <h1>Stop digging. Find the right prompt.</h1>
          <p className="hero-subtitle">
            Browse {formatNumber(meta.total)} ready-to-use prompts across development, design,
            business, research, writing, and more.
          </p>
        </div>
        <aside className="stats-panel" aria-label="Library statistics">
          <div><strong>{formatNumber(meta.total)}</strong><span>prompts</span></div>
          <div><strong>{meta.categories.length}</strong><span>categories</span></div>
          <div><strong>1 click</strong><span>to copy</span></div>
        </aside>
      </section>

      <section className="controls" aria-label="Prompt library controls">
        <label className="search-box">
          <Icon name="search" size={21} />
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search titles or prompt text..."
            aria-label="Search prompts"
          />
          <kbd>/</kbd>
        </label>

        <div className="filter-row">
          <label>
            <span>Category</span>
            <select value={category} onChange={(event) => setCategory(event.target.value)}>
              {categories.map((item) => (
                <option key={item.name} value={item.name}>
                  {item.name} ({formatNumber(item.count)})
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Sort</span>
            <select value={sort} onChange={(event) => setSort(event.target.value)}>
              <option value="relevance">Best match</option>
              <option value="title">Title A–Z</option>
              <option value="shortest">Shortest first</option>
              <option value="longest">Longest first</option>
            </select>
          </label>
        </div>
      </section>

      <section className="results-bar" aria-live="polite">
        <div>
          <strong>{loading && page === 1 ? "Searching…" : `${formatNumber(total)} results`}</strong>
          {favoritesOnly && <span>Saved prompts only</span>}
          {debouncedQuery && <span>for “{debouncedQuery}”</span>}
        </div>
        {(query || category !== "All" || favoritesOnly || sort !== "relevance") && (
          <button className="text-button" type="button" onClick={resetFilters}>Clear filters</button>
        )}
      </section>

      {loading && page === 1 ? (
        <div className="prompt-grid" aria-label="Loading prompts">
          {Array.from({ length: 8 }, (_, index) => <div className="prompt-card skeleton" key={index} />)}
        </div>
      ) : items.length ? (
        <div className="prompt-grid">
          {items.map((prompt) => {
            const saved = favorites.has(prompt.id);
            return (
              <article className="prompt-card" key={prompt.id}>
                <div className="card-topline">
                  <span className="category-label">{prompt.category}</span>
                  <button
                    type="button"
                    className={`icon-button ${saved ? "saved" : ""}`}
                    onClick={() => toggleFavorite(prompt.id)}
                    aria-label={saved ? `Remove ${prompt.title} from favorites` : `Save ${prompt.title} to favorites`}
                  >
                    <Icon name="star" size={18} />
                  </button>
                </div>
                <div className="card-main">
                  <h2>{prompt.title}</h2>
                  <p>{prompt.snippet}</p>
                </div>
                <div className="tag-row" aria-label="Prompt tags">
                  {prompt.tags.slice(0, 3).map((tag) => <span key={tag}>{tag}</span>)}
                </div>
                <footer className="card-footer">
                  <span>{formatNumber(prompt.words)} words</span>
                  <div className="card-actions">
                    <button className="text-button" type="button" onClick={() => setSelectedId(prompt.id)}>
                      Open <Icon name="arrow" size={15} />
                    </button>
                    <button
                      className="copy-button"
                      type="button"
                      onClick={() => {
                        getPromptById(prompt.id).then((data) => data && handleCopy(data.prompt));
                      }}
                    >
                      <Icon name="copy" size={16} /> Copy
                    </button>
                  </div>
                </footer>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="empty-state">
          <span><Icon name="search" size={28} /></span>
          <h2>No prompts found</h2>
          <p>Try a broader phrase, another category, or clear the active filters.</p>
          <button className="primary-button" type="button" onClick={resetFilters}>Reset library</button>
        </div>
      )}

      {hasMore && !loading && (
        <div className="load-zone">
          <button
            className="load-button"
            type="button"
            disabled={loadingMore}
            onClick={() => setPage((value) => value + 1)}
          >
            {loadingMore ? <><span className="loader" /> Loading</> : "Load more prompts"}
          </button>
        </div>
      )}

      <footer className="site-footer">
        <span>Prompt Foundry</span>
        <p>Built to find useful prompts fast—not to make you scroll until retirement.</p>
      </footer>

      {selectedId && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setSelectedId(null);
        }}>
          <section className="prompt-modal" role="dialog" aria-modal="true" aria-labelledby="prompt-title">
            <header className="modal-header">
              <div>
                <span className="category-label">{selectedPrompt?.category || "Loading"}</span>
                <h2 id="prompt-title">{selectedPrompt?.title || "Opening prompt…"}</h2>
              </div>
              <button className="close-button" type="button" onClick={() => setSelectedId(null)} aria-label="Close prompt">
                <Icon name="close" />
              </button>
            </header>

            {detailLoading || !selectedPrompt ? (
              <div className="modal-loading"><span className="loader" /> Loading full prompt…</div>
            ) : (
              <>
                <div className="modal-meta">
                  <span>{formatNumber(selectedPrompt.words)} words</span>
                  <span>{formatNumber(selectedPrompt.characters)} characters</span>
                  <button
                    className={`text-button ${favorites.has(selectedPrompt.id) ? "active" : ""}`}
                    type="button"
                    onClick={() => toggleFavorite(selectedPrompt.id)}
                  >
                    <Icon name="star" size={16} />
                    {favorites.has(selectedPrompt.id) ? "Saved" : "Save"}
                  </button>
                </div>

                {variables.length > 0 && (
                  <div className="variables-panel">
                    <strong>Variables detected</strong>
                    <div>{variables.map((variable) => <code key={variable}>{variable}</code>)}</div>
                  </div>
                )}

                <pre className="prompt-content">{selectedPrompt.prompt}</pre>
                <footer className="modal-footer">
                  <button className="secondary-button" type="button" onClick={() => setSelectedId(null)}>Close</button>
                  <button className="primary-button" type="button" onClick={() => handleCopy(selectedPrompt.prompt)}>
                    <Icon name="copy" size={17} /> Copy full prompt
                  </button>
                </footer>
              </>
            )}
          </section>
        </div>
      )}

      {toast && <div className="toast"><Icon name="check" size={17} />{toast}</div>}
    </main>
  );
}
