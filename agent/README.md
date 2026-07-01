# gputempd - GPU Temperature Daemon

C-агент для чтения температур NVIDIA GPU и отображения данных через HTTP API.

## Возможности

- Чтение Core, Junction, VRAM температур
- GPU utilization, memory, power
- Индикаторы статуса (normal/warning/danger)
- HTTP API для Electron-клиента
- Настройка порогов через env vars

## Зависимости

```bash
sudo apt install libnvidia-ml-dev libpciaccess-dev libmicrohttpd-dev
```

## Сборка

```bash
make
```

## Запуск

```bash
# По умолчанию порт 8080
sudo ./gputempd

# Или указать порт
sudo ./gputempd 9100

# Или через env var
GPUTEMP_PORT=9100 sudo ./gputempd
```

## API

**`GET /gpu`** — текущие показания всех GPU:

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
      "vramStatus": "normal"
    }
  ]
}
```

**Response fields:**

| Field | Type | Description |
|-------|------|-------------|
| `timestamp` | int | Unix timestamp of the snapshot |
| `gpus` | array | Array of GPU objects |
| `gpus[].uuid` | string | NVML GPU UUID (stable identifier) |
| `gpus[].index` | int | NVML device index |
| `gpus[].name` | string | GPU model name |
| `gpus[].coreTemp` | float | Core temperature (°C) |
| `gpus[].junctionTemp` | float | Junction temperature (°C), 0 if unavailable |
| `gpus[].vramTemp` | float | VRAM temperature (°C), 0 if unavailable |
| `gpus[].gpuUtilization` | float | GPU utilization (%) |
| `gpus[].memoryUsed` | int | Video memory used (bytes) |
| `gpus[].memoryTotal` | int | Total video memory (bytes) |
| `gpus[].powerUsage` | float | Power draw (W) |
| `gpus[].coreStatus` | string | `normal`, `warning`, or `danger` |
| `gpus[].junctionStatus` | string | `normal`, `warning`, or `danger` |
| `gpus[].vramStatus` | string | `normal`, `warning`, or `danger` |

**`GET /health`** — проверка доступности:

```json
{"status":"ok"}
```

## Настройка порогов (env vars)

```bash
GPUTEMP_CORE_WARN=70           # Core temp warning (default: 70)
GPUTEMP_CORE_DANGER=85         # Core temp danger (default: 85)
GPUTEMP_JUNCTION_WARN=80       # Junction temp warning (default: 80)
GPUTEMP_JUNCTION_DANGER=95     # Junction temp danger (default: 95)
GPUTEMP_VRAM_WARN=80           # VRAM temp warning (default: 80)
GPUTEMP_VRAM_DANGER=95         # VRAM temp danger (default: 95)
```

## Настройка логирования (env vars)

```bash
GPUTEMP_LOG_LEVEL=DEBUG        # Log level: DEBUG, INFO (default), WARN, ERROR
```

**Output:**
- All levels (DEBUG–CRITICAL) → stdout
- WARN and above → also syslog (`LOG_USER`), captured by journald when run as systemd service
- DEBUG/INFO only stdout — avoids flooding syslog on frequent polls

**Example log output:**
```
[2025-01-15 10:30:00] [INFO ] gputempd starting (pid=12345)
[2025-01-15 10:30:00] [INFO ] Detected 1 GPU(s)
[2025-01-15 10:30:00] [INFO ]   GPU 0: NVIDIA GeForce RTX 3090
[2025-01-15 10:30:00] [INFO ] Starting HTTP server on port 8080
```

## Troubleshooting

### mmap error: `/dev/mem` access denied

**Symptom:** `gputempd` fails with `mmap: Permission denied`

**Solution:** Add `iomem=relaxed` to GRUB:

```bash
sudo nano /etc/default/grub
# GRUB_CMDLINE_LINUX_DEFAULT="quiet splash iomem=relaxed"
sudo update-grub
sudo reboot
```

## Установка как systemd service

```bash
sudo cp gputempd /usr/local/bin/
sudo tee /etc/systemd/system/gputempd.service << EOF
[Unit]
Description=GPU Temperature Daemon
After=network.target

[Service]
ExecStart=/usr/local/bin/gputempd
Restart=always
Environment=GPUTEMP_PORT=8080

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl enable gputempd
sudo systemctl start gputempd
```
