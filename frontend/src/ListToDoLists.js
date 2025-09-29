import "./ListToDoLists.css";
import { useState } from "react";
import { BiSolidTrash } from "react-icons/bi";

function ListToDoLists({
  listSummaries,
  handleSelectList,
  handleNewToDoList,
  handleDeleteToDoList,
}) {
  const [label, setLabel] = useState("");
  // track ids that are being deleted to disable UI for them
  const [deletingIds, setDeletingIds] = useState(new Set());

  const submitNewList = () => {
    const value = label.trim();
    if (!value) return;
    handleNewToDoList(value);
    setLabel("");
  };

  // helper: mark id as deleting (add/remove from Set)
  const markDeleting = (id, on = true) => {
    setDeletingIds((prev) => {
      const copy = new Set(prev);
      if (on) copy.add(id);
      else copy.delete(id);
      return copy;
    });
  };

  const handleDeleteClick = async (evt, id) => {
    evt.stopPropagation();
    if (!window.confirm("Are you sure you want to delete this list?")) return;
    // prevent double-delete
    if (deletingIds.has(id)) return;
    markDeleting(id, true);
    try {
      // handler provided by parent should be async-aware (can return promise)
      const maybePromise = handleDeleteToDoList(id);
      if (maybePromise && typeof maybePromise.then === "function") {
        await maybePromise;
      }
    } catch (err) {
      console.error("Failed to delete list", id, err);
    } finally {
      markDeleting(id, false);
    }
  };

  if (listSummaries === null) {
    return <div className="ListToDoLists loading">Loading to-do lists...</div>;
  }

  const summaries = Array.isArray(listSummaries) ? listSummaries : [];

  if (summaries.length === 0) {
    return (
      <div className="ListToDoLists">
        <div className="box">
          <label>
            New To-Do List:&nbsp;
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Enter list name"
            />
          </label>
          <button onClick={submitNewList} disabled={!label.trim()}>
            New
          </button>
        </div>
        <p>There are no to-do lists!</p>
      </div>
    );
  }

  return (
    <div className="ListToDoLists">
      <h1>All To-Do Lists</h1>

      <div className="box">
        <label>
          New To-Do List:&nbsp;
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Enter list name"
          />
        </label>
        <button onClick={submitNewList} disabled={!label.trim()}>
          New
        </button>
      </div>

      {summaries.map((summary, idx) => {
        // normalize id: prefer summary.id, fallback to summary._id or generated stable fallback
        const rawId = summary?.id ?? summary?._id ?? null;
        // produce a stable string key
        const idStr = rawId != null ? String(rawId) : `__noid_${idx}`;
        const isDeleting = deletingIds.has(idStr);
        return (
          <div
            key={idStr}
            className={`summary ${isDeleting ? "deleting" : ""}`}
            onClick={() => {
              if (!isDeleting) handleSelectList(summary.id ?? summary._id ?? idStr);
            }}
            role="button"
            aria-disabled={isDeleting}
            tabIndex={0}
            onKeyDown={(e) => {
              if ((e.key === "Enter" || e.key === " ") && !isDeleting) {
                handleSelectList(summary.id ?? summary._id ?? idStr);
              }
            }}
          >
            <span className="name">{summary.name}</span>
            <span className="count">({summary.item_count ?? 0} items)</span>
            <span className="flex"></span>
            <span
              className="trash"
              onClick={(evt) => handleDeleteClick(evt, idStr)}
              title={isDeleting ? "Deleting..." : "Delete list"}
              aria-hidden={false}
            >
              <BiSolidTrash />
            </span>
            {isDeleting && <span className="deleting-label">Deleting...</span>}
          </div>
        );
      })}
    </div>
  );
}

export default ListToDoLists;
