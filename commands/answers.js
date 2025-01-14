import {getPreviousTrivia} from "../models/quiz/quiz.js";

export function answersCommand(app) {
    app.command('/answers', async ({ack, say}) => {
        await ack();

        const trivia = await getPreviousTrivia();
        const quizTitle = trivia.topic;

        let questionBlocks = [];
        trivia.questions.forEach((item, index) => {
            questionBlocks.push(
                {
                    'type': 'section',
                    'text': {
                        'type': 'mrkdwn',
                        'text': `*Question ${index + 1}: ${item.question}*`,
                    },
                },
            );
            questionBlocks.push(
                {
                    'type': 'section',
                    'text': {
                        'type': 'mrkdwn',
                        'text': `Answer: *${item.correctAnswer}*`,
                    },
                },
            );
        })

        await say({
            'text': 'previous trivia title',
            'blocks': [
                {
                    "type": "header",
                    "text": {
                        "type": "plain_text",
                        "text": quizTitle,//movies
                        "emoji": true
                    }
                },
                ...questionBlocks
            ]
        })
    });
}