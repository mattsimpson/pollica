'use strict';

const FIRST_NAMES = [
  'Emma', 'Liam', 'Olivia', 'Noah', 'Ava', 'James', 'Sophia', 'Lucas',
  'Mia', 'Ethan', 'Isabella', 'Mason', 'Luna', 'Logan', 'Harper', 'Alex',
  'Ella', 'Jack', 'Aria', 'Owen', 'Chloe', 'Leo', 'Riley', 'Ben', 'Zoe',
  'Sam', 'Lily', 'Max', 'Grace', 'Kai', 'Nora', 'Finn', 'Hazel', 'Cole',
  'Ivy', 'Jake', 'Ruby', 'Ryan', 'Maya', 'Adam', 'Leah', 'Sean', 'Eva',
  'Tyler', 'Jade', 'Dylan', 'Iris', 'Caleb', 'Sara', 'Theo'
];

function generateName(index) {
  const name = FIRST_NAMES[index % FIRST_NAMES.length];
  const suffix = Math.floor(index / FIRST_NAMES.length);
  return suffix === 0 ? name : `${name}${suffix + 1}`;
}

module.exports = { generateName };
