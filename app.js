require('dotenv').config()
const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs } = require('firebase/firestore/lite');

const { App } = require('@slack/bolt');

const firebaseConfig = {
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    projectId: process.env.FIREBASE_PROJECT_ID,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.FIREBASE_APP_ID,
    measurementId: process.env.FIREBASE_MEASUREMENT_ID
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

async function getQuizzes(db) {
    const quizzesCol = collection(db, 'quizzes');
    const quizSnapshot = await getDocs(quizzesCol);
    const quizList = quizSnapshot.docs.map(doc => doc.data());
    return quizList;
}

const app = new App({
    token: process.env.SLACK_BOT_TOKEN,
    signingSecret: process.env.SLACK_SIGNING_SECRET,
    socketMode: true,
    appToken: process.env.SLACK_APP_TOKEN,
    // Socket Mode doesn't listen on a port, but in case you want your app to respond to OAuth,
    // you still need to listen on some port!
    port: process.env.PORT || 3000
  });
  
  // Listens to incoming messages that contain "hello"
  app.message('hello', async ({ message, say }) => {
    // say() sends a message to the channel where the event was triggered
    await say({
        "blocks": [
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": "Hello Friend :wave:"
                }
            },
            {
                "type": "input",
                "element": {
                    "type": "plain_text_input",
                    "multiline": true,
                    "action_id": "plain_text_input-action"
                },
                "label": {
                    "type": "plain_text",
                    "text": "Question #1",
                    "emoji": true
                }
            },
            {
                "type": "input",
                "element": {
                    "type": "plain_text_input",
                    "action_id": "plain_text_input-action"
                },
                "label": {
                    "type": "plain_text",
                    "text": "Answer to question #1",
                    "emoji": true
                }
            },
            // Commented out for faster manual testing
            // {
            //     "type": "input",
            //     "element": {
            //         "type": "plain_text_input",
            //         "multiline": true,
            //         "action_id": "plain_text_input-action"
            //     },
            //     "label": {
            //         "type": "plain_text",
            //         "text": "Question #2",
            //         "emoji": true
            //     }
            // },
            // {
            //     "type": "input",
            //     "element": {
            //         "type": "plain_text_input",
            //         "action_id": "plain_text_input-action"
            //     },
            //     "label": {
            //         "type": "plain_text",
            //         "text": "Answer to question #2",
            //         "emoji": true
            //     }
            // },
            // {
            //     "type": "input",
            //     "element": {
            //         "type": "plain_text_input",
            //         "multiline": true,
            //         "action_id": "plain_text_input-action"
            //     },
            //     "label": {
            //         "type": "plain_text",
            //         "text": "Question #3",
            //         "emoji": true
            //     }
            // },
            // {
            //     "type": "input",
            //     "element": {
            //         "type": "plain_text_input",
            //         "action_id": "plain_text_input-action"
            //     },
            //     "label": {
            //         "type": "plain_text",
            //         "text": "Answer to question #3",
            //         "emoji": true
            //     }
            // },
            // {
            //     "type": "input",
            //     "element": {
            //         "type": "plain_text_input",
            //         "multiline": true,
            //         "action_id": "plain_text_input-action"
            //     },
            //     "label": {
            //         "type": "plain_text",
            //         "text": "Question #4",
            //         "emoji": true
            //     }
            // },
            // {
            //     "type": "input",
            //     "element": {
            //         "type": "plain_text_input",
            //         "action_id": "plain_text_input-action"
            //     },
            //     "label": {
            //         "type": "plain_text",
            //         "text": "Answer to question #4",
            //         "emoji": true
            //     }
            // },
            // {
            //     "type": "input",
            //     "element": {
            //         "type": "plain_text_input",
            //         "multiline": true,
            //         "action_id": "plain_text_input-action"
            //     },
            //     "label": {
            //         "type": "plain_text",
            //         "text": "Question #5",
            //         "emoji": true
            //     }
            // },
            // {
            //     "type": "input",
            //     "element": {
            //         "type": "plain_text_input",
            //         "action_id": "plain_text_input-action"
            //     },
            //     "label": {
            //         "type": "plain_text",
            //         "text": "Answer to question #5",
            //         "emoji": true
            //     }
            // },
            {
                "type": "actions",
                "elements": [
                    {
                        "type": "button",
                        "text": {
                            "type": "plain_text",
                            "text": "Submit",
                            "emoji": true
                        },
                        "action_id": "button_click",
                        "value": "submit_trivia"
                    }
                ]
            }
        ]
    });
  });
  
  app.action('button_click', async ({ body, ack, say }) => {
    // Acknowledge the action
    await ack();
    await say(`<@${body.user.id}> clicked the button`);
    await say(`<@${body.user.id}> ${await getQuizzes(db)}`);
  });

  (async () => {
    // Start your app
    await app.start();
  
    console.log('⚡️ Bolt app is running!');
  })();
  