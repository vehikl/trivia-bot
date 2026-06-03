import {getLastWeeksTrivia} from "../models/quiz/quiz.js";

function getAcceptedAnswersText(item) {
    const acceptedAnswers = Array.isArray(item.acceptedAnswers)
        ? item.acceptedAnswers.map(answer => String(answer || '').trim()).filter(Boolean)
        : [];

    if (acceptedAnswers.length === 0) {
        return '';
    }

    return `\nAlso accepted: ${acceptedAnswers.join(', ')}`;
}

export function answersCommand(app) {
    app.command('/answers', async ({ack, say}) => {
        await ack();

        const trivia = await getLastWeeksTrivia();
        const quizTitle = trivia.topic;

        let questionBlocks = [];
        trivia.questions.forEach((item, index) => {
            const label = item.isBonus ? `Bonus Question: ${item.question}` : `Question ${index + 1}: ${item.question}`;
            questionBlocks.push(
                {
                    'type': 'section',
                    'text': {
                        'type': 'mrkdwn',
                        'text': `*${label}*`,
                    },
                },
            );
            questionBlocks.push(
                {
                    'type': 'section',
                    'text': {
                        'type': 'mrkdwn',
                        'text': `Answer: *${item.correctAnswer}*${getAcceptedAnswersText(item)}`,
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
