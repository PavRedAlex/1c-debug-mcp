# Примеры использования 1C Debug MCP Server

## Базовая отладка общего модуля

```
// 1. Подключение
mcp_1c_debug_attach()

// 2. Установка точки (objectID резолвится автоматически из метаданных)
mcp_1c_debug_set_breakpoints(
  moduleName="ОбщегоНазначения",
  moduleType="CommonModule",
  lines=[42]
)

// 3. Выполнить код в 1С

// 4. Дождаться остановки
stop = mcp_1c_debug_wait_for_stop(timeout=30000)
// → { targetId, moduleName, lineNo, callStack }

// 5. Просмотр переменных
mcp_1c_debug_get_variables(targetId=stop.targetId)
// → { variables: [{ name, typeName, value }] }

// 6. Вычисление выражения
mcp_1c_debug_evaluate(targetId=stop.targetId, expression="ТекущаяДата()")
// → { result: { typeName: "Дата", value: "19.04.2026 16:00:00" } }

// 7. Стек вызовов
mcp_1c_debug_get_call_stack(targetId=stop.targetId)

// 8. Продолжить
mcp_1c_debug_continue(targetId=stop.targetId)

// 9. Отключение
mcp_1c_debug_detach()
```

## Отладка модуля объекта документа

```
mcp_1c_debug_attach()

// objectID резолвится автоматически по имени из метаданных
mcp_1c_debug_set_breakpoints(
  moduleName="_ДемоЗаказПокупателя",
  moduleType="ObjectModule",
  lines=[77]
)

// Записать документ в 1С

stop = mcp_1c_debug_wait_for_stop()
// → moduleName: "Document._ДемоЗаказПокупателя"

mcp_1c_debug_get_variables(targetId=stop.targetId)
// → [{ name: "Отказ", typeName: "Булево", value: "Ложь" }]

mcp_1c_debug_continue(targetId=stop.targetId)
```

## Отладка формы документа

```
mcp_1c_debug_attach()

// UUID формы из src/cf/Documents/_ДемоЗаказПокупателя/Forms/ФормаДокумента.xml
mcp_1c_debug_set_breakpoints(
  moduleName="_ДемоЗаказПокупателя",
  moduleType="FormModule",
  objectID="4dd0d3d6-6edd-4571-a181-6320b2cf459a",
  lines=[15]
)

// Открыть новый документ в 1С

stop = mcp_1c_debug_wait_for_stop()
// → moduleName: "Document._ДемоЗаказПокупателя/Form/ФормаДокумента"

mcp_1c_debug_continue(targetId=stop.targetId)
```

## Отладка расширения

```
mcp_1c_debug_attach()

// extensionName указывает что искать в расширении, не в основной конфигурации
mcp_1c_debug_set_breakpoints(
  moduleName="_ДемоЗаказПокупателя",
  moduleType="ObjectModule",
  extensionName="_ДемоПустоеРасширение",
  lines=[4]
)

// Записать документ в 1С

stop = mcp_1c_debug_wait_for_stop()
// → moduleName: "_ДемоПустоеРасширение:Document._ДемоЗаказПокупателя"

mcp_1c_debug_continue(targetId=stop.targetId)
```

## Пауза и пошаговое выполнение

```
mcp_1c_debug_attach()

// Установить паузу — остановится на следующей выполняемой строке любой цели
mcp_1c_debug_pause()

// Выполнить любое действие в 1С (нажать кнопку, открыть форму)

stop = mcp_1c_debug_wait_for_stop(timeout=30000)
// → остановился где-то в коде

// Шаг с заходом в процедуру
mcp_1c_debug_step_in(targetId=stop.targetId)
stop2 = mcp_1c_debug_wait_for_stop()

// Посмотреть переменные
mcp_1c_debug_get_variables(targetId=stop2.targetId)

// Выйти из процедуры
mcp_1c_debug_step_out(targetId=stop2.targetId)
stop3 = mcp_1c_debug_wait_for_stop()

// Продолжить
mcp_1c_debug_continue(targetId=stop3.targetId)
```

## Отладка серверной процедуры

```
mcp_1c_debug_attach()

// Точки работают для ServerEmulation и Server без дополнительных настроек
mcp_1c_debug_set_breakpoints(
  moduleName="_ДемоЗаказПокупателя",
  moduleType="ObjectModule",
  lines=[77]
)

// Записать документ — ПриЗаписи выполняется на сервере

stop = mcp_1c_debug_wait_for_stop()
// targetType цели будет "ServerEmulation"

mcp_1c_debug_evaluate(targetId=stop.targetId, expression="Ссылка")
// → { typeName: "ДокументСсылка._ДемоЗаказПокупателя", value: "..." }

mcp_1c_debug_continue(targetId=stop.targetId)
```

## Подключение к удалённому серверу

```json
// mcp.json
{
  "env": {
    "ONEC_DEBUG_URL": "http://192.168.1.100:1550",
    "ONEC_INFOBASE_ALIAS": "production_base",
    "ONEC_DEBUG_PASSWORD": "secret"
  }
}
```

Работа идентична локальной отладке.

## Восстановление после сбоя dbgs.exe

```
// Если dbgs.exe перезапустился — ping-цикл автоматически переподключится
// Если сессия зависла:

mcp_1c_debug_force_detach()  // принудительно очистить сессию
mcp_1c_debug_attach()        // подключиться заново
mcp_1c_debug_set_breakpoints(...)  // переустановить точки
```

## Диагностика протокола через raw_request

```
// Проверить что точки установлены
mcp_1c_debug_raw_request(
  cmd="getBreakpoints",
  xml='<?xml version="1.0" encoding="UTF-8"?>
<request xmlns="http://v8.1c.ru/8.3/debugger/debugRDBGRequestResponse">
  <infoBaseAlias>DefAlias</infoBaseAlias>
  <idOfDebuggerUI>SESSION-UUID</idOfDebuggerUI>
</request>'
)

// Проверить ping
mcp_1c_debug_raw_request(
  cmd="pingDebugUIParams",
  dbgui="SESSION-UUID",
  xml=" "
)
```

## Перезагрузка метаданных

После обновления исходников конфигурации:

```
mcp_1c_debug_reload_metadata()
// → { success: true, moduleCount: 1975 }
```

## Включение подробных логов

```json
// mcp.json
{
  "env": {
    "ONEC_LOG_LEVEL": "debug",
    "ONEC_LOG_FILE": "C:\\Logs\\1c-debug.log"
  }
}
```

Лог перезаписывается при каждом перезапуске MCP-сервера.
