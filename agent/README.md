# gputempd - GPU Temperature Daemon

C-агент для чтения температур NVIDIA GPU и отображения данных через HTTP API.

## Возможности

- Чтение Core, Junction, VRAM температур
- GPU utilization, memory, power
- HTTP API для Electron-клиента

Агент отправляет только «сырые» температуры. Оценка статуса
(normal/warning/danger) выполняется приложением GPU Monitor
по пользовательским порогам. Недоступные сенсоры отдаются как `null`.

## Источники температур Junction/VRAM

| Архитектура | Junction | VRAM |
|-------------|----------|------|
| Turing – Ada (RTX 20/30/40) | NVAPI therm channel (type 1) | NVAPI therm channel (type 3), legacy BAR0 fallback |
| Blackwell (RTX 50) | NVAPI register op, агрегированный регистр `0xad0aa0` — **только под root** | NVAPI therm channel (type 3) |

NVAPI (`libnvidia-api.so.1`, есть в драйверах ~560+) — основной источник;
механизм портирован из [LACT](https://github.com/ilya-zlobintsev/LACT) (MIT).
Legacy `/dev/mem` BAR0-фолбэк (регистры `0x0002046C`/`0x0000E2A8`) требует
`iomem=relaxed` и **не работает на Blackwell** — там эти офсёты мертвы.
Если сенсор недоступен всеми способами, в JSON приходит `null`
(в приложении отображается как `--`).

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
# По умолчанию порт 9091
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
  "agentVersion": "1.0.0",
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
        "vendor": "MSI",
       "model": "MAG RTX 3090",
       "partNumber": "MS-7C83"
     }
   ]
 }
```

**Response fields:**

| Field | Type | Description |
|-------|------|-------------|
| `timestamp` | int | Unix timestamp of the snapshot |
| `agentVersion` | string | gputempd build version (agents older than 1.0.0 omit this field) |
| `gpus` | array | Array of GPU objects |
| `gpus[].uuid` | string | NVML GPU UUID (stable identifier) |
| `gpus[].index` | int | NVML device index |
| `gpus[].name` | string | GPU model name |
| `gpus[].coreTemp` | float | Core temperature (°C) |
| `gpus[].junctionTemp` | float \| null | Junction temperature (°C), `null` if sensor unavailable or reading outside 1–255 °C |
| `gpus[].vramTemp` | float \| null | VRAM temperature (°C), `null` if sensor unavailable or reading outside 1–255 °C |
| `gpus[].gpuUtilization` | float | GPU utilization (%) |
| `gpus[].memoryUsed` | int | Video memory used (bytes) |
| `gpus[].memoryTotal` | int | Total video memory (bytes) |
| `gpus[].powerUsage` | float | Power draw (W) |
| `gpus[].fanSpeed` | int | Fan speed (0-100 %) |
| `gpus[].gpuClockMHz` | int | Current GPU core clock (MHz) |
| `gpus[].memClockMHz` | int | Current memory clock (MHz) |
| `gpus[].tempShutdown` | int | Temperature shutdown threshold (°C) |
| `gpus[].tempSlowdown` | int | Temperature slowdown threshold (°C) |
| `gpus[].powerCapW` | float | Enforced power limit (W) |
| `gpus[].driverVersion` | string | NVIDIA driver version |
| `gpus[].perfState` | int | P-state index (P0 = max perf) |
| `gpus[].vendor` | string | Board vendor (ASUS, MSI, Gigabyte, etc.), discovered at startup |
| `gpus[].model` | string | Board model name (from VBIOS), discovered at startup |
| `gpus[].partNumber` | string | NVML board part number, discovered at startup |

> `vendor`, `model`, and `partNumber` are discovered once at startup (VBIOS ROM + PCI sysfs + NVML fallback) and cached for the lifetime of the daemon. They are not per-polling-cycle data.

**`GET /health`** — проверка доступности:

```json
{"status":"ok","version":"1.0.0"}
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
[2025-01-15 10:30:00] [INFO ] Starting HTTP server on port 9091
```

## Troubleshooting

### junctionTemp = null на RTX 50 (Blackwell)

Blackwell hotspot читается только через NVAPI register op, который
требует root (запускайте демон через systemd/sudo, как и предусмотрено).
VRAM (GDDR7) читается therm-каналом и работает без root.

**Check:** `GPUTEMP_LOG_LEVEL=DEBUG gputempd 19091` — ищи
`NVAPI ... failed` строки. `libnvidia-api.so.1 not found` → драйвер
старше ~560 или не установлен userspace-пакет NVIDIA.

### mmap error: `/dev/mem` access denied (legacy fallback only)

**Symptom:** `gputempd` fails with `mmap: Permission denied` on pre-NVAPI GPUs

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
Environment=GPUTEMP_PORT=9091

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl enable gputempd
sudo systemctl start gputempd
```
