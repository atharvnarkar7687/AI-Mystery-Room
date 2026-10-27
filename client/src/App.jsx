
import { useState } from 'react';
import axios from 'axios';
import './App.css';

const API_URL = 'https://ai-mystery-room-api-wnex.onrender.com/api';
const REQUEST_TIMEOUT = 240000;

const DEFAULT_PREMISE =
  'A priceless diamond disappears from a hotel during a party. Three guests had access to the room, and each has a suspicious alibi.';

function getRequestErrorMessage(error, action = 'complete this request') {
  if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
    return 'The request timed out. The backend or AI may be taking too long. Please try again.';
  }

  if (error.response) {
    return (
      error.response.data?.message ||
      `The server returned error ${error.response.status}. Please try again.`
    );
  }

  if (error.request) {
    return 'Could not reach the backend. Check your internet connection and make sure the API is running.';
  }

  return `Could not ${action}. ${error.message || 'Please try again.'}`;
}

function App() {
  const [premise, setPremise] = useState(DEFAULT_PREMISE);
  const [difficulty, setDifficulty] = useState('Easy');
  const [loading, setLoading] = useState(false);
  const [busyAction, setBusyAction] = useState('');
  const [message, setMessage] = useState('');
  const [caseData, setCaseData] = useState(null);
  const [selectedSuspect, setSelectedSuspect] = useState('');
  const [revealedHints, setRevealedHints] = useState([]);
  const [result, setResult] = useState(null);

  const handleCreateMystery = async (event) => {
    event.preventDefault();

    if (premise.trim().length < 10) {
      setMessage('Please describe your mystery in at least 10 characters.');
      return;
    }

    setLoading(true);
    setMessage('');
    setCaseData(null);
    setResult(null);
    setRevealedHints([]);
    setSelectedSuspect('');

    try {
      const response = await axios.post(
        `${API_URL}/cases`,
        {
          premise: premise.trim(),
          difficulty,
        },
        { timeout: REQUEST_TIMEOUT }
      );

      setCaseData(response.data.case);
      setMessage(response.data.message || 'Mystery generated successfully!');
    } catch (error) {
      console.error('Mystery generation failed:', {
        message: error.message,
        code: error.code,
        status: error.response?.status,
        response: error.response?.data,
      });

      setMessage(getRequestErrorMessage(error, 'generate the mystery'));
    } finally {
      setLoading(false);
    }
  };

  const handleDiscoverClue = async (clue) => {
    if (!caseData || busyAction || clue.discovered || caseData.accused) {
      return;
    }

    setBusyAction(clue.id);
    setMessage('');

    try {
      const response = await axios.post(
        `${API_URL}/cases/${caseData.id}/clues/${clue.id}/discover`,
        {},
        { timeout: 30000 }
      );

      setCaseData(response.data.case);
      setMessage(response.data.message);
    } catch (error) {
      console.error('Discovering clue failed:', error);
      setMessage(getRequestErrorMessage(error, 'discover this clue'));
    } finally {
      setBusyAction('');
    }
  };

  const handleGetHint = async () => {
    if (!caseData || busyAction || caseData.accused) return;

    setBusyAction('hint');
    setMessage('');

    try {
      const response = await axios.post(
        `${API_URL}/cases/${caseData.id}/hints`,
        {},
        { timeout: 30000 }
      );

      setRevealedHints((previous) => [
        ...previous,
        response.data.hint,
      ]);

      setCaseData(response.data.case);
      setMessage(response.data.message);
    } catch (error) {
      console.error('Getting hint failed:', error);
      setMessage(getRequestErrorMessage(error, 'retrieve a hint'));
    } finally {
      setBusyAction('');
    }
  };

  const handleAccusation = async (event) => {
    event.preventDefault();

    if (!selectedSuspect) {
      setMessage('Select a suspect before submitting your accusation.');
      return;
    }

    if (!caseData || busyAction) return;

    const confirmed = window.confirm(
      'Are you ready to submit your final accusation?'
    );

    if (!confirmed) return;

    setBusyAction('accusation');
    setMessage('');

    try {
      const response = await axios.post(
        `${API_URL}/cases/${caseData.id}/accuse`,
        { suspectId: selectedSuspect },
        { timeout: 30000 }
      );

      setResult(response.data.result);
      setCaseData((previous) => ({
        ...previous,
        accused: true,
      }));
      setMessage(response.data.message);
    } catch (error) {
      console.error('Submitting accusation failed:', error);
      setMessage(getRequestErrorMessage(error, 'submit your accusation'));
    } finally {
      setBusyAction('');
    }
  };

  const startNewMystery = () => {
    setCaseData(null);
    setResult(null);
    setRevealedHints([]);
    setSelectedSuspect('');
    setMessage('');
  };

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="mb-2 text-sm font-semibold uppercase tracking-[0.3em] text-cyan-400">
              AI-powered detective experience
            </p>
            <h1 className="text-3xl font-black sm:text-5xl">
              AI Mystery Room
            </h1>
            <p className="mt-2 text-slate-400">
              Investigate the evidence. Follow the clues. Solve the case.
            </p>
          </div>

          {caseData && (
            <button
              type="button"
              onClick={startNewMystery}
              className="rounded-xl border border-slate-700 px-4 py-3 font-semibold transition hover:border-cyan-400 hover:text-cyan-300"
            >
              + New Mystery
            </button>
          )}
        </header>

        {message && (
          <div
            role="status"
            aria-live="polite"
            className="mb-6 rounded-xl border border-cyan-900 bg-cyan-950/50 p-4 text-cyan-100"
          >
            {message}
          </div>
        )}

        {!caseData && (
          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl sm:p-8">
            <h2 className="mb-2 text-2xl font-bold">Create your mystery</h2>
            <p className="mb-6 text-slate-400">
              Describe a crime or mysterious event. AI will create a case for
              you to investigate.
            </p>

            <form onSubmit={handleCreateMystery} className="space-y-5">
              <div>
                <label
                  htmlFor="premise"
                  className="mb-2 block font-semibold"
                >
                  Mystery premise
                </label>
                <textarea
                  id="premise"
                  value={premise}
                  onChange={(event) => setPremise(event.target.value)}
                  minLength={10}
                  maxLength={1000}
                  required
                  rows={5}
                  placeholder="Describe a mysterious event..."
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 p-4 outline-none transition focus:border-cyan-400"
                />
                <p className="mt-1 text-right text-sm text-slate-500">
                  {premise.length}/1000
                </p>
              </div>

              <div>
                <label
                  htmlFor="difficulty"
                  className="mb-2 block font-semibold"
                >
                  Difficulty
                </label>
                <select
                  id="difficulty"
                  value={difficulty}
                  onChange={(event) => setDifficulty(event.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 p-4 outline-none focus:border-cyan-400"
                >
                  <option value="Easy">Easy — 3 suspects, 5 clues</option>
                  <option value="Medium">Medium — 4 suspects, 7 clues</option>
                  <option value="Hard">Hard — 5 suspects, 9 clues</option>
                </select>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-cyan-400 px-5 py-4 font-bold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? 'Generating Mystery...' : 'Generate Mystery'}
              </button>

              {loading && (
                <p className="text-sm text-slate-400" role="status">
                  Connecting to the AI detective engine. Generating your
                  mystery may take a little while, especially when the
                  backend is waking up. Keep this page open.
                </p>
              )}
            </form>
          </section>
        )}

        {caseData && (
          <div className="space-y-6">
            <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6 sm:p-8">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <span className="rounded-full border border-cyan-800 bg-cyan-950 px-3 py-1 text-sm font-semibold text-cyan-300">
                  {caseData.difficulty} difficulty
                </span>
                <span className="text-lg font-bold text-amber-300">
                  Score: {caseData.score}
                </span>
              </div>

              <h2 className="text-2xl font-black sm:text-3xl">
                {caseData.title}
              </h2>
              <p className="mt-4 leading-7 text-slate-300">
                {caseData.story}
              </p>

              <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="Suspects" value={caseData.suspects.length} />
                <Stat
                  label="Clues found"
                  value={`${caseData.discoveredClueIds.length}/${caseData.clues.length}`}
                />
                <Stat label="Hints left" value={caseData.hintsAvailable} />
                <Stat label="Hints used" value={caseData.hintsUsed} />
              </div>
            </section>

            <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
              <h2 className="mb-5 text-2xl font-bold">Evidence board</h2>
              <p className="mb-5 text-slate-400">
                Investigate each piece of evidence. Every new clue earns 5
                points.
              </p>

              <div className="grid gap-4 sm:grid-cols-2">
                {caseData.clues.map((clue, index) => (
                  <article
                    key={clue.id}
                    className="rounded-xl border border-slate-700 bg-slate-950 p-5"
                  >
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <h3 className="font-bold">
                        {index + 1}. {clue.title}
                      </h3>
                      <span className="shrink-0 text-xs text-slate-500">
                        {clue.discovered ? 'FOUND' : 'UNKNOWN'}
                      </span>
                    </div>

                    {clue.discovered ? (
                      <p className="leading-6 text-slate-300">
                        {clue.description}
                      </p>
                    ) : (
                      <p className="mb-4 text-slate-500">
                        This evidence has not been examined yet.
                      </p>
                    )}

                    {!clue.discovered && !caseData.accused && (
                      <button
                        type="button"
                        disabled={Boolean(busyAction)}
                        onClick={() => handleDiscoverClue(clue)}
                        className="mt-2 rounded-lg bg-cyan-400 px-4 py-2 font-semibold text-slate-950 hover:bg-cyan-300 disabled:opacity-50"
                      >
                        {busyAction === clue.id
                          ? 'Investigating...'
                          : 'Investigate clue (+5)'}
                      </button>
                    )}
                  </article>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-bold">Request a hint</h2>
                  <p className="mt-2 text-slate-400">
                    A hint may point you in the right direction, but costs 10
                    points.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={
                    Boolean(busyAction) ||
                    caseData.hintsAvailable <= 0 ||
                    caseData.accused
                  }
                  onClick={handleGetHint}
                  className="rounded-xl border border-amber-500 px-5 py-3 font-bold text-amber-300 hover:bg-amber-950 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {busyAction === 'hint'
                    ? 'Getting hint...'
                    : `Get Hint (-10) · ${caseData.hintsAvailable} left`}
                </button>
              </div>

              {revealedHints.length > 0 && (
                <div className="mt-5 space-y-3">
                  {revealedHints.map((hint, index) => (
                    <div
                      key={`${index}-${hint}`}
                      className="rounded-xl border border-amber-900 bg-amber-950/40 p-4"
                    >
                      <p className="mb-1 text-sm font-bold text-amber-300">
                        Hint {index + 1}
                      </p>
                      <p className="text-slate-200">{hint}</p>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {!caseData.accused && !result && (
              <section className="rounded-2xl border border-rose-900/70 bg-slate-900 p-6">
                <h2 className="text-2xl font-bold">Make your accusation</h2>
                <p className="mb-5 mt-2 text-slate-400">
                  Review the evidence carefully. Once submitted, your
                  accusation is final.
                </p>

                <form onSubmit={handleAccusation} className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    {caseData.suspects.map((suspect) => (
                      <label
                        key={suspect.id}
                        className={`cursor-pointer rounded-xl border p-4 transition ${
                          selectedSuspect === suspect.id
                            ? 'border-rose-400 bg-rose-950/40'
                            : 'border-slate-700 bg-slate-950 hover:border-slate-500'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <input
                            type="radio"
                            name="suspect"
                            value={suspect.id}
                            checked={selectedSuspect === suspect.id}
                            onChange={(event) =>
                              setSelectedSuspect(event.target.value)
                            }
                            className="accent-rose-400"
                          />
                          <span className="font-bold">{suspect.name}</span>
                        </div>

                        <p className="mt-3 text-sm leading-6 text-slate-400">
                          {suspect.description}
                        </p>
                        <p className="mt-3 text-sm leading-6">
                          <span className="font-semibold text-cyan-300">
                            Alibi:
                          </span>{' '}
                          {suspect.alibi}
                        </p>
                        <p className="mt-2 text-sm leading-6">
                          <span className="font-semibold text-amber-300">
                            Motive:
                          </span>{' '}
                          {suspect.motive}
                        </p>
                      </label>
                    ))}
                  </div>

                  <button
                    type="submit"
                    disabled={Boolean(busyAction)}
                    className="w-full rounded-xl bg-rose-500 px-5 py-4 font-bold text-white transition hover:bg-rose-400 disabled:opacity-50"
                  >
                    {busyAction === 'accusation'
                      ? 'Submitting accusation...'
                      : 'Submit Final Accusation'}
                  </button>
                </form>
              </section>
            )}

            {result && (
              <section
                aria-live="polite"
                className="rounded-2xl border border-cyan-800 bg-slate-900 p-6 sm:p-8"
              >
                <p className="mb-2 text-sm font-bold uppercase tracking-widest text-cyan-300">
                  Case results
                </p>

                <h2 className="text-3xl font-black">
                  {result.correct ? 'Case Solved!' : 'Case Closed'}
                </h2>

                <p className="mt-4 text-lg">
                  Your accusation: <strong>{result.accusedSuspect}</strong>
                </p>

                <p className="mt-2 text-lg">
                  The culprit was:{' '}
                  <strong className="text-rose-300">
                    {result.culpritName}
                  </strong>
                </p>

                <div className="mt-5 grid grid-cols-2 gap-3">
                  <Stat label="Final score" value={result.score} />
                  <Stat
                    label="Clues discovered"
                    value={`${result.discoveredClues}/${result.totalClues}`}
                  />
                </div>

                <div className="mt-6 rounded-xl bg-slate-950 p-5">
                  <h3 className="mb-2 text-lg font-bold">The solution</h3>
                  <p className="leading-7 text-slate-300">
                    {result.solution}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={startNewMystery}
                  className="mt-6 w-full rounded-xl bg-cyan-400 px-5 py-4 font-bold text-slate-950 hover:bg-cyan-300"
                >
                  Play Another Mystery
                </button>
              </section>
            )}
          </div>
        )}

        <footer className="mt-10 pb-4 text-center text-sm text-slate-600">
          AI Mystery Room · Every clue matters.
        </footer>
      </div>
    </main>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-black text-cyan-300">{value}</p>
    </div>
  );
}

export default App;
