---
inclusion: manual
---
# 1C Debug MCP — Отладка 1С через MCP сервер

## Назначение

Правила работы с MCP сервером для отладки 1С:Предприятие через HTTP Debug Protocol.

## Доступные инструменты

MCP сервер `1c-debug` предоставляет 13 инструментов для отладки:

### Управление сессией

- `mcp_1c_debug_attach` — подключение к серверу отладки
- `mcp_1c_debug_detach` — отключение от сервера

### Управление целями

- `mcp_1c_debug_get_targets` — список целей отладки (процессов 1С)

### Точки останова

- `mcp_1c_debug_set_breakpoints` — установка точек останова
- `mcp_1c_debug_clear_breakpoints` — удаление всех точек

### Выполнение

- `mcp_1c_debug_continue` — продолжить выполнение
- `mcp_1c_debug_step_in` — шаг с заходом в процедуры
- `mcp_1c_debug_step_out` — выход из процедуры
- `mcp_1c_debug_pause` — пауза на следующей строке (breakOnNextLine)

### Инспекция

- `mcp_1c_debug_wait_for_stop` — ожидание остановки
- `mcp_1c_debug_get_variables` — получение локальных переменных
- `mcp_1c_debug_evaluate` — вычисление BSL выражения

### Отладка протокола

- `mcp_1c_debug_raw_request` — отправка произвольного XML запроса

### Метаданные

- `mcp_1c_debug_reload_metadata` — перезагрузка метаданных из исходников без перезапуска сервера

## Правила работы

### 1. Всегда начинай с подключения

```typescript
await mcp_1c_debug_attach();
```

Если нужны специфичные параметры:

```typescript
await mcp_1c_debug_attach({
  url: "http://192.168.1.100:1550",  // Для удалённого сервера
  infobaseAlias: "production_base",   // Для серверной базы
  password: "debug-password"          // Если требуется
});
```

### 2. Установка точек останова

Для модулей конфигурации (работает):

```typescript
await mcp_1c_debug_set_breakpoints({
  moduleName: "ОбщегоНазначения",
  moduleType: "CommonModule",
  lines: [42, 100],
  objectID: "4eee25b1-2da6-459b-953b-4c8d519c9bce"  // Опционально, если отсутствует резолвится автоматически из метаданных
});
```

Типы модулей:

- `CommonModule` — общий модуль
- `ObjectModule` — модуль объекта (документа, справочника)
- `FormModule` — модуль формы
- `ManagerModule` — модуль менеджера
- `RecordSetModule` — модуль набора записей

⚠️ Для внешних обработок (EPF) точки НЕ работают! Используй `pause` вместо точек останова:

```typescript
const targets = await mcp_1c_debug_get_targets();
const client = targets.targets.find(t => t.targetType === "ManagedClient");
await mcp_1c_debug_pause({ targetId: client.targetID.id });
// Пользователь выполняет действие в обработке
const stop = await mcp_1c_debug_wait_for_stop();
await mcp_1c_debug_step_in({ targetId: stop.targetId });
```

### 3. Ожидание остановки

После установки точки или step команды всегда вызывай `wait_for_stop`:

```typescript
const stop = await mcp_1c_debug_wait_for_stop({ timeout: 30000 });
// stop.targetId, stop.moduleName, stop.lineNo, stop.callStack
```

### 4. Просмотр переменных

```typescript
const vars = await mcp_1c_debug_get_variables({ targetId: stop.targetId });
// vars.variables[].name, .typeName, .value, .expandable
```

### 5. Вычисление выражений

```typescript
const result = await mcp_1c_debug_evaluate({
  targetId: stop.targetId,
  expression: "ТекущаяДата()"
});
// result.result.typeName, result.result.value
```

### 6. Продолжение выполнения

```typescript
await mcp_1c_debug_continue({ targetId: stop.targetId });  // до следующей точки
await mcp_1c_debug_step_in({ targetId: stop.targetId });   // шаг с заходом
await mcp_1c_debug_step_out({ targetId: stop.targetId });  // выход из процедуры
```

### 7. Отключение

```typescript
await mcp_1c_debug_detach();
```

## Типичные сценарии

### Отладка общего модуля

```typescript
await mcp_1c_debug_attach();
await mcp_1c_debug_set_breakpoints({
  moduleName: "ОбщегоНазначения",
  moduleType: "CommonModule",
  lines: [42]
});
// Пользователь выполняет код в 1С
const stop = await mcp_1c_debug_wait_for_stop();
const vars = await mcp_1c_debug_get_variables({ targetId: stop.targetId });
await mcp_1c_debug_continue({ targetId: stop.targetId });
await mcp_1c_debug_detach();
```

### Отладка внешней обработки

```typescript
await mcp_1c_debug_attach();
const targets = await mcp_1c_debug_get_targets();
const client = targets.targets.find(t => t.targetType === "ManagedClient");
await mcp_1c_debug_pause({ targetId: client.targetID.id });
// Пользователь нажимает кнопку в обработке
const stop = await mcp_1c_debug_wait_for_stop();
await mcp_1c_debug_step_in({ targetId: stop.targetId });
const stop2 = await mcp_1c_debug_wait_for_stop();
const vars = await mcp_1c_debug_get_variables({ targetId: stop2.targetId });
await mcp_1c_debug_continue({ targetId: stop2.targetId });
```

### Отладка серверной процедуры

```typescript
await mcp_1c_debug_attach();
const targets = await mcp_1c_debug_get_targets();
const server = targets.targets.find(t => t.targetType === "ServerEmulation");
await mcp_1c_debug_set_breakpoints({
  moduleName: "МодульМенеджераДокумента",
  moduleType: "ManagerModule",
  lines: [25],
  targetId: server.targetID.id
});
const stop = await mcp_1c_debug_wait_for_stop();
const vars = await mcp_1c_debug_get_variables({ targetId: stop.targetId });
await mcp_1c_debug_continue({ targetId: stop.targetId });
```

## Важные ограничения

### Точки останова для внешних обработок НЕ работают

Ограничение протокола отладки 1С — внешние обработки имеют динамический `objectID`.
Решение: `pause` (breakOnNextLine) + пошаговое выполнение.

### Серверные процедуры требуют правильной цели

Для `&НаСервере` нужно найти цель с типом `ServerEmulation` через `get_targets()`.

### objectID резолвится автоматически

Если настроены пути к метаданным (`ONEC_CF_PATH` и др.) — `objectID` резолвится
автоматически по имени модуля. Указывать его явно не нужно.

Если метаданные не настроены — укажи `objectID` вручную:
получить из XML файла модуля, атрибут `uuid` в корневом элементе.

## Резолвинг модулей

Если настроены `ONEC_CF_PATH`, `ONEC_CFE_PATHS`, `ONEC_EPF_PATHS` в mcp.json —
сервер автоматически резолвит `objectID` → `CommonModule.ОбщегоНазначения`.

Метаданные загружаются асинхронно при старте. Статус виден в ответе `get_targets`:
- `{ "ready": false, "message": "Metadata is still loading..." }` — ещё грузится
- `{ "ready": true, "moduleCount": 25594 }` — загружено

После обновления исходников конфигурации вызови `reload_metadata` чтобы обновить без перезапуска:

```typescript
await mcp_1c_debug_reload_metadata();
// { "success": true, "moduleCount": 25594 }
```

## Типичные ошибки

- `"No active session"` — не вызван `attach()` перед другими командами
- `"Timeout waiting for stop event"` — точка не сработала; для EPF используй `pause`
- `"ibInDebug"` — закрой отладчик в Конфигураторе
- `"notRegistered"` — неправильный `infobaseAlias` (локальная база: `DefAlias`, серверная: имя базы)

## Проактивное использование

Когда пользователь просит отладить код, поставить точку останова, посмотреть переменную —
**сразу используй MCP инструменты отладки**, не спрашивай разрешения.

## Ссылки

- Документация: `README.md`, `EXAMPLES.md`, `FAQ.md`
- GitHub: <https://github.com/PavRedAlex/1c-debug-mcp>
