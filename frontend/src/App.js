// App.js (replace your current App.js with this)
import { useEffect, useState } from "react";
import axios from "axios";
import "./App.css";
import ListToDoLists from "./ListToDoLists";
import ToDoList from "./ToDoList";

function App() {
  const [listSummaries, setListSummaries] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [deletingIds, setDeletingIds] = useState(new Set());

  useEffect(() => {
    reloadData().catch((err) => {
      console.error("reloadData error", err);
    });
  }, []);

  async function reloadData() {
    try {
      console.log("Reloading to-do lists...");
      const response = await axios.get("/api/lists");
      const data = response?.data ?? [];
      setListSummaries(Array.isArray(data) ? data : []);
      return data;
    } catch (err) {
      console.error("Failed to reload lists:", err);
      setListSummaries([]);
      throw err;
    }
  }

  async function handleNewToDoList(newName) {
    try {
      const payload = { name: newName };
      await axios.post("/api/lists", payload);
      await reloadData();
    } catch (err) {
      console.error("Failed to create new to-do list:", err);
      throw err;
    }
  }

  // delete with optimistic update + rollback and disable double delete
  async function handleDeleteToDoList(id) {
    if (!id) return;
    if (deletingIds.has(id)) return;

    // optimistic update: remove locally first
    const prev = listSummaries ?? [];
    const newList = prev.filter((s) => String(s.id ?? s._id ?? "") !== String(id));
    // mark deleting
    setDeletingIds((prevSet) => {
      const s = new Set(prevSet);
      s.add(String(id));
      return s;
    });
    setListSummaries(newList);

    try {
      await axios.delete(`/api/lists/${id}`);
      // after successful delete, ensure we have fresh data
      await reloadData();
    } catch (err) {
      // rollback to previous state on failure
      console.error("Failed to delete list:", err);
      setListSummaries(prev);
      throw err;
    } finally {
      setDeletingIds((prevSet) => {
        const s = new Set(prevSet);
        s.delete(String(id));
        return s;
      });
    }
  }

  function handleSelectList(id) {
    console.log("Selecting Item: ", id);
    // defensive: ensure id exists in current summaries (if available)
    if (listSummaries && !listSummaries.find((s) => String(s.id ?? s._id ?? "") === String(id))) {
      // if not found, still allow selection but you might choose to reload first
      console.warn("Selected id not found in summaries:", id);
    }
    setSelectedItem(id);
  }

  async function backToList() {
    setSelectedItem(null);
    try {
      await reloadData();
    } catch (err) {
      console.error("Failed to reload data after back:", err);
    }
  }

  if (selectedItem === null) {
    return (
      <div className="App">
        <ListToDoLists
          listSummaries={listSummaries}
          handleSelectList={handleSelectList}
          handleNewToDoList={handleNewToDoList}
          handleDeleteToDoList={handleDeleteToDoList}
        />
      </div>
    );
  } else {
    return (
      <div className="App">
        <ToDoList listId={selectedItem} handleBackButton={backToList} />
      </div>
    );
  }
}

export default App;
