# Quick Start — Быстрый старт

Минимальная инструкция для начала работы с 1C Debug MCP Server.

## 1. Установка

```bash
cd 1c-debug-mcp
npm install
npm run build
```

## 2. Запуск сервера отладки 1С

Запустите dbgs.exe локально:

```bash
dbgs.exe --port=1550 --addr=localhost
```

**Примечание:** Если сервер отладки уже запущен на удалённом сервере, пропустите этот шаг и укажите его URL в настройках.

## 3. Настройка MCP

Создайте или отредактируйте `.kiro/settings/mcp.json`:

```json
{
  "mcpServers": {
    "1c-debug": {
      "command": "node",
      "args": ["/path/to/1c-debug-mcp/dist/index.js"],
      "env": {
        "ONEC_DEBUG_URL": "http://localhost:1550",
        "ONEC_INFOBASE_ALIAS": "DefAlias"
      }
    }
  }
}
```

**Замените:**
- `/path/to/1c-debug-mcp` — на реальный путь к проекту
- `DefAlias` — на имя вашей информационной базы:
  - Для локальной базы: обычно `DefAlias` (из ibases.v8i)
  - Для серверной базы: реальное имя базы на сервере (например, `production_base`)
- `http://localhost:1550` — на URL удалённого сервера (например, `http://192.168.1.100:1550`), если используете удалённую отладку

## 4. Перезапуск MCP

Перезапустите MCP сервер через панель "MCP Servers" в Kiro или перезапустите IDE.

## 5. Первая отладка

### Через AI-ассистента (Kiro/Claude)

Скажите AI:

```
Подключись к серверу отладки 1С и установи точку останова 
на строке 42 в общем модуле ОбщегоНазначения
```

AI выполнит:

```typescript
await mcp_1c_debug_attach();
await mcp_1c_debug_set_breakpoints({
  moduleName: "ОбщегоНазначения",
  moduleType: "CommonModule",
  lines: [42]
});
```

### Выполните код в 1С

Запустите код, который вызовет процедуру из модуля.

### Дождитесь остановки

AI автоматически дождётся остановки и покажет информацию:

```
Stopped at CommonModule.ОбщегоНазначения:42
Variables: Параметр1 = "Значение", Параметр2 = 123
```

## 6. Базовые команды

### Подключение

```typescript
await mcp_1c_debug_attach();
```

### Установка точки останова

```typescript
await mcp_1c_debug_set_breakpoints({
  moduleName: "ИмяМодуля",
  moduleType: "CommonModule",
  lines: [42, 100]
});
```

### Ожидание остановки

```typescript
const stop = await mcp_1c_debug_wait_for_stop({ timeout: 30000 });
```

### Просмотр переменных

```typescript
const vars = await mcp_1c_debug_get_variables({ 
  targetId: stop.targetId 
});
```

### Продолжение выполнения

```typescript
await mcp_1c_debug_continue({ targetId: stop.targetId });
```

### Отключение

```typescript
await mcp_1c_debug_detach();
```

## 7. Отладка внешней обработки

Для внешних обработок точки останова не работают. Используйте:

```typescript
// 1. Получить цели
const targets = await mcp_1c_debug_get_targets();
const client = targets.targets.find(t => t.targetType === "ManagedClient");

// 2. Установить паузу
await mcp_1c_debug_pause({ targetId: client.targetID.id });

// 3. Выполнить действие в обработке

// 4. Дождаться остановки
const stop = await mcp_1c_debug_wait_for_stop();

// 5. Пошаговое выполнение
await mcp_1c_debug_step_in({ targetId: stop.targetId });
```

## 8. Настройка отладки в своём проекте

Если вы хотите добавить отладку в существующий 1С проект, есть два способа.

### Способ 1 — Автоматически через Kiro Steering

В папке [`examples/kiro-steering/`](examples/kiro-steering/) лежат готовые steering файлы для Kiro:

- `1c-debug-setup.md` — помогает быстро настроить отладку в проекте: задаёт нужные вопросы и создаёт `mcp.json`
- `1c-debug-mcp.md` — правила работы с инструментами отладки для AI-ассистента

**Установка:**

```bash
# Глобально (для всех проектов)
copy examples\kiro-steering\1c-debug-setup.md %USERPROFILE%\.kiro\steering\
copy examples\kiro-steering\1c-debug-mcp.md %USERPROFILE%\.kiro\steering\

# Или только для текущего проекта
copy examples\kiro-steering\1c-debug-setup.md .kiro\steering\
copy examples\kiro-steering\1c-debug-mcp.md .kiro\steering\
```

После установки в чате Kiro напишите `#1c-debug-setup` и скажите:

```
Добавь отладку в этот проект
```

Kiro спросит параметры (сервер, база, пути к исходникам) и создаст `mcp.json` автоматически.

### Способ 2 — Вручную

Создайте `.kiro/settings/mcp.json` в корне вашего проекта:

```json
{
  "mcpServers": {
    "1c-debug": {
      "command": "node",
      "args": ["//C/path/to/1c-debug-mcp/dist/index.js"],
      "env": {
        "ONEC_DEBUG_URL": "http://localhost:1550",
        "ONEC_INFOBASE_ALIAS": "DefAlias",
        "ONEC_CF_PATH": "C:\\path\\to\\your\\src\\cf",
        "ONEC_CFE_PATHS": "C:\\path\\to\\your\\src\\cfe",
        "ONEC_EPF_PATHS": "C:\\path\\to\\your\\src\\epf"
      },
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

> Все пути должны быть **абсолютными** — `${workspaceFolder}` не работает в mcp.json.
> В `args` используйте формат `//C/...`, в `env` — обычный Windows формат `C:\\...`.

## 9. Полезные ссылки

- [README.md](README.md) — полная документация
- [EXAMPLES.md](EXAMPLES.md) — примеры использования
- [FAQ.md](FAQ.md) — часто задаваемые вопросы
- [examples/kiro-steering/](examples/kiro-steering/) — готовые steering файлы для Kiro

## Проблемы?

### Ошибка "ibInDebug"

Закройте отладчик в Конфигураторе.

### Ошибка "notRegistered"

Проверьте правильность `infobaseAlias` в mcp.json.

### Точка останова не срабатывает

1. Проверьте что код выполняется
2. Убедитесь что используете правильный `moduleName` и `moduleType`
3. Для внешних обработок используйте `pause` вместо точек останова

### Логи

Смотрите логи в `dist/1c-debug.log`:

```bash
tail -f 1c-debug-mcp/dist/1c-debug.log
```

## Готово!

Теперь вы можете отлаживать 1С приложения через AI-ассистента. 🎉

Для более сложных сценариев см. [EXAMPLES.md](EXAMPLES.md).
