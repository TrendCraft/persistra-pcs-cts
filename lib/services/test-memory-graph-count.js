const fs = require('fs');
const path = require('path');

const filePath = path.resolve(__dirname, '../../data/leo_memory_graph.jsonl');

let count = 0;
let errorCount = 0;

const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
let leftover = '';

stream.on('data', chunk => {
  let lines = (leftover + chunk).split('\n');
  leftover = lines.pop(); // Save last partial line
  for (const line of lines) {
    if (line.trim()) {
      try {
        JSON.parse(line);
        count++;
      } catch (e) {
        errorCount++;
      }
    }
  }
});

stream.on('end', () => {
  if (leftover.trim()) {
    try {
      JSON.parse(leftover);
      count++;
    } catch (e) {
      errorCount++;
    }
  }
  console.log('Total memory objects:', count);
  if (errorCount > 0) {
    console.log('Lines with JSON parse errors:', errorCount);
  }
});

stream.on('error', err => {
  console.error('Error reading file:', err);
});
