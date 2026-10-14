import React, { useState, useRef, useEffect } from "react";
import { supabase } from "./supabaseClient";

// Local calendar date as YYYY-MM-DD (not UTC, so evenings don't roll into tomorrow)
const localISO = (dt) => `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}-${String(dt.getDate()).padStart(2,"0")}`;
const today = () => localISO(new Date());
const addDays = (d, n) => { const [y,m,day] = d.split("-"); return localISO(new Date(+y, +m-1, +day + n)); };
const dayParts = (d) => { const [y,m,day] = d.split("-"); const dt = new Date(+y,+m-1,+day); return { weekday: dt.toLocaleDateString("en-US",{weekday:"long"}), short: dt.toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"}), md: dt.toLocaleDateString("en-US",{month:"short",day:"numeric"}) }; };
const byDateThenPos = (a,b) => (a.task_date||"").localeCompare(b.task_date||"") || (a.position||0)-(b.position||0);
const isFuture = (d) => d && d > today();
const daysUntil = (d) => {
  if (!d) return Infinity;
  const now = new Date(); now.setHours(0,0,0,0);
  return Math.ceil((new Date(d+"T00:00:00") - now) / 86400000);
};
const fmtDate = (d) => {
  if (!d) return "";
  const [y,m,day] = d.split("-");
  const dt = new Date(+y,+m-1,+day);
  return dt.toLocaleDateString("en-US",{month:"short",day:"numeric",year:y!==String(new Date().getFullYear())?"numeric":undefined});
};

function useIsMobile() {
  const [m, setM] = useState(window.innerWidth < 640);
  useEffect(() => { const h = () => setM(window.innerWidth < 640); window.addEventListener("resize",h); return () => window.removeEventListener("resize",h); }, []);
  return m;
}

export default function TaskFlow({ session }) {
  const [groups, setGroups] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [selected, setSelected] = useState(null);
  const [viewMode, setViewMode] = useState("tasks");
  const [expandedTask, setExpandedTask] = useState(null);
  const [showDone, setShowDone] = useState({});
  const [showScheduled, setShowScheduled] = useState({});
  const [addingGroup, setAddingGroup] = useState(false);
  const [addingTask, setAddingTask] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [showArchive, setShowArchive] = useState(false);
  const [contextMenu, setContextMenu] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const dragIdRef = useRef(null);
  const [, forceRender] = useState(0);
  const groupInputRef = useRef(null);
  const taskInputRef = useRef(null);
  const isMobile = useIsMobile();
  const userId = session.user.id;

  // ---- Week section state ----
  const [section, setSection] = useState(() => { try { return localStorage.getItem("vt-section") || "projects"; } catch { return "projects"; } });
  const [todayStr, setTodayStr] = useState(today());
  const [dayTasks, setDayTasks] = useState([]);
  const [dayAttachments, setDayAttachments] = useState([]);
  const [selectedDay, setSelectedDay] = useState("d0");
  const [showDayDone, setShowDayDone] = useState({});
  const [addingDayTask, setAddingDayTask] = useState(false);
  const [newDayTitle, setNewDayTitle] = useState("");
  const [newFutureDate, setNewFutureDate] = useState(addDays(today(), 7));
  const dayInputRef = useRef(null);

  const switchSection = (s) => {
    setSection(s); setExpandedTask(null); setAddingTask(false); setAddingDayTask(false);
    if (s === "week") setSelectedDay("d0");
    try { localStorage.setItem("vt-section", s); } catch {}
  };

  // Keep "today" current if the app stays open past midnight
  useEffect(() => {
    const refresh = () => setTodayStr(today());
    const iv = setInterval(refresh, 60000);
    document.addEventListener("visibilitychange", refresh);
    return () => { clearInterval(iv); document.removeEventListener("visibilitychange", refresh); };
  }, []);
  useEffect(() => { if (addingDayTask && dayInputRef.current) dayInputRef.current.focus(); }, [addingDayTask]);

  useEffect(() => {
    (async () => {
      const [{ data: g }, { data: t }, { data: a }, { data: dt }, { data: da }] = await Promise.all([
        supabase.from("groups").select("*").eq("user_id", userId).order("created_at"),
        supabase.from("tasks").select("*").eq("user_id", userId).order("position"),
        supabase.from("attachments").select("*").eq("user_id", userId).order("created_at"),
        supabase.from("day_tasks").select("*").eq("user_id", userId).order("position"),
        supabase.from("day_task_attachments").select("*").eq("user_id", userId).order("created_at"),
      ]);
      setGroups(g || []); setTasks(t || []); setAttachments(a || []);
      setDayTasks(dt || []); setDayAttachments(da || []); setLoaded(true);
    })();
  }, [userId]);

  useEffect(() => { if (addingGroup && groupInputRef.current) groupInputRef.current.focus(); }, [addingGroup]);
  useEffect(() => { if (addingTask && taskInputRef.current) taskInputRef.current.focus(); }, [addingTask]);
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener("click", close); window.addEventListener("scroll", close, true);
    return () => { window.removeEventListener("click", close); window.removeEventListener("scroll", close, true); };
  }, [contextMenu]);

  const activeGroups = groups.filter(g => !g.archived);
  const archivedGroups = groups.filter(g => g.archived);
  const selectedGroup = groups.find(g => g.id === selected);
  const groupTasks = selected ? tasks.filter(t => t.group_id === selected) : [];
  const activeTasks = groupTasks.filter(t => !t.done && !isFuture(t.activate_date)).sort((a,b) => (a.position||0)-(b.position||0));
  const scheduledTasks = groupTasks.filter(t => !t.done && isFuture(t.activate_date)).sort((a,b) => (a.activate_date||"").localeCompare(b.activate_date||""));
  const doneTasks = groupTasks.filter(t => t.done);
  const isDoneVisible = showDone[selected] || false;
  const isScheduledVisible = showScheduled[selected] || false;
  const activeCount = (gid) => tasks.filter(t => t.group_id === gid && !t.done && !isFuture(t.activate_date)).length;

  const selectGroup = (id) => { setSelected(id); setViewMode("tasks"); setAddingTask(false); setExpandedTask(null); setContextMenu(null); if (isMobile) setSidebarOpen(false); };
  const selectGroupNotes = (id) => { setSelected(id); setViewMode("notes"); setAddingTask(false); setExpandedTask(null); setContextMenu(null); if (isMobile) setSidebarOpen(false); };

  const addGroup = async () => {
    if (!newGroupName.trim()) return;
    const { data } = await supabase.from("groups").insert({ user_id: userId, name: newGroupName.trim(), archived: false, notes: "" }).select().single();
    if (data) { setGroups(prev => [...prev, data]); setSelected(data.id); setViewMode("tasks"); if (isMobile) setSidebarOpen(false); }
    setNewGroupName(""); setAddingGroup(false);
  };
  const archiveGroup = async (id) => {
    await supabase.from("groups").update({ archived: true }).eq("id", id);
    setGroups(prev => prev.map(g => g.id === id ? { ...g, archived: true } : g));
    if (selected === id) setSelected(null); setContextMenu(null);
  };
  const restoreGroup = async (id) => {
    await supabase.from("groups").update({ archived: false }).eq("id", id);
    setGroups(prev => prev.map(g => g.id === id ? { ...g, archived: false } : g));
    setSelected(id); setViewMode("tasks"); setShowArchive(false); if (isMobile) setSidebarOpen(false);
  };
  const updateGroupNotes = async (id, notes) => {
    await supabase.from("groups").update({ notes }).eq("id", id);
    setGroups(prev => prev.map(g => g.id === id ? { ...g, notes } : g));
  };

  const addTask = async () => {
    if (!newTaskTitle.trim() || !selected) return;
    const maxPos = Math.max(0, ...tasks.filter(t => t.group_id === selected).map(t => t.position || 0));
    const { data } = await supabase.from("tasks").insert({ user_id: userId, group_id: selected, title: newTaskTitle.trim(), notes: "", done: false, activate_date: null, due_date: null, position: maxPos + 1 }).select().single();
    if (data) setTasks(prev => [...prev, data]);
    setNewTaskTitle(""); setAddingTask(false);
  };
  const toggleDone = async (id) => {
    const task = tasks.find(t => t.id === id); if (!task) return;
    const done = !task.done;
    if (done) {
      const ta = attachments.filter(a => a.task_id === id);
      if (ta.length) { await supabase.storage.from("attachments").remove(ta.map(a => a.file_path)); await supabase.from("attachments").delete().eq("task_id", id); setAttachments(prev => prev.filter(a => a.task_id !== id)); }
    }
    await supabase.from("tasks").update({ done }).eq("id", id);
    setTasks(prev => prev.map(t => t.id === id ? { ...t, done } : t));
  };
  const updateTask = async (id, updates) => {
    const db = {};
    for (const [k, v] of Object.entries(updates)) { if (k === "activateDate") db.activate_date = v || null; else if (k === "dueDate") db.due_date = v || null; else db[k] = v; }
    await supabase.from("tasks").update(db).eq("id", id);
    setTasks(prev => prev.map(t => t.id === id ? { ...t, ...db } : t));
  };
  const removeTask = async (id) => {
    const ta = attachments.filter(a => a.task_id === id);
    if (ta.length) { await supabase.storage.from("attachments").remove(ta.map(a => a.file_path)); await supabase.from("attachments").delete().eq("task_id", id); setAttachments(prev => prev.filter(a => a.task_id !== id)); }
    await supabase.from("tasks").delete().eq("id", id); setTasks(prev => prev.filter(t => t.id !== id)); setExpandedTask(null);
  };

  const uploadAttachment = async (taskId, file) => {
    const fp = `${userId}/${taskId}/${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from("attachments").upload(fp, file); if (error) return;
    const { data } = await supabase.from("attachments").insert({ user_id: userId, task_id: taskId, file_name: file.name, file_path: fp, file_size: file.size }).select().single();
    if (data) setAttachments(prev => [...prev, data]);
  };
  const deleteAttachment = async (aid) => {
    const att = attachments.find(a => a.id === aid); if (!att) return;
    await supabase.storage.from("attachments").remove([att.file_path]);
    await supabase.from("attachments").delete().eq("id", aid);
    setAttachments(prev => prev.filter(a => a.id !== aid));
  };
  const openAttachment = async (fp) => {
    const { data } = await supabase.storage.from("attachments").createSignedUrl(fp, 3600);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  const reorderTasks = (getNewOrder) => {
    setTasks(prev => {
      const next = [...prev];
      const items = next.map((t, i) => ({ t, i })).filter(({ t }) => t.group_id === selected && !t.done && !isFuture(t.activate_date)).sort((a, b) => (a.t.position||0) - (b.t.position||0));
      if (items.length < 2) return prev;
      items.forEach(({ i }, pos) => { next[i] = { ...next[i], position: pos }; });
      const ordered = getNewOrder(items.map(({ i }) => next[i]));
      if (!ordered) return prev;
      ordered.forEach((t, pos) => { const mi = next.findIndex(nt => nt.id === t.id); if (mi !== -1) next[mi] = { ...next[mi], position: pos }; });
      ordered.forEach((t, pos) => { supabase.from("tasks").update({ position: pos }).eq("id", t.id); });
      return next;
    });
  };
  const handleDragStart = (e, id) => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", id); dragIdRef.current = id; forceRender(n => n+1); };
  const handleDragOver = (e, id) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; if (id !== dragOverId) setDragOverId(id); };
  const handleDragEnd = () => { dragIdRef.current = null; setDragOverId(null); forceRender(n => n+1); };
  const handleDrop = (e, targetId) => {
    e.preventDefault(); const srcId = dragIdRef.current; dragIdRef.current = null; setDragOverId(null); forceRender(n => n+1);
    if (!srcId || srcId === targetId) return;
    reorderTasks(list => { const fi = list.findIndex(t => t.id === srcId), ti = list.findIndex(t => t.id === targetId); if (fi===-1||ti===-1) return null; const r = [...list]; const [m] = r.splice(fi, 1); r.splice(ti, 0, m); return r; });
  };
  const moveTask = (taskId, dir) => {
    reorderTasks(list => { const i = list.findIndex(t => t.id === taskId); if (i===-1) return null; const ni = i+dir; if (ni<0||ni>=list.length) return null; const r = [...list]; [r[i],r[ni]] = [r[ni],r[i]]; return r; });
  };

  // ==================== WEEK SECTION ====================
  const weekDates = Array.from({ length: 7 }, (_, i) => addDays(todayStr, i));
  const horizon = weekDates[6];
  const overdueOpen = dayTasks.filter(t => !t.done && t.task_date < todayStr).sort(byDateThenPos);
  const futureTasks = dayTasks.filter(t => t.task_date > horizon);
  const dayItems = [
    { key: "uncompleted", label: "Uncompleted", count: overdueOpen.length },
    ...weekDates.map((d, i) => {
      const p = dayParts(d);
      return { key: "d" + i, date: d, label: i === 0 ? "Today" : i === 1 ? "Tomorrow" : p.weekday, sub: i < 2 ? p.short : p.md,
        count: dayTasks.filter(t => t.task_date === d && !t.done).length };
    }),
    { key: "future", label: "Future tasks", count: futureTasks.filter(t => !t.done).length },
  ];
  const currentDayItem = dayItems.find(it => it.key === selectedDay) || dayItems[1];
  const currentDate = currentDayItem.date || null;
  let dayOpen = [], dayDone = [];
  if (selectedDay === "uncompleted") { dayOpen = overdueOpen; }
  else if (selectedDay === "future") { dayOpen = futureTasks.filter(t => !t.done).sort(byDateThenPos); dayDone = futureTasks.filter(t => t.done).sort(byDateThenPos); }
  else if (currentDate) {
    dayOpen = dayTasks.filter(t => t.task_date === currentDate && !t.done).sort((a,b) => (a.position||0)-(b.position||0));
    dayDone = dayTasks.filter(t => t.task_date === currentDate && t.done);
  }
  const canReorderDay = !!currentDate;

  const selectDay = (key) => { setSelectedDay(key); setExpandedTask(null); setAddingDayTask(false); if (isMobile) setSidebarOpen(false); };

  const addDayTask = async () => {
    const title = newDayTitle.trim(); if (!title) return;
    const date = selectedDay === "future" ? newFutureDate : currentDate;
    if (!date) return;
    const maxPos = Math.max(0, ...dayTasks.filter(t => t.task_date === date).map(t => t.position || 0));
    const { data } = await supabase.from("day_tasks").insert({ user_id: userId, title, notes: "", done: false, task_date: date, position: maxPos + 1 }).select().single();
    if (data) setDayTasks(prev => [...prev, data]);
    setNewDayTitle("");
  };
  const removeDayAttachments = async (taskId) => {
    const da = dayAttachments.filter(a => a.task_id === taskId);
    if (!da.length) return;
    await supabase.storage.from("attachments").remove(da.map(a => a.file_path));
    await supabase.from("day_task_attachments").delete().eq("task_id", taskId);
    setDayAttachments(prev => prev.filter(a => a.task_id !== taskId));
  };
  const toggleDayDone = async (id) => {
    const t = dayTasks.find(x => x.id === id); if (!t) return;
    const done = !t.done;
    if (done) await removeDayAttachments(id);
    await supabase.from("day_tasks").update({ done }).eq("id", id);
    setDayTasks(prev => prev.map(x => x.id === id ? { ...x, done } : x));
  };
  const updateDayTask = async (id, updates) => {
    const db = { ...updates };
    if ("task_date" in db) {
      if (!db.task_date) return; // a day task always needs a date
      db.position = Math.max(0, ...dayTasks.filter(t => t.task_date === db.task_date).map(t => t.position || 0)) + 1;
    }
    await supabase.from("day_tasks").update(db).eq("id", id);
    setDayTasks(prev => prev.map(t => t.id === id ? { ...t, ...db } : t));
  };
  const removeDayTask = async (id) => {
    await removeDayAttachments(id);
    await supabase.from("day_tasks").delete().eq("id", id);
    setDayTasks(prev => prev.filter(t => t.id !== id)); setExpandedTask(null);
  };
  const moveAllOverdueToToday = async () => {
    const ids = overdueOpen.map(t => t.id); if (!ids.length) return;
    const base = Math.max(0, ...dayTasks.filter(t => t.task_date === todayStr).map(t => t.position || 0));
    const posMap = {}; overdueOpen.forEach((t, i) => { posMap[t.id] = base + 1 + i; });
    setDayTasks(prev => prev.map(t => t.id in posMap ? { ...t, task_date: todayStr, position: posMap[t.id] } : t));
    await Promise.all(overdueOpen.map(t => supabase.from("day_tasks").update({ task_date: todayStr, position: posMap[t.id] }).eq("id", t.id)));
  };

  const uploadDayAttachment = async (taskId, file) => {
    const fp = `${userId}/day/${taskId}/${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from("attachments").upload(fp, file); if (error) return;
    const { data } = await supabase.from("day_task_attachments").insert({ user_id: userId, task_id: taskId, file_name: file.name, file_path: fp, file_size: file.size }).select().single();
    if (data) setDayAttachments(prev => [...prev, data]);
  };
  const deleteDayAttachment = async (aid) => {
    const att = dayAttachments.find(a => a.id === aid); if (!att) return;
    await supabase.storage.from("attachments").remove([att.file_path]);
    await supabase.from("day_task_attachments").delete().eq("id", aid);
    setDayAttachments(prev => prev.filter(a => a.id !== aid));
  };

  // Reorder within the selected day
  const applyDayOrder = (ordered) => {
    const posMap = {}; ordered.forEach((t, i) => { posMap[t.id] = i; });
    setDayTasks(prev => prev.map(t => t.id in posMap ? { ...t, position: posMap[t.id] } : t));
    ordered.forEach((t, i) => { supabase.from("day_tasks").update({ position: i }).eq("id", t.id); });
  };
  const handleDayDrop = (e, targetId) => {
    e.preventDefault(); const srcId = dragIdRef.current; dragIdRef.current = null; setDragOverId(null); forceRender(n => n+1);
    if (!srcId || srcId === targetId) return;
    const list = [...dayOpen]; const fi = list.findIndex(t => t.id === srcId), ti = list.findIndex(t => t.id === targetId);
    if (fi === -1 || ti === -1) return;
    const [m] = list.splice(fi, 1); list.splice(ti, 0, m); applyDayOrder(list);
  };
  const moveDayTask = (taskId, dir) => {
    const list = [...dayOpen]; const i = list.findIndex(t => t.id === taskId); const ni = i + dir;
    if (i === -1 || ni < 0 || ni >= list.length) return;
    [list[i], list[ni]] = [list[ni], list[i]]; applyDayOrder(list);
  };

  const lpt = useRef(null);
  const startLP = (id, e) => { lpt.current = setTimeout(() => { const r = e.currentTarget.getBoundingClientRect(); setContextMenu({ id, x: r.right-20, y: r.bottom }); }, 500); };
  const cancelLP = () => { if (lpt.current) clearTimeout(lpt.current); };
  const signOut = async () => { await supabase.auth.signOut(); };

  if (!loaded) return <div style={{ height:"100vh",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'IBM Plex Sans',sans-serif",color:"#b0aca6" }}>Loading...</div>;

  return (
    <div style={{ fontFamily:"'IBM Plex Sans',-apple-system,sans-serif", height:"100vh", display:"flex", background:"#fdfdfc", color:"#1a1a1a", position:"relative", overflow:"hidden" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@300;400;500;600&display=swap');
        *{box-sizing:border-box;margin:0;padding:0} ::-webkit-scrollbar{width:0}
        input,textarea,button{font-family:'IBM Plex Sans',-apple-system,sans-serif}
        @keyframes appear{from{opacity:0}to{opacity:1}}
        @keyframes slideUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        button{cursor:pointer} textarea{resize:none}
        .g-item{transition:background .12s;border-radius:6px;cursor:pointer;user-select:none;-webkit-user-select:none}
        .g-item:hover{background:#f5f3f0}
        .g-note-btn{opacity:.35;transition:opacity .12s}
        .g-item:hover .g-note-btn{opacity:.7}
        .g-note-btn:hover{opacity:1!important}
        .g-note-btn.has-notes{opacity:.8}
        .task-row{transition:background .12s,box-shadow .12s}
        .task-row:hover{background:#fafaf8}
        .task-row:hover .t-remove{opacity:.35}
        .task-row:hover .drag-handle{opacity:.4}
        .t-remove{opacity:0;transition:opacity .12s} .t-remove:hover{opacity:1!important}
        .drag-handle{opacity:0;transition:opacity .12s;cursor:grab;user-select:none;-webkit-user-select:none}
        .drag-handle:active{cursor:grabbing}
        .task-row.dragging{opacity:.4} .task-row.drag-over{box-shadow:0 -2px 0 0 #b8b3ab}
        .check{appearance:none;-webkit-appearance:none;width:20px;height:20px;border:1.5px solid #c8c4be;border-radius:4px;cursor:pointer;transition:all .15s;flex-shrink:0;position:relative;background:#fff}
        .check:checked{background:#b8b3ab;border-color:#b8b3ab}
        .check:checked::after{content:'\\2713';position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:12px;color:#fff;font-weight:600}
        .check:hover{border-color:#9c9890}
        .ctx-menu{position:fixed;background:#fff;border:1px solid #e8e6e2;border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,.1);padding:4px;z-index:500;min-width:150px;animation:slideUp .1s ease}
        .ctx-item{display:block;width:100%;padding:9px 14px;border:none;background:none;text-align:left;font-size:13px;color:#4a4a46;border-radius:5px}
        .ctx-item:hover{background:#f5f3f0} .ctx-item.warn{color:#b87a5a} .ctx-item.warn:hover{background:#fdf8f5}
        .overlay{position:fixed;inset:0;background:rgba(26,26,26,.12);backdrop-filter:blur(2px);-webkit-backdrop-filter:blur(2px);z-index:400;display:flex;align-items:center;justify-content:center;animation:appear .15s ease}
        .modal{background:#fff;border-radius:14px;box-shadow:0 12px 48px rgba(0,0,0,.12);width:360px;max-width:90vw;max-height:70vh;overflow:hidden;animation:slideUp .2s ease}
        .sidebar-overlay{position:fixed;inset:0;background:rgba(26,26,26,.2);z-index:290;animation:appear .15s ease}
        .sidebar{z-index:300;border-right:1px solid #eae8e4;display:flex;flex-direction:column;background:#fdfdfc;transition:transform .25s ease}
      `}</style>

      {isMobile && sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}

      {/* SIDEBAR */}
      <div className="sidebar" style={{ width: isMobile?"85vw":240, minWidth: isMobile?0:240, position: isMobile?"fixed":"relative", top:0, left:0, bottom:0, transform: isMobile && !sidebarOpen ? "translateX(-100%)" : "translateX(0)" }}>
        <div style={{ padding: isMobile?"24px 20px 20px":"32px 24px 24px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <h1 style={{ fontSize:17, fontWeight:600, letterSpacing:"-0.01em" }}>Vibe Task</h1>
          <button onClick={signOut} title="Sign out" style={{ background:"none",border:"none",fontSize:12,color:"#b0aca6",padding:"4px 8px" }}>Sign out</button>
        </div>
        <div style={{ padding: isMobile?"0 20px 14px":"0 24px 16px" }}>
          <div style={{ display:"flex", background:"#f0eeea", borderRadius:8, padding:3 }}>
            {[["projects","Projects"],["week","Week"]].map(([k,l]) => (
              <button key={k} onClick={() => switchSection(k)}
                style={{ flex:1, padding: isMobile?"8px 0":"6px 0", borderRadius:6, border:"none", fontSize: isMobile?14:12.5, fontWeight:500,
                  background: section===k?"#fff":"transparent", color: section===k?"#1a1a1a":"#9c9890",
                  boxShadow: section===k?"0 1px 2px rgba(0,0,0,.06)":"none", transition:"all .15s" }}>{l}</button>
            ))}
          </div>
        </div>
        {section === "week" ? (
          <div style={{ flex:1, overflowY:"auto", padding:"0 12px", WebkitOverflowScrolling:"touch" }}>
            {dayItems.map((it, idx) => {
              const sel = selectedDay === it.key;
              const warn = it.key === "uncompleted" && it.count > 0;
              return (
                <React.Fragment key={it.key}>
                  {idx === 8 && <div style={{ height:1, background:"#eae8e4", margin:"6px 12px" }} />}
                  <div className="g-item" onClick={() => selectDay(it.key)}
                    style={{ padding: isMobile?"11px 12px":"9px 12px", display:"flex", alignItems:"baseline", gap:8, background: sel?"#f0eeea":"transparent", marginBottom:1 }}>
                    <span style={{ fontSize: isMobile?15:13.5, fontWeight: sel?500:400, color: warn?"#c4453a":"#1a1a1a" }}>{it.label}</span>
                    {it.sub && <span style={{ fontSize: isMobile?12.5:11.5, color:"#b0aca6" }}>{it.sub}</span>}
                    <span style={{ flex:1 }} />
                    {it.count > 0 && <span style={{ fontSize:12, color: warn?"#c4453a":"#b0aca6", fontWeight: warn?500:400 }}>{it.count}</span>}
                  </div>
                  {idx === 0 && <div style={{ height:1, background:"#eae8e4", margin:"6px 12px" }} />}
                </React.Fragment>
              );
            })}
          </div>
        ) : (
        <div style={{ flex:1, overflowY:"auto", padding:"0 12px", WebkitOverflowScrolling:"touch" }}>
          {[...activeGroups].sort((a,b) => a.name.localeCompare(b.name)).map(g => {
            const count = activeCount(g.id);
            const hasGN = g.notes && g.notes.trim().length > 0;
            return (
              <div key={g.id} className="g-item"
                onContextMenu={e => { e.preventDefault(); setContextMenu({ id:g.id, x:e.clientX, y:e.clientY }); }}
                onTouchStart={e => startLP(g.id,e)} onTouchEnd={cancelLP} onTouchMove={cancelLP}
                style={{ padding: isMobile?"11px 12px":"9px 12px", display:"flex", alignItems:"center", gap:6, background: selected===g.id?"#f0eeea":"transparent", marginBottom:1 }}>
                <button className={`g-note-btn${hasGN?" has-notes":""}`}
                  onClick={(e) => { e.stopPropagation(); selectGroupNotes(g.id); }}
                  title="Notes"
                  style={{ background:"none",border:"none",padding: isMobile?"4px 4px":"2px 3px",fontSize: isMobile?15:13,lineHeight:1,flexShrink:0, color: hasGN?"#7a8f96":"#c8c4be" }}>
                  {hasGN ? "📝" : "📄"}
                </button>
                <span onClick={() => selectGroup(g.id)}
                  style={{ fontSize: isMobile?15:13.5, fontWeight: selected===g.id?500:400, color:"#1a1a1a", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", flex:1, cursor:"pointer" }}>
                  {g.name}
                </span>
                {count > 0 && <span style={{ fontSize:12,color:"#b0aca6",marginLeft:4,flexShrink:0 }}>{count}</span>}
              </div>
            );
          })}
          {addingGroup ? (
            <div style={{ padding:"6px 12px", animation:"appear .15s ease" }}>
              <input ref={groupInputRef} value={newGroupName} onChange={e => setNewGroupName(e.target.value)}
                onKeyDown={e => { if (e.key==="Enter") addGroup(); if (e.key==="Escape"){setAddingGroup(false);setNewGroupName("");} }}
                onBlur={() => { if (!newGroupName.trim()){setAddingGroup(false);setNewGroupName("");} }}
                placeholder="Name..." style={{ width:"100%",padding:"10px 12px",borderRadius:6,border:"1px solid #ddd9d3",fontSize: isMobile?15:13,outline:"none",background:"#fff" }} />
            </div>
          ) : (
            <button onClick={() => setAddingGroup(true)} style={{ display:"block",width:"calc(100% - 8px)",margin:"8px 4px",padding: isMobile?"12px 12px":"9px 12px",borderRadius:6,border:"none",background:"transparent",color:"#b0aca6",fontSize: isMobile?15:13,textAlign:"left" }}>+ Add person or project</button>
          )}
        </div>
        )}
        {section === "projects" && archivedGroups.length > 0 && (
          <div style={{ borderTop:"1px solid #eae8e4", padding:"14px 20px" }}>
            <button onClick={() => setShowArchive(true)} style={{ background:"none",border:"none",padding:0,color:"#b0aca6",fontSize:12.5,display:"flex",alignItems:"center",gap:6 }}>↩ Archived ({archivedGroups.length})</button>
          </div>
        )}
      </div>

      {contextMenu && <div className="ctx-menu" style={{ left:contextMenu.x, top:contextMenu.y }} onClick={e => e.stopPropagation()}><button className="ctx-item warn" onClick={() => archiveGroup(contextMenu.id)}>Archive</button></div>}

      {showArchive && (
        <div className="overlay" onClick={() => setShowArchive(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div style={{ padding:"20px 24px 14px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <h3 style={{ fontSize:15, fontWeight:500 }}>Archived</h3>
              <button onClick={() => setShowArchive(false)} style={{ background:"none",border:"none",fontSize:18,color:"#b0aca6",lineHeight:1,padding:"4px" }}>×</button>
            </div>
            <div style={{ padding:"4px 16px 20px", maxHeight:"55vh", overflowY:"auto" }}>
              {archivedGroups.map(g => {
                const tc = tasks.filter(t => t.group_id===g.id).length;
                return (
                  <div key={g.id} style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 8px",borderBottom:"1px solid #f0eeea" }}>
                    <div><span style={{ fontSize:14,color:"#1a1a1a" }}>{g.name}</span><span style={{ fontSize:12,color:"#b0aca6",marginLeft:10 }}>{tc} task{tc!==1?"s":""}</span></div>
                    <button onClick={() => restoreGroup(g.id)} style={{ padding:"6px 14px",borderRadius:6,border:"1px solid #ddd9d3",background:"#fff",fontSize:12.5,color:"#4a4a46",fontWeight:500 }}>Restore</button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* MAIN PANEL */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden", width:"100%" }}>
        {section === "week" ? (
          <>
            <div style={{ padding: isMobile?"20px 20px 16px":"32px 40px 20px", borderBottom:"1px solid #eae8e4", display:"flex", alignItems:"center", gap:12 }}>
              {isMobile && <button onClick={() => setSidebarOpen(true)} style={{ background:"none",border:"none",fontSize:20,color:"#1a1a1a",padding:"4px",lineHeight:1,flexShrink:0 }}>☰</button>}
              <div style={{ flex:1, minWidth:0, display:"flex", alignItems:"baseline", gap:10, flexWrap:"wrap" }}>
                <h2 style={{ fontSize: isMobile?20:22, fontWeight:400, letterSpacing:"-0.02em" }}>{currentDayItem.label}</h2>
                {currentDate && <span style={{ fontSize:13, color:"#b0aca6" }}>{dayParts(currentDate).short}</span>}
                {selectedDay === "future" && <span style={{ fontSize:13, color:"#b0aca6" }}>after {dayParts(horizon).md}</span>}
              </div>
            </div>
            <div style={{ flex:1, overflowY:"auto", padding: isMobile?"12px 16px 32px":"16px 40px 40px", WebkitOverflowScrolling:"touch" }}>
              {selectedDay === "uncompleted" && (
                dayOpen.length === 0
                  ? <p style={{ fontSize:14, color:"#c8c4be", padding:"12px 0 0 4px" }}>Nothing left over from earlier days.</p>
                  : <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"0 0 8px 4px", gap:12 }}>
                      <span style={{ fontSize:12.5, color:"#b0aca6" }}>Unfinished tasks from past days</span>
                      <button onClick={moveAllOverdueToToday} style={{ padding:"6px 12px", borderRadius:6, border:"1px solid #ddd9d3", background:"#fff", fontSize:12.5, color:"#4a4a46", fontWeight:500, flexShrink:0 }}>Move all to today</button>
                    </div>
              )}
              {dayOpen.map((task, idx) => {
                const badge = selectedDay === "uncompleted" ? dayParts(task.task_date).short : selectedDay === "future" ? dayParts(task.task_date).short : null;
                return (
                  <TaskRow key={task.id} task={task} expanded={expandedTask===task.id} isMobile={isMobile}
                    dayMode badge={badge} badgeColor={selectedDay === "uncompleted" ? "#c4453a" : "#b0aca6"}
                    onMoveToToday={task.task_date !== todayStr ? () => updateDayTask(task.id, { task_date: todayStr }) : null}
                    draggable={!isMobile && canReorderDay} isDragging={dragIdRef.current===task.id} isDragOver={dragOverId===task.id && dragIdRef.current!==task.id}
                    onDragStart={(e) => handleDragStart(e,task.id)} onDragOver={(e) => handleDragOver(e,task.id)} onDragEnd={handleDragEnd} onDrop={(e) => handleDayDrop(e,task.id)}
                    onToggle={() => toggleDayDone(task.id)} onExpand={() => setExpandedTask(expandedTask===task.id?null:task.id)}
                    onUpdate={(u) => updateDayTask(task.id,u)} onRemove={() => removeDayTask(task.id)}
                    attachments={dayAttachments.filter(a => a.task_id===task.id)}
                    onUpload={(f) => uploadDayAttachment(task.id,f)} onDeleteAttachment={deleteDayAttachment} onOpenAttachment={openAttachment}
                    canMoveUp={canReorderDay && idx>0} canMoveDown={canReorderDay && idx<dayOpen.length-1}
                    onMoveUp={canReorderDay ? () => moveDayTask(task.id,-1) : null} onMoveDown={canReorderDay ? () => moveDayTask(task.id,1) : null} />
                );
              })}
              {selectedDay !== "uncompleted" && (addingDayTask ? (
                <div style={{ padding: isMobile?"10px 0 10px 32px":"10px 0 10px 42px", animation:"appear .15s ease" }}>
                  <input ref={dayInputRef} value={newDayTitle} onChange={e => setNewDayTitle(e.target.value)}
                    onKeyDown={e => { if (e.key==="Enter" && newDayTitle.trim()) addDayTask(); if (e.key==="Escape"){ setAddingDayTask(false); setNewDayTitle(""); } }}
                    onBlur={() => { if (!newDayTitle.trim() && selectedDay !== "future") { setAddingDayTask(false); setNewDayTitle(""); } }}
                    placeholder="Task description..." style={{ width:"100%",padding:"8px 0",border:"none",borderBottom:"1px solid #eae8e4",fontSize: isMobile?16:14,outline:"none",background:"transparent",color:"#1a1a1a" }} />
                  {selectedDay === "future" && (
                    <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:10, flexWrap:"wrap" }}>
                      <span style={{ fontSize:11.5,color:"#b0aca6",textTransform:"uppercase",letterSpacing:"0.04em" }}>Date</span>
                      <input type="date" value={newFutureDate} min={addDays(todayStr,7)} onChange={e => e.target.value && setNewFutureDate(e.target.value)}
                        style={{ padding:"6px 8px",borderRadius:5,border:"1px solid #e8e6e2",fontSize:13,color:"#4a4a46",outline:"none",background:"#fafaf8" }} />
                      <button onClick={addDayTask} disabled={!newDayTitle.trim()} style={{ padding:"6px 14px",borderRadius:6,border:"none",background:newDayTitle.trim()?"#1a1a1a":"#e8e6e2",color:newDayTitle.trim()?"#fdfdfc":"#b0aca6",fontSize:12.5,fontWeight:500 }}>Add</button>
                      <button onClick={() => { setAddingDayTask(false); setNewDayTitle(""); }} style={{ padding:"6px 10px",borderRadius:6,border:"none",background:"none",color:"#b0aca6",fontSize:12.5 }}>Cancel</button>
                    </div>
                  )}
                </div>
              ) : (
                <button onClick={() => { if (selectedDay === "future" && newFutureDate <= horizon) setNewFutureDate(addDays(todayStr,7)); setAddingDayTask(true); }}
                  style={{ padding: isMobile?"12px 0 12px 32px":"10px 0 10px 42px",background:"none",border:"none",color:"#b0aca6",fontSize: isMobile?15:13.5,display:"block" }}>+ Add task</button>
              ))}
              {dayDone.length > 0 && (
                <div style={{ marginTop:32 }}>
                  <button onClick={() => setShowDayDone({ ...showDayDone, [selectedDay]: !showDayDone[selectedDay] })} style={{ background:"none",border:"none",padding:"0 0 12px 0",color:"#b0aca6",fontSize:12.5,display:"flex",alignItems:"center",gap:6 }}>
                    <span style={{ display:"inline-block",fontSize:9,transform:showDayDone[selectedDay]?"rotate(90deg)":"rotate(0deg)",transition:"transform .15s ease" }}>▶</span>{dayDone.length} completed
                  </button>
                  {showDayDone[selectedDay] && dayDone.map(task => (
                    <TaskRow key={task.id} task={task} expanded={expandedTask===task.id} isMobile={isMobile} dayMode
                      onToggle={() => toggleDayDone(task.id)} onExpand={() => setExpandedTask(expandedTask===task.id?null:task.id)}
                      onUpdate={(u) => updateDayTask(task.id,u)} onRemove={() => removeDayTask(task.id)}
                      attachments={dayAttachments.filter(a => a.task_id===task.id)} onUpload={(f) => uploadDayAttachment(task.id,f)} onDeleteAttachment={deleteDayAttachment} onOpenAttachment={openAttachment} />
                  ))}
                </div>
              )}
            </div>
          </>
        ) : !selected ? (
          <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:20 }}>
            {isMobile && <button onClick={() => setSidebarOpen(true)} style={{ background:"#1a1a1a",color:"#fdfdfc",border:"none",padding:"12px 24px",borderRadius:8,fontSize:15,fontWeight:500,marginBottom:12 }}>Open menu</button>}
            <p style={{ fontSize:14,color:"#c8c4be" }}>Select a person or project</p>
          </div>
        ) : viewMode === "notes" ? (
          <GroupNotesView group={selectedGroup} isMobile={isMobile} onOpenSidebar={() => setSidebarOpen(true)} onSwitchToTasks={() => setViewMode("tasks")} onUpdateNotes={(n) => updateGroupNotes(selected,n)} />
        ) : (
          <>
            <div style={{ padding: isMobile?"20px 20px 16px":"32px 40px 20px", borderBottom:"1px solid #eae8e4", display:"flex", alignItems:"center", gap:12 }}>
              {isMobile && <button onClick={() => setSidebarOpen(true)} style={{ background:"none",border:"none",fontSize:20,color:"#1a1a1a",padding:"4px",lineHeight:1,flexShrink:0 }}>☰</button>}
              <h2 style={{ fontSize: isMobile?20:22, fontWeight:400, letterSpacing:"-0.02em", flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{selectedGroup?.name}</h2>
            </div>
            <div style={{ flex:1, overflowY:"auto", padding: isMobile?"12px 16px 32px":"16px 40px 40px", WebkitOverflowScrolling:"touch" }}>
              {activeTasks.map((task, idx) => (
                <TaskRow key={task.id} task={task} expanded={expandedTask===task.id} isMobile={isMobile}
                  draggable={!isMobile} isDragging={dragIdRef.current===task.id} isDragOver={dragOverId===task.id && dragIdRef.current!==task.id}
                  onDragStart={(e) => handleDragStart(e,task.id)} onDragOver={(e) => handleDragOver(e,task.id)} onDragEnd={handleDragEnd} onDrop={(e) => handleDrop(e,task.id)}
                  onToggle={() => toggleDone(task.id)} onExpand={() => setExpandedTask(expandedTask===task.id?null:task.id)}
                  onUpdate={(u) => updateTask(task.id,u)} onRemove={() => removeTask(task.id)}
                  attachments={attachments.filter(a => a.task_id===task.id)}
                  onUpload={(f) => uploadAttachment(task.id,f)} onDeleteAttachment={deleteAttachment} onOpenAttachment={openAttachment}
                  canMoveUp={idx>0} canMoveDown={idx<activeTasks.length-1} onMoveUp={() => moveTask(task.id,-1)} onMoveDown={() => moveTask(task.id,1)} />
              ))}
              {addingTask ? (
                <div style={{ padding: isMobile?"10px 0 10px 32px":"10px 0 10px 42px", animation:"appear .15s ease" }}>
                  <input ref={taskInputRef} value={newTaskTitle} onChange={e => setNewTaskTitle(e.target.value)}
                    onKeyDown={e => { if (e.key==="Enter"&&newTaskTitle.trim()){addTask();setTimeout(() => setAddingTask(true),10);} if (e.key==="Escape"){setAddingTask(false);setNewTaskTitle("");} }}
                    onBlur={() => { if (!newTaskTitle.trim()){setAddingTask(false);setNewTaskTitle("");} }}
                    placeholder="Task description..." style={{ width:"100%",padding:"8px 0",border:"none",borderBottom:"1px solid #eae8e4",fontSize: isMobile?16:14,outline:"none",background:"transparent",color:"#1a1a1a" }} />
                </div>
              ) : (
                <button onClick={() => setAddingTask(true)} style={{ padding: isMobile?"12px 0 12px 32px":"10px 0 10px 42px",background:"none",border:"none",color:"#b0aca6",fontSize: isMobile?15:13.5,display:"block" }}>+ Add task</button>
              )}
              {scheduledTasks.length > 0 && (
                <div style={{ marginTop:32 }}>
                  <button onClick={() => setShowScheduled({...showScheduled,[selected]:!isScheduledVisible})} style={{ background:"none",border:"none",padding:"0 0 12px 0",color:"#b0aca6",fontSize:12.5,display:"flex",alignItems:"center",gap:6 }}>
                    <span style={{ display:"inline-block",fontSize:9,transform:isScheduledVisible?"rotate(90deg)":"rotate(0deg)",transition:"transform .15s ease" }}>▶</span>{scheduledTasks.length} scheduled
                  </button>
                  {isScheduledVisible && scheduledTasks.map(task => (
                    <TaskRow key={task.id} task={task} expanded={expandedTask===task.id} isMobile={isMobile}
                      onToggle={() => toggleDone(task.id)} onExpand={() => setExpandedTask(expandedTask===task.id?null:task.id)}
                      onUpdate={(u) => updateTask(task.id,u)} onRemove={() => removeTask(task.id)}
                      attachments={attachments.filter(a => a.task_id===task.id)} onUpload={(f) => uploadAttachment(task.id,f)} onDeleteAttachment={deleteAttachment} onOpenAttachment={openAttachment} />
                  ))}
                </div>
              )}
              {doneTasks.length > 0 && (
                <div style={{ marginTop: scheduledTasks.length>0?16:32 }}>
                  <button onClick={() => setShowDone({...showDone,[selected]:!isDoneVisible})} style={{ background:"none",border:"none",padding:"0 0 12px 0",color:"#b0aca6",fontSize:12.5,display:"flex",alignItems:"center",gap:6 }}>
                    <span style={{ display:"inline-block",fontSize:9,transform:isDoneVisible?"rotate(90deg)":"rotate(0deg)",transition:"transform .15s ease" }}>▶</span>{doneTasks.length} completed
                  </button>
                  {isDoneVisible && doneTasks.map(task => (
                    <TaskRow key={task.id} task={task} expanded={expandedTask===task.id} isMobile={isMobile}
                      onToggle={() => toggleDone(task.id)} onExpand={() => setExpandedTask(expandedTask===task.id?null:task.id)}
                      onUpdate={(u) => updateTask(task.id,u)} onRemove={() => removeTask(task.id)}
                      attachments={attachments.filter(a => a.task_id===task.id)} onUpload={(f) => uploadAttachment(task.id,f)} onDeleteAttachment={deleteAttachment} onOpenAttachment={openAttachment} />
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

function GroupNotesView({ group, isMobile, onOpenSidebar, onSwitchToTasks, onUpdateNotes }) {
  const [localNotes, setLocalNotes] = useState(group?.notes || "");
  const [editing, setEditing] = useState(false);
  const ref = useRef(null);

  useEffect(() => { if (!editing) setLocalNotes(group?.notes || ""); }, [group?.notes, group?.id, editing]);
  useEffect(() => { if (editing && ref.current) { ref.current.focus(); ref.current.selectionStart = ref.current.value.length; } }, [editing]);

  const save = () => { onUpdateNotes(localNotes); setEditing(false); };

  return (
    <>
      <div style={{ padding: isMobile?"20px 20px 16px":"32px 40px 20px", borderBottom:"1px solid #eae8e4", display:"flex", alignItems:"center", gap:12 }}>
        {isMobile && <button onClick={onOpenSidebar} style={{ background:"none",border:"none",fontSize:20,color:"#1a1a1a",padding:"4px",lineHeight:1,flexShrink:0 }}>☰</button>}
        <div style={{ flex:1, minWidth:0 }}>
          <h2 style={{ fontSize: isMobile?20:22, fontWeight:400, letterSpacing:"-0.02em", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{group?.name}</h2>
          <div style={{ display:"flex", gap:16, marginTop:6 }}>
            <button onClick={onSwitchToTasks} style={{ background:"none",border:"none",padding:0,fontSize:13,color:"#b0aca6" }}>← Tasks</button>
            <span style={{ fontSize:13,color:"#1a1a1a",fontWeight:500 }}>Notes</span>
          </div>
        </div>
      </div>
      <div style={{ flex:1, overflowY:"auto", padding: isMobile?"16px 20px 32px":"24px 40px 40px", WebkitOverflowScrolling:"touch" }}>
        {editing ? (
          <textarea ref={ref} value={localNotes} onChange={e => setLocalNotes(e.target.value)}
            onBlur={save} onKeyDown={e => { if (e.key==="Escape") save(); }}
            placeholder="Add notes about this person or project..."
            style={{ width:"100%",minHeight:"calc(100vh - 200px)",padding:"12px 14px",borderRadius:8,border:"1px solid #ddd9d3",fontSize: isMobile?16:14,lineHeight:1.6,outline:"none",background:"#fafaf8",color:"#4a4a46" }} />
        ) : (
          <div onClick={() => setEditing(true)}
            style={{ minHeight:200,padding:"12px 14px",borderRadius:8,background:"#fafaf8",fontSize: isMobile?16:14,lineHeight:1.6,color:localNotes.trim()?"#4a4a46":"#b0aca6",cursor:"text",whiteSpace:"pre-wrap",borderLeft:localNotes.trim()?"3px solid #e0ddd8":"3px solid transparent" }}>
            {localNotes.trim() || "Add notes about this person or project..."}
          </div>
        )}
      </div>
    </>
  );
}

function TaskRow({ task, expanded, isMobile, draggable, isDragging, isDragOver,
  onDragStart, onDragOver, onDragEnd, onDrop, onToggle, onExpand, onUpdate, onRemove,
  attachments=[], onUpload, onDeleteAttachment, onOpenAttachment,
  canMoveUp, canMoveDown, onMoveUp, onMoveDown,
  dayMode = false, badge = null, badgeColor = "#b0aca6", onMoveToToday = null }) {

  const [editingTitle, setEditingTitle] = useState(false);
  const [localTitle, setLocalTitle] = useState(task.title);
  const [editingNotes, setEditingNotes] = useState(false);
  const [localNotes, setLocalNotes] = useState(task.notes || "");
  const [uploading, setUploading] = useState(false);
  const titleRef = useRef(null); const noteRef = useRef(null); const fileRef = useRef(null);

  useEffect(() => { setLocalTitle(task.title); }, [task.title]);
  useEffect(() => { if (!editingNotes) setLocalNotes(task.notes || ""); }, [task.notes, editingNotes]);
  useEffect(() => { if (editingTitle && titleRef.current) titleRef.current.focus(); }, [editingTitle]);
  useEffect(() => { if (editingNotes && noteRef.current) { noteRef.current.focus(); noteRef.current.selectionStart = noteRef.current.value.length; } }, [editingNotes]);

  const hasNotes = task.notes && task.notes.trim().length > 0;
  const actDate = task.activate_date || "", dueDate = task.due_date || "";
  const hasAct = !!actDate, hasDue = !!dueDate;
  const hasDetails = hasNotes || hasAct || hasDue || attachments.length > 0;
  const isScheduled = isFuture(actDate);
  const dueDays = daysUntil(dueDate);
  const isUrgent = hasDue && !task.done && dueDays <= 3;
  const isOverdue = hasDue && !task.done && dueDays < 0;
  const titleColor = task.done ? "#b0aca6" : isUrgent ? "#c4453a" : "#1a1a1a";
  const fs = isMobile ? 15 : 14;

  return (
    <div className={`task-row${isDragging?" dragging":""}${isDragOver?" drag-over":""}`}
      draggable={draggable && !editingTitle && !editingNotes && !expanded}
      onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDrop={onDrop}
      style={{ borderRadius:6, marginBottom:1 }}>
      <div style={{ display:"flex", alignItems:"flex-start", gap:0, padding: isMobile?"11px 4px 11px 0":"10px 8px 10px 0" }}>
        {draggable ? (
          <div className="drag-handle" style={{ width:18,minWidth:18,paddingTop:3,marginRight:4,display:"flex",flexDirection:"column",alignItems:"center",gap:2,fontSize:8,color:"#b8b3ab",lineHeight:1 }}>⠿</div>
        ) : <div style={{ width: isMobile?4:22, minWidth: isMobile?4:22 }} />}
        <input type="checkbox" className="check" checked={task.done} onChange={onToggle} style={{ marginTop:2 }} />
        <div style={{ flex:1, minWidth:0, marginLeft:10 }}>
          {editingTitle ? (
            <input ref={titleRef} value={localTitle} onChange={e => setLocalTitle(e.target.value)}
              onBlur={() => { onUpdate({title:localTitle}); setEditingTitle(false); }}
              onKeyDown={e => { if (e.key==="Enter"){onUpdate({title:localTitle});setEditingTitle(false);} if (e.key==="Escape"){setLocalTitle(task.title);setEditingTitle(false);} }}
              style={{ width:"100%",border:"none",borderBottom:"1px solid #ddd9d3",fontSize:fs,outline:"none",background:"transparent",padding:"0 0 2px",color:titleColor }} />
          ) : (
            <div style={{ display:"flex",alignItems:"flex-start",gap:6,flexWrap:"wrap" }}>
              <span onClick={() => !task.done && setEditingTitle(true)}
                style={{ fontSize:fs,fontWeight:400,color:titleColor,textDecoration:task.done?"line-through":"none",cursor:task.done?"default":"text",lineHeight:1.45 }}>
                {task.title}
              </span>
              {badge && !expanded && <span style={{ fontSize:11,flexShrink:0,fontWeight:500,color:badgeColor,lineHeight:1.8 }}>{badge}</span>}
              {hasDue && !task.done && !expanded && <span style={{ fontSize:11,flexShrink:0,fontWeight:500,color:isUrgent?"#c4453a":"#b0aca6",lineHeight:1.8 }}>{isOverdue?"overdue":`due ${fmtDate(dueDate)}`}</span>}
              {isScheduled && !expanded && <span style={{ fontSize:11,color:"#b0aca6",flexShrink:0,lineHeight:1.8 }}>{fmtDate(actDate)}</span>}
              <button onClick={onExpand} style={{ background:"none",border:"none",padding: isMobile?"2px 8px":"1px 4px",color:hasDetails?"#a8a4a0":"#d4d1cc",fontSize:14,lineHeight:1,flexShrink:0,borderRadius:3 }} title="Details">
                {expanded ? "▾" : hasDetails ? "▸" : "＋"}
              </button>
            </div>
          )}
          {expanded && (
            <div style={{ marginTop:10, animation:"appear .12s ease", display:"flex", flexDirection:"column", gap:8 }}>
              {editingNotes ? (
                <textarea ref={noteRef} value={localNotes} onChange={e => setLocalNotes(e.target.value)}
                  onBlur={() => { onUpdate({notes:localNotes}); setEditingNotes(false); }}
                  onKeyDown={e => { if (e.key==="Escape"){onUpdate({notes:localNotes});setEditingNotes(false);} }}
                  rows={Math.max(2,(localNotes.match(/\n/g)||[]).length+2)} placeholder="Add a note..."
                  style={{ width:"100%",padding:"8px 10px",borderRadius:5,border:"1px solid #ddd9d3",fontSize: isMobile?15:13,lineHeight:1.55,outline:"none",background:"#fafaf8",color:"#4a4a46" }} />
              ) : (
                <div onClick={() => setEditingNotes(true)}
                  style={{ padding:"8px 10px",borderRadius:5,background:"#fafaf8",fontSize: isMobile?15:13,lineHeight:1.55,color:hasNotes?"#5a5a56":"#b0aca6",cursor:"text",minHeight:40,whiteSpace:"pre-wrap",borderLeft:hasNotes?"2px solid #e0ddd8":"2px solid transparent" }}>
                  {hasNotes ? task.notes : "Add a note..."}
                </div>
              )}
              {dayMode ? (
                <div style={{ display:"flex",alignItems:"center",gap:8,padding:"2px 0",flexWrap:"wrap" }}>
                  <span style={{ fontSize:11.5,color:"#b0aca6",textTransform:"uppercase",letterSpacing:"0.04em",minWidth:58 }}>Date</span>
                  <input type="date" value={task.task_date || ""} onChange={e => e.target.value && onUpdate({task_date:e.target.value})} style={{ padding:"6px 8px",borderRadius:5,border:"1px solid #e8e6e2",fontSize:13,color:"#4a4a46",outline:"none",background:"#fafaf8" }} />
                  {onMoveToToday && !task.done && <button onClick={onMoveToToday} style={{ padding:"6px 10px",borderRadius:5,border:"1px solid #e0ddd8",background:"#fafaf8",color:"#6b5d4e",fontSize:12 }}>Move to today</button>}
                </div>
              ) : (
              <div style={{ display:"flex",flexDirection:"column",gap:6 }}>
                <div style={{ display:"flex",alignItems:"center",gap:8,padding:"2px 0" }}>
                  <span style={{ fontSize:11.5,color:isUrgent?"#c4453a":"#b0aca6",textTransform:"uppercase",letterSpacing:"0.04em",minWidth:58,fontWeight:isUrgent?500:400 }}>Due</span>
                  <input type="date" value={dueDate} onChange={e => onUpdate({dueDate:e.target.value})} style={{ padding:"6px 8px",borderRadius:5,border:`1px solid ${isUrgent?"#e8c4c0":"#e8e6e2"}`,fontSize:13,color:isUrgent?"#c4453a":hasDue?"#4a4a46":"#b0aca6",outline:"none",background:isUrgent?"#fdf6f5":"#fafaf8" }} />
                  {hasDue && <button onClick={() => onUpdate({dueDate:""})} style={{ background:"none",border:"none",fontSize:14,color:"#c8c4be",padding:"4px 6px",lineHeight:1 }}>×</button>}
                </div>
                <div style={{ display:"flex",alignItems:"center",gap:8,padding:"2px 0" }}>
                  <span style={{ fontSize:11.5,color:"#b0aca6",textTransform:"uppercase",letterSpacing:"0.04em",minWidth:58 }}>Activate</span>
                  <input type="date" value={actDate} onChange={e => onUpdate({activateDate:e.target.value})} style={{ padding:"6px 8px",borderRadius:5,border:"1px solid #e8e6e2",fontSize:13,color:hasAct?"#4a4a46":"#b0aca6",outline:"none",background:"#fafaf8" }} />
                  {hasAct && <button onClick={() => onUpdate({activateDate:""})} style={{ background:"none",border:"none",fontSize:14,color:"#c8c4be",padding:"4px 6px",lineHeight:1 }}>×</button>}
                </div>
              </div>
              )}
              <div style={{ display:"flex",flexDirection:"column",gap:4 }}>
                {attachments.map(att => (
                  <div key={att.id} style={{ display:"flex",alignItems:"center",gap:8,padding:"4px 0" }}>
                    <span style={{ fontSize:13,color:"#4a9cc4",cursor:"pointer",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1 }} onClick={() => onOpenAttachment(att.file_path)}>📎 {att.file_name}</span>
                    <span style={{ fontSize:11,color:"#b0aca6",flexShrink:0 }}>{att.file_size<1024?`${att.file_size} B`:att.file_size<1048576?`${(att.file_size/1024).toFixed(0)} KB`:`${(att.file_size/1048576).toFixed(1)} MB`}</span>
                    <button onClick={() => onDeleteAttachment(att.id)} style={{ background:"none",border:"none",fontSize:13,color:"#c8c4be",padding:"2px 4px",lineHeight:1,flexShrink:0 }}>×</button>
                  </div>
                ))}
                <input ref={fileRef} type="file" style={{ display:"none" }} onChange={async (e) => { const f=e.target.files?.[0]; if(!f)return; setUploading(true); await onUpload(f); setUploading(false); e.target.value=""; }} />
                <button onClick={() => fileRef.current?.click()} disabled={uploading}
                  style={{ alignSelf:"flex-start",padding:"5px 10px",borderRadius:5,border:"1px solid #e0ddd8",background:"#fafaf8",color:uploading?"#b0aca6":"#6b5d4e",fontSize:12,display:"flex",alignItems:"center",gap:5 }}>
                  {uploading ? "Uploading..." : "📎 Attach file"}
                </button>
              </div>
              {isMobile && (onMoveUp || onMoveDown) && (
                <div style={{ display:"flex",gap:6,marginTop:4 }}>
                  <button onClick={onMoveUp} disabled={!canMoveUp} style={{ padding:"6px 14px",borderRadius:5,border:"1px solid #e0ddd8",background:"#fafaf8",color:canMoveUp?"#6b5d4e":"#d4d1cc",fontSize:12,display:"flex",alignItems:"center",gap:4 }}>↑ Move up</button>
                  <button onClick={onMoveDown} disabled={!canMoveDown} style={{ padding:"6px 14px",borderRadius:5,border:"1px solid #e0ddd8",background:"#fafaf8",color:canMoveDown?"#6b5d4e":"#d4d1cc",fontSize:12,display:"flex",alignItems:"center",gap:4 }}>↓ Move down</button>
                </div>
              )}
              <button onClick={onRemove} style={{ alignSelf:"flex-start",padding:"6px 12px",borderRadius:5,border:"1px solid #e8d4d4",background:"#fdf8f7",color:"#c47a6a",fontSize:12,marginTop:4 }}>Delete task</button>
            </div>
          )}
        </div>
        {!isMobile && <button className="t-remove" onClick={onRemove} style={{ background:"none",border:"none",fontSize:14,color:"#c8c4be",padding:"2px 4px",lineHeight:1,marginTop:1 }}>×</button>}
      </div>
    </div>
  );
}
