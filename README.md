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