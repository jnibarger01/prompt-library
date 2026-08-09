"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { allCategories, getTopCategories } from "@/lib/categorize.mjs";

/**
 * Add / edit dialog for a user's own prompt.
 *
 * The category is suggested, never assigned silently. The suggester is right
 * about 54% of the time at the top and 79% within its first three guesses, so
 * hiding the decision would mislabel roughly two prompts in five and quietly
 * corrupt the category filter. Showing three chips keeps it to one click while
 * staying honest about the uncertainty.
 */

const SUGGESTION_DELAY = 350;

export default function AddPromptDialog({ open, initialValue, onCancel, onSave }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tags, setTags] = useState("");
  const [category, setCategory] = useState("");
  const [touchedCategory, setTouchedCategory] = useState(false);
  const [suggestion, setSuggestion] = useState({ suggestions: [], confident: false });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const titleRef = useRef(null);

  const editing = Boolean(initialValue);
  const categories = useMemo(() => allCategories(), []);

  useEffect(() => {
    if (!open) return;
    setTitle(initialValue?.title || "");
    setBody(initialValue?.prompt || "");
    setTags((initialValue?.tags || []).join(", "));
    setCategory(initialValue?.category || "");
    setTouchedCategory(Boolean(initialValue?.category));
    setSuggestion({ suggestions: [], confident: false });
    setError("");
    setSaving(false);
    // Focus after paint so the dialog is on screen before it steals focus.
    const timer = window.setTimeout(() => titleRef.current?.focus(), 40);
    return () => window.clearTimeout(timer);
  }, [open, initialValue]);

  // Re-suggest as the prompt takes shape, debounced so typing stays smooth.
  useEffect(() => {
    if (!open) return undefined;
    if (!title.trim() && !body.trim()) {
      setSuggestion({ suggestions: [], confident: false });
      return undefined;
    }

    const timer = window.setTimeout(() => {
      const next = getTopCategories(title, body, 3);
      setSuggestion(next);
      // Only auto-fill while the user has not expressed a preference.
      if (!touchedCategory && next.confident) setCategory(next.suggestions[0]);
    }, SUGGESTION_DELAY);

    return () => window.clearTimeout(timer);
  }, [open, title, body, touchedCategory]);

  useEffect(() => {
    if (!open) return undefined;
    function onKeyDown(event) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onCancel();
      }
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [open, onCancel]);

  if (!open) return null;

  const chips = suggestion.suggestions;
  const remaining = categories.filter((name) => !chips.includes(name));

  async function handleSubmit(event) {
    event.preventDefault();
    if (!title.trim() || !body.trim()) {
      setError("A title and a prompt body are both required.");
      return;
    }
    if (!category) {
      setError("Pick a category — the suggestions are a starting point, not a guess to accept blindly.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      await onSave({ title: title.trim(), prompt: body.trim(), category, tags });
    } catch (saveError) {
      setError(saveError?.message || "Could not save that prompt.");
      setSaving(false);
    }
  }

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <section className="prompt-modal add-modal" role="dialog" aria-modal="true" aria-labelledby="add-prompt-title">
        <header className="modal-header">
          <div>
            <span className="category-label">{editing ? "Edit" : "New prompt"}</span>
            <h2 id="add-prompt-title">{editing ? "Edit your prompt" : "Add a prompt"}</h2>
          </div>
          <button className="close-button" type="button" onClick={onCancel} aria-label="Close">
            <span aria-hidden="true">×</span>
          </button>
        </header>

        <form className="add-form" onSubmit={handleSubmit}>
          <label className="field">
            <span>Title</span>
            <input
              ref={titleRef}
              type="text"
              value={title}
              maxLength={120}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="e.g. Rust Error Handling Reviewer"
            />
          </label>

          <label className="field">
            <span>Prompt</span>
            <textarea
              value={body}
              rows={9}
              onChange={(event) => setBody(event.target.value)}
              placeholder={"Write the prompt itself.\nUse ${placeholders} for anything the user should fill in."}
            />
            <small>{body.trim() ? `${body.trim().split(/\s+/).length} words` : "No content yet"}</small>
          </label>

          <div className="field">
            <span>Category</span>
            {chips.length > 0 ? (
              <>
                <div className="chip-row" role="group" aria-label="Suggested categories">
                  {chips.map((name, index) => (
                    <button
                      key={name}
                      type="button"
                      className={`chip ${category === name ? "selected" : ""}`}
                      onClick={() => {
                        setCategory(name);
                        setTouchedCategory(true);
                      }}
                    >
                      {name}
                      {index === 0 && suggestion.confident && <em>best guess</em>}
                    </button>
                  ))}
                </div>
                <small>
                  {suggestion.confident
                    ? "Suggested from the existing library — correct about 4 times in 5 among these three. Change it if it is wrong."
                    : "Too little to go on yet. Keep typing, or pick one below."}
                </small>
              </>
            ) : (
              <small>Suggestions appear once there is something to read.</small>
            )}

            <select
              value={remaining.includes(category) ? category : ""}
              onChange={(event) => {
                setCategory(event.target.value);
                setTouchedCategory(true);
              }}
              aria-label="Choose a different category"
            >
              <option value="">Another category…</option>
              {remaining.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          <label className="field">
            <span>Tags</span>
            <input
              type="text"
              value={tags}
              onChange={(event) => setTags(event.target.value)}
              placeholder="comma, separated, optional"
            />
          </label>

          {error && <p className="form-error" role="alert">{error}</p>}

          <footer className="modal-footer">
            <button className="secondary-button" type="button" onClick={onCancel}>Cancel</button>
            <button className="primary-button" type="submit" disabled={saving}>
              {saving ? "Saving…" : editing ? "Save changes" : "Add to library"}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
