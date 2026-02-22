'use strict';

const SHORT_WORDS = [
  'innovation', 'teamwork', 'growth', 'learning', 'creativity',
  'leadership', 'collaboration', 'resilience', 'empathy', 'focus',
  'strategy', 'design', 'research', 'data', 'quality',
  'community', 'education', 'technology', 'science', 'progress'
];

function generateAnswer(question) {
  const type = question.question_type;

  if (type === 'multiple_choice') {
    const options = typeof question.options === 'string'
      ? JSON.parse(question.options)
      : question.options;
    if (!options || options.length === 0) return 'A';
    return options[Math.floor(Math.random() * options.length)];
  }

  if (type === 'true_false') {
    return Math.random() < 0.5 ? 'True' : 'False';
  }

  if (type === 'numeric') {
    return String(Math.floor(Math.random() * 100) + 1);
  }

  // short_answer
  const word1 = SHORT_WORDS[Math.floor(Math.random() * SHORT_WORDS.length)];
  const word2 = SHORT_WORDS[Math.floor(Math.random() * SHORT_WORDS.length)];
  return `${word1} ${word2}`;
}

// Log-normal think time: median ~4s, range roughly 1-30s
function thinkTimeMs() {
  const mu = Math.log(4000);
  const sigma = 0.6;
  // Box-Muller transform for normal distribution
  const u1 = Math.random();
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  const ms = Math.exp(mu + sigma * z);
  return Math.max(1000, Math.min(30000, ms));
}

module.exports = { generateAnswer, thinkTimeMs };
