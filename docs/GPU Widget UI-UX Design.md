---
tags:
  - ui
  - ux
  - design
  - electron
  - react
created: 2026-06-30
status: draft
---

# GPU Monitor Electron App — UI/UX Design

## Design Principles

1. **Minimalism** — только необходимые данные, без перегрузки
2. **At-a-glance** — температура читается за 1 секунду
3. **Color-coded** — интуитивные цветовые индикаторы статуса
4. **Compact** — окно 400-600px, не перекрывает рабочий стол
5. **Responsive** — адаптируется к количеству GPU (1-8+) и агентов (1-10+)

---

## Visual Design

### Color Palette

```
# Dark Theme (primary)
--bg-primary: #1E2733        /* Фон приложения */
--bg-secondary: #2E3440      /* Карточки, headers */
--bg-tertiary: #3B4252       /* Hover states, bars bg */

--text-primary: #D8DEE9      /* Основной текст */
--text-secondary: #88C0D0    /* Labels, accents */
--text-muted: #6A7380        /* Disabled, secondary info */

--status-normal: #4CAF50     /* Зелёный — норма */
--status-warning: #FFC107    /* Жёлтый — предупреждение */
--status-danger: #F44336     /* Красный — опасность */
--status-danger-flash: #FF5252  /* Пульсация при danger */

--agent-online: #4CAF50      /* Агент подключён */
--agent-offline: #F44336     /* Агент недоступен */
--agent-stale: #FF9800       /* Данные устарели (>15s) */

--border: #3B4252            /* Границы */
--shadow: rgba(0, 0, 0, 0.3) /* Тени */
```

### Typography

```
--font-family: 'Inter', 'Segoe UI', sans-serif
--font-size-h1: 18px         /* Title */
--font-size-h2: 15px         /* GPU name */
--font-size-body: 13px       /* Labels */
--font-size-value: 15px      /* Temperature values */
--font-size-small: 11px      /* Footer info */

--font-weight-normal: 400
--font-weight-medium: 500
--font-weight-bold: 700
```

### Spacing & Layout

```
--spacing-xs: 4px
--spacing-sm: 8px
--spacing-md: 12px
--spacing-lg: 16px
--spacing-xl: 20px

--radius-sm: 4px
--radius-md: 6px
--radius-lg: 8px

--card-padding: 14px
--card-gap: 10px
```

---

## Component Specifications

### 1. App Window

```
┌─────────────────────────────────────────────────┐
│  🔥 GPU Monitor           [👁️ Agents] [⚙️] [─] [□] [✕] │  44px
├─────────────────────────────────────────────────┤
│                                                 │
│  [Agent: srv1]  ● online                        │  32px
│  [Agent: srv2]  ● offline                       │  32px
│                                                 │
│  ─────────────────────────────────────────────  │
│                                                 │
│  [GPU Cards Container - scrollable]             │
│                                                 │
│  ─────────────────────────────────────────────  │
│  Last: 2s ago  │  Refresh: 5s  │  3 GPUs        │  28px
└─────────────────────────────────────────────────┘
```

**Dimensions:**
- Min width: 380px, preferred: 480px
- Min height: 300px, preferred: auto (fits all GPUs)
- Corner radius: 8px
- Shadow: 4px 8px 16px var(--shadow)
- Frameless window (custom title bar)

### 2. Agent List (sidebar or top bar)

```tsx
// AgentList.tsx
<div className="agent-list">
  <div className="agent-item online">
    <div className="agent-status">●</div>
    <div className="agent-name">srv1</div>
    <div className="agent-url">http://192.168.1.100:8080</div>
  </div>
  <div className="agent-item offline">
    <div className="agent-status">●</div>
    <div className="agent-name">srv2</div>
    <div className="agent-url">http://192.168.1.101:8080</div>
  </div>
</div>
```

**States:**
- **Online**: зелёная точка, данные свежие
- **Offline**: красная точка, последняя попытка Nс назад
- **Stale**: оранжевая точка, данные >15s (агент медленный)

### 3. GPU Card

```
┌─────────────────────────────────────────────────┐
│  GPU 0: NVIDIA GeForce RTX 4090                 │  Header
├─────────────────────────────────────────────────┤
│                                                 │
│  Core:    ██████████░░░░░░  65°C  🟢            │  28px
│  Junction:████████░░░░░░░░  72°C  🟡            │  28px
│  VRAM:    ██████████░░░░░░  68°C  🟢            │  28px
│                                                 │
│  ─────────────────────────────────────────────  │
│                                                 │
│  GPU:     ████████████░░  92%                   │  24px
│  Memory:  ████████░░░░░░  72%  17.7/24GB        │  24px
│  Power:   ████████░░░░░░  64%  320W             │  24px
│                                                 │
└─────────────────────────────────────────────────┘
```

**Structure:**
- Background: var(--bg-primary)
- Border: 1px solid var(--border)
- Radius: 8px
- Padding: 14px
- Margin-bottom: 10px (gap between cards)

**Header Row:**
- Left: "GPU [index]" (14px bold, var(--text-secondary))
- Right: GPU name (13px, var(--text-primary), ellipsis on overflow)

**Temperature Rows:**
- Layout: flex row, space-between
  - Label: "Core:", "Junction:", "VRAM:" (12px, var(--text-muted), width: 65px)
  - Bar: GpuBar component (flex-1, height: 20px, margin: 0 10px)
  - Value: "65°C" (14px bold, color matches status)

**Separator:**
- Thin line (1px, var(--border)) with label "▸ Utilization" (11px, var(--text-muted))

**Utilization Rows:**
- Layout: Same as temp rows but with percentage
  - Label: "GPU:", "Memory:", "Power:" (12px, var(--text-muted), width: 65px)
  - Bar: GpuBar component (flex-1, height: 16px, slightly smaller)
  - Value: "85%" or "17.7/24GB" or "320W" (12px bold)

### 4. GpuBar Component

```tsx
// GpuBar.tsx
interface GpuBarProps {
  value: number;       // 0-100 for percentage, or raw value
  max: number;         // max for percentage calculation
  unit?: string;       // "%", "°C", "W", "GB"
  status: 'normal' | 'warning' | 'danger';
  showDetail?: boolean; // show "17.7/24GB" instead of just "%"
  animated?: boolean;
}

const GpuBar: React.FC<GpuBarProps> = ({ value, max, unit = '%', status, showDetail, animated = true }) => {
  const percentage = (value / max) * 100;
  const displayValue = showDetail
    ? `${(value / 1024).toFixed(1)}/${(max / 1024).toFixed(0)}GB`
    : `${Math.round(value)}${unit}`;

  return (
    <div className="gpu-bar-container" style={{ position: 'relative', width: '100%', height: '20px' }}>
      {/* Background */}
      <div className="gpu-bar-bg" style={{
        position: 'absolute',
        inset: 0,
        backgroundColor: '--bg-tertiary',
        borderRadius: '4px',
      }} />

      {/* Fill */}
      <div className="gpu-bar-fill" style={{
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        width: `${percentage}%`,
        backgroundColor: statusColor(status),
        borderRadius: '4px',
        transition: animated ? 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)' : 'none',
      }} />

      {/* Danger pulse */}
      {status === 'danger' && (
        <div className="gpu-bar-pulse" style={{
          position: 'absolute',
          inset: 0,
          borderRadius: '4px',
          backgroundColor: '--status-danger',
          opacity: 0.3,
          animation: 'pulse 1s infinite',
        }} />
      )}

      {/* Text overlay */}
      <div className="gpu-bar-text" style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'white',
        fontSize: '12px',
        fontWeight: 700,
        textShadow: '0 1px 2px rgba(0,0,0,0.5)',
      }}>
        {displayValue}
      </div>
    </div>
  );
};
```

**Danger State Animation:**
```css
@keyframes pulse {
  0%, 100% { opacity: 0.3; }
  50% { opacity: 0.8; }
}
```

### 5. Footer

```tsx
// Footer.tsx
<div className="footer">
  <div className="footer-item">
    Last: {formatTime(lastUpdate)} ago
  </div>
  <div className="footer-divider">│</div>
  <div className="footer-item">
    Refresh: {interval}s
  </div>
  <div className="footer-divider">│</div>
  <div className="footer-item">
    {gpuCount} GPUs
  </div>
</div>
```

**Error State:**
```tsx
<div className="footer error">
  ⚠️ Connection error — last update: 15s ago
</div>
```

### 6. Settings Modal

```tsx
// SettingsModal.tsx
const SettingsModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  settings: ISettings;
  onSave: (settings: ISettings) => void;
}> = ({ isOpen, onClose, settings, onSave }) => {
  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-container" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>⚙️ Settings</h2>
          <button onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          {/* Agents */}
          <section>
            <h3>Agents</h3>
            {settings.agents.map(agent => (
              <div key={agent.id} className="agent-edit-row">
                <input value={agent.name} onChange={...} placeholder="Name" />
                <input value={agent.url} onChange={...} placeholder="http://..." />
                <button onClick={() => removeAgent(agent.id)}>✕</button>
              </div>
            ))}
            <button onClick={() => addAgent()}>+ Add Agent</button>
          </section>

          {/* Refresh Interval */}
          <section>
            <label>Refresh Interval (seconds)</label>
            <input
              type="number"
              value={settings.refreshInterval}
              onChange={...}
              min={1}
              max={60}
            />
          </section>

          {/* Thresholds */}
          <section>
            <h3>Temperature Thresholds</h3>
            <div className="threshold-row">
              <span>Core Warn:</span>
              <input type="number" value={settings.thresholds.core.warn} />
              <span>Core Danger:</span>
              <input type="number" value={settings.thresholds.core.critical} />
            </div>
            {/* junction, vram similar */}
          </section>
        </div>

        <div className="modal-footer">
          <button onClick={onClose}>Cancel</button>
          <button onClick={() => onSave(settings)}>Save</button>
        </div>
      </div>
    </div>
  );
};
```

---

## Interaction Patterns

### 1. Auto-refresh

- **Interval:** 5 seconds (default), configurable 1-60s
- **Visual feedback:** Footer shows "Last update: Xs ago"
- **Error state:** If request fails, show "⚠️ Connection error" in footer (red)
- **Agent status:** Each agent shows ● online/offline/stale

### 2. Manual Refresh

- **Trigger:** Click ↻ button in header
- **Feedback:** Button shows spinning animation during request
- **Cooldown:** 1s between manual refreshes to prevent spam

### 3. Hover States

```css
/* On GPU card hover */
.gpu-card:hover {
  background-color: var(--bg-tertiary);
  box-shadow: 0 4px 12px var(--shadow);
  transform: translateY(-1px);
  transition: all 0.2s ease;
}

.gpu-card {
  transition: all 0.2s ease;
}
```

### 4. Click Actions

- **Click on GPU card:** No action (info display only)
- **Click on temperature value:** Copy to clipboard (with toast notification)
- **Click on agent name:** Expand/collapse GPU list for that agent
- **Right-click on app:** Context menu (Settings, Refresh All, About, Exit)

### 5. Context Menu

```tsx
// Right-click context menu
const menuItems = [
  { label: '⚙️ Settings', action: 'openSettings' },
  { type: 'separator' },
  { label: '↻ Refresh All', action: 'refreshAll' },
  { type: 'separator' },
  { label: 'ℹ️ About', action: 'showAbout' },
  { type: 'separator' },
  { label: '✕ Exit', action: 'exit' },
];
```

### 6. Agent Connection States

```tsx
// AgentService polling
const pollAgent = async (agent: IAgent) => {
  try {
    const response = await fetch(`${agent.url}/gpu`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    
    // Update agent status
    setAgentStatus(agent.id, 'online');
    setLastUpdate(agent.id, Date.now());
    
    // Update GPU data
    setGpus(agent.id, data);
  } catch (error) {
    // Agent offline
    setAgentStatus(agent.id, 'offline');
    setLastError(agent.id, error.message);
  }
};

// Stale detection (data > 15s old)
const isStale = (lastUpdate: number) => Date.now() - lastUpdate > 15000;
```

---

## Responsive Behavior

### Window Sizes

| Width | Layout |
|-------|--------|
| < 400px | Single column, compact cards (hide power) |
| 400-600px | Single column, full cards |
| > 600px | Two-column grid for GPU cards |

### GPU Count

| GPUs | Layout |
|------|--------|
| 1-2 | Single column |
| 3-4 | Single column, taller window |
| 5+ | Two-column grid |

---

## Accessibility

- **Keyboard navigation:** Tab through cards, Enter to copy value
- **ARIA labels:** Every card has `role="region"`, `aria-label="GPU 0: NVIDIA RTX 4090"`
- **Color contrast:** All text meets WCAG AA (4.5:1 minimum)
- **Focus visible:** Outline on focused elements (4px solid var(--text-secondary))
- **Screen reader:** Announce temperature changes via live region

---

## Future Enhancements

- [ ] Mini-mode: only show critical alerts in system tray
- [ ] Graph history: sparkline showing temp over last 5 minutes
- [ ] Alert notifications: desktop notifications on threshold breach
- [ ] Dark/Light theme toggle
- [ ] Export data: CSV/PNG screenshot of current state
- [ ] Multiple monitor support: pin window to specific screen

---

## Related Resources

- [[GPU Monitor Electron App]] — архитектура проекта
- [[NVIDIA NVML API]] — API для чтения данных с GPU
