# Quick Start — Быстрый старт

Минимальная инструкция для начала работы с 1C Debug MCP Server (Go).

## 1. Получить бинарник

Скачай готовый бинарник из релизов или собери из исходников:

```bash
cd 1c-debug-mcp/go
go build -o dist/1c-debug-mcp.exe ./cmd/1c-debug-mcp/
```

Node.js не нужен — это самодостаточный Go-бинарник.

## 2. Запуск сервера отладки 1С

### Файловая или локальная база

**Шаг 1.** Закройте клиент 1С и Конфигуратор, если были открыты.

**Шаг 2.** Запустите сервер отладки. `dbgs.exe` находится в папке `bin` клиента 1С:

```bash
"C:\Program Files\1cv8\<версия>\bin\dbgs.exe" --addr=localhost --port=1550
```

Окно терминала с dbgs.exe должно остаться открытым.

**Шаг 3.** Настройте клиент 1С для работы с HTTP-отладкой. В меню клиента:

`Настройки → Параметры`

Установите:
- **Отладка при перезапуске** → `Разрешена (протокол HTTP)`
- **Сервер отладки при перезапуске** → `http://localhost:1561`

> Адрес сервера отладки клиента можно посмотреть в Конфигураторе: `Отладка → Подключение → Настройка`.

Нажмите **Применить** и закройте клиент.

**Шаг 4.** В настройках MCP укажите URL сервера отладки (dbgs.exe, не клиента):

```json
"ONEC_DEBUG_URL": "http://localhost:1550"
```

**Шаг 5.** Порядок запуска — важен:
1. Сначала запустите `dbgs.exe`
2. Затем запустите клиент 1С

Если всё настроено корректно — MCP подключится без ошибок при вызове `attach`.

### Серверная база

Запустите dbgs.exe на сервере 1С и укажите его адрес в `ONEC_DEBUG_URL`.

## 3. Настройка MCP

Создайте или отредактируйте `.kiro/settings/mcp.json`:

```json
{
  "mcpServers": {
    "1c-debug": {
      "command": "C:\\path\\to\\1c-debug-mcp\\go\\dist\\1c-debug-mcp.exe",
      "env": {
        "ONEC_DEBUG_URL": "http://localhost:1550",
        "ONEC_INFOBASE_ALIAS": "DefAlias",
        "ONEC_CF_PATH": "C:\\path\\to\\src\\cf",
        "ONEC_LOG_LEVEL": "info",
        "ONEC_LOG_FILE": "C:\\Logs\\1c-debug.log"
      },
      "type": "stdio",
      "disabled": false,
      "autoApprove": ["get_targets", "wait_for_stop", "get_variables", "evaluate"]
    }
  }
}
```

**Замените:**
- Путь к бинарнику — на реальный путь к `1c-debug-mcp.exe`
- `DefAlias` — на имя вашей информационной базы
- `ONEC_CF_PATH` — на путь к выгруженной конфигурации (опционально, для резолвинга имён модулей)

## 4. Перезапуск MCP

Перезапустите MCP сервер через панель "MCP Servers" в Kiro или перезапустите IDE.

## 5. Первая отладка

### Подключение и точка останова

```
Подключись к серверу отладки 1С и установи точку останова 
на строке 42 в общем модуле ОбщегоНазначения
```

AI выполнит:

```
mcp_1c_debug_attach()
mcp_1c_debug_set_breakpoints(moduleName="ОбщегоНазначения", moduleType="CommonModule", lines=[42])
```

### Выполните код в 1С

Запустите код, который вызовет процедуру из модуля.

### Дождитесь остановки

```
mcp_1c_debug_wait_for_stop()
→ Stopped at CommonModule.ОбщегоНазначения:42
mcp_1c_debug_get_variables(targetId="...")
→ Variables: Параметр1 = "Значение"
```

## 6. Базовые команды

### Подключение

```
mcp_1c_debug_attach()
```

### Установка точки останова (авторезолв objectID из метаданных)

```
mcp_1c_debug_set_breakpoints(moduleName="ИмяМодуля", moduleType="CommonModule", lines=[42])
```

### Точка в расширении

```
mcp_1c_debug_set_breakpoints(
  moduleName="МодульРасширения",
  moduleType="ObjectModule",
  extensionName="МоёРасширение",
  lines=[10]
)
```

### Пауза (остановка на следующей выполняемой строке)

```
mcp_1c_debug_pause()
```

### Ожидание остановки

```
mcp_1c_debug_wait_for_stop(timeout=30000)
```

### Стек вызовов

```
mcp_1c_debug_get_call_stack(targetId="...")
```

### Просмотр переменных

```
mcp_1c_debug_get_variables(targetId="...")
```

### Продолжение выполнения

```
mcp_1c_debug_continue(targetId="...")
```

### Отключение

```
mcp_1c_debug_detach()
```

### Принудительное отключение (при зависшей сессии)

```
mcp_1c_debug_force_detach()
```

## 7. Переменные окружения

| Переменная | Описание | Обязательная |
|---|---|---|
| `ONEC_DEBUG_URL` | URL сервера отладки | Да |
| `ONEC_INFOBASE_ALIAS` | Алиас базы | Да |
| `ONEC_DEBUG_PASSWORD` | Пароль сервера отладки | Нет |
| `ONEC_CF_PATH` | Путь к конфигурации (для резолвинга) | Нет |
| `ONEC_CFE_PATHS` | Пути к расширениям (через `;`) | Нет |
| `ONEC_EPF_PATHS` | Пути к внешним обработкам (через `;`) | Нет |
| `ONEC_LOG_LEVEL` | Уровень логов: `error`/`info`/`debug` | Нет |
| `ONEC_LOG_FILE` | Путь к файлу логов (перезапись при старте) | Нет |

## 8. Проблемы?

### Ошибка "ibInDebug"

Закройте отладчик в Конфигураторе. Или вызовите `force_detach` и `attach` заново.

### Ошибка "notRegistered"

Проверьте правильность `ONEC_INFOBASE_ALIAS`.

### Точка останова не срабатывает

1. Убедитесь что код выполняется
2. Проверьте `moduleName` и `moduleType`
3. Для расширений укажите `extensionName`
4. Проверьте что метаданные загружены (`get_targets` → `metadata.ready: true`)

### Логи

```
ONEC_LOG_LEVEL=debug
ONEC_LOG_FILE=C:\Logs\1c-debug.log
```

## Готово!

Для более сложных сценариев см. [EXAMPLES.md](EXAMPLES.md) и [README.md](README.md).
