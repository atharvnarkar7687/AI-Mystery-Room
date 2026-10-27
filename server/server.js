
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const mongoose = require('mongoose');
require('dotenv').config();

const { GoogleGenAI } = require('@google/genai');
const Case = require('./models/Case');

const app = express();
const PORT = process.env.PORT || 5000;
const MODEL_NAME = 'gemini-3.8-flash';

const ai = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  : null;

// Allow local development and the deployed Vercel frontend.
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'https://ai-mystery-room-olive.vercel.app',
  process.env.CLIENT_URL,
].filter(Boolean);

app.use(
  cors({
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

app.use(express.json({ limit: '1mb' }));

// Log request duration to help diagnose slow API calls.
app.use((req, res, next) => {
  const startedAt = Date.now();

  res.on('finish', () => {
    console.log(
      `${req.method} ${req.originalUrl} ${res.statusCode} - ${Date.now() - startedAt}ms`
    );
  });

  next();
});

const difficultySettings = {
  Easy: { suspects: 3, clues: 5, hints: 2, baseScore: 100 },
  Medium: { suspects: 4, clues: 7, hints: 3, baseScore: 150 },
  Hard: { suspects: 5, clues: 9, hints: 3, baseScore: 200 },
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function getErrorStatus(error) {
  const status = error?.status ?? error?.code ?? error?.error?.code;

  if (Number.isInteger(Number(status))) {
    return Number(status);
  }

  const match = String(error?.message || '').match(
    /\b(400|401|403|404|429|500|502|503|504)\b/
  );

  return match ? Number(match[1]) : 500;
}

function getErrorMessage(error) {
  return typeof error?.message === 'string'
    ? error.message
    : 'Unknown error';
}

async function generateWithRetry(callback, maxAttempts = 3) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await callback();
    } catch (error) {
      const status = getErrorStatus(error);
      const retryable = [429, 500, 502, 503, 504].includes(status);

      if (!retryable || attempt === maxAttempts) {
        throw error;
      }

      const delay = attempt * 1500;

      console.warn(
        `Gemini returned status ${status}. Retry ${attempt + 1}/${maxAttempts} in ${delay / 1000}s.`
      );

      await sleep(delay);
    }
  }

  throw new Error('Gemini request failed after retries.');
}

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function fromDatabase(document) {
  const game = document.toObject();
  game.id = game.gameId;
  delete game.gameId;
  delete game.__v;
  return game;
}

function toDatabase(game) {
  const { id, _id, __v, ...fields } = game;
  return { ...fields, gameId: id };
}

async function loadGame(id) {
  const document = await Case.findOne({ gameId: id });
  return document ? fromDatabase(document) : null;
}

async function saveGame(game) {
  const updated = await Case.findOneAndUpdate(
    { gameId: game.id },
    { $set: toDatabase(game) },
    { new: true, runValidators: true }
  );

  if (!updated) {
    throw new Error('Case could not be saved to MongoDB.');
  }

  return game;
}

function publicCase(game) {
  return {
    id: game.id,
    premise: game.premise,
    difficulty: game.difficulty,
    title: game.title,
    story: game.story,

    suspects: game.suspects.map((suspect) => ({
      id: suspect.id,
      name: suspect.name,
      description: suspect.description,
      alibi: suspect.alibi,
      motive: suspect.motive,
    })),

    clues: game.clues.map((clue) => {
      const discovered = game.discoveredClueIds.includes(clue.id);

      return {
        id: clue.id,
        title: clue.title,
        description: discovered ? clue.description : null,
        discovered,
      };
    }),

    hintsAvailable: Math.max(0, game.hints.length - game.hintsUsed),
    hintsUsed: game.hintsUsed,
    discoveredClueIds: [...game.discoveredClueIds],
    score: game.score,
    accused: game.accused,
  };
}

async function findGame(req, res) {
  const game = await loadGame(req.params.id);

  if (!game) {
    res.status(404).json({
      success: false,
      message: 'Mystery not found. Please create a new mystery.',
    });
    return null;
  }

  return game;
}

function validateGeneratedMystery(generated, config) {
  if (
    !generated ||
    typeof generated !== 'object' ||
    !cleanText(generated.title) ||
    !cleanText(generated.story) ||
    !Array.isArray(generated.suspects) ||
    !Array.isArray(generated.clues) ||
    !Array.isArray(generated.hints) ||
    !cleanText(generated.culpritName) ||
    !cleanText(generated.solution)
  ) {
    throw new Error('Gemini returned incomplete mystery data.');
  }

  if (
    generated.suspects.length !== config.suspects ||
    generated.clues.length !== config.clues ||
    generated.hints.length !== config.hints
  ) {
    throw new Error(
      'Generated mystery does not match the requested difficulty.'
    );
  }

  for (const suspect of generated.suspects) {
    if (
      !cleanText(suspect.name) ||
      !cleanText(suspect.description) ||
      !cleanText(suspect.alibi) ||
      !cleanText(suspect.motive)
    ) {
      throw new Error('A generated suspect is missing required information.');
    }
  }

  for (const clue of generated.clues) {
    if (!cleanText(clue.title) || !cleanText(clue.description)) {
      throw new Error('A generated clue is missing required information.');
    }
  }

  if (generated.hints.some((hint) => !cleanText(hint))) {
    throw new Error('A generated hint is empty.');
  }

  const culpritExists = generated.suspects.some(
    (suspect) =>
      cleanText(suspect.name).toLowerCase() ===
      cleanText(generated.culpritName).toLowerCase()
  );

  if (!culpritExists) {
    throw new Error('The culprit does not match any generated suspect.');
  }
}

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'AI Mystery Room server is running!',
    geminiConfigured: Boolean(ai),
    mongoConnected: mongoose.connection.readyState === 1,
  });
});

// Create a mystery
app.post('/api/cases', async (req, res) => {
  const startedAt = Date.now();

  try {
    const premise = cleanText(req.body?.premise);
    const difficulty = req.body?.difficulty;

    if (premise.length < 10 || premise.length > 1000) {
      return res.status(400).json({
        success: false,
        message: 'Premise must contain between 10 and 1000 characters.',
      });
    }

    if (!difficultySettings[difficulty]) {
      return res.status(400).json({
        success: false,
        message: 'Choose Easy, Medium, or Hard difficulty.',
      });
    }

    if (!ai) {
      return res.status(500).json({
        success: false,
        message: 'Gemini API key is not configured on the backend.',
      });
    }

    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        success: false,
        message: 'Database is not connected. Please try again shortly.',
      });
    }

    const config = difficultySettings[difficulty];

    const prompt = `
Create an original, logically solvable detective mystery.

USER PREMISE:
${premise}

DIFFICULTY:
${difficulty}

Return ONLY valid JSON in this format:
{
  "title": "Mystery title",
  "story": "Detailed mystery story",
  "suspects": [
    {
      "name": "Suspect name",
      "description": "Short description",
      "alibi": "Suspect's alibi",
      "motive": "Possible motive"
    }
  ],
  "clues": [
    {
      "title": "Clue title",
      "description": "Evidence description"
    }
  ],
  "hints": ["First hint", "Second hint"],
  "culpritName": "Exact name of the culprit",
  "solution": "Explanation of how the evidence identifies the culprit"
}

Requirements:
- Generate exactly ${config.suspects} suspects.
- Generate exactly ${config.clues} clues.
- Generate exactly ${config.hints} hints.
- culpritName must match one suspect's name exactly.
- All suspects must have names, descriptions, alibis, and motives.
- All clues must be useful and consistent with the solution.
- The solution must be logically supported by the clues.
- Hints should become progressively more revealing.
- Do not reveal the culprit or final solution in the public story.
- Do not put the solution in suspect descriptions, alibis, motives, or clues.
- Make the mystery engaging and solvable.
- Do not include Markdown or code fences.
`;

    console.log(
      `Starting ${difficulty} mystery generation with ${MODEL_NAME}.`
    );

    const response = await generateWithRetry(() =>
      ai.models.generateContent({
        model: MODEL_NAME,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
        },
      })
    );

    const responseText =
      typeof response.text === 'function'
        ? await response.text()
        : response.text;

    if (typeof responseText !== 'string' || !responseText.trim()) {
      throw new Error('Gemini returned an empty response.');
    }

    let generated;

    try {
      generated = JSON.parse(responseText);
    } catch {
      throw new SyntaxError('Gemini returned invalid JSON.');
    }

    validateGeneratedMystery(generated, config);

    const game = {
      id: crypto.randomUUID(),
      premise,
      difficulty,
      title: cleanText(generated.title),
      story: cleanText(generated.story),

      suspects: generated.suspects.map((suspect) => ({
        id: crypto.randomUUID(),
        name: cleanText(suspect.name),
        description: cleanText(suspect.description),
        alibi: cleanText(suspect.alibi),
        motive: cleanText(suspect.motive),
      })),

      clues: generated.clues.map((clue) => ({
        id: crypto.randomUUID(),
        title: cleanText(clue.title),
        description: cleanText(clue.description),
      })),

      hints: generated.hints.map(cleanText),
      culpritName: cleanText(generated.culpritName),
      solution: cleanText(generated.solution),

      discoveredClueIds: [],
      hintsUsed: 0,
      score: config.baseScore,

      accused: false,
      accusedSuspectId: null,
      accusationCorrect: null,
    };

    await new Case(toDatabase(game)).save();

    console.log(
      `Mystery saved successfully: ${game.id}. Total generation time: ${Date.now() - startedAt}ms`
    );

    return res.status(201).json({
      success: true,
      message: 'Mystery generated successfully!',
      case: publicCase(game),
    });
  } catch (error) {
    const status = getErrorStatus(error);

    // Log technical details for diagnosis. Never log API keys or database URIs.
    console.error('Mystery generation failed:', {
      message: getErrorMessage(error),
      status,
      name: error?.name,
      elapsedMs: Date.now() - startedAt,
    });

    if (status === 429) {
      return res.status(429).json({
        success: false,
        message: 'Gemini API quota or rate limit reached. Try again later.',
      });
    }

    if ([503, 504].includes(status)) {
      return res.status(503).json({
        success: false,
        message: 'Gemini is temporarily busy. Please try again later.',
      });
    }

    if ([401, 403].includes(status)) {
      return res.status(status).json({
        success: false,
        message: 'Check the Gemini API key and model access in Render.',
      });
    }

    if (status === 404) {
      return res.status(502).json({
        success: false,
        message: 'The configured Gemini model was not found or is unavailable.',
      });
    }

    if (error instanceof SyntaxError) {
      return res.status(502).json({
        success: false,
        message: 'Gemini returned invalid JSON. Please try again.',
      });
    }

    if (
      error.name === 'ValidationError' ||
      error.code === 11000
    ) {
      return res.status(500).json({
        success: false,
        message: 'The case could not be saved to MongoDB.',
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Mystery generation or database saving failed. Check backend logs.',
    });
  }
});

// Get the current public case
app.get('/api/cases/:id', async (req, res) => {
  try {
    const game = await findGame(req, res);
    if (!game) return;

    res.json({ success: true, case: publicCase(game) });
  } catch (error) {
    console.error('Loading case failed:', getErrorMessage(error));
    res.status(500).json({
      success: false,
      message: 'Could not load the case.',
    });
  }
});

// Discover a clue: +5 points, once per clue
app.post('/api/cases/:id/clues/:clueId/discover', async (req, res) => {
  try {
    const game = await findGame(req, res);
    if (!game) return;

    if (game.accused) {
      return res.status(400).json({
        success: false,
        message: 'The investigation is already complete.',
      });
    }

    const clue = game.clues.find((item) => item.id === req.params.clueId);

    if (!clue) {
      return res.status(404).json({
        success: false,
        message: 'Clue not found.',
      });
    }

    const alreadyDiscovered = game.discoveredClueIds.includes(clue.id);

    if (!alreadyDiscovered) {
      game.discoveredClueIds.push(clue.id);
      game.score += 5;
      await saveGame(game);
    }

    res.json({
      success: true,
      message: alreadyDiscovered
        ? 'You have already discovered this clue.'
        : 'Clue discovered! +5 points.',
      case: publicCase(game),
    });
  } catch (error) {
    console.error('Discovering clue failed:', getErrorMessage(error));
    res.status(500).json({
      success: false,
      message: 'Could not update the clue.',
    });
  }
});

// Reveal the next hint: -10 points, minimum score 0
app.post('/api/cases/:id/hints', async (req, res) => {
  try {
    const game = await findGame(req, res);
    if (!game) return;

    if (game.accused) {
      return res.status(400).json({
        success: false,
        message: 'The investigation is already complete.',
      });
    }

    if (game.hintsUsed >= game.hints.length) {
      return res.status(400).json({
        success: false,
        message: 'No hints remain.',
      });
    }

    const hint = game.hints[game.hintsUsed];

    game.hintsUsed += 1;
    game.score = Math.max(0, game.score - 10);

    await saveGame(game);

    res.json({
      success: true,
      message: 'Hint revealed. -10 points.',
      hint,
      case: publicCase(game),
    });
  } catch (error) {
    console.error('Getting hint failed:', getErrorMessage(error));
    res.status(500).json({
      success: false,
      message: 'Could not retrieve the hint.',
    });
  }
});

// Submit a final accusation and reveal the solution
app.post('/api/cases/:id/accuse', async (req, res) => {
  try {
    const game = await findGame(req, res);
    if (!game) return;

    if (game.accused) {
      return res.status(400).json({
        success: false,
        message: 'You have already submitted your accusation.',
      });
    }

    const suspectId = req.body?.suspectId;

    if (!suspectId) {
      return res.status(400).json({
        success: false,
        message: 'Select a suspect before submitting your accusation.',
      });
    }

    const suspect = game.suspects.find((item) => item.id === suspectId);

    if (!suspect) {
      return res.status(400).json({
        success: false,
        message: 'That suspect does not belong to this mystery.',
      });
    }

    game.accused = true;
    game.accusedSuspectId = suspect.id;
    game.accusationCorrect =
      suspect.name.toLowerCase() === game.culpritName.toLowerCase();

    await saveGame(game);

    const result = buildResult(game);

    res.json({
      success: true,
      message: game.accusationCorrect
        ? 'Correct accusation! Case solved.'
        : 'Incorrect accusation. Review the solution below.',
      result,
    });
  } catch (error) {
    console.error('Submitting accusation failed:', getErrorMessage(error));
    res.status(500).json({
      success: false,
      message: 'Could not submit the accusation.',
    });
  }
});

function buildResult(game) {
  const accusedSuspect = game.suspects.find(
    (suspect) => suspect.id === game.accusedSuspectId
  );

  return {
    correct: game.accusationCorrect,
    accusedSuspect: accusedSuspect?.name ?? null,
    culpritName: game.culpritName,
    solution: game.solution,
    score: game.score,
    maxScore:
      difficultySettings[game.difficulty].baseScore + game.clues.length * 5,
    discoveredClues: game.discoveredClueIds.length,
    totalClues: game.clues.length,
    hintsUsed: game.hintsUsed,
  };
}

// Results cannot be retrieved before an accusation
app.get('/api/cases/:id/result', async (req, res) => {
  try {
    const game = await findGame(req, res);
    if (!game) return;

    if (!game.accused) {
      return res.status(403).json({
        success: false,
        message: 'Submit an accusation before viewing the solution.',
      });
    }

    res.json({ success: true, result: buildResult(game) });
  } catch (error) {
    console.error('Loading result failed:', getErrorMessage(error));
    res.status(500).json({
      success: false,
      message: 'Could not load the result.',
    });
  }
});

// Unknown endpoint
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'API endpoint not found.',
  });
});

// Malformed JSON and other middleware errors
app.use((error, req, res, next) => {
  if (error instanceof SyntaxError && 'body' in error) {
    return res.status(400).json({
      success: false,
      message: 'Invalid JSON request body.',
    });
  }

  console.error('Unexpected server error:', error);
  res.status(500).json({
    success: false,
    message: 'An unexpected server error occurred.',
  });
});

// Connect first; only start listening after MongoDB is ready.
async function startServer() {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI is missing from server environment variables.');
    }

    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
    });

    console.log('MongoDB connected successfully.');
    console.log(`Database: ${mongoose.connection.name}`);

    app.listen(PORT, () => {
      console.log(`Server listening on port ${PORT}`);
      console.log(`Gemini configured: ${Boolean(ai)}`);
      console.log('Allowed frontend origins:', allowedOrigins);
    });
  } catch (error) {
    console.error('Server startup failed:', getErrorMessage(error));
    process.exit(1);
  }
}

startServer();
