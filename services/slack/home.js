async function updateView() {
  const blocks = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*Welcome to Thursday\'s Trivia!* :brain:\nTest your knowledge and compete with your colleagues in our weekly trivia game. Every Thursday, we\'ll have exciting new questions on various topics!'
      }
    },
    {
      type: 'divider'
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*How to Play:*\n• Wait for the trivia questions to be posted in the channel\n• Click the \'Play\' button to participate\n• Answer the questions when prompted\n• See how you rank against your colleagues!'
      }
    },
    {
      type: 'divider'
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: 'Ready to test your knowledge? Use the button below to join the current trivia game!'
      },
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: 'Play',
            emoji: true,
          },
          value: 'play_button',
          action_id: 'play',
        },
      ],
    },
  ];

  return JSON.stringify({
    type: 'home',
    title: {
      type: 'plain_text',
      text: 'Thursday\'s Trivia'
    },
    blocks,
  });
}

async function displayHome(app, user) {
  try {
    await app.client.views.publish({
      user_id: user,
      view: await updateView()
    });
  } catch (error) {
    console.error(error);
  }
}

export function registerHomeView(app) {
  app.event('app_home_opened', async ({event}) => {
    try {
      await displayHome(app, event.user);
    } catch (error) {
      console.error(error);
    }
  });
}
