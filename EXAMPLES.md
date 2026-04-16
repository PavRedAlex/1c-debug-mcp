# Примеры использования 1C Debug MCP Server

## Базовая отладка общего модуля

```typescript
// 1. Подключение к серверу отладки
await mcp_1c_debug_attach({
  url: "http://localhost:1550",
  infobaseAlias: "DefAlias",
  autoAttach: true
});

// 2. Установка точки останова
await mcp_1c_debug_set_breakpoints({
  moduleName: "ОбщегоНазначения",
  moduleType: "CommonModule",
  lines: [42, 100],
  objectID: "4eee25b1-2da6-459b-953b-4c8d519c9bce"
});

// 3. Выполнить код в 1С, который вызовет процедуру из модуля

// 4. Дождаться остановки на точке
const stopEvent = await mcp_1c_debug_wait_for_stop({ timeout: 30000 });
console.log(`Stopped at ${stopEvent.moduleName}:${stopEvent.lineNo}`);

// 5. Просмотр локальных переменных
const vars = await mcp_1c_debug_get_variables({ 
  targetId: stopEvent.targetId 
});
console.log("Variables:", vars.variables);

// 6. Вычисление выражения
const result = await mcp_1c_debug_evaluate({
  targetId: stopEvent.targetId,
  expression: "ТекущаяДата()"
});
console.log("Current date:", result.result.value);

// 7. Продолжить выполнение
await mcp_1c_debug_continue({ targetId: stopEvent.targetId });

// 8. Отключение
await mcp_1c_debug_detach();
```

## Отладка внешней обработки (EPF)

Точки останова для внешних обработок не работают. Используйте breakOnNextLine:

```typescript
// 1. Подключение
await mcp_1c_debug_attach();

// 2. Получить список целей отладки
const targets = await mcp_1c_debug_get_targets();
const clientTarget = targets.targets.find(t => t.targetType === "ManagedClient");

// 3. Установить паузу на следующей строке
await mcp_1c_debug_pause({ targetId: clientTarget.targetID.id });

// 4. Выполнить действие в обработке (например, нажать кнопку)
// Пользователь выполняет действие в UI

// 5. Дождаться остановки
const stop = await mcp_1c_debug_wait_for_stop({ timeout: 30000 });
console.log(`Stopped at ${stop.moduleName}:${stop.lineNo}`);
console.log("Call stack:", stop.callStack);

// 6. Пошаговое выполнение
await mcp_1c_debug_step_in({ targetId: stop.targetId });

// Дождаться следующей остановки
const stop2 = await mcp_1c_debug_wait_for_stop({ timeout: 5000 });
console.log(`Now at ${stop2.moduleName}:${stop2.lineNo}`);

// 7. Выход из процедуры
await mcp_1c_debug_step_out({ targetId: stop2.targetId });

// 8. Продолжить выполнение
await mcp_1c_debug_continue({ targetId: stop2.targetId });
```

## Отладка серверной процедуры

```typescript
// 1. Подключение
await mcp_1c_debug_attach();

// 2. Получить цели отладки
const targets = await mcp_1c_debug_get_targets();
console.log("Available targets:", targets.targets.map(t => ({
  id: t.targetID.id,
  type: t.targetType,
  suspended: t.suspended
})));

// 3. Найти серверную цель
const serverTarget = targets.targets.find(t => t.targetType === "ServerEmulation");

// 4. Установить точку в серверной процедуре
await mcp_1c_debug_set_breakpoints({
  moduleName: "МодульМенеджераДокумента",
  moduleType: "ManagerModule",
  lines: [25],
  objectID: "document-manager-object-id",
  targetId: serverTarget.targetID.id
});

// 5. Выполнить серверный код в 1С

// 6. Дождаться остановки
const stop = await mcp_1c_debug_wait_for_stop({ timeout: 30000 });

// 7. Просмотр переменных
const vars = await mcp_1c_debug_get_variables({ targetId: stop.targetId });

// 8. Продолжить
await mcp_1c_debug_continue({ targetId: stop.targetId });
```

## Отладка расширения

```typescript
// Убедитесь что ONEC_CFE_PATHS настроен в mcp.json

// 1. Подключение
await mcp_1c_debug_attach();

// 2. Установить точку в модуле расширения
await mcp_1c_debug_set_breakpoints({
  moduleName: "МодульРасширения",
  moduleType: "CommonModule",
  lines: [10, 20],
  objectID: "extension-module-object-id"
});

// 3. Выполнить код расширения в 1С

// 4. Дождаться остановки
const stop = await mcp_1c_debug_wait_for_stop();
console.log(`Stopped in extension: ${stop.moduleName}:${stop.lineNo}`);

// 5. Отладка
const vars = await mcp_1c_debug_get_variables({ targetId: stop.targetId });
await mcp_1c_debug_continue({ targetId: stop.targetId });
```

## Подключение к удалённому серверу

Для подключения к удалённому серверу отладки укажите его URL в настройках или при вызове `attach`:

```typescript
// Подключение к удалённому серверу
await mcp_1c_debug_attach({
  url: "http://192.168.1.100:1550",
  infobaseAlias: "DefAlias",
  password: "debug-password",  // Если требуется
  autoAttach: true
});

// Дальнейшая работа идентична локальной отладке
await mcp_1c_debug_set_breakpoints({
  moduleName: "ОбщегоНазначения",
  moduleType: "CommonModule",
  lines: [42]
});

const stop = await mcp_1c_debug_wait_for_stop();
const vars = await mcp_1c_debug_get_variables({ targetId: stop.targetId });
await mcp_1c_debug_continue({ targetId: stop.targetId });
```

## Условная отладка с вычислением выражений

```typescript
// 1. Подключение и установка точки
await mcp_1c_debug_attach();
await mcp_1c_debug_set_breakpoints({
  moduleName: "ОбщегоНазначения",
  moduleType: "CommonModule",
  lines: [42]
});

// 2. Дождаться остановки
const stop = await mcp_1c_debug_wait_for_stop();

// 3. Проверить условие через evaluate
const condition = await mcp_1c_debug_evaluate({
  targetId: stop.targetId,
  expression: "Параметр1 = \"НужноеЗначение\""
});

if (condition.result.value === "Истина") {
  // Условие выполнено — продолжаем отладку
  const vars = await mcp_1c_debug_get_variables({ targetId: stop.targetId });
  console.log("Variables:", vars);
  
  // Вычислить сложное выражение
  const result = await mcp_1c_debug_evaluate({
    targetId: stop.targetId,
    expression: "СтрДлина(Параметр1) + СтрДлина(Параметр2)"
  });
  console.log("Total length:", result.result.value);
} else {
  // Условие не выполнено — продолжаем выполнение
  await mcp_1c_debug_continue({ targetId: stop.targetId });
}
```

## Множественные точки останова

```typescript
// 1. Подключение
await mcp_1c_debug_attach();

// 2. Установить точки в нескольких модулях
await mcp_1c_debug_set_breakpoints({
  moduleName: "ОбщегоНазначения",
  moduleType: "CommonModule",
  lines: [42, 100, 150]
});

await mcp_1c_debug_set_breakpoints({
  moduleName: "РаботаСФайлами",
  moduleType: "CommonModule",
  lines: [25, 50]
});

// 3. Выполнить код в 1С

// 4. Обработка остановок в цикле
for (let i = 0; i < 5; i++) {
  const stop = await mcp_1c_debug_wait_for_stop({ timeout: 60000 });
  console.log(`Stop ${i + 1}: ${stop.moduleName}:${stop.lineNo}`);
  
  // Просмотр переменных на каждой остановке
  const vars = await mcp_1c_debug_get_variables({ targetId: stop.targetId });
  console.log(`Variables at stop ${i + 1}:`, vars.variables.length);
  
  // Продолжить выполнение
  await mcp_1c_debug_continue({ targetId: stop.targetId });
}

// 5. Очистить все точки
await mcp_1c_debug_clear_breakpoints();
```

## Отладка с использованием raw_request

Для отладки протокола или нестандартных операций:

```typescript
// Отправка произвольного XML запроса
const response = await mcp_1c_debug_raw_request({
  cmd: "getCallStack",
  dbgui: "your-debug-ui-id",
  xml: `<?xml version="1.0" encoding="UTF-8"?>
<request xmlns="http://v8.1c.ru/8.3/debugger/debugRDBGRequestResponse">
  <infoBaseAlias>DefAlias</infoBaseAlias>
  <idOfDebuggerUI>your-debug-ui-id</idOfDebuggerUI>
  <id>
    <id>target-id</id>
  </id>
</request>`
});

console.log("Response status:", response.status);
console.log("Response body:", response.body);
```

## Обработка ошибок

```typescript
try {
  await mcp_1c_debug_attach({
    url: "http://localhost:1550",
    infobaseAlias: "DefAlias"
  });
} catch (error) {
  if (error.message.includes("ibInDebug")) {
    console.error("Another debugger is connected. Close Configurator debugger.");
  } else if (error.message.includes("notRegistered")) {
    console.error("Invalid infobase alias or credentials.");
  } else {
    console.error("Connection failed:", error.message);
  }
  process.exit(1);
}

try {
  const stop = await mcp_1c_debug_wait_for_stop({ timeout: 30000 });
  // ... отладка
} catch (error) {
  if (error.name === "TimeoutError") {
    console.error("Timeout waiting for stop event");
  } else {
    console.error("Wait failed:", error.message);
  }
}
```

## Автоматизация отладки

```typescript
async function debugWorkflow() {
  // 1. Подключение
  await mcp_1c_debug_attach();
  
  // 2. Установка точек
  await mcp_1c_debug_set_breakpoints({
    moduleName: "ОбщегоНазначения",
    moduleType: "CommonModule",
    lines: [42]
  });
  
  // 3. Ожидание остановки
  const stop = await mcp_1c_debug_wait_for_stop({ timeout: 60000 });
  
  // 4. Автоматический сбор информации
  const vars = await mcp_1c_debug_get_variables({ targetId: stop.targetId });
  const stackDepth = stop.callStack.length;
  
  // 5. Логирование
  console.log("=== Debug Info ===");
  console.log(`Module: ${stop.moduleName}`);
  console.log(`Line: ${stop.lineNo}`);
  console.log(`Stack depth: ${stackDepth}`);
  console.log(`Variables count: ${vars.variables.length}`);
  
  // 6. Вычисление ключевых выражений
  const expressions = [
    "ТекущаяДата()",
    "ПараметрыСеанса.ТекущийПользователь",
    "ТипЗнч(Параметр1)"
  ];
  
  for (const expr of expressions) {
    try {
      const result = await mcp_1c_debug_evaluate({
        targetId: stop.targetId,
        expression: expr
      });
      console.log(`${expr} = ${result.result.value}`);
    } catch (error) {
      console.log(`${expr} = ERROR: ${error.message}`);
    }
  }
  
  // 7. Продолжение
  await mcp_1c_debug_continue({ targetId: stop.targetId });
  
  // 8. Отключение
  await mcp_1c_debug_detach();
}

// Запуск
debugWorkflow().catch(console.error);
```
