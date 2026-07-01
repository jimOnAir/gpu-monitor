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
│  │  - HTTP сервер на :8080                               │   │
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

## Agent API

**`GET /gpu`** — current GPU data:

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

## Documentation

- [GPU Monitoring Project](docs/GPU%20Monitoring%20Project.md) — architecture, components, installation
- [GPU Monitor Electron App](docs/GPU%20Monitor%20Electron%20App.md) — project plan
- [GPU Widget UI-UX Design](docs/GPU%20Widget%20UI-UX%20Design.md) — UI/UX design

## License

MIT
