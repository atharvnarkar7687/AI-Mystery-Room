
const mongoose = require('mongoose');

const caseSchema = new mongoose.Schema(
  {
    // Preserve the existing UUID used by your API routes.
    gameId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    title: String,
    premise: String,
    story: String,
    difficulty: {
      type: String,
      enum: ['easy', 'medium', 'hard', 'Easy', 'Medium', 'Hard'],
    },

    // Keep generated data flexible while preserving its structure.
    suspects: {
      type: mongoose.Schema.Types.Mixed,
      default: [],
    },
    clues: {
      type: mongoose.Schema.Types.Mixed,
      default: [],
    },
    hints: {
      type: mongoose.Schema.Types.Mixed,
      default: [],
    },

    hintsAvailable: Number,
    score: Number,
    baseScore: Number,

    // These fields must only be revealed by the backend
    // after the player submits an accusation.
    culpritName: String,
    solution: String,

    accused: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    result: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  {
    timestamps: true,
    strict: false,
  }
);

module.exports =
  mongoose.models.Case ||
  mongoose.model('Case', caseSchema);
