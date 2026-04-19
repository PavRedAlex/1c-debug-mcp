# Архитектура 1C Debug MCP Server (Go)

## Обзор

```
┌─────────────────┐
│  AI Assistant   │ (Claude, Kiro, etc.)
└────────┬────────┘
         │ MCP Protocol (stdio JSON-RPC 2.0)
         ↓
┌─────────────────────────────────────────┐
│         1c-debug-mcp (Go binary)        │
│  cmd/1c-debug-mcp/main.go               │
│  - parseConfig()                        │
│  - регистрация 15 MCP-инструментов      │
│  - mcp.NewStdioServer()                 │
│  - SIGINT/SIGTERM graceful shutdown     │
└──────────────┬──────────────────────────┘
               │
    ┌──────────┼──────────────────────────┐
    │          │                          │
    ▼          ▼                          ▼
┌────────┐ ┌──────────┐  ┌──────────┐ ┌──────────────┐
│session │ │  client  │  │  events  │ │   metadata   │
│Manager │ │DebugClient│  │EventQueue│ │MetadataProvider│
└────────┘ └──────────┘  └──────────┘ └──────────────┘
                ▲               ▲
                │               │
           ┌────┴────┐    ┌─────┴────┐
           │  ping   │    │  tools/  │
           │PingLoop │    │ (15 шт)  │
           └─────────┘    └──────────┘
                │
                │ HTTP POST (no body, &dbgui=<id>)
                ▼
┌──────────────────────────────────┐
│   1C Debug Server (dbgs.exe)     │
│   HTTP Debug Protocol            │
└──────────────────────────────────┘
```

## Пакеты

### `cmd/1c-debug-mcp` — точка входа

- `parseConfig()` — читает env (`ONEC_*`) и CLI-флаги (`--url`, `--alias`, `--cf-path`)
- Создаёт все компоненты
- Регистрирует 15 MCP-инструментов через `mcp-go`
- Запускает `server.ServeStdio()` — блокирует до закрытия stdin
- Обрабатывает SIGINT/SIGTERM: Stop ping → Detach → Exit 0

### `internal/session` — SessionManager

```go
type Session struct {
    ID              string           // UUID v4
    URL             string
    Alias           string
    Password        string
    LastBreakpoints *xmlproto.BPWorkspace
}
```

- `Create(url, alias, password)` — создаёт сессию с UUID v4
- `Require()` — возвращает ошибку если нет активной сессии
- `SetLastBreakpoints(bp)` — сохраняет точки для переотправки

### `internal/client` — DebugClient

HTTP-клиент для протокола отладки 1С. Все запросы — `POST /e1crdbg/rdbg?cmd=<cmd>`.

**Ключевые особенности протокола:**
- `ping` — **без тела**, с `&dbgui=<sessionID>` в URL
- `step` — action значения с заглавной: `Continue`, `StepIn`, `StepOut`
- `setBreakpoints` — три namespace: `debugRDBGRequestResponse`, `debugBreakpoints`, `debugBaseData`
- `setAutoAttachSettings` — namespace `debugAutoAttach`, `xsi:type="aa:DebugAutoAttachSettings"`
- `attachDetachDbgTargets` — `xsi:type="bd:DebugTargetIdLight"` на каждом `<id>`

### `internal/ping` — PingLoop

Горутина, опрашивающая dbgs.exe каждые 500мс.

**Поток событий:**
```
ping → callStackFormed → EventQueue.EnqueueStop()
ping → exprEvaluated  → EventQueue.DeliverEval()
ping → targetStarted  → AttachDetachTargets() + SetBreakpoints()
ping → HTTP 400       → Detach → AttachWithRetry → восстановление
```

**При HTTP 400 (dbgs.exe перезапущен):**
1. Ждёт 3 секунды
2. `Detach` → `AttachWithRetry` (5 попыток)
3. `InitSettings` → `SetAutoAttach`
4. Ждёт 2 секунды (клиенты переподключаются)
5. `GetTargets` → `AttachDetachTargets` → `SetBreakpoints`

### `internal/events` — EventQueue

```go
type Queue struct {
    pendingStop   *StopEvent    // текущее событие (потребляется wait_for_stop)
    lastCallStack *StopEvent    // последнее событие (не потребляется, для get_call_stack)
    stopCh        chan StopEvent // буфер 1
    evalWaiters   map[string]chan EvalResult
}
```

- `WaitForStop(ctx)` — блокирует до события или таймаута; возвращает немедленно если уже есть
- `GetLastCallStack()` — не потребляет событие, для `get_call_stack`
- `RegisterEvalWaiter(id)` / `DeliverEval(id, result)` — для eval результатов

### `internal/metadata` — MetadataProvider

Читает XML-файлы конфигурации, строит маппинг `UUID → имя модуля`.

```
objectID (UUID) → "CommonModule.ОбщегоНазначения"
objectID (UUID) → "_ДемоПустоеРасширение:Document._ДемоЗаказПокупателя"
```

**Кэширование (v2.0+):**

Для ускорения старта метаданные автоматически кэшируются:

- **Первый запуск:** полное сканирование XML → сохранение в `.1c-debug-metadata-cache.json`
- **Последующие запуски:** загрузка из кэша (<100мс)
- **Инвалидация:** автоматическая при изменении `Configuration.xml` или папок метаданных

**Оптимизации:**

1. **Частичное чтение XML** — только первые 2KB для извлечения UUID (экономия ~90% I/O)
2. **Параллельное сканирование** — горутины для обработки XML файлов (ускорение в 2-4 раза)
3. **Проверка mtime папок** — вместо проверки каждого файла (быстрая инвалидация)

**Файлы:**
- `metadata/metadata.go` — основная логика сканирования
- `metadata/cache.go` — кэширование и инвалидация
- `metadata/cache_test.go` — тесты

**`ResolveObjectID(moduleName, extensionName string)`:**

- `extensionName == ""` → ищет только в основной конфигурации (без `:` в метке)
- `extensionName != ""` → ищет только в конкретном расширении

### `internal/xmlproto` — XML типы и билдеры

- `builder.go` — функции сборки XML-строк для каждой команды
- `responses.go` — Go-структуры для парсинга XML-ответов
- `types.go` — общие типы: `BPWorkspace`, `ModuleID`, `TargetID`, `StackFrame`
- `escape.go` — `EscapeXML()` для экранирования спецсимволов

### `internal/tools` — 15 MCP-инструментов

| Инструмент | Описание |
|---|---|
| `attach` | Подключение к dbgs.exe |
| `detach` | Отключение |
| `force_detach` | Принудительное отключение (при зависшей сессии) |
| `get_targets` | Список целей отладки + статус метаданных |
| `set_breakpoints` | Установка точек (авторезолв objectID) |
| `clear_breakpoints` | Удаление всех точек |
| `continue` | Продолжить выполнение |
| `step_in` | Шаг с заходом |
| `step_out` | Выход из процедуры |
| `pause` | Пауза через `initSettings(breakOnNextLine=true)` |
| `wait_for_stop` | Ожидание остановки + сброс `breakOnNextLine` |
| `get_call_stack` | Стек из последнего события (не потребляет очередь) |
| `get_variables` | Локальные переменные через `evalLocalVariables` |
| `evaluate` | Вычисление BSL-выражения |
| `raw_request` | Произвольный XML-запрос к dbgs.exe |
| `reload_metadata` | Перезагрузка метаданных без перезапуска (с опцией `skipCache`) |

### `internal/logger` — Логирование

```go
// Уровни: LevelError (0), LevelInfo (1), LevelDebug (2)
// Управление: ONEC_LOG_LEVEL=error|info|debug
// Файл: ONEC_LOG_FILE=path (O_TRUNC — перезапись при старте)
// Вывод: всегда в stderr + опционально в файл (MultiWriter)
```

## Поток данных

### Установка точки останова

```
AI → set_breakpoints(moduleName, moduleType, lines, extensionName?)
  → MetadataProvider.ResolveObjectID(name, ext) → objectID
  → xmlproto.BuildSetBreakpointsXML(...)
  → POST /e1crdbg/rdbg?cmd=setBreakpoints
  → SessionManager.SetLastBreakpoints(bp)
```

### Ожидание остановки

```
AI → wait_for_stop(timeout)
  → EventQueue.WaitForStop(ctx) — блокирует

[Параллельно, каждые 500мс]
PingLoop → POST /e1crdbg/rdbg?cmd=pingDebugUIParams&dbgui=<id>
  → ParsePingResponse → callStackFormed
  → EventQueue.EnqueueStop(event)
  → WaitForStop разблокируется

wait_for_stop → InitSettings(breakOnNextLine=false) — сброс паузы
  → резолвинг objectID → имена модулей
  → возврат AI
```

### Вычисление выражения

```
AI → evaluate(targetId, expression)
  → uuid = NewUUID()
  → EventQueue.RegisterEvalWaiter(uuid)
  → POST /e1crdbg/rdbg?cmd=evalExpr (с uuid в теле)
  → ждёт 10с

[Параллельно]
PingLoop → exprEvaluated → EventQueue.DeliverEval(uuid, result)
  → evaluate разблокируется → возврат AI
```

## Конфигурация

```go
type Config struct {
    URL      string   // ONEC_DEBUG_URL или --url
    Alias    string   // ONEC_INFOBASE_ALIAS или --alias
    Password string   // ONEC_DEBUG_PASSWORD или --password
    CFPath   string   // ONEC_CF_PATH или --cf-path
    CFEPaths []string // ONEC_CFE_PATHS (разделитель ;)
    EPFPaths []string // ONEC_EPF_PATHS (разделитель ;)
}
```

CLI-флаги имеют приоритет над переменными окружения.

## Сборка

```bash
cd 1c-debug-mcp/go
go build -o dist/1c-debug-mcp.exe ./cmd/1c-debug-mcp/

# Cross-compilation
GOOS=linux   go build -o dist/1c-debug-mcp-linux ./cmd/1c-debug-mcp/
GOOS=darwin  go build -o dist/1c-debug-mcp-macos ./cmd/1c-debug-mcp/
GOOS=windows go build -o dist/1c-debug-mcp.exe   ./cmd/1c-debug-mcp/
```

## Зависимости

- `github.com/mark3labs/mcp-go` — MCP stdio transport
- `github.com/google/uuid` — генерация UUID v4
- `pgregory.net/rapid` — property-based тесты (опционально)
