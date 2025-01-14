import {getAllTopics} from "../models/quiz/quiz.js";

export function allCommand(app) {
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

