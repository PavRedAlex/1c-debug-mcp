# 1C Debug MCP Server

MCP (Model Context Protocol) сервер для отладки 1С:Предприятие через HTTP Debug Protocol (dbgs.exe).

Позволяет AI-ассистентам (Claude, Kiro и др.) управлять отладкой 1С приложений: устанавливать точки останова, выполнять пошаговую отладку, просматривать переменные и вычислять выражения.

## Возможности

- ✅ Подключение к серверу отладки 1С (dbgs.exe)
- ✅ Установка и удаление точек останова
- ✅ Пошаговое выполнение (step-in, step-out, continue)
- ✅ Просмотр локальных переменных
- ✅ Вычисление BSL выражений в контексте остановки
- ✅ Получение стека вызовов
- ✅ Поддержка конфигураций, расширений и внешних обработок
- ✅ Автоматический резолвинг objectID → имя модуля через метаданные
- ✅ Перезагрузка метаданных без перезапуска сервера

## Установка

### Требования

- Node.js 18+
- 1С:Предприятие 8.3 с запущенным сервером отладки (dbgs.exe)
- TypeScript (для сборки из исходников)

### Сборка

```bash
cd 1c-debug-mcp
npm install
npm run build
```

После сборки исполняемый файл будет в `dist/index.js`.

## Настройка

### 1. Запуск сервера отладки 1С

Запустите dbgs.exe локально:

```bash
dbgs.exe --port=1550 --addr=localhost
```

Сервер будет доступен на `http://localhost:1550`.

**Примечание:** Если сервер отладки уже запущен на удалённом сервере, просто укажите его URL в настройках (см. ниже).

### 2. Настройка MCP сервера

Добавьте конфигурацию в `.kiro/settings/mcp.json` (или `~/.kiro/settings/mcp.json` для глобальной настройки):

```json
{
  "mcpServers": {
    "1c-debug": {
      "command": "node",
      "args": ["/path/to/1c-debug-mcp/dist/index.js"],
      "env": {
        "ONEC_DEBUG_URL": "http://localhost:1550",
        "ONEC_INFOBASE_ALIAS": "DefAlias",
        "ONEC_CF_PATH": "/path/to/configuration",
        "ONEC_CFE_PATHS": "/path/to/extensions/Extension1",
        "ONEC_EPF_PATHS": "/path/to/external-processors/Processor1"
      }
    }
  }
}
```

**Для подключения к удалённому серверу отладки** просто укажите его URL:

```json
{
  "env": {
    "ONEC_DEBUG_URL": "http://192.168.1.100:1550",
    "ONEC_INFOBASE_ALIAS": "production_base"
  }
}
```

**Примечание:** 
- Для локальной базы `ONEC_INFOBASE_ALIAS` обычно `DefAlias`
- Для серверной базы укажите реальное имя базы на сервере (например, `production_base`, `accounting`, и т.д.)

Работа с удалённым сервером ничем не отличается от локального.

#### Параметры конфигурации

| Параметр | Описание | Обязательный |
|----------|----------|--------------|
| `ONEC_DEBUG_URL` | URL сервера отладки (локальный: `http://localhost:1550` или удалённый: `http://server-ip:1550`) | Да |
| `ONEC_INFOBASE_ALIAS` | Алиас информационной базы из ibases.v8i. Для локальной базы обычно `DefAlias`, для серверной — имя базы на сервере | Да |
| `ONEC_CF_PATH` | Путь к выгруженной конфигурации (для резолвинга модулей) | Нет |
| `ONEC_CFE_PATHS` | Пути к расширениям (через запятую) | Нет |
| `ONEC_EPF_PATHS` | Пути к внешним обработкам (через запятую) | Нет |

**Примечание:** Работа с локальным и удалённым сервером отладки идентична — просто укажите соответствующий URL.

### 3. Перезапуск MCP сервера

После изменения конфигурации перезапустите MCP сервер через панель "MCP Servers" в Kiro или перезапустите IDE.

## Доступные инструменты

### attach

Подключение к серверу отладки 1С.

**Параметры:**
- `url` (optional) — URL сервера отладки (по умолчанию из `ONEC_DEBUG_URL`)
- `infobaseAlias` (optional) — алиас информационной базы (по умолчанию из `ONEC_INFOBASE_ALIAS`)
- `autoAttach` (optional) — автоматически подключаться ко всем целям отладки (по умолчанию `true`)
- `password` (optional) — пароль сервера отладки

**Пример:**
```typescript
// Локальный сервер
await attach({
  url: "http://localhost:1550",
  infobaseAlias: "DefAlias",
  autoAttach: true
});

// Удалённый сервер
await attach({
  url: "http://192.168.1.100:1550",
  infobaseAlias: "DefAlias",
  password: "debug-password",
  autoAttach: true
});
```

### detach

Отключение от сервера отладки.

**Параметры:** нет

### get_targets

Получение списка подключенных целей отладки (процессов 1С).

**Параметры:** нет

**Возвращает:**
```json
{
  "targets": [
    {
      "targetID": { "id": "...", "seanceId": "..." },
      "targetType": "ManagedClient",
      "suspended": false
    }
  ]
}
```

### set_breakpoints

Установка точек останова в модуле BSL.

**Параметры:**
- `moduleName` (required) — имя модуля (например, `МойОбщийМодуль`)
- `moduleType` (optional) — тип модуля: `CommonModule`, `ObjectModule`, `FormModule`, `ManagerModule`, и др.
- `lines` (required) — массив номеров строк для установки точек
- `objectID` (optional) — GUID объекта из метаданных (для надёжного сопоставления)
- `targetId` (optional) — ID цели отладки (если указан, вызывает `clearBreakOnNextStatement` перед установкой)

**Пример:**
```typescript
await set_breakpoints({
  moduleName: "ОбщегоНазначения",
  moduleType: "CommonModule",
  lines: [42, 100],
  objectID: "4eee25b1-2da6-459b-953b-4c8d519c9bce"
});
```

**⚠️ Ограничения:**
- Точки останова для **внешних обработок (EPF)** не работают через протокол отладки (ограничение платформы 1С)
- Для внешних обработок используйте `pause` (breakOnNextLine) + пошаговое выполнение

### clear_breakpoints

Удаление всех точек останова.

**Параметры:**
- `moduleName` (optional) — имя модуля
- `moduleType` (optional) — тип модуля

### continue

Продолжение выполнения остановленной цели отладки.

**Параметры:**
- `targetId` (required) — ID цели отладки из `get_targets`

### step_in

Шаг с заходом в процедуры/функции.

**Параметры:**
- `targetId` (required) — ID цели отладки

### step_out

Выход из текущей процедуры/функции.

**Параметры:**
- `targetId` (required) — ID цели отладки

### pause

Приостановка выполнения на следующей строке (breakOnNextLine).

**Параметры:**
- `targetId` (required) — ID цели отладки

**Использование для внешних обработок:**
```typescript
// 1. Установить паузу
await pause({ targetId: "..." });

// 2. Выполнить действие в обработке (нажать кнопку)

// 3. Дождаться остановки
const event = await wait_for_stop({ timeout: 30000 });

// 4. Пошаговое выполнение
await step_in({ targetId: event.targetId });
```

### wait_for_stop

Ожидание остановки цели отладки (на точке останова или после step).

**Параметры:**
- `timeout` (optional) — таймаут в миллисекундах (по умолчанию 30000)

**Возвращает:**
```json
{
  "targetId": "...",
  "moduleName": "CommonModule.ОбщегоНазначения",
  "lineNo": 42,
  "callStack": [
    {
      "moduleID": {
        "type": "CommonModule",
        "name": "ОбщегоНазначения",
        "objectID": "...",
        "propertyID": "..."
      },
      "lineNo": 42
    }
  ]
}
```

### get_variables

Получение локальных переменных остановленной цели отладки.

**Параметры:**
- `targetId` (required) — ID цели отладки

**Возвращает:**
```json
{
  "variables": [
    {
      "name": "Параметр1",
      "typeName": "Строка",
      "value": "Значение",
      "expandable": false
    }
  ]
}
```

### evaluate

Вычисление BSL выражения в контексте остановленной цели отладки.

**Параметры:**
- `targetId` (required) — ID цели отладки
- `expression` (required) — BSL выражение для вычисления

**Пример:**
```typescript
await evaluate({
  targetId: "...",
  expression: "Параметр1 + \" - \" + Параметр2"
});
```

**Возвращает:**
```json
{
  "expression": "Параметр1 + \" - \" + Параметр2",
  "result": {
    "typeName": "Строка",
    "value": "Значение1 - Значение2"
  }
}
```

### raw_request

Отправка произвольного XML запроса к серверу отладки (для отладки протокола).

**Параметры:**
- `cmd` (required) — имя команды (например, `setBreakpoints`, `getCallStack`)
- `xml` (required) — полное тело XML запроса
- `dbgui` (optional) — параметр dbgui для query string

### reload_metadata

Перезагрузка метаданных из исходных файлов без перезапуска сервера.

Используйте после обновления исходников конфигурации (добавление новых объектов, форм и т.д.).

**Параметры:** нет

**Возвращает:**
```json
{
  "success": true,
  "moduleCount": 25594
}
```

## Типичные сценарии использования

### Отладка общего модуля

```typescript
// 1. Подключиться
await attach();

// 2. Установить точку останова
await set_breakpoints({
  moduleName: "ОбщегоНазначения",
  moduleType: "CommonModule",
  lines: [42],
  objectID: "4eee25b1-2da6-459b-953b-4c8d519c9bce"
});

// 3. Выполнить код в 1С (вызвать процедуру)

// 4. Дождаться остановки
const stop = await wait_for_stop({ timeout: 30000 });

// 5. Просмотреть переменные
const vars = await get_variables({ targetId: stop.targetId });

// 6. Вычислить выражение
const result = await evaluate({
  targetId: stop.targetId,
  expression: "ТекущаяДата()"
});

// 7. Продолжить выполнение
await continue({ targetId: stop.targetId });
```

### Отладка внешней обработки

```typescript
// 1. Подключиться
await attach();

// 2. Получить цели отладки
const targets = await get_targets();
const clientTarget = targets.targets.find(t => t.targetType === "ManagedClient");

// 3. Установить паузу на следующей строке
await pause({ targetId: clientTarget.targetID.id });

// 4. Выполнить действие в обработке (нажать кнопку)

// 5. Дождаться остановки
const stop = await wait_for_stop({ timeout: 30000 });

// 6. Пошаговое выполнение
await step_in({ targetId: stop.targetId });
await step_out({ targetId: stop.targetId });
await continue({ targetId: stop.targetId });
```

### Отладка расширения

```typescript
// 1. Убедиться что ONEC_CFE_PATHS настроен в mcp.json

// 2. Подключиться
await attach();

// 3. Установить точку в модуле расширения
await set_breakpoints({
  moduleName: "МодульРасширения",
  moduleType: "CommonModule",
  lines: [10],
  objectID: "extension-object-id-from-metadata"
});

// 4. Выполнить код расширения в 1С

// 5. Дождаться остановки и отладить
const stop = await wait_for_stop();
```

## Резолвинг модулей

MCP сервер автоматически резолвит `objectID` (GUID) в человекочитаемые имена модулей, если настроены пути к метаданным:

- `ONEC_CF_PATH` — путь к выгруженной конфигурации
- `ONEC_CFE_PATHS` — пути к расширениям (через запятую)
- `ONEC_EPF_PATHS` — пути к внешним обработкам (через запятую)

**Пример резолвинга:**
```
objectID: 4eee25b1-2da6-459b-953b-4c8d519c9bce
→ CommonModule.ОбщегоНазначения
```

Без метаданных будет показан только `objectID`.

## Известные ограничения

### Внешние обработки (EPF)

Точки останова для внешних обработок **не работают** через протокол отладки 1С. Это ограничение платформы — внешние обработки имеют динамический `objectID`, который меняется при каждом открытии.

**Решение:** Используйте `pause` (breakOnNextLine) + пошаговое выполнение:

1. Вызовите `pause({ targetId })`
2. Выполните действие в обработке
3. Платформа остановится на первой выполняемой строке
4. Используйте `step_in` / `step_out` для навигации

### Серверный контекст

Для отладки серверных процедур (с директивой `&НаСервере`) нужно:

1. Получить список целей через `get_targets()`
2. Найти цель с типом `ServerEmulation`
3. Использовать её `targetId` для команд отладки

## Логирование

Все операции логируются в файл `1c-debug.log` в директории `dist/`.

Для просмотра логов в реальном времени:

```bash
tail -f 1c-debug-mcp/dist/1c-debug.log
```

## Разработка

### Структура проекта

```
1c-debug-mcp/
├── src/
│   ├── index.ts              # Точка входа MCP сервера
│   ├── debugClient.ts        # HTTP клиент для протокола отладки
│   ├── sessionManager.ts     # Управление сессией отладки
│   ├── pingLoop.ts           # Цикл опроса событий (ping)
│   ├── eventQueue.ts         # Очередь событий отладки
│   ├── config.ts             # Парсинг конфигурации из env
│   ├── metadataProvider.ts   # Резолвинг objectID → имя модуля
│   ├── xmlSerializer.ts      # Сериализация/десериализация XML
│   ├── logger.ts             # Логирование
│   ├── types/                # TypeScript типы
│   │   ├── events.ts
│   │   ├── requests.ts
│   │   └── responses.ts
│   └── tools/                # Реализация MCP инструментов
│       ├── attach.ts
│       ├── targets.ts
│       ├── breakpoints.ts
│       ├── execution.ts
│       ├── inspection.ts
│       └── waitForStop.ts
├── tests/                    # Тесты (vitest)
├── dist/                     # Скомпилированный код
├── package.json
├── tsconfig.json
└── README.md
```

### Запуск тестов

```bash
npm test              # Запуск всех тестов
npm run test:watch    # Режим watch
```

### Сборка в watch режиме

```bash
npm run dev
```

## Протокол отладки 1С

MCP сервер использует HTTP Debug Protocol платформы 1С:Предприятие 8.3.

**Основные эндпоинты:**
- `POST /e1crdbg/rdbg?cmd=attachDebugUI` — подключение отладчика
- `POST /e1crdbg/rdbg?cmd=setBreakpoints` — установка точек останова
- `POST /e1crdbg/rdbg?cmd=pingDebugUIParams` — опрос событий
- `POST /e1crdbg/rdbg?cmd=step` — пошаговое выполнение
- `POST /e1crdbg/rdbg?cmd=evalLocalVariables` — получение переменных
- `POST /e1crdbg/rdbg?cmd=evalExpr` — вычисление выражений

**Документация протокола:**
- [onec-debug-adapter](https://github.com/akpaevj/onec-debug-adapter) — C# реализация DAP адаптера для 1С
- Анализ протокола в `vault/knowledge/logic/`

## Документация

- 📖 [Quick Start](QUICKSTART.md) — быстрый старт за 5 минут
- 📚 [Examples](EXAMPLES.md) — примеры использования
- ❓ [FAQ](FAQ.md) — часто задаваемые вопросы
- 🏗️ [Architecture](ARCHITECTURE.md) — архитектура проекта
- 🤝 [Contributing](CONTRIBUTING.md) — как внести вклад
- 📝 [Changelog](CHANGELOG.md) — история изменений

## Лицензия

MIT License - свободное использование, модификация и распространение.

См. [LICENSE](LICENSE) для подробностей.

## Авторы

**PavRedAlex**

Разработано для интеграции с AI-ассистентами через Model Context Protocol (MCP).

## Связанные проекты

- [onec-debug-adapter](https://github.com/akpaevj/onec-debug-adapter) — Debug Adapter Protocol для 1С
- [OneDebugger](https://github.com/otymko/OneDebugger) — Альтернативный отладчик на BSL
- [Model Context Protocol](https://modelcontextprotocol.io/) — Спецификация MCP
