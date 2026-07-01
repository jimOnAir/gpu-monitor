---
name: GPU Monitor Electron App
type: project
tags: [gpu, monitoring, electron, react, typescript]
created: 2026-06-30
status: ✅ Implemented
---

# GPU Monitor Electron App

## Goal
Desktop Electron app для мониторинга GPU на удалённых серверах. Подключается к C агентам по HTTP, показывает температуры, утилизацию, память в реальном времени.

## Status
✅ Implemented — полный функционал работает

## Implemented Features
1. [x] Monorepo структура (shared/main/renderer)
2. [x] Settings — список агентов + пороговые значения (JSON file + in-memory cache)
3. [x] Agent polling — HTTP client с timeout + stale detection
4. [x] Dashboard — GPU cards с температурами и utilization
5. [x] Auto-refresh через setInterval (configurable 1-60s)
6. [x] System tray with dynamic icon based on temperature
7. [x] Debug panel with agent status and log entries
8. [x] Agent detail modal with extended GPU metrics
9. [x] Footer with agent status indicators

## Architecture

### Структура (по образцу writing-tools)
```
gpu-monitor/
├── package.json              # workspaces: packages/*
├── packages/
│   ├── shared/               # общие типы, enum'ы
│   │   └── src/
│   │       ├── types/
│   │       │   ├── IAgent.ts
│   │       │   ├── IGpu.ts
│   │       │   └── ISettings.ts
│   │       ├── enums/
│   │       │   └── EAgentStatus.ts
│   │       └── index.ts
│   ├── main/                 # Electron main process
│   │   ├── package.json
│   │   └── src/
│   │       ├── main.ts
│   │       ├── preload.ts
│   │       └── domains/
│   │           └── settings/
│   │               ├── SettingsRepository.ts
│   │               └── SettingsService.ts
│   └── renderer/             # React UI
│       ├── package.json
│       └── src/
│           ├── App.tsx
│           ├── components/
│           │   ├── App.tsx
│           │   ├── GpuCard.tsx
│           │   ├── GpuBar.tsx
│           │   ├── AgentList.tsx
│           │   ├── AgentDetailModal.tsx
│           │   ├── DebugPanel.tsx
│           │   ├── Footer.tsx
│           │   └── SettingsModal.tsx
│           ├── domains/
│           │   ├── agents/
│           │   │   ├── AgentService.ts    # fetch + polling
│           │   │   └── AgentRepository.ts # HTTP calls
│           │   └── dashboard/
│           │       └── DashboardService.ts
│           └── styles/
```

### Settings (settings.json)
```json
{
  "agents": [
    {
      "id": "localhost",
      "name": "localhost",
      "url": "http://localhost:9091",
      "status": "Offline"
    },
    {
      "id": "srv1",
      "name": "srv1",
      "url": "http://192.168.3.128:9091",
      "status": "Offline"
    }
  ],
  "refreshInterval": 5000,
  "thresholds": {
    "core": { "warn": 70, "critical": 85 },
    "junction": { "warn": 80, "critical": 95 },
    "vram": { "warn": 80, "critical": 95 }
  }
}
```

### API агента (GET /gpu)
```json
{
  "timestamp": 1700000000,
  "gpus": [
    {
      "uuid": "GPU-63e7dc09-e444-285c-3f3d-67aed394f06d",
      "index": 0,
      "name": "NVIDIA GeForce RTX 3090",
      "coreTemp": 47.0,
      "junctionTemp": 57.0,
      "vramTemp": 54.0,
      "gpuUtilization": 0.0,
      "memoryUsed": 4431924224,
      "memoryTotal": 25769803776,
      "powerUsage": 20.4,
      "coreStatus": "normal",
      "junctionStatus": "normal",
      "vramStatus": "normal",
      "fanSpeed": 30,
      "gpuClockMHz": 1700,
      "memClockMHz": 9000,
       "tempShutdown": 105,
       "tempSlowdown": 95,
       "powerCapW": 350.0,
       "driverVersion": "550.90.07",
       "perfState": 8,
       "vendor": "MSI",
       "model": "MAG RTX 3090",
       "partNumber": "MS-7C83"
     }
   ]
 }
```

**AgentRepository** (packages/main/src/domains/agents/AgentRepository.ts) толерантен к обоим форматам — принимает и обернутый `{"timestamp":..., "gpus":[...]}`, и сырой массив `[...]`.

### UI Flow
1. **Dashboard** — список агентов (сверху), каждый агент раскрывается в список GPU
2. **GpuCard** — index, name, 3 температуры (core/junction/vram) с цветовой индикацией
3. **GpuRow** — утилизация GPU%, память (использовано/всего), питание
4. **SettingsModal** — список агентов (add/edit/delete), interval, thresholds
5. **Auto-refresh** — setInterval на interval из настроек (по умолчанию 5s)

### Key Patterns (из writing-tools)
- **Domain-driven**: сервисы + репозитории, DI через конструктор
- **No Electron in services**: platform-agnostic код
- **Strict typing**: интерфейсы в shared, enum'ы для статусов
- **Settings**: JSON file + in-memory cache + default values

## Dependencies
- electron (^28.0.0)
- react (^18.2.0)
- typescript (^5.0.0)
- esbuild (для main bundle)
- webpack + ts-loader (для renderer)

## Related Areas
- [[GPU Monitoring Project]] — общая концепция
- [[GPU Widget UI-UX Design]] — дизайн (частично актуален)
- [[Homelab]]

## Notes
- Агент (gputempd) — отдельный проект, Electron app не зависит от него в коде
- Agent URL настраивается пользователем, не хардкод
- Error handling: если агент недоступен — показывать "offline" на карточке
- Auto-reconnect: при потере связи — показывать последнюю известную температуру с пометкой "stale"
