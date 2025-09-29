import "./ToDoList.css";
import { useEffect, useState } from "react";
import axios from "axios";
import { BiSolidTrash } from "react-icons/bi";

function ToDoList({ listId, handleBackButton }) {
  const [listData, setListData] = useState(null);
  const [newLabel, setNewLabel] = useState("");
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    let mounted = true;
    const fetchData = async () => {
      setLoading(true);
      try {
        const response = await axios.get(`/api/lists/${listId}`);
        if (mounted) setListData(response.data);
      } catch (err) {
        console.error("Failed to fetch list:", err);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    fetchData();
    return () => {
      mounted = false;
    };
  }, [listId]);

  const handleCreateItem = async (label) => {
    const value = (label || "").trim();
    if (!value) return;
    setUpdating(true);
    try {
      const response = await axios.post(`/api/lists/${listId}/items`, { label: value });
      setListData(response.data);
      setNewLabel("");
    } catch (err) {
      console.error("Failed to create item:", err);
    } finally {
      setUpdating(false);
    }
  };

  const handleDeleteItem = async (id) => {
    if (!window.confirm("Are you sure you want to delete this item?")) return;
    // optimistic update: remove locally first
    const prev = listData;
    const prevItems = Array.isArray(prev?.items) ? prev.items : [];
    const newItemsOptimistic = prevItems.filter((it) => (it.id || it._id || "") !== id);
    setListData({ ...prev, items: newItemsOptimistic });
    setUpdating(true);
    try {
      const response = await axios.delete(`/api/lists/${listData.id}/items/${id}`);
      // server returns authoritative list
      if (response?.data) setListData(response.data);
    } catch (err) {
      console.error("Failed to delete item:", err);
      // rollback: restore previous list (or refetch)
      setListData(prev);
    } finally {
      setUpdating(false);
    }
  };

  const handleCheckToggle = async (itemId, newState) => {
    // optimistic toggle
    const prev = listData;
    const prevItems = Array.isArray(prev?.items) ? prev.items : [];
    const newItems = prevItems.map((it) =>
      ((it.id || it._id || "") === itemId) ? { ...it, checked: newState } : it
    );
    setListData({ ...prev, items: newItems });

    setUpdating(true);
    try {
      // NOTE: endpoint path must match server: /api/lists/{list_id}/items/checked_state
      const response = await axios.patch(`/api/lists/${listData.id}/items/checked_state`, {
        item_id: itemId,
        checked_state: newState,
      });
      if (response?.data) setListData(response.data);
    } catch (err) {
      console.error("Failed to update item state:", err);
      // rollback on failure
      setListData(prev);
    } finally {
      setUpdating(false);
    }
  };

  if (loading || listData === null) {
    return (
      <div className="ToDoList loading">
        <button className="back" onClick={handleBackButton}>
          Back
        </button>
        Loading to-do list...
      </div>
    );
  }

  // normalize & dedupe items client-side to avoid duplicate-key errors
  const itemsRaw = Array.isArray(listData.items) ? listData.items : [];
  const seen = new Set();
  const items = [];
  for (let i = 0; i < itemsRaw.length; i++) {
    const it = itemsRaw[i];
    // normalize id: prefer 'id', fallback to '_id' (string)
    const rawId = it?.id ?? it?._id ?? null;
    const idStr = rawId != null ? String(rawId) : null;
    // if id missing generate a per-render fallback to keep keys stable for this render
    const finalId = idStr ?? `__noid_${i}`;
    if (!seen.has(finalId)) {
      seen.add(finalId);
      // ensure the item in array has an 'id' for later handlers
      items.push({ ...it, id: finalId });
    } else {
      // duplicate: skip
    }
  }

  return (
    <div className="ToDoList">
      <button className="back" onClick={handleBackButton}>
        Back
      </button>
      <h1>List: {listData.name}</h1>

      <div className="box">
        <label>
          New item:&nbsp;
          <input
            type="text"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="Enter Item label"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreateItem(newLabel);
            }}
            disabled={updating}
          />
        </label>
        <button onClick={() => handleCreateItem(newLabel)} disabled={!newLabel.trim() || updating}>
          {updating ? "..." : "New"}
        </button>
      </div>

      {items.length > 0 ? (
        items.map((item, idx) => {
          // item.id is guaranteed by normalization above
          const key = item.id ?? `${item.label}-${idx}`;
          return (
            <div
              key={key}
              className={item.checked ? "item checked" : "item"}
              onClick={() => !updating && handleCheckToggle(item.id, !item.checked)}
              aria-disabled={updating}
              role="button"
            >
              <span>{item.checked ? "✓" : "✗"}</span>
              <span className="label">{item.label}</span>
              <span className="flex"></span>
              <span
                className="trash"
                onClick={(evt) => {
                  evt.stopPropagation();
                  if (!updating) handleDeleteItem(item.id);
                }}
              >
                <BiSolidTrash />
              </span>
            </div>
          );
        })
      ) : (
        <div className="box">There are currently no items.</div>
      )}
    </div>
  );
}

export default ToDoList;
