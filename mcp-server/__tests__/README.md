# MCP Server Tests

Comprehensive unit tests for the ezmodo MCP server.

## Test Structure

```
__tests__/
├── test-utils.js           # Shared test utilities and mocks
├── get-task.test.js        # Tests for get_task function (ID and task number lookup)
├── task-operations.test.js # Tests for task CRUD operations
└── project-context.test.js # Tests for project context operations
```

## Running Tests

```bash
# Install dependencies (if not already installed)
npm install

# Run all tests
npm test

# Run tests in watch mode (for development)
npm run test:watch

# Run tests with coverage report
npm run test:coverage
```

## Test Coverage

The test suite covers:

### Task Retrieval (`get-task.test.js`)
- ✅ Lookup by document ID (backward compatible)
- ✅ Lookup by task number + project ID (new feature)
- ✅ Input validation (missing params, conflicting params)
- ✅ Error handling (404, 401, 403, 500, timeout)
- ✅ Edge cases (null values, malformed responses)
- ✅ Performance (response time, concurrent requests)

### Task Operations (`task-operations.test.js`)
- ✅ Task creation with required and optional fields
- ✅ Sequential task number assignment
- ✅ Task updates (title, status, priority, steps, knowledge)
- ✅ Task completion with notes
- ✅ Task search (by project, status, text query)
- ✅ AI assignee support
- ✅ Integration scenarios (create → retrieve, update → retrieve)

### Project Context (`project-context.test.js`)
- ✅ Project context retrieval
- ✅ Access validation (public, private, team)
- ✅ Context consistency across calls
- ✅ Knowledge and memory arrays
- ✅ Error handling and performance

## Writing New Tests

### Using Test Utilities

```javascript
import {
  createMockCallEzmodoAPI,
  createMockTask,
  createMockProject,
  createMockError,
} from './test-utils.js';

// Create mock API
const mockCallEzmodoAPI = createMockCallEzmodoAPI();

// Create mock task
const task = createMockTask({
  id: 'custom-id',
  title: 'Custom Task',
  taskNumber: 42,
});

// Create mock error
const error = createMockError('Not found', 404);
```

### Test Pattern

```javascript
describe('Feature Name', () => {
  let mockCallEzmodoAPI;
  let functionUnderTest;

  beforeEach(() => {
    mockCallEzmodoAPI = createMockCallEzmodoAPI();
    functionUnderTest = async (args) => {
      return mockCallEzmodoAPI('endpoint', args);
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should do something', async () => {
    const result = await functionUnderTest({ param: 'value' });

    expect(result.success).toBe(true);
    expect(mockCallEzmodoAPI).toHaveBeenCalledWith('endpoint', {
      param: 'value',
    });
  });
});
```

### Mocking Custom Responses

```javascript
mockCallEzmodoAPI.mockImplementationOnce(async (endpoint, args) => {
  return {
    success: true,
    data: { custom: 'response' },
  };
});
```

## Test Philosophy

1. **Fast**: Tests should run quickly (< 1s per test)
2. **Isolated**: Each test is independent and can run alone
3. **Readable**: Test names describe what they test
4. **Comprehensive**: Cover happy paths, edge cases, and errors
5. **Maintainable**: Use shared utilities to reduce duplication

## Coverage Goals

Target coverage: **> 80%**

- Statements: > 80%
- Branches: > 75%
- Functions: > 80%
- Lines: > 80%

## Continuous Integration

Tests run automatically on:
- Pull requests
- Commits to `main` and `develop` branches
- Pre-push git hooks

## Troubleshooting

### Tests failing with "Cannot find module"
Ensure you're using Node 18+ and have installed dependencies:
```bash
npm install
```

### Tests timeout
Increase Jest timeout in individual tests:
```javascript
it('long running test', async () => {
  // Test code
}, 10000); // 10 second timeout
```

### Mock not working
Clear mocks between tests:
```javascript
afterEach(() => {
  jest.clearAllMocks();
});
```

## Contributing

When adding new MCP functions:
1. Create a corresponding test file
2. Cover happy paths and error cases
3. Add integration tests if applicable
4. Update this README with new coverage
5. Ensure all tests pass before committing

## Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Testing Best Practices](https://testingjavascript.com/)
- [MCP SDK Documentation](https://modelcontextprotocol.io/)
