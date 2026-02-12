import { useState, useRef, useEffect, useCallback } from "react";
import { supabase } from "./supabaseClient";

const today = () => { const d = new Date(); return d.toISOString().split("T")[0]; };
const isFuture = (dateStr) => dateStr && dateStr > today();
const daysUntil = (dateStr) => {
  if (!dateStr) return Infinity;
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const d = new Date(dateStr + "T00:00:00");
  return Math.ceil((d - now) / 86400000);
};
const formatDate = (dateStr) => {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-");
  const dt = new Date(+y, +m - 1, +d);
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: y !== String(new Date().getFullYear()) ? "numeric" : undefined });
};

function useIsMobile() {
  const [mobile, setMobile] = useState(window.innerWidth < 640);
  useEffect(() => {
    const h = () => setMobile(window.innerWidth < 640);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);
  return mobile;
}

export default function TaskFlow({ session }) {
  const [groups, setGroups] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [selected, setSelected] = useState(null);
  const [expandedTask, setExpandedTask] = useState(null);
  const [showDone, setShowDone] = useState({});
  const [showScheduled, setShowScheduled] = useState({});
  const [addingGroup, setAddingGroup] = useState(false);
  const [addingTask, setAddingTask] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [showArchive, setShowArchive] = useState(false);
  const [contextMenu, setContextMenu] = useState(null);
  const [dragId, setDragId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const groupInputRef = useRef(null);
  const taskInputRef = useRef(null);
  const isMobile = useIsMobile();

  const userId = session.user.id;

  useEffect(() => {
    const load = async () => {
      const [{ data: g }, { data: t }] = await Promise.all([
        supabase.from("groups").select("*").eq("user_id", userId).order("created_at"),
        supabase.from("tasks").select("*").eq("user_id", userId).order("position"),
      ]);
      setGroups(g || []);
      setTasks(t || []);
      setLoaded(true);
    };
    load();
  }, [userId]);

  useEffect(() => { if (addingGroup && groupInputRef.current) groupInputRef.current.focus(); }, [addingGroup]);
  useEffect(() => { if (addingTask && taskInputRef.current) taskInputRef.current.focus(); }, [addingTask]);
  useEffect(() => {
    const close = () => setContextMenu(null);
    if (contextMenu) { window.addEventListener("click", close); window.addEventListener("scroll", close, true); }
    return () => { window.removeEventListener("click", close); window.removeEventListener("scroll", close, true); };
  }, [contextMenu]);

  const activeGroups = groups.filter(g => !g.archived);
  const archivedGroups = groups.filter(g => g.archived);
  const selectedGroup = groups.find(g => g.id === selected);
  const groupTasks = selected ? tasks.filter(t => t.group_id === selected) : [];
  const activeTasks = groupTasks.filter(t => !t.done && !isFuture(t.activate_date));
  const scheduledTasks = groupTasks.filter(t => !t.done && isFuture(t.activate_date)).sort((a, b) => (a.activate_date || "").localeCompare(b.activate_date || ""));
  const doneTasks = groupTasks.filter(t => t.done);
  const isDoneVisible = showDone[selected] || false;
  const isScheduledVisible = showScheduled[selected] || false;

  const selectGroup = (id) => {
    setSelected(id);
    setAddingTask(false);
    setExpandedTask(null);
    setContextMenu(null);
    if (isMobile) setSidebarOpen(false);
  };

  const addGroup = async () => {
    if (!newGroupName.trim()) return;
    const { data, error } = await supabase.from("groups").insert({ user_id: userId, name: newGroupName.trim(), archived: false }).select().single();
    if (!error && data) {
      setGroups(prev => [...prev, data]);
      setSelected(data.id);
      if (isMobile) setSidebarOpen(false);
    }
    setNewGroupName(""); setAddingGroup(false);
  };

  const archiveGroup = async (id) => {
    await supabase.from("groups").update({ archived: true }).eq("id", id);
    setGroups(prev => prev.map(g => g.id === id ? { ...g, archived: true } : g));
    if (selected === id) setSelected(null);
    setContextMenu(null);
  };

  const restoreGroup = async (id) => {
    await supabase.from("groups").update({ archived: false }).eq("id", id);
    setGroups(prev => prev.map(g => g.id === id ? { ...g, archived: false } : g));
    setSelected(id); setShowArchive(false);
    if (isMobile) setSidebarOpen(false);
  };

  const addTask = async () => {
    if (!newTaskTitle.trim() || !selected) return;
    const maxPos = Math.max(0, ...tasks.filter(t => t.group_id === selected).map(t => t.position || 0));
    const { data, error } = await supabase.from("tasks").insert({
      user_id: userId, group_id: selected, title: newTaskTitle.trim(),
      notes: "", done: false, activate_date: null, due_date: null, position: maxPos + 1,
    }).select().single();
    if (!error && data) setTasks(prev => [...prev, data]);
    setNewTaskTitle(""); setAddingTask(false);
  };

  const toggleDone = async (id) => {
    const task = tasks.find(t => t.id === id);
    if (!task) return;
    const done = !task.done;
    await supabase.from("tasks").update({ done }).eq("id", id);
    setTasks(prev => prev.map(t => t.id === id ? { ...t, done } : t));
  };

  const updateTask = async (id, updates) => {
    const dbUpdates = {};
    for (const [k, v] of Object.entries(updates)) {
      if (k === "activateDate") dbUpdates.activate_date = v || null;
      else if (k === "dueDate") dbUpdates.due_date = v || null;
      else dbUpdates[k] = v;
    }
    await supabase.from("tasks").update(dbUpdates).eq("id", id);
    setTasks(prev => prev.map(t => t.id === id ? { ...t, ...dbUpdates } : t));
  };

  const removeTask = async (id) => {
    await supabase.from("tasks").delete().eq("id", id);
    setTasks(prev => prev.filter(t => t.id !== id));
    setExpandedTask(null);
  };

  const activeCount = (gid) => tasks.filter(t => t.group_id === gid && !t.done && !isFuture(t.activate_date)).length;

  const handleDragStart = (id) => setDragId(id);
  const handleDragOver = (e, id) => { e.preventDefault(); if (id !== dragOverId) setDragOverId(id); };
  const handleDragEnd = () => { setDragId(null); setDragOverId(null); };
  const handleDrop = useCallback(async (targetId) => {
    if (dragId === null || dragId === targetId) { setDragId(null); setDragOverId(null); return; }
    const currentActive = [...activeTasks];
    const fromIdx = currentActive.findIndex(t => t.id === dragId);
    const toIdx = currentActive.findIndex(t => t.id === targetId);
    if (fromIdx === -1 || toIdx === -1) { setDragId(null); setDragOverId(null); return; }
    const [moved] = currentActive.splice(fromIdx, 1);
    currentActive.splice(toIdx, 0, moved);
    const updates = currentActive.map((t, i) => ({ id: t.id, position: i }));
    const newTasks = tasks.map(t => { const u = updates.find(u => u.id === t.id); return u ? { ...t, position: u.position } : t; });
    setTasks(newTasks);
    setDragId(null); setDragOverId(null);
    for (const u of updates) { await supabase.from("tasks").update({ position: u.position }).eq("id", u.id); }
  }, [dragId, activeTasks, tasks]);

  const longPressTimer = useRef(null);
  const startLongPress = (id, e) => { longPressTimer.current = setTimeout(() => { const r = e.currentTarget.getBoundingClientRect(); setContextMenu({ id, x: r.right - 20, y: r.bottom }); }, 500); };
  const cancelLongPress = () => { if (longPressTimer.current) clearTimeout(longPressTimer.current); };

  const signOut = async () => { await supabase.auth.signOut(); };

  if (!loaded) return (
    <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'IBM Plex Sans', sans-serif", color: "#b0aca6" }}>Loading...</div>
  );

  const sidebarWidth = isMobile ? "85vw" : 240;
  const showSidebar = isMobile ? sidebarOpen : true;

  return (
    <div style={{ fontFamily: "'IBM Plex Sans', -apple-system, sans-serif", height: "100vh", display: "flex", background: "#fdfdfc", color: "#1a1a1a", position: "relative", overflow: "hidden" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@300;400;500;600&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 0px; }
        input, textarea, button { font-family: 'IBM Plex Sans', -apple-system, sans-serif; }
        @keyframes appear { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        button { cursor: pointer; }
        textarea { resize: none; }
        .g-item { transition: background 0.12s; border-radius: 6px; cursor: pointer; user-select: none; -webkit-user-select: none; }
        .g-item:hover { background: #f5f3f0; }
        .task-row { transition: background 0.12s, box-shadow 0.12s; }
        .task-row:hover { background: #fafaf8; }
        .task-row:hover .t-remove { opacity: 0.35; }
        .task-row:hover .drag-handle { opacity: 0.4; }
        .t-remove { opacity: 0; transition: opacity 0.12s; }
        .t-remove:hover { opacity: 1 !important; }
        .drag-handle { opacity: 0; transition: opacity 0.12s; cursor: grab; user-select: none; -webkit-user-select: none; }
        .drag-handle:active { cursor: grabbing; }
        .task-row.dragging { opacity: 0.4; }
        .task-row.drag-over { box-shadow: 0 -2px 0 0 #b8b3ab; }
        .check { appearance: none; -webkit-appearance: none; width: 20px; height: 20px; border: 1.5px solid #c8c4be; border-radius: 4px; cursor: pointer; transition: all 0.15s; flex-shrink: 0; position: relative; background: #fff; }
        .check:checked { background: #b8b3ab; border-color: #b8b3ab; }
        .check:checked::after { content: '✓'; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 12px; color: #fff; font-weight: 600; }
        .check:hover { border-color: #9c9890; }
        .ctx-menu { position: fixed; background: #fff; border: 1px solid #e8e6e2; border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); padding: 4px; z-index: 500; min-width: 150px; animation: slideUp 0.1s ease; }
        .ctx-item { display: block; width: 100%; padding: 9px 14px; border: none; background: none; text-align: left; font-size: 13px; color: #4a4a46; border-radius: 5px; }
        .ctx-item:hover { background: #f5f3f0; }
        .ctx-item.warn { color: #b87a5a; }
        .ctx-item.warn:hover { background: #fdf8f5; }
        .overlay { position: fixed; inset: 0; background: rgba(26,26,26,0.12); backdrop-filter: blur(2px); -webkit-backdrop-filter: blur(2px); z-index: 400; display: flex; align-items: center; justify-content: center; animation: appear 0.15s ease; }
        .modal { background: #fff; border-radius: 14px; box-shadow: 0 12px 48px rgba(0,0,0,0.12); width: 360px; max-width: 90vw; max-height: 70vh; overflow: hidden; animation: slideUp 0.2s ease; }
        .sidebar-overlay { position: fixed; inset: 0; background: rgba(26,26,26,0.2); z-index: 290; animation: appear 0.15s ease; }
        .sidebar { z-index: 300; border-right: 1px solid #eae8e4; display: flex; flex-direction: column; background: #fdfdfc; transition: transform 0.25s ease; }
      `}</style>

      {/* Mobile sidebar backdrop */}
      {isMobile && sidebarOpen && (
        <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <div className="sidebar" style={{
        width: sidebarWidth,
        minWidth: isMobile ? 0 : 240,
        position: isMobile ? "fixed" : "relative",
        top: 0, left: 0, bottom: 0,
        transform: isMobile && !sidebarOpen ? "translateX(-100%)" : "translateX(0)",
      }}>
        <div style={{ padding: isMobile ? "24px 20px 20px" : "32px 24px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h1 style={{ fontSize: 17, fontWeight: 600, letterSpacing: "-0.01em" }}>TaskFlow</h1>
          <button onClick={signOut} title="Sign out"
            style={{ background: "none", border: "none", fontSize: 12, color: "#b0aca6", padding: "4px 8px" }}>
            Sign out
          </button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "0 12px", WebkitOverflowScrolling: "touch" }}>
          {[...activeGroups].sort((a, b) => a.name.localeCompare(b.name)).map(g => {
            const count = activeCount(g.id);
            return (
              <div key={g.id} className="g-item"
                onClick={() => selectGroup(g.id)}
                onContextMenu={e => { e.preventDefault(); setContextMenu({ id: g.id, x: e.clientX, y: e.clientY }); }}
                onTouchStart={e => startLongPress(g.id, e)} onTouchEnd={cancelLongPress} onTouchMove={cancelLongPress}
                style={{ padding: isMobile ? "12px 12px" : "10px 12px", display: "flex", alignItems: "center", background: selected === g.id ? "#f0eeea" : "transparent", marginBottom: 1 }}>
                <span style={{ fontSize: isMobile ? 15 : 13.5, fontWeight: selected === g.id ? 500 : 400, color: "#1a1a1a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{g.name}</span>
                {count > 0 && <span style={{ fontSize: 12, color: "#b0aca6", marginLeft: 8, flexShrink: 0 }}>{count}</span>}
              </div>
            );
          })}
          {addingGroup ? (
            <div style={{ padding: "6px 12px", animation: "appear 0.15s ease" }}>
              <input ref={groupInputRef} value={newGroupName} onChange={e => setNewGroupName(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") addGroup(); if (e.key === "Escape") { setAddingGroup(false); setNewGroupName(""); } }}
                onBlur={() => { if (!newGroupName.trim()) { setAddingGroup(false); setNewGroupName(""); } }}
                placeholder="Name..." style={{ width: "100%", padding: "10px 12px", borderRadius: 6, border: "1px solid #ddd9d3", fontSize: isMobile ? 15 : 13, outline: "none", background: "#fff" }} />
            </div>
          ) : (
            <button onClick={() => setAddingGroup(true)}
              style={{ display: "block", width: "calc(100% - 8px)", margin: "8px 4px", padding: isMobile ? "12px 12px" : "9px 12px", borderRadius: 6, border: "none", background: "transparent", color: "#b0aca6", fontSize: isMobile ? 15 : 13, textAlign: "left" }}>
              + Add person or project
            </button>
          )}
        </div>
        {archivedGroups.length > 0 && (
          <div style={{ borderTop: "1px solid #eae8e4", padding: "14px 20px" }}>
            <button onClick={() => setShowArchive(true)} style={{ background: "none", border: "none", padding: 0, color: "#b0aca6", fontSize: 12.5, display: "flex", alignItems: "center", gap: 6 }}>
              ↩ Archived ({archivedGroups.length})
            </button>
          </div>
        )}
      </div>

      {contextMenu && (
        <div className="ctx-menu" style={{ left: contextMenu.x, top: contextMenu.y }} onClick={e => e.stopPropagation()}>
          <button className="ctx-item warn" onClick={() => archiveGroup(contextMenu.id)}>Archive</button>
        </div>
      )}

      {showArchive && (
        <div className="overlay" onClick={() => setShowArchive(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div style={{ padding: "20px 24px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ fontSize: 15, fontWeight: 500 }}>Archived</h3>
              <button onClick={() => setShowArchive(false)} style={{ background: "none", border: "none", fontSize: 18, color: "#b0aca6", lineHeight: 1, padding: "4px" }}>×</button>
            </div>
            <div style={{ padding: "4px 16px 20px", maxHeight: "55vh", overflowY: "auto" }}>
              {archivedGroups.map(g => {
                const tc = tasks.filter(t => t.group_id === g.id).length;
                return (
                  <div key={g.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 8px", borderBottom: "1px solid #f0eeea" }}>
                    <div>
                      <span style={{ fontSize: 14, color: "#1a1a1a" }}>{g.name}</span>
                      <span style={{ fontSize: 12, color: "#b0aca6", marginLeft: 10 }}>{tc} task{tc !== 1 ? "s" : ""}</span>
                    </div>
                    <button onClick={() => restoreGroup(g.id)}
                      style={{ padding: "6px 14px", borderRadius: 6, border: "1px solid #ddd9d3", background: "#fff", fontSize: 12.5, color: "#4a4a46", fontWeight: 500 }}>
                      Restore
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Main panel */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", width: "100%" }}>
        {!selected ? (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 20 }}>
            {isMobile && (
              <button onClick={() => setSidebarOpen(true)}
                style={{ background: "#1a1a1a", color: "#fdfdfc", border: "none", padding: "12px 24px", borderRadius: 8, fontSize: 15, fontWeight: 500, marginBottom: 12 }}>
                Open menu
              </button>
            )}
            <p style={{ fontSize: 14, color: "#c8c4be" }}>Select a person or project</p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div style={{
              padding: isMobile ? "20px 20px 16px" : "32px 40px 20px",
              borderBottom: "1px solid #eae8e4",
              display: "flex", alignItems: "center", gap: 12,
            }}>
              {isMobile && (
                <button onClick={() => setSidebarOpen(true)}
                  style={{ background: "none", border: "none", fontSize: 20, color: "#1a1a1a", padding: "4px", lineHeight: 1, flexShrink: 0 }}>
                  ☰
                </button>
              )}
              <h2 style={{ fontSize: isMobile ? 20 : 22, fontWeight: 400, letterSpacing: "-0.02em", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selectedGroup?.name}</h2>
            </div>

            {/* Tasks */}
            <div style={{ flex: 1, overflowY: "auto", padding: isMobile ? "12px 16px 32px" : "16px 40px 40px", WebkitOverflowScrolling: "touch" }}>

              {activeTasks.map(task => (
                <TaskRow key={task.id} task={task} expanded={expandedTask === task.id} isMobile={isMobile}
                  draggable={!isMobile}
                  isDragging={dragId === task.id}
                  isDragOver={dragOverId === task.id && dragId !== task.id}
                  onDragStart={() => handleDragStart(task.id)}
                  onDragOver={(e) => handleDragOver(e, task.id)}
                  onDragEnd={handleDragEnd}
                  onDrop={() => handleDrop(task.id)}
                  onToggle={() => toggleDone(task.id)}
                  onExpand={() => setExpandedTask(expandedTask === task.id ? null : task.id)}
                  onUpdate={(u) => updateTask(task.id, u)}
                  onRemove={() => removeTask(task.id)} />
              ))}

              {addingTask ? (
                <div style={{ padding: isMobile ? "10px 0 10px 32px" : "10px 0 10px 42px", animation: "appear 0.15s ease" }}>
                  <input ref={taskInputRef} value={newTaskTitle} onChange={e => setNewTaskTitle(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter" && newTaskTitle.trim()) { addTask(); setTimeout(() => setAddingTask(true), 10); }
                      if (e.key === "Escape") { setAddingTask(false); setNewTaskTitle(""); }
                    }}
                    onBlur={() => { if (!newTaskTitle.trim()) { setAddingTask(false); setNewTaskTitle(""); } }}
                    placeholder="Task description..."
                    style={{ width: "100%", padding: "8px 0", border: "none", borderBottom: "1px solid #eae8e4", fontSize: isMobile ? 16 : 14, outline: "none", background: "transparent", color: "#1a1a1a" }} />
                </div>
              ) : (
                <button onClick={() => setAddingTask(true)}
                  style={{ padding: isMobile ? "12px 0 12px 32px" : "10px 0 10px 42px", background: "none", border: "none", color: "#b0aca6", fontSize: isMobile ? 15 : 13.5, display: "block" }}>
                  + Add task
                </button>
              )}

              {scheduledTasks.length > 0 && (
                <div style={{ marginTop: 32 }}>
                  <button onClick={() => setShowScheduled({ ...showScheduled, [selected]: !isScheduledVisible })}
                    style={{ background: "none", border: "none", padding: "0 0 12px 0", color: "#b0aca6", fontSize: 12.5, display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ display: "inline-block", fontSize: 9, transform: isScheduledVisible ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s ease" }}>▶</span>
                    {scheduledTasks.length} scheduled
                  </button>
                  {isScheduledVisible && scheduledTasks.map(task => (
                    <TaskRow key={task.id} task={task} expanded={expandedTask === task.id} isMobile={isMobile}
                      onToggle={() => toggleDone(task.id)}
                      onExpand={() => setExpandedTask(expandedTask === task.id ? null : task.id)}
                      onUpdate={(u) => updateTask(task.id, u)}
                      onRemove={() => removeTask(task.id)} />
                  ))}
                </div>
              )}

              {doneTasks.length > 0 && (
                <div style={{ marginTop: scheduledTasks.length > 0 ? 16 : 32 }}>
                  <button onClick={() => setShowDone({ ...showDone, [selected]: !isDoneVisible })}
                    style={{ background: "none", border: "none", padding: "0 0 12px 0", color: "#b0aca6", fontSize: 12.5, display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ display: "inline-block", fontSize: 9, transform: isDoneVisible ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s ease" }}>▶</span>
                    {doneTasks.length} completed
                  </button>
                  {isDoneVisible && doneTasks.map(task => (
                    <TaskRow key={task.id} task={task} expanded={expandedTask === task.id} isMobile={isMobile}
                      onToggle={() => toggleDone(task.id)}
                      onExpand={() => setExpandedTask(expandedTask === task.id ? null : task.id)}
                      onUpdate={(u) => updateTask(task.id, u)}
                      onRemove={() => removeTask(task.id)} />
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function TaskRow({ task, expanded, isMobile, draggable, isDragging, isDragOver, onDragStart, onDragOver, onDragEnd, onDrop, onToggle, onExpand, onUpdate, onRemove }) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [localTitle, setLocalTitle] = useState(task.title);
  const [editingNotes, setEditingNotes] = useState(false);
  const [localNotes, setLocalNotes] = useState(task.notes || "");
  const titleRef = useRef(null);
  const noteRef = useRef(null);

  useEffect(() => { setLocalTitle(task.title); }, [task.title]);
  useEffect(() => { if (!editingNotes) setLocalNotes(task.notes || ""); }, [task.notes, editingNotes]);
  useEffect(() => { if (editingTitle && titleRef.current) titleRef.current.focus(); }, [editingTitle]);
  useEffect(() => { if (editingNotes && noteRef.current) { noteRef.current.focus(); noteRef.current.selectionStart = noteRef.current.value.length; } }, [editingNotes]);

  const hasNotes = task.notes && task.notes.trim().length > 0;
  const activateDate = task.activate_date || "";
  const dueDate = task.due_date || "";
  const hasActivateDate = !!activateDate;
  const hasDueDate = !!dueDate;
  const hasDetails = hasNotes || hasActivateDate || hasDueDate;
  const isScheduled = isFuture(activateDate);

  const dueDays = daysUntil(dueDate);
  const isUrgent = hasDueDate && !task.done && dueDays <= 3;
  const isOverdue = hasDueDate && !task.done && dueDays < 0;
  const titleColor = task.done ? "#b0aca6" : isUrgent ? "#c4453a" : "#1a1a1a";

  const fontSize = isMobile ? 15 : 14;

  return (
    <div
      className={`task-row${isDragging ? " dragging" : ""}${isDragOver ? " drag-over" : ""}`}
      draggable={draggable && !editingTitle && !editingNotes && !expanded}
      onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDrop={onDrop}
      style={{ borderRadius: 6, marginBottom: 1 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 0, padding: isMobile ? "11px 4px 11px 0" : "10px 8px 10px 0" }}>
        {draggable ? (
          <div className="drag-handle" style={{
            width: 18, minWidth: 18, paddingTop: 3, marginRight: 4,
            display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
            fontSize: 8, color: "#b8b3ab", lineHeight: 1,
          }}>⠿</div>
        ) : (
          <div style={{ width: isMobile ? 4 : 22, minWidth: isMobile ? 4 : 22 }} />
        )}
        <input type="checkbox" className="check" checked={task.done} onChange={onToggle} style={{ marginTop: 2 }} />
        <div style={{ flex: 1, minWidth: 0, marginLeft: 10 }}>
          {editingTitle ? (
            <input ref={titleRef} value={localTitle} onChange={e => setLocalTitle(e.target.value)}
              onBlur={() => { onUpdate({ title: localTitle }); setEditingTitle(false); }}
              onKeyDown={e => { if (e.key === "Enter") { onUpdate({ title: localTitle }); setEditingTitle(false); } if (e.key === "Escape") { setLocalTitle(task.title); setEditingTitle(false); } }}
              style={{ width: "100%", border: "none", borderBottom: "1px solid #ddd9d3", fontSize, outline: "none", background: "transparent", padding: "0 0 2px", color: titleColor }} />
          ) : (
            <div style={{ display: "flex", alignItems: "flex-start", gap: 6, flexWrap: "wrap" }}>
              <span onClick={() => !task.done && setEditingTitle(true)}
                style={{ fontSize, fontWeight: 400, color: titleColor, textDecoration: task.done ? "line-through" : "none", cursor: task.done ? "default" : "text", lineHeight: 1.45 }}>
                {task.title}
              </span>
              {hasDueDate && !task.done && !expanded && (
                <span style={{ fontSize: 11, flexShrink: 0, fontWeight: 500, color: isUrgent ? "#c4453a" : "#b0aca6", lineHeight: 1.8 }}>
                  {isOverdue ? "overdue" : `due ${formatDate(dueDate)}`}
                </span>
              )}
              {isScheduled && !expanded && (
                <span style={{ fontSize: 11, color: "#b0aca6", flexShrink: 0, lineHeight: 1.8 }}>{formatDate(activateDate)}</span>
              )}
              <button onClick={onExpand}
                style={{ background: "none", border: "none", padding: isMobile ? "2px 8px" : "1px 4px", color: hasDetails ? "#a8a4a0" : "#d4d1cc", fontSize: 14, lineHeight: 1, flexShrink: 0, borderRadius: 3 }}
                title="Details">
                {expanded ? "▾" : hasDetails ? "▸" : "＋"}
              </button>
            </div>
          )}

          {expanded && (
            <div style={{ marginTop: 10, animation: "appear 0.12s ease", display: "flex", flexDirection: "column", gap: 8 }}>
              {editingNotes ? (
                <textarea ref={noteRef} value={localNotes} onChange={e => setLocalNotes(e.target.value)}
                  onBlur={() => { onUpdate({ notes: localNotes }); setEditingNotes(false); }}
                  onKeyDown={e => { if (e.key === "Escape") { onUpdate({ notes: localNotes }); setEditingNotes(false); } }}
                  rows={Math.max(2, (localNotes.match(/\n/g) || []).length + 2)}
                  placeholder="Add a note..."
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 5, border: "1px solid #ddd9d3", fontSize: isMobile ? 15 : 13, lineHeight: 1.55, outline: "none", background: "#fafaf8", color: "#4a4a46" }} />
              ) : (
                <div onClick={() => setEditingNotes(true)}
                  style={{ padding: "8px 10px", borderRadius: 5, background: "#fafaf8", fontSize: isMobile ? 15 : 13, lineHeight: 1.55, color: hasNotes ? "#5a5a56" : "#b0aca6", cursor: "text", minHeight: 40, whiteSpace: "pre-wrap", borderLeft: hasNotes ? "2px solid #e0ddd8" : "2px solid transparent" }}>
                  {hasNotes ? task.notes : "Add a note..."}
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "2px 0" }}>
                  <span style={{ fontSize: 11.5, color: isUrgent ? "#c4453a" : "#b0aca6", textTransform: "uppercase", letterSpacing: "0.04em", minWidth: 58, fontWeight: isUrgent ? 500 : 400 }}>Due</span>
                  <input type="date" value={dueDate}
                    onChange={e => onUpdate({ dueDate: e.target.value })}
                    style={{ padding: "6px 8px", borderRadius: 5, border: `1px solid ${isUrgent ? "#e8c4c0" : "#e8e6e2"}`, fontSize: 13, color: isUrgent ? "#c4453a" : hasDueDate ? "#4a4a46" : "#b0aca6", outline: "none", background: isUrgent ? "#fdf6f5" : "#fafaf8" }} />
                  {hasDueDate && (
                    <button onClick={() => onUpdate({ dueDate: "" })}
                      style={{ background: "none", border: "none", fontSize: 14, color: "#c8c4be", padding: "4px 6px", lineHeight: 1 }}>×</button>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "2px 0" }}>
                  <span style={{ fontSize: 11.5, color: "#b0aca6", textTransform: "uppercase", letterSpacing: "0.04em", minWidth: 58 }}>Activate</span>
                  <input type="date" value={activateDate}
                    onChange={e => onUpdate({ activateDate: e.target.value })}
                    style={{ padding: "6px 8px", borderRadius: 5, border: "1px solid #e8e6e2", fontSize: 13, color: hasActivateDate ? "#4a4a46" : "#b0aca6", outline: "none", background: "#fafaf8" }} />
                  {hasActivateDate && (
                    <button onClick={() => onUpdate({ activateDate: "" })}
                      style={{ background: "none", border: "none", fontSize: 14, color: "#c8c4be", padding: "4px 6px", lineHeight: 1 }}>×</button>
                  )}
                </div>
              </div>
              {/* Delete task button - easier to reach on mobile */}
              <button onClick={onRemove}
                style={{ alignSelf: "flex-start", padding: "6px 12px", borderRadius: 5, border: "1px solid #e8d4d4", background: "#fdf8f7", color: "#c47a6a", fontSize: 12, marginTop: 4 }}>
                Delete task
              </button>
            </div>
          )}
        </div>
        {!isMobile && (
          <button className="t-remove" onClick={onRemove}
            style={{ background: "none", border: "none", fontSize: 14, color: "#c8c4be", padding: "2px 4px", lineHeight: 1, marginTop: 1 }}>×</button>
        )}
      </div>
    </div>
  );
}
