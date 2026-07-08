# Trivia Bot
A Node.js Slack bot that generates trivia with OpenAI, collects submissions, grades answers, and posts leaderboard results.

## Features
- Listens to commands from Slack
- Automatically generates Trivia every session
- Grades Users' submissions
- Posts a Leaderboard for every Trivia session

Examples:
- Generates weekly trivia
- Posts quizzes to Slack
- Grades submissions
- Builds a leaderboard
- Supports requested topics
- Stores data in Firestore

## Tech Stack

- Node.js
- Slack Bolt
- OpenAI API
- Firestore

## Project Structure

- `app.js` - Main App Entry Point
- `commands/` - Slack Slash Commands
- `services/trivia/` - Quiz Generation, Grading, Leaderboard, Modal Helpers
- `models/` - Firestore read/write logic
- `services/firebase/` - Firestore connection
- `services/utils/` - Date Helpers and Shared Utilities

## Requirements

- Node.js version
- Slack app credentials
- OpenAI API key
- Firebase / Firestore project
- Firebase CLI for the local Firestore emulator
- A Slack workspace/channel for trivia

## Installation

1. Clone the repo
2. Install dependencies
3. Create `.env`
4. Configure Slack app
5. Configure Firebase
6. Start the app

## Running Locally

```bash
npm install
npm start
```

## Firestore Emulator Setup

The app can use the local Firestore emulator during development. The emulator is configured in `firebase.json` to run Firestore on port `8080`.

1. Install the Firebase CLI if you do not already have it:

```bash
npm install -g firebase-tools
```

2. Copy `.env.example` to `.env` and make sure these local development values are set:

```bash
NODE_ENV=development
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
```

3. Start the Firestore emulator in one terminal:

```bash
firebase emulators:start --only firestore
```

4. Start the bot in another terminal:

```bash
npm start
```

When the emulator is running, Firestore data is stored locally instead of being written to the configured Firebase project. The emulator UI is available at `http://127.0.0.1:4000` unless Firebase chooses a different available port.
