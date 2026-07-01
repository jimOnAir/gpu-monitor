# GPU Monitor

Desktop Electron app for monitoring NVIDIA GPUs on remote servers.

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
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Project Structure

```
gpu-monitor/
├── agent/                      # C-агент на серверах
│   ├── main.c                  # HTTP сервер, обработка запросов
│   ├── gpu.c/h                 # Чтение GPU (NVML + /dev/mem)
│   ├── Makefile
│   └── README.md
├── packages/
│   ├── shared/                 # Общие типы, enum'ы
│   ├── main/                   # Electron main process
│   └── renderer/               # React UI
└── docs/                       # Документация
```

## Getting Started

```bash
# Install dependencies
npm install

# Build all packages
npm run build

# Run in dev mode
npm start
```

## Settings

Configuration stored in `~/.config/gpu-monitor/settings.json`:

```json
{
  "agents": [
    {
      "id": "srv1",
      "name": "srv1",
      "url": "http://192.168.3.128:9091"
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

## Agent API

**`GET /gpu`** — current GPU data (wrapped in `{timestamp, gpus}`):

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
      "perfState": 8
    }
  ]
}
```

**`GET /health`** — liveness check:

```json
{"status":"ok"}
```

## Documentation

- [GPU Monitoring Project](docs/GPU%20Monitoring%20Project.md) — architecture, components, installation
- [GPU Monitor Electron App](docs/GPU%20Monitor%20Electron%20App.md) — project plan
- [GPU Widget UI-UX Design](docs/GPU%20Widget%20UI-UX%20Design.md) — UI/UX design

## License

MIT
