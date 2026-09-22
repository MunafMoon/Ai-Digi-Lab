import { Bell, Bot, CalendarDays, CheckCircle2, ChevronLeft, Circle, Command, FileText, Flag, GitBranch, Home, Inbox, LayoutDashboard, MessageSquare, Milestone, Moon, Plus, Search, Settings, Users, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type View = "Board" | "Backlog" | "Sprints" | "Roadmap" | "Calendar" | "AI Assistant";
type Priority = "Urgent" | "High" | "Medium" | "Low" | "No Priority";
type Task = { id: string; title: string; status: string; priority: Priority; assignee: string; points: number; due: string; sprint: string | null; epic: string | null; labels: string[]; description: string; comments: string[] };

const navItems = [[Home, "Home"], [CheckCircle2, "My Tasks"], [Inbox, "Inbox"], [Bot, "AI Assistant"], [LayoutDashboard, "Projects"], [Users, "Teams"], [BarChart, "Reports"], [CalendarDays, "Calendar"], [FileText, "Documents"], [Settings, "Settings"]] as const;
const columns = ["Backlog", "Todo", "In Progress", "In Review", "QA", "Done"];
const tabs: View[] = ["Board", "Backlog", "Sprints", "Roadmap", "Calendar", "AI Assistant"];
const projects = [{ key: "ECOM", name: "E-Commerce Platform", health: "At Risk", tasks: 18 }, { key: "BANK", name: "Mobile Banking App", health: "Attention", tasks: 14 }, { key: "CRM", name: "CRM Platform", health: "Healthy", tasks: 11 }];
const workload = [{ name: "Alex", points: 18 }, { name: "Maya", points: 12 }, { name: "Jordan", points: 25 }, { name: "Priya", points: 15 }];
const sprints = [{ name: "Sprint Alpha", status: "Active", goal: "Ship secure authentication and stabilize checkout.", range: "Sep 18 - Oct 2" }, { name: "Sprint Beta", status: "Planned", goal: "Complete integration tests and polish handoff workflows.", range: "Oct 3 - Oct 17" }];
const epics = [{ name: "Authentication", color: "bg-iris", window: "Sep 18 - Oct 10" }, { name: "Checkout Reliability", color: "bg-mint", window: "Sep 22 - Oct 18" }];
const initialTasks: Task[] = [
  { id: "ECOM-1", title: "Design authentication flow", status: "In Progress", priority: "High", assignee: "Alex", points: 5, due: "Sep 24", sprint: "Sprint Alpha", epic: "Authentication", labels: ["auth", "ux"], description: "Create secure login and signup UX with validation states.", comments: ["Maya: OAuth edge cases are documented."] },
  { id: "ECOM-2", title: "Configure Google OAuth", status: "Todo", priority: "Urgent", assignee: "Priya", points: 3, due: "Sep 23", sprint: "Sprint Alpha", epic: "Authentication", labels: ["auth"], description: "Set up provider credentials and callback validation.", comments: [] },
  { id: "ECOM-3", title: "Build checkout timeout alert", status: "QA", priority: "Medium", assignee: "Jordan", points: 2, due: "Sep 27", sprint: "Sprint Alpha", epic: "Checkout Reliability", labels: ["checkout", "bug"], description: "Warn users when payment sessions are about to expire.", comments: ["Alex: QA can use the Stripe test clock scenario."] },
  { id: "ECOM-4", title: "Write auth integration tests", status: "Backlog", priority: "High", assignee: "Maya", points: 5, due: "Oct 5", sprint: "Sprint Beta", epic: "Authentication", labels: ["tests"], description: "Cover signup, login, refresh rotation, and tenant isolation.", comments: [] },
  { id: "ECOM-5", title: "Review payment webhook logging", status: "Done", priority: "Low", assignee: "Jordan", points: 2, due: "Sep 20", sprint: "Sprint Alpha", epic: "Checkout Reliability", labels: ["payments"], description: "Make failed webhook attempts visible in activity history.", comments: ["Jordan: Complete and merged."] },
  { id: "ECOM-6", title: "Document sprint release notes", status: "Backlog", priority: "No Priority", assignee: "Alex", points: 1, due: "Oct 12", sprint: null, epic: null, labels: ["docs"], description: "Prepare release notes for the sprint closeout.", comments: [] }
];
const priorityTone: Record<Priority, string> = { Urgent: "text-coral", High: "text-rose-600", Medium: "text-amber-600", Low: "text-mint", "No Priority": "text-slate-400" };

export function App() {
  const [tasks, setTasks] = useState(initialTasks);
  const [selectedTaskId, setSelectedTaskId] = useState("ECOM-1");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<View>("Board");
  const selectedTask = tasks.find((task) => task.id === selectedTaskId) ?? tasks[0];
  const filteredTasks = useMemo(() => tasks.filter((task) => `${task.id} ${task.title} ${task.assignee} ${task.labels.join(" ")} ${task.epic ?? ""} ${task.sprint ?? ""}`.toLowerCase().includes(query.toLowerCase())), [tasks, query]);
  const activeSprintTasks = filteredTasks.filter((task) => task.sprint === "Sprint Alpha");
  const aiTaskBreakdown = ["Clarify authentication acceptance criteria", "Design OAuth callback and session model", "Implement JWT refresh rotation", "Add tenant isolation tests", "Document security review notes"];

  function moveTask(id: string, status: string) { setTasks((items) => items.map((task) => task.id === id ? { ...task, status } : task)); }
  function moveToSprint(id: string, sprint: string | null) { setTasks((items) => items.map((task) => task.id === id ? { ...task, sprint } : task)); }
  function createTask() { const next = tasks.length + 1; const task: Task = { id: `ECOM-${next}`, title: "New task from quick create", status: "Todo", priority: "Medium", assignee: "Unassigned", points: 1, due: "Oct 1", sprint: null, epic: null, labels: ["triage"], description: "Created from the Phase 4 quick action.", comments: [] }; setTasks((items) => [task, ...items]); setSelectedTaskId(task.id); }
  function addComment() { setTasks((items) => items.map((task) => task.id === selectedTask.id ? { ...task, comments: [...task.comments, "Alex: Added a follow-up note from the task drawer."] } : task)); }

  return <main className="min-h-screen bg-mist text-ink"><div className="flex min-h-screen"><aside className="hidden w-72 shrink-0 border-r border-slate-200 bg-white px-4 py-5 lg:block"><div className="mb-6 flex items-center justify-between"><div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Workspace</p><h1 className="text-lg font-semibold">Acme Technologies</h1></div><button className="rounded-md border border-slate-200 p-2"><ChevronLeft size={16} /></button></div><nav className="space-y-1">{navItems.map(([Icon, label]) => <button key={label} className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm ${label === "Projects" ? "bg-slate-100 text-ink" : "text-slate-700 hover:bg-slate-100"}`}><Icon size={17} /> {label}</button>)}</nav></aside><section className="flex min-w-0 flex-1 flex-col"><header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur md:px-6"><div className="flex items-center gap-3"><div className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500"><Search size={16} /><input className="min-w-0 flex-1 bg-transparent outline-none" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search projects, tasks, sprints, epics" /><span className="ml-auto hidden items-center gap-1 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-xs md:flex"><Command size={12} /> K</span></div><button onClick={createTask} className="rounded-md bg-ink px-3 py-2 text-sm font-medium text-white"><Plus className="mr-1 inline" size={16} /> Task</button><button className="rounded-md border border-slate-200 p-2"><Bot size={18} /></button><button className="rounded-md border border-slate-200 p-2"><Bell size={18} /></button><button className="rounded-md border border-slate-200 p-2"><Moon size={18} /></button></div></header><div className="grid min-h-0 gap-6 p-4 md:p-6 xl:grid-cols-[1fr_380px]"><div className="min-w-0 space-y-6"><section className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between"><div><p className="text-sm font-medium text-slate-500">Project workspace</p><h2 className="mt-1 text-3xl font-semibold tracking-normal">E-Commerce Platform</h2></div><div className="flex flex-wrap gap-2 text-sm">{tabs.map((tab) => <button key={tab} onClick={() => setView(tab)} className={`rounded-md border px-3 py-2 ${view === tab ? "border-ink bg-ink text-white" : "border-slate-200 bg-white"}`}>{tab}</button>)}</div></section><section className="grid gap-3 md:grid-cols-3">{projects.map((project) => <article key={project.key} className="rounded-md border border-slate-200 bg-white p-4"><div className="flex items-center justify-between"><p className="font-semibold">{project.name}</p><span className="rounded bg-slate-100 px-2 py-1 text-xs">{project.key}</span></div><p className="mt-3 text-sm text-slate-600">{project.tasks} active tasks</p><p className={`mt-2 text-sm font-medium ${project.health === "Healthy" ? "text-mint" : project.health === "Attention" ? "text-amber-600" : "text-coral"}`}>{project.health}</p></article>)}</section>{view === "Board" && <Board tasks={filteredTasks} moveTask={moveTask} selectTask={setSelectedTaskId} />}{view === "Backlog" && <Backlog tasks={filteredTasks} moveToSprint={moveToSprint} selectTask={setSelectedTaskId} />}{view === "Sprints" && <Sprints tasks={activeSprintTasks} />}{view === "Roadmap" && <Roadmap tasks={filteredTasks} />}{view === "Calendar" && <Calendar tasks={filteredTasks} />}{view === "AI Assistant" && <AIAssistant tasks={filteredTasks} breakdown={aiTaskBreakdown} />}</div><aside className="space-y-4"><TaskPanel task={selectedTask} addComment={addComment} /><section className="rounded-md border border-slate-200 bg-white p-4"><h3 className="font-semibold">Team workload</h3><div className="mt-4 h-48"><ResponsiveContainer width="100%" height="100%"><BarChart data={workload}><XAxis dataKey="name" /><YAxis /><Tooltip /><Bar dataKey="points" fill="#18a999" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div></section><section className="rounded-md border border-slate-200 bg-white p-4"><h3 className="font-semibold">Activity</h3><div className="mt-3 space-y-3 text-sm text-slate-700"><p><Circle className="mr-2 inline text-mint" size={10} />Sprint Alpha started</p><p><Circle className="mr-2 inline text-amber-500" size={10} />ECOM-4 moved to Sprint Beta</p><p><Circle className="mr-2 inline text-iris" size={10} />Authentication epic updated</p></div></section></aside></div></section></div></main>;
}

function Board({ tasks, moveTask, selectTask }: { tasks: Task[]; moveTask: (id: string, status: string) => void; selectTask: (id: string) => void }) { return <section className="overflow-x-auto pb-2"><div className="grid min-w-[980px] grid-cols-6 gap-3">{columns.map((column) => <div key={column} className="rounded-md border border-slate-200 bg-white"><div className="flex items-center justify-between border-b border-slate-200 px-3 py-2"><h3 className="text-sm font-semibold">{column}</h3><span className="text-xs text-slate-500">{tasks.filter((task) => task.status === column).length}</span></div><div className="space-y-2 p-2">{tasks.filter((task) => task.status === column).map((task) => <TaskCard key={task.id} task={task} selectTask={selectTask} moveTask={moveTask} />)}</div></div>)}</div></section>; }
function TaskCard({ task, selectTask, moveTask }: { task: Task; selectTask: (id: string) => void; moveTask: (id: string, status: string) => void }) { return <button onClick={() => selectTask(task.id)} className="w-full rounded-md border border-slate-200 bg-slate-50 p-3 text-left hover:border-slate-300"><div className="flex items-start justify-between gap-2"><p className="text-sm font-medium leading-5">{task.title}</p><Flag className={priorityTone[task.priority]} size={15} /></div><p className="mt-2 text-xs text-slate-500">{task.id} - {task.points} pts - {task.due}</p><div className="mt-3 flex items-center justify-between"><span className="rounded bg-white px-2 py-1 text-xs text-slate-600">{task.assignee}</span><select value={task.status} onChange={(event) => moveTask(task.id, event.target.value)} className="rounded border border-slate-200 bg-white text-xs">{columns.map((column) => <option key={column}>{column}</option>)}</select></div></button>; }
function Backlog({ tasks, moveToSprint, selectTask }: { tasks: Task[]; moveToSprint: (id: string, sprint: string | null) => void; selectTask: (id: string) => void }) { const backlog = tasks.filter((task) => !task.sprint); const buckets = [...sprints.map((sprint) => sprint.name), "Backlog"]; return <section className="grid gap-3 lg:grid-cols-3">{buckets.map((bucket) => { const bucketTasks = bucket === "Backlog" ? backlog : tasks.filter((task) => task.sprint === bucket); return <div key={bucket} className="rounded-md border border-slate-200 bg-white p-3"><h3 className="font-semibold">{bucket}</h3><div className="mt-3 space-y-2">{bucketTasks.map((task) => <div key={task.id} className="rounded-md bg-slate-50 p-3 text-sm"><button onClick={() => selectTask(task.id)} className="text-left font-medium">{task.id} {task.title}</button><select className="mt-2 w-full rounded border border-slate-200 bg-white text-xs" value={task.sprint ?? ""} onChange={(event) => moveToSprint(task.id, event.target.value || null)}><option value="">Backlog</option>{sprints.map((sprint) => <option key={sprint.name}>{sprint.name}</option>)}</select></div>)}</div></div>; })}</section>; }
function Sprints({ tasks }: { tasks: Task[] }) { const complete = tasks.filter((task) => task.status === "Done").reduce((sum, task) => sum + task.points, 0); const total = tasks.reduce((sum, task) => sum + task.points, 0); return <section className="grid gap-3 lg:grid-cols-[1fr_1fr_1fr]"><article className="rounded-md border border-slate-200 bg-white p-4"><h3 className="font-semibold">Sprint Alpha</h3><p className="mt-2 text-sm text-slate-600">Ship secure authentication and stabilize checkout.</p><p className="mt-4 text-2xl font-semibold">{complete}/{total} pts</p></article><article className="rounded-md border border-slate-200 bg-white p-4"><h3 className="font-semibold">Blocked tasks</h3><p className="mt-4 text-2xl font-semibold">1</p><p className="mt-2 text-sm text-slate-600">ECOM-2 needs OAuth credentials.</p></article><article className="rounded-md border border-slate-200 bg-white p-4"><h3 className="font-semibold">Velocity</h3><p className="mt-4 text-2xl font-semibold">21 pts</p><p className="mt-2 text-sm text-slate-600">Based on last completed sprint.</p></article></section>; }
function Roadmap({ tasks }: { tasks: Task[] }) { return <section className="rounded-md border border-slate-200 bg-white p-4"><h3 className="font-semibold">Roadmap</h3><div className="mt-4 space-y-4">{epics.map((epic) => <div key={epic.name}><div className="flex items-center gap-2 text-sm font-medium"><GitBranch size={16} />{epic.name}<span className="text-slate-500">{epic.window}</span></div><div className="mt-2 h-3 rounded bg-slate-100"><div className={`h-3 rounded ${epic.color}`} style={{ width: epic.name === "Authentication" ? "70%" : "45%" }} /></div><div className="mt-2 flex flex-wrap gap-2">{tasks.filter((task) => task.epic === epic.name).map((task) => <span key={task.id} className="rounded bg-slate-50 px-2 py-1 text-xs">{task.id}</span>)}</div></div>)}</div></section>; }
function Calendar({ tasks }: { tasks: Task[] }) { return <section className="rounded-md border border-slate-200 bg-white p-4"><h3 className="font-semibold">Calendar Agenda</h3><div className="mt-4 grid gap-2 md:grid-cols-2">{tasks.map((task) => <div key={task.id} className="rounded-md border border-slate-200 p-3 text-sm"><Milestone className="mr-2 inline text-iris" size={15} /><span className="font-medium">{task.due}</span> - {task.id} {task.title}</div>)}</div></section>; }
function AIAssistant({ tasks, breakdown }: { tasks: Task[]; breakdown: string[] }) {
  const active = tasks.filter((task) => task.status !== "Done");
  const risks = tasks.filter((task) => task.priority === "Urgent" || task.priority === "High");
  const blocked = tasks.filter((task) => task.id === "ECOM-2");
  const completedPoints = tasks.filter((task) => task.status === "Done").reduce((sum, task) => sum + task.points, 0);
  const totalPoints = tasks.reduce((sum, task) => sum + task.points, 0);

  return (
    <section className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <div className="space-y-4">
        <div className="rounded-md border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-2">
            <Bot className="text-iris" size={20} />
            <h3 className="font-semibold">AI Project Manager</h3>
          </div>
          <div className="mt-4 space-y-3 text-sm">
            <div className="rounded-md bg-slate-50 p-3"><p className="font-medium">Will we finish Sprint Alpha on time?</p></div>
            <div className="rounded-md border border-slate-200 p-3 leading-6 text-slate-700">
              Sprint Alpha is {Math.round((completedPoints / Math.max(totalPoints, 1)) * 100)}% complete by story points. Delivery needs attention because {risks.length} high-priority items remain and ECOM-2 is treated as the main blocker.
            </div>
          </div>
          <div className="mt-4 rounded-md border border-slate-200 p-3">
            <p className="text-sm font-semibold">Tool evidence</p>
            <div className="mt-2 grid gap-2 text-xs text-slate-600 md:grid-cols-3">
              <span className="rounded bg-slate-50 px-2 py-1">getTasks: {tasks.length} tasks</span>
              <span className="rounded bg-slate-50 px-2 py-1">getBlockedTasks: {blocked.length} task</span>
              <span className="rounded bg-slate-50 px-2 py-1">getWorkload: 4 members</span>
            </div>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <article className="rounded-md border border-slate-200 bg-white p-4">
            <h3 className="font-semibold">Project health</h3>
            <p className="mt-3 text-2xl font-semibold text-coral">At Risk</p>
            <p className="mt-2 text-sm text-slate-600">{active.length} active tasks, {risks.length} high-priority, 1 blocker. Health is calculated first, then explained.</p>
          </article>
          <article className="rounded-md border border-slate-200 bg-white p-4">
            <h3 className="font-semibold">AI prioritize</h3>
            <div className="mt-3 space-y-2 text-sm">
              {risks.slice(0, 3).map((task) => <p key={task.id} className="rounded bg-slate-50 p-2"><Flag className="mr-2 inline text-coral" size={14} />{task.id} - {task.title}</p>)}
            </div>
          </article>
        </div>
      </div>

      <div className="space-y-4">
        <div className="rounded-md border border-slate-200 bg-white p-4">
          <h3 className="font-semibold">Daily standup</h3>
          <div className="mt-3 space-y-2 text-sm text-slate-700">
            <p><span className="font-medium">Yesterday:</span> ECOM-5 completed.</p>
            <p><span className="font-medium">Today:</span> ECOM-1 and ECOM-2.</p>
            <p><span className="font-medium">Blockers:</span> OAuth credentials for ECOM-2.</p>
          </div>
        </div>
        <div className="rounded-md border border-slate-200 bg-white p-4">
          <h3 className="font-semibold">Sprint summary</h3>
          <p className="mt-2 text-sm text-slate-700">Velocity: {completedPoints} pts. Remaining: {Math.max(totalPoints - completedPoints, 0)} pts.</p>
          <p className="mt-2 text-sm text-slate-700">Suggested action: clear blockers before accepting new scope.</p>
        </div>
        <div className="rounded-md border border-slate-200 bg-white p-4">
          <h3 className="font-semibold">Retrospective draft</h3>
          <p className="mt-2 text-sm text-slate-700">Improve by escalating blocked urgent work within one day and splitting large security tasks earlier.</p>
        </div>
        <div className="rounded-md border border-slate-200 bg-white p-4">
          <h3 className="font-semibold">Task breakdown draft</h3>
          <div className="mt-3 space-y-2 text-sm text-slate-700">{breakdown.map((item) => <p key={item} className="rounded bg-slate-50 p-2"><CheckCircle2 className="mr-2 inline text-mint" size={15} />{item}</p>)}</div>
        </div>
      </div>
    </section>
  );
}

function TaskPanel({ task, addComment }: { task: Task; addComment: () => void }) { return <section className="rounded-md border border-slate-200 bg-white p-4"><div className="flex items-start justify-between"><div><p className="text-sm text-slate-500">{task.id}</p><h3 className="mt-1 font-semibold">{task.title}</h3></div><button className="rounded-md border border-slate-200 p-2"><X size={16} /></button></div><p className="mt-3 text-sm leading-6 text-slate-700">{task.description}</p><div className="mt-4 grid grid-cols-2 gap-2 text-sm"><Info label="Status" value={task.status} /><Info label="Priority" value={task.priority} /><Info label="Sprint" value={task.sprint ?? "Backlog"} /><Info label="Epic" value={task.epic ?? "None"} /></div><div className="mt-4 flex flex-wrap gap-2">{task.labels.map((label) => <span key={label} className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-600">{label}</span>)}</div><button onClick={addComment} className="mt-4 w-full rounded-md bg-ink px-3 py-2 text-sm font-medium text-white"><MessageSquare className="mr-1 inline" size={16} /> Add comment</button><div className="mt-4 space-y-2">{task.comments.map((comment) => <p key={comment} className="rounded-md bg-slate-50 p-2 text-sm text-slate-700">{comment}</p>)}</div></section>; }
function Info({ label, value }: { label: string; value: string }) { return <div className="rounded-md border border-slate-200 p-2"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 font-medium">{value}</p></div>; }

