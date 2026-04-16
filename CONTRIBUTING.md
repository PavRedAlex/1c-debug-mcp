# Contributing to 1C Debug MCP Server

Спасибо за интерес к проекту! Мы приветствуем любой вклад.

## Как внести вклад

### Сообщение об ошибках

Если вы нашли ошибку:

1. Проверьте, нет ли уже открытого issue с этой проблемой
2. Создайте новый issue с подробным описанием:
   - Версия 1С:Предприятие
   - Версия Node.js
   - Шаги для воспроизведения
   - Ожидаемое и фактическое поведение
   - Логи из `dist/1c-debug.log`

### Предложение новых возможностей

1. Создайте issue с описанием предлагаемой функциональности
2. Объясните, зачем это нужно и как это должно работать
3. Дождитесь обсуждения перед началом разработки

### Pull Requests

1. Форкните репозиторий
2. Создайте ветку для вашей функции: `git checkout -b feature/my-feature`
3. Внесите изменения
4. Добавьте тесты для новой функциональности
5. Убедитесь что все тесты проходят: `npm test`
6. Закоммитьте изменения: `git commit -m "Add my feature"`
7. Запушьте ветку: `git push origin feature/my-feature`
8. Создайте Pull Request

## Стандарты кода

### TypeScript

- Используйте строгую типизацию
- Избегайте `any` — используйте `unknown` или конкретные типы
- Документируйте публичные API через JSDoc комментарии

### Именование

- Файлы: `camelCase.ts`
- Классы: `PascalCase`
- Функции и переменные: `camelCase`
- Константы: `UPPER_SNAKE_CASE`
- Интерфейсы: `PascalCase` (без префикса `I`)

### Структура кода

```typescript
// 1. Импорты
import { Something } from "./module.js";

// 2. Типы и интерфейсы
interface MyInterface {
  field: string;
}

// 3. Константы
const DEFAULT_TIMEOUT = 30000;

// 4. Функции
export function myFunction(arg: string): MyInterface {
  // Реализация
}
```

### Комментарии

- Пишите комментарии на английском или русском (в зависимости от контекста)
- Документируйте сложную логику
- Используйте JSDoc для публичных API

```typescript
/**
 * Подключение к серверу отладки 1С
 * @param session - Сессия отладки
 * @returns Promise, который резолвится при успешном подключении
 * @throws {Error} Если подключение не удалось
 */
export async function attach(session: Session): Promise<void> {
  // ...
}
```

## Тестирование

### Запуск тестов

```bash
npm test              # Все тесты
npm run test:watch    # Watch режим
```

### Написание тестов

Используем Vitest. Тесты должны быть в папке `tests/` с суффиксом `.test.ts`.

```typescript
import { describe, it, expect } from "vitest";
import { myFunction } from "../src/myModule.js";

describe("myFunction", () => {
  it("should return expected result", () => {
    const result = myFunction("input");
    expect(result).toBe("expected");
  });

  it("should throw on invalid input", () => {
    expect(() => myFunction("")).toThrow();
  });
});
```

### Property-based тестирование

Для сложной логики используйте fast-check:

```typescript
import { fc, test } from "fast-check";

test("property: function should always return positive", () => {
  fc.assert(
    fc.property(fc.integer(), (n) => {
      const result = Math.abs(n);
      return result >= 0;
    })
  );
});
```

## Документация

### README

При добавлении нового инструмента обновите:

1. Раздел "Доступные инструменты" в README.md
2. Добавьте пример использования в EXAMPLES.md
3. Добавьте FAQ если нужно

### Комментарии в коде

- Документируйте сложные алгоритмы
- Объясняйте "почему", а не "что"
- Ссылайтесь на внешние ресурсы (спецификации, документацию)

## Процесс разработки

### Локальная разработка

1. Клонируйте репозиторий
2. Установите зависимости: `npm install`
3. Запустите сборку в watch режиме: `npm run dev`
4. В другом терминале запустите тесты: `npm run test:watch`

### Отладка MCP сервера

1. Добавьте `console.error()` или `process.stderr.write()` для логирования
2. Логи пишутся в `dist/1c-debug.log`
3. Просмотр логов: `tail -f dist/1c-debug.log`

### Тестирование с реальным сервером отладки

1. Запустите dbgs.exe: `dbgs.exe --port=1550 --addr=localhost`
2. Настройте mcp.json с правильными параметрами
3. Запустите MCP сервер через Kiro или Claude Desktop
4. Используйте инструменты через AI-ассистента

## Архитектура

### Основные компоненты

- **DebugClient** — HTTP клиент для протокола отладки
- **SessionManager** — управление сессией отладки
- **PingLoop** — цикл опроса событий
- **EventQueue** — очередь событий отладки
- **MetadataProvider** — резолвинг objectID → имя модуля
- **Tools** — реализация MCP инструментов

### Поток данных

```
AI Assistant
    ↓
MCP Server (index.ts)
    ↓
Tool Handler (tools/*.ts)
    ↓
DebugClient
    ↓
HTTP Debug Protocol (dbgs.exe)
    ↓
1C:Enterprise
```

### Добавление нового инструмента

1. Создайте файл `src/tools/myTool.ts`:

```typescript
import type { DebugClient } from "../debugClient.js";
import type { SessionManager } from "../sessionManager.js";

export function createMyTool(
  debugClient: DebugClient,
  sessionManager: SessionManager
) {
  return async (args: { param: string }) => {
    const session = sessionManager.requireSession();
    
    // Ваша логика
    const result = await debugClient.someMethod(session, args.param);
    
    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify(result)
      }]
    };
  };
}
```

2. Зарегистрируйте в `src/index.ts`:

```typescript
import { createMyTool } from "./tools/myTool.js";

const myTool = createMyTool(debugClient, sessionManager);

server.tool(
  "my_tool",
  "Description of my tool",
  {
    param: z.string().describe("Parameter description")
  },
  myTool
);
```

3. Добавьте тесты в `tests/myTool.test.ts`

4. Обновите документацию

## Версионирование

Используем [Semantic Versioning](https://semver.org/):

- **MAJOR** — несовместимые изменения API
- **MINOR** — новая функциональность (обратно совместимая)
- **PATCH** — исправления ошибок

## Релизы

1. Обновите версию в `package.json`
2. Обновите `CHANGELOG.md`
3. Создайте git tag: `git tag v1.0.0`
4. Запушьте tag: `git push origin v1.0.0`

## Вопросы?

Если у вас есть вопросы:

1. Проверьте FAQ.md
2. Создайте issue с меткой "question"
3. Опишите ваш вопрос подробно

Спасибо за вклад в проект! 🎉
