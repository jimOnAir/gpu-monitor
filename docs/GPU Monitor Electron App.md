---
name: GPU Monitor Electron App
type: project
tags: [gpu, monitoring, electron, react, typescript]
created: 2026-06-30
status: 🟡 In Progress
---

# GPU Monitor Electron App

## Goal
Desktop Electron app для мониторинга GPU на удалённых серверах. Подключается к C/Go агентам по HTTP, показывает температуры, утилизацию, память в реальном времени.

## Status
🟡 In Progress — архитектура определена, нужна реализация

## Next Actions
1. [ ] Создать структуру проекта (monorepo: shared/main/renderer)
2. [ ] Реализовать settings — список агентов + пороговые значения
3. [ ] Реализовать fetch агентов (HTTP client с retry + error handling)
4. [ ] Dashboard — список GPU с карточками
5. [ ] Auto-refresh через setInterval
6. [ ] Test на srv1/srv2 с реальным агентом

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
│           │   ├── Dashboard.tsx
│           │   ├── GpuCard.tsx
│           │   ├── GpuRow.tsx
│           │   ├── AgentList.tsx
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
      "id": "srv1",
      "name": "srv1",
      "url": "http://192.168.1.100:8080"
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
[
  {
    "index": 0,
    "name": "NVIDIA RTX 3090",
    "coreTemp": 65,
    "junctionTemp": 72,
    "vramTemp": 70,
    "gpuUtilization": 45,
    "memoryUsed": 10240,
    "memoryTotal": 24576,
    "powerUsage": 150
  }
]
```

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
