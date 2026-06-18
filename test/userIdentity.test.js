import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getUserIdentityFields,
  resolveUserIdentity,
} from '../services/slack/userIdentity.js';

test('prefers Slack display name while retaining other searchable names', () => {
  assert.deepEqual(
    getUserIdentityFields({
      id: 'U123',
      name: 'johnith',
      profile: {
        display_name: 'John',
        real_name: 'John Smith',
      },
    }),
    {
      user_name: 'John',
      user_display_name: 'John',
      user_real_name: 'John Smith',
      slack_user_name: 'johnith',
    }
  );
});

test('resolves current Slack profile data for a submission', async () => {
  const identity = await resolveUserIdentity(
    {
      users: {
        info: async ({user}) => ({
          user: {
            id: user,
            name: 'johnith',
            profile: {
              display_name: 'John',
              real_name: 'John Smith',
            },
          },
        }),
      },
    },
    {id: 'U123'}
  );

  assert.equal(identity.user_name, 'John');
  assert.equal(identity.user_real_name, 'John Smith');
});

test('falls back to submission body user data when profile lookup fails', async () => {
  const originalWarn = console.warn;
  let identity;

  try {
    console.warn = () => {};
    identity = await resolveUserIdentity(
      {
        users: {
          info: async () => {
            throw new Error('missing_scope');
          },
        },
      },
      {
        id: 'U123',
        username: 'johnith',
      }
    );
  } finally {
    console.warn = originalWarn;
  }

  assert.deepEqual(identity, {
    user_name: 'johnith',
    slack_user_name: 'johnith',
  });
});
