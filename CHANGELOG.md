# Changelog

## [2.0.0] - 2026-04-19

### Breaking Changes

- Переписан с TypeScript/Node.js на Go
- Бинарник `1c-debug-mcp.exe` — больше не нужен Node.js
- В mcp.json: `"command": "1c-debug-mcp.exe"` вместо `"command": "node"` + `"args"`

### Added

- Go-бинарник без внешних зависимостей (Node.js не нужен)
- Инструмент `get_call_stack` — стек вызовов из последнего события остановки
- Инструмент `force_detach` — принудительная остановка ping-цикла и очистка сессии
- Параметр `extensionName` в `set_breakpoints` — явное указание расширения для авторезолва
- Логирование с уровнями: `ONEC_LOG_LEVEL` (error/info/debug)
- Запись логов в файл: `ONEC_LOG_FILE` (перезапись при старте)
- Автоматический сброс `breakOnNextLine` после остановки
- Переподключение ping-цикла при HTTP 400 с восстановлением точек останова

### Fixed

- `ping` — убрано XML-тело, добавлен `&dbgui=<id>` в URL (критическое исправление)
- `step` — правильные значения enum: `Continue`, `StepIn`, `StepOut`
- `setAutoAttachSettings` — правильный namespace `debugAutoAttach` и `xsi:type`
- `pause` — реализован через `initSettings(breakOnNextLine=true)` вместо `attachDetachTargets`
- `get_variables` — правильный парсинг `localVariableName` и `valueOfContextPropInfo`
- `setBreakpoints` — правильная структура XML без лишнего `xsi:type` на `<id>`
- `ResolveObjectID` — не путает модули основной конфигурации и расширений

### Changed

- `pause` не требует `targetId` — глобальная пауза через `initSettings`
- `setAutoAttach` использует правильные типы: `ManagedClient`, `JOB` вместо `BackgroundJob`

---

## [1.0.0] - 2026-04-16

### Added

- Полная реализация MCP сервера на TypeScript/Node.js
- Подключение к серверу отладки (dbgs.exe) через HTTP Debug Protocol
- Установка и удаление точек останова
- Пошаговое выполнение (step-in, step-out, continue, pause)
- Просмотр локальных переменных
- Вычисление BSL выражений в контексте остановки
- Получение стека вызовов
- Автоматический резолвинг objectID → имя модуля через метаданные
- Поддержка конфигураций, расширений и внешних обработок
- Автоматический ping loop для получения событий отладки
- Логирование всех операций в файл
