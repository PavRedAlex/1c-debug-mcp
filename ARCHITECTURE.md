# Архитектура 1C Debug MCP Server

Документ описывает внутреннюю архитектуру MCP сервера для отладки 1С.

## Обзор

```
┌─────────────────┐
│  AI Assistant   │ (Claude, Kiro, etc.)
└────────┬────────┘
         │ MCP Protocol (stdio)
         ↓
┌─────────────────┐
│   MCP Server    │ (index.ts)
│  Tool Registry  │
└────────┬────────┘
         │
    ┌────┴────┬────────┬──────────┬─────────────┐
    ↓         ↓        ↓          ↓             ↓
┌────────┐ ┌──────┐ ┌──────┐ ┌─────────┐ ┌──────────┐
│ Debug  │ │Session│ │ Ping │ │  Event  │ │ Metadata │
│ Client │ │Manager│ │ Loop │ │  Queue  │ │ Provider │
└────┬───┘ └──────┘ └───┬──┘ └────┬────┘ └──────────┘
     │                  │         │
     │ HTTP             │ Events  │
     ↓                  ↓         ↓
┌──────────────────────────────────┐
│   1C Debug Server (dbgs.exe)     │
│   HTTP Debug Protocol            │
└──────────────────────────────────┘
                 ↓
┌──────────────────────────────────┐
│      1C:Enterprise Platform      │
└──────────────────────────────────┘
```

## Основные компоненты

### 1. MCP Server (index.ts)

**Назначение:** Точка входа, регистрация инструментов MCP.

**Ответственность:**
- Инициализация всех компонентов
- Регистрация MCP инструментов через `server.tool()`
- Обработка stdio транспорта
- Graceful shutdown

**Зависимости:**
- `@modelcontextprotocol/sdk` — MCP SDK
- Все компоненты системы

### 2. DebugClient (debugClient.ts)

**Назначение:** HTTP клиент для протокола отладки 1С.

**Ответственность:**
- Отправка HTTP POST запросов к dbgs.exe
- Сериализация запросов в XML
- Десериализация ответов из XML
- Обработка ошибок HTTP
- Retry логика для attach (при ibInDebug)

**Основные методы:**
- `attach()` — подключение к серверу отладки
- `detach()` — отключение
- `setBreakpoints()` — установка точек останова
- `step()` — пошаговое выполнение
- `ping()` — опрос событий
- `evalLocalVariables()` — получение переменных
- `evalExpr()` — вычисление выражений

**Протокол:**
```
POST /e1crdbg/rdbg?cmd=<command>&dbgui=<debugger-id>
Content-Type: application/xml; charset=utf-8
User-Agent: 1CV8

<request xmlns="http://v8.1c.ru/8.3/debugger/debugRDBGRequestResponse">
  ...
</request>
```

### 3. SessionManager (sessionManager.ts)

**Назначение:** Управление сессией отладки.

**Ответственность:**
- Хранение текущей сессии (URL, alias, debugger ID)
- Валидация наличия активной сессии
- Хранение последних установленных точек останова
- Очистка сессии при отключении

**Структура Session:**
```typescript
interface Session {
  url: string;              // http://localhost:1550
  alias: string;            // DefAlias
  id: string;               // UUID отладчика
  password?: string;        // Пароль (опционально)
  lastBreakpoints?: BPWorkspaceInternal;
}
```

### 4. PingLoop (pingLoop.ts)

**Назначение:** Цикл опроса событий отладки.

**Ответственность:**
- Периодический вызов `ping()` для получения событий
- Диспетчеризация событий в EventQueue
- Управление интервалом опроса (по умолчанию 500ms)
- Остановка цикла при отключении

**Поток:**
```
start() → setInterval(500ms) → ping() → events → eventQueue.enqueue()
```

**События:**
- `callStackFormed` — остановка на точке/step
- `exprEvaluated` — результат evaluate
- `targetQuit` — завершение цели отладки
- `targetStarted` — запуск новой цели

### 5. EventQueue (eventQueue.ts)

**Назначение:** Очередь событий отладки с ожиданием.

**Ответственность:**
- Хранение событий остановки (StopEvent)
- Ожидание событий с таймаутом (`waitForStop`)
- Хранение последнего стека вызовов
- Обработка результатов evaluate

**Основные методы:**
- `enqueue(event)` — добавить событие
- `waitForStop(timeout)` — дождаться остановки
- `getLastCallStack()` — получить последний стек
- `enqueueEvalResult()` — результат evaluate
- `waitForEvalResult()` — дождаться результата evaluate

**Механизм ожидания:**
```typescript
// Если уже остановлены — вернуть сразу
if (this._pendingStop) return this._pendingStop;

// Иначе подписаться на событие "stop"
this.once("stop", (event) => resolve(event));
```

### 6. MetadataProvider (metadataProvider.ts)

**Назначение:** Резолвинг objectID → имя модуля.

**Ответственность:**
- Парсинг XML метаданных конфигурации
- Парсинг XML расширений
- Парсинг XML внешних обработок
- Кэширование результатов
- Резолвинг extensionName для расширений

**Структура:**
```typescript
class MetadataProvider {
  private cfModules: Map<string, string>;      // objectID → имя
  private cfeModules: Map<string, string>;     // objectID → имя
  private epfModules: Map<string, string>;     // objectID → имя
  private extensionNames: Map<string, string>; // objectID → extensionName
  
  resolveModuleName(objectID: string): string | undefined;
  resolveExtensionName(objectID: string): string | undefined;
}
```

**Пример резолвинга:**
```
objectID: 4eee25b1-2da6-459b-953b-4c8d519c9bce
→ CommonModule.ОбщегоНазначения
```

### 7. XMLSerializer (xmlSerializer.ts)

**Назначение:** Сериализация/десериализация XML.

**Ответственность:**
- Сериализация объектов в XML (для запросов)
- Десериализация XML в объекты (для ответов)
- Обработка namespace
- Обработка base64 полей

**Используемая библиотека:** `fast-xml-parser`

## Инструменты (Tools)

Каждый инструмент — это функция-обработчик, зарегистрированная в MCP сервере.

### Структура инструмента

```typescript
export function createMyTool(
  debugClient: DebugClient,
  sessionManager: SessionManager,
  // ... другие зависимости
) {
  return async (args: { param: string }) => {
    // 1. Валидация сессии
    const session = sessionManager.requireSession();
    
    // 2. Вызов DebugClient
    const result = await debugClient.someMethod(session, args.param);
    
    // 3. Возврат результата
    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify(result)
      }]
    };
  };
}
```

### Категории инструментов

#### Управление сессией (attach.ts)
- `attach` — подключение к серверу отладки
- `detach` — отключение

#### Управление целями (targets.ts)
- `get_targets` — список целей отладки

#### Точки останова (breakpoints.ts)
- `set_breakpoints` — установка точек
- `clear_breakpoints` — удаление точек

#### Выполнение (execution.ts)
- `continue` — продолжить выполнение
- `step_in` — шаг с заходом
- `step_out` — выход из процедуры
- `pause` — пауза на следующей строке

#### Инспекция (inspection.ts)
- `get_variables` — локальные переменные
- `evaluate` — вычисление выражения
- `get_call_stack` — стек вызовов (не используется, данные в StopEvent)

#### Ожидание (waitForStop.ts)
- `wait_for_stop` — ожидание остановки

## Поток данных

### Установка точки останова

```
AI → mcp_1c_debug_set_breakpoints
  → setBreakpointsTool
    → sessionManager.requireSession()
    → debugClient.setBreakpoints()
      → POST /e1crdbg/rdbg?cmd=setBreakpoints
        → dbgs.exe
          → 1C Platform
```

### Ожидание остановки

```
AI → mcp_1c_debug_wait_for_stop
  → waitForStopTool
    → eventQueue.waitForStop(timeout)
      → [ждёт события "stop"]
      
[Параллельно]
PingLoop (каждые 500ms)
  → debugClient.ping()
    → POST /e1crdbg/rdbg?cmd=pingDebugUIParams
      → dbgs.exe возвращает события
        → debugClient парсит XML
          → eventQueue.enqueue(StopEvent)
            → emit("stop", event)
              → waitForStop резолвится
                → возврат AI
```

### Вычисление выражения

```
AI → mcp_1c_debug_evaluate
  → evaluateTool
    → sessionManager.requireSession()
    → debugClient.evalExpr(session, targetId, expression)
      → POST /e1crdbg/rdbg?cmd=evalExpr
        → dbgs.exe
          → 1C Platform вычисляет выражение
            → результат в событии exprEvaluated
              → PingLoop получает событие
                → eventQueue.enqueueEvalResult()
                  → waitForEvalResult резолвится
                    → возврат AI
```

## Типы данных

### Основные интерфейсы

```typescript
// Цель отладки
interface DebugTarget {
  targetID: TargetID;
  targetType: "ManagedClient" | "ServerEmulation" | ...;
  suspended: boolean;
}

// ID цели
interface TargetID {
  id: string;           // UUID
  seanceId?: string;    // UUID сеанса
  seqno?: number;       // Порядковый номер
}

// Модуль
interface ModuleID {
  type: ModuleType;
  name: string;
  url?: string;
  objectID?: string;    // GUID из метаданных
  propertyID?: string;  // GUID типа модуля
  extensionName?: string;
}

// Точка останова
interface Breakpoint {
  line: number;
}

// Переменная
interface Variable {
  name: string;
  typeName: string;
  value: string;
  expandable?: boolean;
}

// Событие остановки
interface StopEvent {
  type: "DBGUIExtCmdInfoCallStackFormed";
  targetId: string;
  moduleName: string;
  lineNo: number;
  callStack: StackFrame[];
}
```

## Конфигурация

### Переменные окружения

Читаются из `env` секции mcp.json:

```typescript
interface Config {
  url?: string;           // ONEC_DEBUG_URL
  alias?: string;         // ONEC_INFOBASE_ALIAS
  cfPath?: string;        // ONEC_CF_PATH
  cfePaths?: string[];    // ONEC_CFE_PATHS (split by comma)
  epfPaths?: string[];    // ONEC_EPF_PATHS (split by comma)
}
```

### Парсинг (config.ts)

```typescript
export function parseConfig(): Config {
  return {
    url: process.env.ONEC_DEBUG_URL,
    alias: process.env.ONEC_INFOBASE_ALIAS,
    cfPath: process.env.ONEC_CF_PATH,
    cfePaths: process.env.ONEC_CFE_PATHS?.split(",").map(s => s.trim()),
    epfPaths: process.env.ONEC_EPF_PATHS?.split(",").map(s => s.trim()),
  };
}
```

## Логирование

Все операции логируются в `dist/1c-debug.log`:

```typescript
// Перенаправление stderr в файл
const logStream = fs.createWriteStream(logFile, { flags: "w" });
process.stderr.write = (chunk) => {
  logStream.write(chunk);
  return origStderr(chunk);
};

// Использование
process.stderr.write(`[1c-debug] Operation: ${data}\n`);
```

## Обработка ошибок

### HTTP ошибки

```typescript
class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
    public readonly url: string
  ) {
    super(`HTTP ${status} from ${url}`);
  }
}
```

### Timeout ошибки

```typescript
class TimeoutError extends Error {
  constructor(public readonly timeoutMs: number) {
    super(`No stop event received within ${timeoutMs}ms`);
  }
}
```

### Обработка в инструментах

```typescript
try {
  const result = await debugClient.someMethod();
  return { content: [{ type: "text", text: JSON.stringify(result) }] };
} catch (err) {
  return {
    content: [{ type: "text", text: JSON.stringify({ error: String(err) }) }],
    isError: true
  };
}
```

## Тестирование

### Unit тесты (Vitest)

```typescript
describe("DebugClient", () => {
  it("should serialize request correctly", () => {
    const xml = serialize({ field: "value" });
    expect(xml).toContain("<field>value</field>");
  });
});
```

### Property-based тесты (fast-check)

```typescript
test("XML serialization roundtrip", () => {
  fc.assert(
    fc.property(fc.record({ field: fc.string() }), (obj) => {
      const xml = serialize(obj);
      const result = deserialize(xml);
      return result.field === obj.field;
    })
  );
});
```

## Производительность

### Оптимизации

1. **Кэширование метаданных** — MetadataProvider кэширует результаты парсинга XML
2. **Переиспользование HTTP соединений** — fetch API использует keep-alive
3. **Асинхронность** — все операции асинхронные, не блокируют event loop
4. **Ping интервал** — 500ms баланс между отзывчивостью и нагрузкой

### Узкие места

1. **Парсинг XML** — может быть медленным для больших ответов
2. **Ping loop** — постоянная нагрузка на сервер отладки
3. **Метаданные** — первый парсинг может занять время

## Безопасность

### Ограничения

- Нет аутентификации MCP сервера (stdio транспорт локальный)
- Пароль сервера отладки передаётся в открытом виде (HTTP)
- Логи могут содержать чувствительные данные

### Рекомендации

- Используйте только в изолированных средах разработки
- Не запускайте на продакшен серверах
- Не коммитьте mcp.json с паролями в git

## Расширяемость

### Добавление нового инструмента

1. Создать файл в `src/tools/`
2. Реализовать функцию-обработчик
3. Зарегистрировать в `src/index.ts`
4. Добавить тесты
5. Обновить документацию

### Добавление нового типа события

1. Добавить интерфейс в `src/types/events.ts`
2. Обновить `DebugEventUnion`
3. Добавить обработку в `debugClient.ping()`
4. Добавить обработку в `eventQueue.enqueue()`

### Добавление нового типа модуля

1. Добавить в `ModuleType` enum в `src/types/requests.ts`
2. Добавить маппинг в `MODULE_PROPERTY_ID` в `src/tools/breakpoints.ts`
3. Добавить маппинг в `MODULE_TYPE_PREFIX` если нужно
4. Обновить документацию

## Связанные проекты

- [onec-debug-adapter](https://github.com/akpaevj/onec-debug-adapter) — C# реализация DAP адаптера
- [OneDebugger](https://github.com/otymko/OneDebugger) — Альтернативный отладчик на BSL
- [MCP SDK](https://github.com/modelcontextprotocol/typescript-sdk) — TypeScript SDK для MCP
