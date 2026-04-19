---
inclusion: manual
---
# Настройка отладки 1С в проекте

Когда пользователь просит добавить отладку в проект — выполни шаги ниже.

## Шаг 1 — Определи путь к бинарнику

Проверь есть ли уже настроенный MCP сервер `1c-debug`:

1. Прочитай `~/.kiro/settings/mcp.json` (глобальный конфиг)
2. Прочитай `.kiro/settings/mcp.json` в текущем проекте (если существует)
3. Если секция `1c-debug` найдена — возьми `command` из неё (путь к бинарнику)
4. Если не найдена — спроси: "Укажи полный абсолютный путь к `1c-debug-mcp.exe`"

## Шаг 2 — Узнай параметры

Задай пользователю эти вопросы одним сообщением:

1. **Сервер отладки** — локальный (`localhost:1550`) или удалённый? Если удалённый — IP/хост и порт?
2. **Алиас базы** — для локальной обычно `DefAlias`, для серверной — имя базы. Какой у тебя?
3. **Исходники конфигурации** — есть ли выгруженная конфигурация? Если да — полный путь к папке `cf`.
4. **Расширения** — есть ли расширения? Если да — полные пути к папкам (через `;`).
5. **Внешние обработки** — есть ли EPF? Если да — полные пути к папкам (через `;`).
6. **Пароль** — требует ли сервер отладки пароль?

## Шаг 3 — Создай файл конфигурации

Создай `.kiro/settings/mcp.json` в корне проекта (или обнови если уже существует).

### Минимальный конфиг

```json
{
  "mcpServers": {
    "1c-debug": {
      "command": "C:\\path\\to\\1c-debug-mcp.exe",
      "env": {
        "ONEC_DEBUG_URL": "http://localhost:1550",
        "ONEC_INFOBASE_ALIAS": "DefAlias"
      },
      "type": "stdio",
      "disabled": false,
      "autoApprove": ["get_targets", "wait_for_stop", "get_variables", "evaluate", "get_call_stack"]
    }
  }
}
```

### Полный конфиг (с метаданными и логами)

```json
{
  "mcpServers": {
    "1c-debug": {
      "command": "C:\\path\\to\\1c-debug-mcp.exe",
      "env": {
        "ONEC_DEBUG_URL": "http://localhost:1550",
        "ONEC_INFOBASE_ALIAS": "DefAlias",
        "ONEC_CF_PATH": "C:\\full\\path\\to\\src\\cf",
        "ONEC_CFE_PATHS": "C:\\full\\path\\to\\src\\cfe",
        "ONEC_EPF_PATHS": "C:\\full\\path\\to\\src\\epf",
        "ONEC_LOG_LEVEL": "info",
        "ONEC_LOG_FILE": "C:\\Logs\\1c-debug.log"
      },
      "type": "stdio",
      "disabled": false,
      "autoApprove": ["get_targets", "wait_for_stop", "get_variables", "evaluate", "get_call_stack"]
    }
  }
}
```

### С паролем и удалённым сервером

```json
{
  "mcpServers": {
    "1c-debug": {
      "command": "C:\\path\\to\\1c-debug-mcp.exe",
      "env": {
        "ONEC_DEBUG_URL": "http://192.168.1.100:1550",
        "ONEC_INFOBASE_ALIAS": "production_base",
        "ONEC_DEBUG_PASSWORD": "secret",
        "ONEC_CF_PATH": "C:\\full\\path\\to\\src\\cf"
      },
      "type": "stdio",
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

## Параметры конфигурации

| Параметр | Описание | Обязательный |
|---|---|---|
| `ONEC_DEBUG_URL` | URL сервера отладки | Да |
| `ONEC_INFOBASE_ALIAS` | Алиас базы | Да |
| `ONEC_DEBUG_PASSWORD` | Пароль сервера отладки | Нет |
| `ONEC_CF_PATH` | Путь к конфигурации (для резолвинга имён модулей) | Нет |
| `ONEC_CFE_PATHS` | Пути к расширениям через `;` | Нет |
| `ONEC_EPF_PATHS` | Пути к внешним обработкам через `;` | Нет |
| `ONEC_LOG_LEVEL` | Уровень логов: `error`/`info`/`debug` | Нет |
| `ONEC_LOG_FILE` | Путь к файлу логов (перезапись при старте) | Нет |

## Шаг 4 — Сообщи пользователю

После создания файла скажи:

1. Перезапусти MCP сервер через панель "MCP Servers" в Kiro
2. Проверь подключение: `mcp_1c_debug_attach()`
3. Для работы с отладкой используй steering `#1c-debug-mcp`

## Важные замечания

- Если `.kiro/settings/mcp.json` уже существует — **не перезаписывай**, только добавь секцию `1c-debug`
- Все пути должны быть **абсолютными** — `${workspaceFolder}` не работает в mcp.json
- Разделитель для `ONEC_CFE_PATHS` и `ONEC_EPF_PATHS` — точка с запятой `;`
- Без `ONEC_CF_PATH` отладка работает, но в стеке будут GUID вместо имён модулей
