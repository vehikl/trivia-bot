function clean(value) {
  return String(value || '').trim();
}

export function getUserIdentityFields(user = {}) {
  const profile = user.profile || {};
  const userName = clean(user.name || user.username);
  const displayName = clean(profile.display_name || profile.display_name_normalized);
  const realName = clean(profile.real_name || profile.real_name_normalized || user.real_name);

  return {
    user_name: displayName || realName || userName || clean(user.id),
    ...(displayName ? {user_display_name: displayName} : {}),
    ...(realName ? {user_real_name: realName} : {}),
    ...(userName ? {slack_user_name: userName} : {}),
  };
}

export async function resolveUserIdentity(client, bodyUser = {}) {
  try {
    const response = await client.users.info({user: bodyUser.id});
    if (response?.user) {
      return getUserIdentityFields(response.user);
    }
  } catch (error) {
    console.warn('Unable to resolve Slack user profile for submission.', error);
  }

  return getUserIdentityFields(bodyUser);
}
