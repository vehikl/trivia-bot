import assert from 'node:assert/strict';
import test from 'node:test';
import {requestCommand} from '../commands/request.js';

test('/request command exposes descriptive error message when handling fails', async () => {
  let commandHandler = null;
  const postedMessages = [];

  const fakeApp = {
    command: (commandName, handler) => {
      if (commandName === '/request') {
        commandHandler = handler;
      }
    },
    client: {
      chat: {
        postEphemeral: async (payload) => {
          postedMessages.push(payload);
        },
      },
    },
  };

  const fakeOpenai = {
    chat: {
      completions: {
        create: async () => {
          throw new Error('Topic validation service unavailable.');
        },
      },
    },
  };

  const originalConsoleError = console.error;
  console.error = () => {};

  try {
    requestCommand(fakeApp, fakeOpenai);
    assert.ok(commandHandler, 'Command handler for /request should be registered');

    let ackCalled = false;
    await commandHandler({
      ack: async () => {
        ackCalled = true;
      },
      body: {
        channel_id: 'C123',
        user_id: 'U123',
        text: 'Canadian Inventions',
      },
    });

    assert.equal(ackCalled, true);
    assert.equal(postedMessages.length, 2);
    assert.equal(postedMessages[0].text, 'Reviewing and generating trivia for "Canadian Inventions"...');
    assert.equal(
      postedMessages[1].text,
      'Sorry, I could not generate that requested trivia topic. Topic validation service unavailable.'
    );
  } finally {
    console.error = originalConsoleError;
  }
});

test('/request command falls back to default message when error has no descriptive message', async () => {
  let commandHandler = null;
  const postedMessages = [];

  const fakeApp = {
    command: (commandName, handler) => {
      if (commandName === '/request') {
        commandHandler = handler;
      }
    },
    client: {
      chat: {
        postEphemeral: async (payload) => {
          postedMessages.push(payload);
        },
      },
    },
  };

  const fakeOpenai = {
    chat: {
      completions: {
        create: async () => {
          throw new Error('');
        },
      },
    },
  };

  const originalConsoleError = console.error;
  console.error = () => {};

  try {
    requestCommand(fakeApp, fakeOpenai);
    assert.ok(commandHandler, 'Command handler for /request should be registered');

    await commandHandler({
      ack: async () => {},
      body: {
        channel_id: 'C123',
        user_id: 'U123',
        text: 'Canadian Inventions',
      },
    });

    assert.equal(postedMessages.length, 2);
    assert.equal(
      postedMessages[1].text,
      'Sorry, I could not generate that requested trivia topic. Please try again.'
    );
  } finally {
    console.error = originalConsoleError;
  }
});
