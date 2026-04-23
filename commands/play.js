import {openTriviaModal} from '../services/trivia/playModal.js';

export function playCommand(app, options = {}) {
  const getTriviaForPlay = options.getTriviaForPlay;

  app.command('/play', async ({ack, body, client, logger}) => {
    await ack();

    try {
      await openTriviaModal({
        body: {
          ...body,
          text: '',
        },
        client,
        logger,
        getDefaultTriviaForPlay: getTriviaForPlay,
      });
    } catch (error) {
      logger.error('Error handling /play command:', error);
      await client.chat.postEphemeral({
        channel: body.channel_id,
        user: body.user_id,
        text: 'Sorry, I could not open the latest trivia right now.',
      });
    }
  });
}
