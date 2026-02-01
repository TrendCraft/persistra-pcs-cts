// nlCommandRouter.test.js
const { detectManagementCommand, handleManagementCommand } = require('./nlCommandRouter');

describe('NL Command Router', () => {
  const fakeAgentState = {
    identity: 'Leo the Agent',
    capabilities: ['reasoning', 'planning'],
    lastDrift: '2025-06-29T10:00:00-04:00',
    lastMajorUpdate: '2025-06-28T15:00:00-04:00',
    memories: [
      { content: 'Learned about quantum embeddings.' },
      { content: 'Refactored agent loop.' },
      { content: 'Discussed time travel features.' }
    ]
  };

  test('detects show state', () => {
    expect(detectManagementCommand('Show state')).toEqual({ type: 'show_state' });
    expect(detectManagementCommand('Introspect')).toEqual({ type: 'show_state' });
    expect(detectManagementCommand('Describe state')).toEqual({ type: 'show_state' });
  });

  test('detects delete and requires confirmation', async () => {
    const cmd = detectManagementCommand('delete memory 2');
    expect(cmd.type).toBe('delete_memory');
    const result = await handleManagementCommand(cmd, fakeAgentState);
    expect(result.requiresConfirmation).toBe(true);
    expect(result.response).toMatch(/Are you sure/);
  });

  test('delete confirmed', async () => {
    const cmd = detectManagementCommand('delete memory 2');
    const result = await handleManagementCommand(cmd, fakeAgentState, 'y');
    expect(result.handled).toBe(true);
    expect(result.response).toMatch(/deleted/);
  });

  test('delete cancelled', async () => {
    const cmd = detectManagementCommand('delete memory 2');
    const result = await handleManagementCommand(cmd, fakeAgentState, 'n');
    expect(result.handled).toBe(true);
    expect(result.response).toMatch(/Cancelled/);
  });

  test('undo/rollback with confirmation', async () => {
    const cmd = detectManagementCommand('rollback two sessions');
    expect(cmd.type).toBe('time_travel');
    const result = await handleManagementCommand(cmd, fakeAgentState);
    expect(result.requiresConfirmation).toBe(true);
    expect(result.response).toMatch(/Are you sure/);
  });

  test('undo/rollback confirmed', async () => {
    const cmd = detectManagementCommand('rollback two sessions');
    const result = await handleManagementCommand(cmd, fakeAgentState, 'y');
    expect(result.handled).toBe(true);
    expect(result.response).toMatch(/Rolled back/);
  });

  test('show state summary', async () => {
    const cmd = detectManagementCommand('show state');
    const result = await handleManagementCommand(cmd, fakeAgentState);
    expect(result.handled).toBe(true);
    expect(result.response).toMatch(/Agent State Summary/);
    expect(result.response).toMatch(/Leo the Agent/);
    expect(result.response).toMatch(/reasoning/);
    expect(result.response).toMatch(/last drift/i);
  });
});
