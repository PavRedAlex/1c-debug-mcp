---
inclusion: manual
---
# 1C Debug MCP — Отладка 1С через MCP сервер

## Назначение

Правила работы с MCP сервером для отладки 1С:Предприятие через HTTP Debug Protocol.
Реализован на Go — единый бинарник без зависимостей.

## Доступные инструменты

MCP сервер `1c-debug` предоставляет 15 инструментов:

### Управление сессией

- `mcp_1c_debug_attach` — подключение к серверу отладки
- `mcp_1c_debug_detach` — отключение от сервера
- `mcp_1c_debug_force_detach` — принудительное отключение (при зависшей сессии / ibInDebug)

### Управление целями

- `mcp_1c_debug_get_targets` — список целей отладки (процессов 1С) + статус метаданных

### Точки останова

- `mcp_1c_debug_set_breakpoints` — установка точек останова
- `mcp_1c_debug_clear_breakpoints` — удаление всех точек

### Выполнение

- `mcp_1c_debug_continue` — продолжить выполнение
- `mcp_1c_debug_step_in` — шаг с заходом в процедуры
- `mcp_1c_debug_step_out` — выход из процедуры
- `mcp_1c_debug_pause` — пауза на следующей строке (глобальная, без targetId)

### Инспекция

- `mcp_1c_debug_wait_for_stop` — ожидание остановки
- `mcp_1c_debug_get_call_stack` — стек вызовов (из последнего события)
- `mcp_1c_debug_get_variables` — получение локальных переменных
- `mcp_1c_debug_evaluate` — вычисление BSL выражения

### Служебные

- `mcp_1c_debug_raw_request` — отправка произвольного XML запроса
- `mcp_1c_debug_reload_metadata` — перезагрузка метаданных без перезапуска сервера

## Правила работы

### 1. Всегда начинай с подключения

```
mcp_1c_debug_attach()
```

Если нужны специфичные параметры:

```
mcp_1c_debug_attach(
  url="http://192.168.1.100:1550",
  infobaseAlias="production_base",
  password="debug-password"
)
```

### 2. Установка точек останова

Для основной конфигурации (objectID резолвится автоматически):

```
mcp_1c_debug_set_breakpoints(
  moduleName="ОбщегоНазначения",
  moduleType="CommonModule",
  lines=[42]
)
```

Для расширения (обязательно указывай extensionName):

```
mcp_1c_debug_set_breakpoints(
  moduleName="_ДемоЗаказПокупателя",
  moduleType="ObjectModule",
  extensionName="_МоёРасширение",
  lines=[10]
)
```

Типы модулей:

- `CommonModule` — общий модуль
- `ObjectModule` — модуль объекта (документа, справочника)
- `FormModule` — модуль формы (нужен objectID из XML формы)
- `ManagerModule` — модуль менеджера
- `RecordSetModule` — модуль набора записей

### 3. Пауза

`pause` останавливает на следующей выполняемой строке **любой** цели — не нужен targetId:

```
mcp_1c_debug_pause()
// выполни действие в 1С
stop = mcp_1c_debug_wait_for_stop()
```

После остановки `breakOnNextLine` сбрасывается автоматически.

### 4. Ожидание остановки

После установки точки или step команды вызывай `wait_for_stop`:

```
stop = mcp_1c_debug_wait_for_stop(timeout=30000)
// stop.targetId, stop.moduleName, stop.lineNo, stop.callStack
```

### 5. Стек вызовов

```
mcp_1c_debug_get_call_stack(targetId=stop.targetId)
// Возвращает последний стек — не потребляет очередь событий
```

### 6. Просмотр переменных

```
mcp_1c_debug_get_variables(targetId=stop.targetId)
// → { variables: [{ name, typeName, value }] }
```

### 7. Вычисление выражений

```
mcp_1c_debug_evaluate(targetId=stop.targetId, expression="ТекущаяДата()")
// → { result: { typeName, value } }
```

### 8. Продолжение выполнения

```
mcp_1c_debug_continue(targetId=stop.targetId)   // до следующей точки
mcp_1c_debug_step_in(targetId=stop.targetId)    // шаг с заходом
mcp_1c_debug_step_out(targetId=stop.targetId)   // выход из процедуры
```

### 9. Отключение

```
mcp_1c_debug_detach()
```

При зависшей сессии:

```
mcp_1c_debug_force_detach()
mcp_1c_debug_attach()
```

## Типичные сценарии

### Отладка общего модуля

```
mcp_1c_debug_attach()
mcp_1c_debug_set_breakpoints(moduleName="ОбщегоНазначения", moduleType="CommonModule", lines=[42])
// выполнить код в 1С
stop = mcp_1c_debug_wait_for_stop()
mcp_1c_debug_get_variables(targetId=stop.targetId)
mcp_1c_debug_continue(targetId=stop.targetId)
mcp_1c_debug_detach()
```

### Отладка расширения

```
mcp_1c_debug_attach()
mcp_1c_debug_set_breakpoints(
  moduleName="_ДемоЗаказПокупателя",
  moduleType="ObjectModule",
  extensionName="_МоёРасширение",
  lines=[4]
)
// записать документ
stop = mcp_1c_debug_wait_for_stop()
// → moduleName: "_МоёРасширение:Document._ДемоЗаказПокупателя"
mcp_1c_debug_continue(targetId=stop.targetId)
```

### Отладка внешней обработки (EPF)

Точки для EPF не работают — используй pause:

```
mcp_1c_debug_attach()
mcp_1c_debug_pause()
// выполнить действие в обработке
stop = mcp_1c_debug_wait_for_stop()
mcp_1c_debug_step_in(targetId=stop.targetId)
stop2 = mcp_1c_debug_wait_for_stop()
mcp_1c_debug_get_variables(targetId=stop2.targetId)
mcp_1c_debug_continue(targetId=stop2.targetId)
```

## Важные ограничения

### Точки останова для внешних обработок НЕ работают

Ограничение протокола 1С. Решение: `pause` + пошаговое выполнение.

### extensionName обязателен для расширений

Без `extensionName` авторезолв ищет только в основной конфигурации. Для расширений всегда указывай `extensionName`.

### Серверные процедуры

Для `&НаСервере` точки работают автоматически — сервер подключается как `ServerEmulation` или `Server`.

Типы целей отладки:

| Тип | Описание |
|---|---|
| `ManagedClient` | Тонкий клиент (`&НаКлиенте`) |
| `Server` | Серверный контекст, серверная база |
| `ServerEmulation` | Серверный контекст, файловая база |
| `BackgroundJob` | Фоновые задания |
| `WebClient` | Веб-клиент |

## Резолвинг модулей

Если настроены `ONEC_CF_PATH`, `ONEC_CFE_PATHS`, `ONEC_EPF_PATHS` — сервер автоматически резолвит `objectID`.

Статус в `get_targets`:
- `{ "ready": false }` — ещё загружается
- `{ "ready": true, "moduleCount": 1975 }` — готово

После обновления исходников:

```
mcp_1c_debug_reload_metadata()
```

## Типичные ошибки

- `"No active debug session"` — не вызван `attach`
- `"Timeout waiting for stop event"` — точка не сработала или код не выполнялся
- `"ibInDebug"` — вызови `force_detach`, затем `attach`; или перезапусти dbgs.exe
- `"notRegistered"` — неправильный `infobaseAlias`
- `"Debug session is reconnecting"` — подожди несколько секунд, ping переподключается

## Проактивное использование

Когда пользователь просит отладить код, поставить точку останова, посмотреть переменную —
**сразу используй MCP инструменты отладки**, не спрашивай разрешения.

При установке точки останова — **всегда читай файл** чтобы найти первую непустую строку внутри процедуры.

## Ссылки

- Документация: `README.md`, `EXAMPLES.md`, `FAQ.md`, `ARCHITECTURE.md`
- GitHub: <https://github.com/PavRedAlex/1c-debug-mcp>
