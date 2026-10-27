# AI Mystery Room — Project Specification

## 1. Project Overview

AI Mystery Room is an AI-powered web application where users create and solve mysteries generated using Google's Gemini AI. Players investigate suspects, discover clues, request hints, and identify the culprit. The application shows the verdict, explanation, and final score after the player submits an accusation.

## 2. Problem Statement

A mystery game can become repetitive when it uses only fixed stories. AI Mystery Room aims to provide a more varied mystery-solving experience by generating cases based on a user's premise and selected difficulty level.

## 3. Target Users and User Experience

### Target users
- People who enjoy detective stories, puzzles, and mystery-solving games.
- Users who want a short, interactive investigation experience.

### Expected user experience
1. The user opens the website.
2. The user enters a mystery premise and selects Easy, Medium, or Hard.
3. Gemini generates the story, suspects, clues, and hints.
4. The user investigates the case and discovers clues.
5. The user may request hints.
6. The user selects a suspect and submits an accusation.
7. The application reveals the verdict, culprit, explanation, and score.
8. The user can start another mystery.

## 4. Technology Stack

- Frontend: React with Vite
- Styling: Tailwind CSS
- Frontend routing and requests: React Router and Axios
- Backend: Node.js and Express
- Database: MongoDB with Mongoose
- AI: Gemini API using the `@google/genai` package
- Validation: Zod
- Configuration: environment variables in a server-side `.env` file

## 5. Core Features

1. Home page with project introduction and a Start Mystery button.
2. Mystery creation form with a premise field and difficulty selector.
3. AI-generated mystery story.
4. Suspect cards.
5. Clue discovery and investigation progress.
6. Hint requests with a score penalty.
7. Suspect accusation submission.
8. Final verdict and explanation.
9. Score calculation.
10. Ability to start a new mystery.
11. Loading indicators and helpful error messages.
12. Responsive layout for desktop and mobile screens.

## 6. Difficulty Rules

| Difficulty | Suspects | Clues | Hints | Base points for a correct accusation |
|---|---:|---:|---:|---:|
| Easy | 3 | 5 | 2 | 100 |
| Medium | 4 | 7 | 3 | 150 |
| Hard | 5 | 9 | 3 | 200 |

## 7. Scoring Rules

- Correct accusation: Easy = 100 points, Medium = 150 points, Hard = 200 points.
- Each discovered clue: +5 points.
- Each hint used: -10 points.
- Minimum final score: 0.
- Score calculation must happen on the backend.
- The frontend must not be trusted to submit the final score as authoritative.

Suggested formula:

`finalScore = max(0, (correctAccusation ? basePoints : 0) + (discoveredClueCount * 5) - (hintCount * 10))`

A wrong accusation earns no base points. The clue points and hint penalty are still applied, and the final score cannot fall below zero.

## 8. User Interface Pages

### 8.1 Home
- Project name and short introduction.
- Start Mystery button.
- Clear instructions for the game.

### 8.2 Create Mystery
- Text field for the user's mystery premise.
- Difficulty selector: Easy, Medium, Hard.
- Generate Mystery button.
- Input validation and generation loading state.

### 8.3 Investigation Room
- Mystery title and story.
- Suspect cards.
- Available clues and discovered-clue state.
- Request Hint button and revealed hints.
- Investigation progress.
- Button to proceed to accusation when ready.

### 8.4 Accusation
- Suspect selection.
- Confirmation before submitting the accusation.
- Submit Accusation button.
- Loading and error states.

### 8.5 Results
- Correct or incorrect verdict.
- Actual culprit.
- Explanation of how the clues support the solution.
- Final score.
- Start Another Mystery button.

## 9. Backend API Design

The following endpoints are planned, based on the project guide.

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/cases` | Generate and create a mystery |
| GET | `/api/cases/:id` | Retrieve an active mystery without exposing the solution |
| POST | `/api/cases/:id/clues/:clueId/discover` | Mark a clue as discovered |
| POST | `/api/cases/:id/hints` | Request a hint |
| POST | `/api/cases/:id/accuse` | Submit an accusation and calculate the score |
| GET | `/api/cases/:id/result` | Retrieve the completed result after accusation |

### API expectations
- Validate request data and IDs.
- Return useful HTTP status codes and clear error messages.
- Handle unavailable AI service, invalid AI output, and database errors gracefully.
- Do not return the culprit, solution, or private solution explanation from active-case responses.
- Only reveal the result after the accusation has been submitted.
- Prevent repeated requests from incorrectly awarding clue points or applying hint penalties multiple times.

## 10. Database Model

Each mystery/case should store the information needed to run and finish a game:

- Mystery title and story.
- Difficulty.
- Suspects, including stable IDs and descriptions.
- Clues, including stable IDs, text, and discovered status/progress.
- Hints and which hints have been used.
- Culprit ID and private solution explanation.
- Player's accusation.
- Completion status.
- Final score.
- Creation and update timestamps.

The culprit and solution must be kept on the backend and must never be included in responses for an active case.

## 11. Gemini AI Output and Validation

Gemini should return structured data that the backend can validate before saving. The generated case should contain:
- Title and story.
- The required number of suspects for the selected difficulty.
- The required number of clues for the selected difficulty.
- The required number of hints for the selected difficulty.
- One valid culprit ID that matches one of the suspects.
- A solution explanation supported by the clues.

Use Zod or equivalent validation on the backend. If the output is incomplete, malformed, inconsistent, or fails validation, do not save it as a playable case. Handle the error safely and allow a retry.

The mystery should be logically consistent: the solution should be supported by the clues, and the clues should not contradict the final explanation.

## 12. Security and Privacy

- Store `GEMINI_API_KEY` and `MONGODB_URI` only in the backend environment.
- Never put secret keys in React/frontend code.
- Never commit `.env` files or API keys to GitHub.
- Add a `.gitignore` that excludes `.env`, `node_modules`, build output, and other generated files.
- Keep culprit ID and solution explanation private until the accusation is submitted.
- Validate and sanitize user inputs.
- Do not trust client-provided scores, discovered-clue counts, or hint counts; verify progress on the backend.
- Configure CORS to allow the intended frontend origin.

## 13. Error and Loading States

Show helpful messages when:
- The premise is empty or invalid.
- Mystery generation is in progress.
- Gemini is unavailable or returns invalid data.
- The requested case or clue does not exist.
- A clue has already been discovered.
- A hint cannot be provided.
- The accusation request fails.
- The database or server is unavailable.

Do not show raw secret values, API keys, or internal stack traces to users.

## 14. Acceptance Criteria

The project is complete when:
- Users can create mysteries at Easy, Medium, and Hard levels.
- Each difficulty produces the required number of suspects, clues, and hints.
- Players can discover clues, request hints, and submit an accusation.
- The culprit and solution are not revealed before the accusation.
- The backend calculates the score and enforces the minimum of zero.
- The results page shows the correct verdict, culprit, explanation, and score.
- Invalid AI output and API/database failures are handled safely.
- The interface works on desktop and mobile screens.
- The complete workflow works on the deployed website.

## 15. Deployment Plan

- Configure a MongoDB Atlas database.
- Deploy the Express backend to a suitable hosting provider.
- Deploy the React frontend to Vercel.
- Configure environment variables on the relevant hosting services.
- Set the production frontend URL in the backend CORS configuration.
- Test the complete game using the public production URL.

## 16. Final Deliverables

- `SPEC.md` — this project specification.
- Complete source code in a GitHub repository.
- Live deployed website URL.
- A successful demonstration of generating and solving a mystery on the deployed website.

## 17. Implementation Order

1. Review and finalize this specification.
2. Create the React/Vite client and Express server folders.
3. Configure environment variables and `.gitignore`.
4. Connect the backend to MongoDB.
5. Create the case model and API endpoints.
6. Integrate Gemini and validate its output.
7. Build the five user-interface pages.
8. Connect the frontend to the backend APIs.
9. Implement clue discovery, hints, accusations, and scoring.
10. Test all difficulty levels and failure cases.
11. Deploy the frontend and backend.
12. Run the complete game on the live website.
