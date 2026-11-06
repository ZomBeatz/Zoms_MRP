import { useEffect, useMemo, useState } from "react";
import {
  BookOpen, FlaskConical,
  BarChart3, CalendarRange, ClipboardList, GraduationCap, ChevronsLeft, ChevronsRight, LayoutDashboard, Menu, Plane, Plus, Settings as Cog, Users, Wrench, X, Scale, ClipboardCheck, Search, Calculator
} from "lucide-react";
import { useStore } from "./store";
import { RELEASES_URL, isDesktopApp, isOnlineDemo } from "./platform";
import { findIssues } from "./coverage";
import { autoPlans } from "./program";
import type { Page } from "./types";
import { Wordmark, LogoMark } from "./components/Logo";
import { Overview } from "./pages/Overview";
import { Schedule } from "./pages/Schedule";
import { Missions } from "./pages/Missions";
import { AircraftPage } from "./pages/Aircraft";
import { People } from "./pages/People";
import { Maintenance } from "./pages/Maintenance";
import { Reports } from "./pages/Reports";
import { Balance } from "./pages/Balance";
import { Planner } from "./pages/Planner";
import { Inspections } from "./pages/Inspections";
import { TrainingPage } from "./pages/Training";
import { SettingsPage } from "./pages/Settings";
import { Dialogs } from "./dialogs";
import { Welcome } from "./pages/Welcome";
import { Guide } from "./pages/Guide";
import { TourOverlay } from "./tour";
import { QuickFind } from "./components/QuickFind";
import { PageNote } from "./components/PageNote";
import { ErrorBoundary } from "./components/ErrorBoundary";

const NAV: { page: Page; label: string; icon: typeof Plane }[] = [
  { page: "overview", label: "Overview", icon: LayoutDashboard },
  { page: "aircraft", label: "Fleet", icon: Plane },
  { page: "schedule", label: "Schedule", icon: CalendarRange },
  { page: "missions", label: "Missions", icon: ClipboardList },
  { page: "people", label: "Crew", icon: Users },
  { page: "maintenance", label: "Maintenance", icon: Wrench },
  { page: "training", label: "Training", icon: GraduationCap },
  { page: "inspections", label: "Inspections", icon: ClipboardCheck },
  { page: "balance", label: "Balance", icon: Scale },
  { page: "planner", label: "Crew planner", icon: Calculator },
  { page: "reports", label: "Reports", icon: BarChart3 },
];

const typing = (e: KeyboardEvent) => {
  const t = e.target as HTMLElement | null;
  return !!t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));
};

export default function App() {
  const [finding, setFinding] = useState(false);
  const { data, started, demo, canEdit, page, go, open, editing, toast, saveError, updateSettings, undo, redo, resetDemo, setDemo } = useStore();
  const [drawer, setDrawer] = useState(false);
  const collapsed = data.settings.sidebarCollapsed;
  const issues = useMemo(() => findIssues(data), [data]);
  const problems = issues.filter((i) => i.severity === "danger").length;

  // Desktop app: keep the Excel copy for Teams up to date, if a folder is picked.
  useEffect(() => {
    if (isDesktopApp) void import("./excelCopy").then((m) => m.startExcelCopy());
  }, []);

  // Theme lives on <html> so the tokens pick it up.
  useEffect(() => {
    const root = document.documentElement;
    if (data.settings.theme === "system") delete root.dataset.theme;
    else root.dataset.theme = data.settings.theme;
  }, [data.settings.theme]);

  // The same keys as every ZomBeatz product (DESIGN.md "Keyboard shortcuts").
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setFinding(true);
        return;
      }
      if (mod && e.key.toLowerCase() === "z" && !typing(e)) {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod || e.altKey || typing(e) || useStore.getState().editing) return;
      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        const kind = ({ aircraft: "aircraft", people: "person", maintenance: "job", training: "training" } as const)[page as "aircraft"] ?? "mission";
        open(kind, "new");
      } else if (e.key === "[") updateSettings({ sidebarCollapsed: !useStore.getState().data.settings.sidebarCollapsed });
      else if (e.key === "?") useStore.getState().go("guide");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [page, open, undo, redo, updateSettings]);

  // Automatic planning (Settings › Maintenance programs): when the app opens or it's turned on, inspections
  // overdue or due soon are booked in their tail's best free stretch. Not on every change, so Undo sticks.
  const { enabled: mxOn, autoPlan } = data.settings.maintenance;
  useEffect(() => {
    if (!started || !canEdit || !mxOn || !autoPlan) return;
    const jobs = autoPlans(useStore.getState().data);
    if (jobs.length) useStore.getState().change((d) => ({ ...d, jobs: [...d.jobs, ...jobs] }), `Planned ${jobs.length === 1 ? "1 inspection" : `${jobs.length} inspections`} automatically`);
  }, [started, canEdit, mxOn, autoPlan]);

  if (!started) return <Welcome />;

  const navTo = (p: Page) => {
    go(p);
    setDrawer(false);
  };

  return (
    <div className="app">
      <div className="phone-top">
        <button className="icon-btn" aria-label="Menu" onClick={() => setDrawer(true)}>
          <Menu size={20} />
        </button>
        <button className="grow row gap-sm brand-link" onClick={() => navTo("overview")} aria-label="Overview">
          <LogoMark size={32} />
          <b>Zom's MRP</b>
        </button>
        <button className="icon-btn" aria-label="Find" onClick={() => setFinding(true)}>
          <Search size={20} />
        </button>
        <button className="icon-btn" aria-label="New mission" onClick={() => open("mission", "new")}>
          <Plus size={20} />
        </button>
      </div>
      {drawer && <div className="drawer-scrim" onClick={() => setDrawer(false)} />}

      <aside className={`sidebar ${collapsed ? "collapsed" : ""} ${drawer ? "open" : ""}`}>
        <div className="row between">
          <button className="brand-link" onClick={() => navTo("overview")} aria-label="Overview" title="Overview">
            <Wordmark collapsed={collapsed && !drawer} />
          </button>
          {drawer && (
            <button className="icon-btn" aria-label="Close menu" onClick={() => setDrawer(false)}>
              <X size={18} />
            </button>
          )}
        </div>
        <button className="btn primary big" onClick={() => open("mission", "new")} title="New mission (N)">
          <Plus size={16} />
          {(!collapsed || drawer) && "New mission"}
        </button>
        <button className="nav-item find-item" onClick={() => setFinding(true)} title={collapsed ? "Find (Ctrl K)" : "Find anything (Ctrl or ⌘ K)"}>
          <Search size={16} />
          {(!collapsed || drawer) && <>Find<span className="kbd-hint muted small" style={{ marginLeft: "auto" }}>{navigator.platform.includes("Mac") ? "⌘K" : "Ctrl K"}</span></>}
        </button>
        {NAV.filter((n) => (n.page !== "inspections" || data.settings.maintenance.enabled) && !(data.settings.hiddenPages ?? []).includes(n.page)).map(({ page: p, label, icon: Icon }) => (
          <button key={p} className={`nav-item ${page === p ? "active" : ""}`} onClick={() => navTo(p)} title={collapsed ? label : undefined}>
            <Icon size={16} />
            {(!collapsed || drawer) && label}
            {(!collapsed || drawer) && p === "overview" && problems > 0 && <span className="pill danger nav-count">{problems}</span>}
          </button>
        ))}
        <div className="nav-gap" />
        <button className={`nav-item ${page === "guide" ? "active" : ""}`} onClick={() => navTo("guide")} title={collapsed ? "Guide" : undefined}>
          <BookOpen size={16} />
          {(!collapsed || drawer) && "Guide"}
        </button>
        <button className={`nav-item ${page === "settings" ? "active" : ""}`} onClick={() => navTo("settings")} title={collapsed ? "Settings" : undefined}>
          <Cog size={16} />
          {(!collapsed || drawer) && "Settings"}
        </button>
        <button className="nav-item kbd-hint" onClick={() => updateSettings({ sidebarCollapsed: !collapsed })} aria-label={collapsed ? "Unfold the sidebar" : "Fold the sidebar"} title="Fold the sidebar ([)">
          {collapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
          {!collapsed && "Fold sidebar"}
        </button>
      </aside>

      <main className="main">
        {saveError && (
          <div className="save-error row gap">
            <span className="grow">{saveError}</span>
            {/reload/i.test(saveError) && <button className="btn sm" onClick={() => location.reload()}>Reload</button>}
          </div>
        )}
        {!canEdit && !demo && (
          <div className="banner">
            <span className="grow"><b>View only.</b> You can look at everything but not change it. Ask an admin for scheduler access.</span>
          </div>
        )}
        {demo && (
          <div className="banner demo-banner">
            <FlaskConical size={15} />
            <span className="grow"><b>Demo</b><span className="wide-only banner-note muted"> · made-up data. Try anything; changes stay in this browser.</span></span>
            <button className="btn sm primary" onClick={() => navTo("guide")}><span className="wide-only">Guide and lessons</span><span className="phone-only">Guide</span></button>
            <button className="btn sm ghost" onClick={() => resetDemo()} title="Put the demo back the way it started">Reset</button>
            {isOnlineDemo
              ? <a className="btn sm" href={RELEASES_URL} target="_blank" rel="noreferrer"><span className="wide-only">Get Zom's MRP</span><span className="phone-only">Get it</span></a>
              : <button className="btn sm" onClick={() => setDemo(false)}><span className="wide-only">Use my own data</span><span className="phone-only">My data</span></button>}
          </div>
        )}
        <div className="page">
          <PageNote key={`note-${page}`} page={page} />
          <ErrorBoundary key={`page-${page}`} what={page === "overview" ? "the Overview" : `this page`} onLeave={() => navTo("overview")} onUndo={() => useStore.getState().undo()}>
          {page === "overview" && <Overview issues={issues} />}
          {page === "schedule" && <Schedule issues={issues} />}
          {page === "missions" && <Missions issues={issues} />}
          {page === "aircraft" && <AircraftPage />}
          {page === "people" && <People issues={issues} />}
          {page === "maintenance" && <Maintenance />}
          {page === "training" && <TrainingPage />}
          {page === "balance" && <Balance />}
          {page === "planner" && <Planner />}
          {page === "inspections" && data.settings.maintenance.enabled && <Inspections />}
          {page === "reports" && <Reports />}
          {page === "settings" && <SettingsPage onHelp={() => navTo("guide")} />}
          {page === "guide" && <Guide />}
          </ErrorBoundary>
        </div>
      </main>

      {editing && <ErrorBoundary key={`${editing.kind}-${editing.id}`} what="this form" floating onLeave={() => { useStore.getState().close(); navTo("overview"); }} onUndo={() => useStore.getState().undo()}><Dialogs /></ErrorBoundary>}
      <TourOverlay />
      {finding && <QuickFind onClose={() => setFinding(false)} />}
      {toast && (
        <div className="toast" key={toast.id} role="status">
          {toast.text}
          {toast.action && (
            <button className="btn sm" onClick={() => { toast.action!.run(); }}>
              {toast.action.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
