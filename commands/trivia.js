import OpenAI from 'openai';
import {getAllTopics, store} from '../models/quiz/quiz.js';

const openai = new OpenAI({apiKey: process.env.OPENAI_API_KEY});

export function triviaCommand(app) {
  app.command('/trivia', async ({ack, body, say}) => {
    await ack();

    const topic = body.text;

    const completion = await openai.chat.completions.create({
      messages: [
        {
          role: 'system', content: 'You will be provided a topic. You will need to create trivia questions from this topic. Make sure that the message given to the User is string' +
              ' format so I can JSON parse it. Please only provide 5 questions. \n' +
              '\n' +
              'Make sure each string has a property of questions with each object having a question, answers as an array with multiple choice of a,b,c, and d in their own objects' +
              ' the right answer. An example of the string format would be: [{question: "question text", answers: ["a) Example answer 1","b) Example answer 2","c) Example' +
              ' answer 3" "d) Example answer 4", correctAnswer: b]},' +
              ' ...] This is the' +
              ' topic:' +
              ' ' + topic,
        },
      ],
      model: 'gpt-4o',
    });

    const response = JSON.parse(completion.choices[0].message.content);

    let questionBlocks = [];
    response.forEach((item, index) => {
      questionBlocks.push(
          {
            'type': 'section',
            'text': {
              'type': 'mrkdwn',
              'text': `*Question ${index + 1}: ${item.question}*`,
            },
          },
      );

      item.answers.forEach((answer) => {
        questionBlocks.push(
            {
              'type': 'section',
              'text': {
                'type': 'mrkdwn',
                'text': answer,
              },
            },
        );
      });

      questionBlocks.push(
          {
            'type': 'section',
            'text': {
              'type': 'mrkdwn',
              'text': `*Answer: ${item.correctAnswer}*`,
            },
          },
      );
    });

    app.action('submit', async ({ack}) => {
      await ack();

      const questions = response.map(item => ({
        question: item.question,
        options: item.answers,
        correctAnswer: item.correctAnswer,
      }));

      const quiz = {
        topic,
        questions,
      };
      await store(quiz);
    });

    await say({
      'text': 'Trivia Based on ' + body.text,
      'blocks': [
        {
          'type': 'header',
          'text': {
            'type': 'plain_text',
            'text': 'Hello Friend! Time for Trivia! :wave:',
          },
        },
        ...questionBlocks,
        {
          'type': 'divider',
        },
        {
          'type': 'context',
          'elements': [
            {
              'type': 'mrkdwn',
              'text': 'Make sure to review the answers and questions before submitting! 💡',
            },
          ],
        },
        {
          'type': 'actions',
          'elements': [
            {
              'type': 'button',
              'text': {
                'type': 'plain_text',
                'text': 'Submit',
                'emoji': true,
              },
              'value': 'submit_button',
              'action_id': 'submit',
            },
          ],
        },
      ],
    });
  });

  app.command('/all', async ({ack, say}) => {
    await ack();

    const quizTitles = await getAllTopics();

    const botSays = quizTitles.join('\n');

    await say({
      'text': 'All trivia titles',
      'blocks' : [
        {
          "type": "header",
          "text": {
            "type": "plain_text",
            "text": "All Trivia topics:",
            "emoji": true
          }
        },
        {
          "type": "section",
          "text": {
            "type": "plain_text",
            "text": botSays,
            "emoji": true
          }
        }
      ]
    })
  });
}
