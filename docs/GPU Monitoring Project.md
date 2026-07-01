---
tags:
  - project
  - gpu
  - monitoring
  - electron
  - react
  - typescript
created: 2026-06-30
status: planning
---

# GPU Monitor Electron App

**Goal:**  
Desktop Electron app для мониторинга GPU на удалённых серверах. Подключается к C/Go агентам по HTTP, показывает температуры, утилизацию, память в реальном времени.

**Deadline:**  
TBD

**Status:**  
🟡 In Progress — архитектура определена, нужна реализация

**Next Actions:**
- [x] Проработать UI/UX дизайн (Electron + React)
- [ ] Создать структуру проекта (monorepo: shared/main/renderer)
- [ ] Реализовать settings — список агентов + пороговые значения
- [ ] Реализовать fetch агентов (HTTP client с retry + error handling)
- [ ] Dashboard — список GPU с карточками
- [ ] Auto-refresh через setInterval
- [ ] Test на srv1/srv2 с реальным агентом

**Notes:**
- Reference: [[gddr6-core-junction-vram-temps]] — C-библиотека для чтения GPU температур
- Backend: NVML + `/dev/mem` для Junction/VRAM температур
- Frontend: Electron + React (TypeScript) для HTTP запросов к агентам
- API: JSON формат с индексами GPU, названиями, температурами, статусами

**Cost:**  
Зависимости: libnvidia-ml-dev, libpciaccess-dev, libmicrohttpd-dev (backend), Electron, React, TypeScript (frontend)

**Related Areas:** [[Homelab]], [[Server Administration]]  
**Related Resources:** [[gddr6-core-junction-vram-temps]], [[NVIDIA NVML API]]

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
│  │  - HTTP сервер на :8080                               │   │
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

### 1. Backend: `gputemp-agent`

**Язык:** C  
**Зависимости:** libnvidia-ml, libpciaccess, libmicrohttpd  
**Размер:** ~300-400 строк

#### Файлы
```
gputemp-agent/
├── main.c      — HTTP сервер, обработка запросов, пороговые значения
├── gpu.c/h     — чтение GPU через NVML + /dev/mem
├── Makefile    — сборка
└── README.md   — документация
```

#### API

**`GET /metrics`** — текущие показания всех GPU:

```json
{
  "server": "srv1",
  "timestamp": 1719700000,
  "gpus": [
    {
      "index": 0,
      "name": "NVIDIA GeForce RTX 4090",
      "core_temp": 65,
      "junction_temp": 72,
      "vram_temp": 68,
      "gpu_utilization": 85,
      "memory_utilization": 72,
      "memory_used": 21500,
      "memory_total": 24576,
      "power_usage": 320,
      "status": "normal"
    },
    {
      "index": 1,
      "name": "NVIDIA GeForce RTX 4090",
      "core_temp": 71,
      "junction_temp": 79,
      "vram_temp": 74,
      "gpu_utilization": 92,
      "memory_utilization": 88,
      "memory_used": 21600,
      "memory_total": 24576,
      "power_usage": 450,
      "status": "warning"
    }
  ],
  "thresholds": {
    "core_temp_warn": 70,
    "core_temp_danger": 85,
    "junction_temp_warn": 80,
    "junction_temp_danger": 95,
    "vram_temp_warn": 80,
    "vram_temp_danger": 95,
    "gpu_util_warn": 80,
    "gpu_util_danger": 95,
    "mem_util_warn": 80,
    "mem_util_danger": 95,
    "power_warn": 400,
    "power_danger": 500
  }
}
```

**`GET /health`** — проверка что агент жив:

```json
{
  "status": "ok",
  "timestamp": 1719700000,
  "gpus_count": 2
}
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
sudo systemctl enable gputemp-agent
sudo systemctl start gputemp-agent
```

#### Docker

```dockerfile
FROM nvidia/cuda:12.2.0-base
COPY gputemp-agent /usr/local/bin/gputemp-agent
ENTRYPOINT ["gputemp-agent"]
```

```bash
docker run -d --privileged -p 9100:9100 gputemp-agent
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
│           │   ├── Dashboard.tsx
│           │   ├── GpuCard.tsx
│           │   ├── GpuRow.tsx
│           │   ├── AgentList.tsx
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
cd gputemp-agent
make
sudo make install

# Configure
echo "GPUTEMP_PORT=9100" | sudo tee /etc/default/gputemp-agent
echo "GPUTEMP_CORE_WARN=70" | sudo tee -a /etc/default/gputemp-agent

# Enable service
sudo systemctl enable gputemp-agent
sudo systemctl start gputemp-agent
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
