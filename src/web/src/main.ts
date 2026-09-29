import './style.css';
import { connectHub, onHub, type HubStatus, type JobName } from './hub';
import { notifyModelChanged, reloadAssets } from './state';
import { initData } from './tabs/data';
import { initLog } from './tabs/log';
import { initRecognition } from './tabs/recognition';
import { initTraining } from './tabs/training';
import { $ } from './util';

const TABS = ['data', 'training', 'recognition', 'log'] as const;
type Tab = (typeof TABS)[number];

function isTab(v: string): v is Tab {
  return (TABS as readonly string[]).includes(v);
}

function showTab(tab: Tab, focus = false): void {
  for (const t of TABS) {
    const active = t === tab;
    const btn = $<HTMLButtonElement>(`tabbtn-${t}`);
    btn.setAttribute('aria-selected', String(active));
    btn.tabIndex = active ? 0 : -1;
    $(`tab-${t}`).hidden = !active;
    if (active && focus) btn.focus();
  }
  if (location.hash !== `#${tab}`) history.replaceState(null, '', `#${tab}`);
}

function initTabs(): void {
  const nav = document.querySelector<HTMLElement>('nav.tabs');
  nav?.addEventListener('click', (ev) => {
    const btn = (ev.target as HTMLElement).closest<HTMLButtonElement>('[data-tab]');
    const tab = btn?.dataset.tab;
    if (tab && isTab(tab)) showTab(tab);
  });
  nav?.addEventListener('keydown', (ev) => {
    if (ev.key !== 'ArrowRight' && ev.key !== 'ArrowLeft') return;
    const current = TABS.findIndex((t) => $(`tabbtn-${t}`).getAttribute('aria-selected') === 'true');
    const next = (current + (ev.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length;
    showTab(TABS[next], true);
    ev.preventDefault();
  });
  window.addEventListener('hashchange', () => {
    const h = location.hash.slice(1);
    if (isTab(h)) showTab(h);
  });
  const initial = location.hash.slice(1);
  showTab(isTab(initial) ? initial : 'data');
}

const STATUS_TEXT: Record<HubStatus, string> = {
  connecting: 'Підключення…',
  connected: 'Підключено',
  reconnecting: 'Перепідключення…',
  disconnected: 'Немає з’єднання',
};

const STATUS_CLASS: Record<HubStatus, string> = {
  connecting: 'badge--muted',
  connected: 'badge--ok',
  reconnecting: 'badge--warn',
  disconnected: 'badge--danger',
};

const JOB_TEXT: Record<JobName, string> = {
  training: 'навчання',
  generate: 'генерація',
};

function initHeader(): void {
  const badge = $('conn-status');
  const op = $('current-op');
  let everConnected = false;

  const setOp = (name: JobName | null) => {
    op.hidden = name === null;
    op.textContent = name ? `Виконується: ${JOB_TEXT[name] ?? name}` : '';
  };

  onHub({
    started: (e) => setOp(e.name),
    progress: (p) => {
      // page opened mid-job: infer the operation from the stage
      if (op.hidden) setOp(p.stage === 'generate' ? 'generate' : 'training');
    },
    completed: () => setOp(null),
    failed: () => setOp(null),
  });

  connectHub((s) => {
    badge.textContent = STATUS_TEXT[s];
    badge.className = `badge ${STATUS_CLASS[s]}`;
    if (s === 'connected') {
      // after a reconnect, events may have been missed: refresh shared state
      if (everConnected) {
        void reloadAssets();
        notifyModelChanged();
      }
      everConnected = true;
    }
  });
}

initTabs();
initHeader();
initData();
initTraining();
initRecognition();
initLog();
void reloadAssets();
