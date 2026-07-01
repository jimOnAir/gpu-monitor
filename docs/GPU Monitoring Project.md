---
tags:
  - project
  - gpu
  - monitoring
  - electron
  - react
  - typescript
created: 2026-06-30
status: ✅ Implemented
---

# GPU Monitor Electron App

**Goal:**  
Desktop Electron app для мониторинга GPU на удалённых серверах. Подключается к C агентам по HTTP, показывает температуры, утилизацию, память в реальном времени.

**Deadline:**  
TBD

**Status:**  
✅ Implemented — полный функционал работает

**Implemented Features:**
- [x] Проработать UI/UX дизайн (Electron + React)
- [x] Создать структуру проекта (monorepo: shared/main/renderer)
- [x] Реализовать settings — список агентов + пороговые значения
- [x] Реализовать fetch агентов (HTTP client с retry + error handling)
- [x] Dashboard — список GPU с карточками
- [x] Auto-refresh через setInterval (configurable 1-60s)
- [x] Test на srv1/srv2 с реальным агентом
- [x] System tray with dynamic icon based on temperature
- [x] Debug panel with agent status and log entries
- [x] Agent detail modal with extended GPU metrics

**Notes:**
- Reference: [gddr6-core-junction-vram-temps](https://github.com/ThomasBaruzier/gddr6-core-junction-vram-temps) — C-библиотека для чтения GPU температур
- Backend: NVML + `/dev/mem` для Junction/VRAM температур
- Frontend: Electron + React (TypeScript) для HTTP запросов к агентам
- API: JSON формат с индексами GPU, названиями, температурами, статусами

**Cost:**  
Зависимости: libnvidia-ml-dev, libpciaccess-dev, libmicrohttpd-dev (backend), Electron, React, TypeScript (frontend)

**Related Areas:** [[Homelab]], [[Server Administration]]  
**Related Resources:** [gddr6-core-junction-vram-temps](https://github.com/ThomasBaruzier/gddr6-core-junction-vram-temps), [NVIDIA NVML API](https://docs.nvidia.com/deploy/nvml-api/nvml-api-reference.html)

---

## Documentation

- [[GPU Monitor Electron App]] — архитектура, структура проекта, API агента
- [[GPU Widget UI-UX Design]] — UI/UX дизайн (актуален для карточек GPU, цветов, индикаторов)

## Overview

Система мониторинга GPU с двумя компонентами:
- **Backend**: C-агент (`gputempd`), читающий данные с GPU через NVML + `/dev/mem`
- **Frontend**: Electron + React app, отображающий данные в реальном времени

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Desktop (User's Machine)                                   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  GPU Monitor (Electron + React)                     │   │
│  │  - Список агентов с индикаторами online/offline     │   │
│  │  - Карточки GPU с температурами (core/junction/vram)│   │
│  │  - Индикаторы утилизации (GPU%, Memory, Power)      │   │
│  │  - Настройки: URL агентов, interval, thresholds     │   │
│  └─────────────────────────────────────────────────────┘   │
│                          │                                  │
│                          │ HTTP GET /gpu                     │
│                          ▼                                  │
└──────────────────────────┼──────────────────────────────────┘
                           │
┌──────────────────────────┼──────────────────────────────────┐
│  Server (srv1, srv2)      │                                  │
│  ┌────────────────────────▼─────────────────────────────┐   │
│  │  gputempd (C)                                         │   │
│  │  - Чтение NVML (core temp, utilization, memory)       │   │
│  │  - mmap /dev/mem (junction + vram temps)             │   │
│  │  - HTTP сервер на :9091                               │   │
│  │  - Конфигурация через env vars                        │   │
│  └─────────────────────────────────────────────────────┘   │
│                          │                                  │
│                          ▼                                  │
│  GPU 0: NVIDIA GeForce RTX 4090                             │
│  GPU 1: NVIDIA GeForce RTX 4090                             │
│  GPU 2: NVIDIA A100 80GB                                    │
└─────────────────────────────────────────────────────────────┘
```

## Components

### 1. Backend: `gputempd`

**Язык:** C  
**Зависимости:** libnvidia-ml, libpciaccess, libmicrohttpd  
**Размер:** ~300-400 строк

#### Файлы
```
agent/
├── main.c          — HTTP сервер, обработка запросов, пороговые значения
├── gpu.c/h         — чтение GPU через NVML + /dev/mem
├── logger.c/h      — структурированное логирование (stdout + syslog)
├── Makefile        — сборка
├── gputempd.service — systemd unit
├── scripts/        — build/deploy scripts
└── README.md       — документация
```

#### API

**`GET /gpu`** — текущие показания всех GPU (wrapped in `{timestamp, gpus}`):

```json
{
  "timestamp": 1719700000,
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
      "perfState": 8
    }
  ]
}
```

**`GET /health`** — проверка что агент жив:

```json
{"status":"ok"}
```

#### Конфигурация

Env vars (без файлов конфигурации):

```bash
GPUTEMP_PORT=9100
GPUTEMP_CORE_WARN=70
GPUTEMP_CORE_DANGER=85
GPUTEMP_JUNCTION_WARN=80
GPUTEMP_JUNCTION_DANGER=95
GPUTEMP_VRAM_WARN=80
GPUTEMP_VRAM_DANGER=95
```

#### Сборка

```bash
sudo apt install libnvidia-ml-dev libpciaccess-dev libmicrohttpd-dev
make
sudo make install
```

#### Установка как сервис

```bash
sudo systemctl enable gputempd
sudo systemctl start gputempd
```

#### Docker

```dockerfile
FROM nvidia/cuda:12.2.0-base
COPY agent/gputempd /usr/local/bin/gputempd
ENTRYPOINT ["gputempd"]
```

```bash
docker run -d --privileged -p 9091:9091 gputempd
```

---

### 2. Frontend: `gpu-monitor-app`

**Стек:** Electron + React (TypeScript)  
**Зависимости:** electron, react, typescript, esbuild (main), webpack (renderer)

#### Структура проекта (monorepo)

```
gpu-monitor-app/
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
│           │   │   ├── AgentService.ts
│           │   │   └── AgentRepository.ts
│           │   └── dashboard/
│           │       └── DashboardService.ts
│           └── styles/
```

#### UI/UX Design

Подробный UI/UX дизайн (цветовая схема, компоненты, layout, interaction patterns) в отдельном документе: [[GPU Widget UI-UX Design]]

---

## Installation

### Backend (on servers)

```bash
# Install dependencies
sudo apt install libnvidia-ml-dev libpciaccess-dev libmicrohttpd-dev

# Build
cd agent
make

# Deploy (uses systemd, port 9091)
bash scripts/deploy.sh <server-host>
```

Or manually:
```bash
sudo cp gputempd /usr/local/bin/
sudo cp gputempd.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now gputempd
```

### Frontend (desktop app)

```bash
# Clone monorepo
git clone <repo-url> gpu-monitor-app
cd gpu-monitor-app

# Install dependencies
npm install

# Build
npm run build

# Run in dev mode
npm start
```

---

## Dependencies

### Backend
- `libnvidia-ml-dev` — NVIDIA Management Library
- `libpciaccess-dev` — PCI access for /dev/mem mapping
- `libmicrohttpd-dev` — Lightweight HTTP server

### Frontend (Electron + React)
- `electron` — Desktop framework
- `react` — UI library
- `typescript` — Type safety
- `esbuild` — Fast bundler for main process
- `webpack` + `ts-loader` — Bundler for renderer

---

## Future Enhancements

- [ ] System tray mode (mini-view with critical alerts only)
- [ ] Historical data (influxdb/grafana integration)
- [ ] Desktop notifications on threshold breach
- [ ] Dark/light theme toggle
- [ ] Clock speed monitoring
- [ ] Export data (CSV, PNG screenshot)
- [ ] Multi-monitor support (pin window to specific screen)
- [ ] Auto-start on login (systemd/user service)

---

## References

- [gddr6-core-junction-vram-temps](https://github.com/ThomasBaruzier/gddr6-core-junction-vram-temps) — Reference implementation for GPU temp reading
- [NVML Documentation](https://docs.nvidia.com/deploy/nvml-api/nvml-api-reference.html)
- [Electron Documentation](https://www.electronjs.org/docs)

---

## Troubleshooting

### mmap error: `/dev/mem` access denied

**Symptom:** `gputempd` fails with `mmap: Permission denied` or `Cannot mmap /dev/mem`

**Cause:** Kernel restricts `/dev/mem` access by default. Junction/VRAM temps require direct memory access.

**Solution:** Add `iomem=relaxed` to GRUB kernel parameters:

```bash
# 1. Edit GRUB config
sudo nano /etc/default/grub

# 2. Add iomem=relaxed to GRUB_CMDLINE_LINUX_DEFAULT
GRUB_CMDLINE_LINUX_DEFAULT="quiet splash iomem=relaxed"

# 3. Update GRUB and reboot
sudo update-grub
sudo reboot
```

**Verification:**
```bash
# After reboot, verify /dev/mem is accessible
sudo cat /dev/mem | head -c 100 | od -An -tx1

# Run gputempd — should now read Junction/VRAM temps
sudo gputempd
```

**Note:** `iomem=relaxed` reduces security slightly (allows user-space memory access). Only use on trusted systems. For production servers, consider using NVML-only mode (Junction/VRAM temps may be unavailable on some GPU models).
