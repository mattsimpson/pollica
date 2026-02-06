import React, { useMemo, useState } from 'react';
import { Text } from '@visx/text';
import { scaleLog } from '@visx/scale';
import Wordcloud from '@visx/wordcloud/lib/Wordcloud';

const colors = ['#667eea', '#764ba2', '#8b5cf6', '#7c3aed', '#6d28d9', '#5b21b6'];

function WordCloud({ responses, width = 500, height = 400 }) {
  const [hoveredWord, setHoveredWord] = useState(null);

  const words = useMemo(() => {
    if (!responses || responses.length === 0) {
      return [];
    }

    // Count word frequencies from all responses
    const wordCounts = {};

    responses.forEach(response => {
      if (!response.answer_text) return;

      // Split into words, filter out common words, and count
      const text = response.answer_text.toLowerCase();
      const wordsArray = text.split(/\s+/);

      // Common stop words to exclude
      const stopWords = new Set([
        'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
        'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
        'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
        'could', 'should', 'may', 'might', 'can', 'i', 'you', 'he', 'she',
        'it', 'we', 'they', 'this', 'that', 'these', 'those', 'am', 'my',
        'your', 'his', 'her', 'its', 'our', 'their'
      ]);

      wordsArray.forEach(word => {
        // Remove punctuation and trim
        const cleaned = word.replace(/[^\w]/g, '').trim();

        // Skip empty, short, or stop words
        if (cleaned.length > 2 && !stopWords.has(cleaned)) {
          wordCounts[cleaned] = (wordCounts[cleaned] || 0) + 1;
        }
      });
    });

    // Convert to array format for word cloud
    return Object.entries(wordCounts).map(([text, value]) => ({
      text,
      value
    }));
  }, [responses]);

  const fontScale = useMemo(() => {
    const values = words.map(w => w.value);
    const min = Math.min(...values, 1);
    const max = Math.max(...values, 1);
    return scaleLog({
      domain: [min, max],
      range: [14, 60]
    });
  }, [words]);

  const fontSizeSetter = (datum) => fontScale(datum.value);

  if (words.length === 0) {
    return (
      <div style={{
        textAlign: 'center',
        padding: '3rem',
        color: '#6b7280',
        border: '2px dashed #e5e7eb',
        borderRadius: '0.5rem',
        backgroundColor: '#f9fafb'
      }}>
        <p>No responses yet. Word cloud will appear as students submit answers.</p>
      </div>
    );
  }

  return (
    <div style={{
      width: '100%',
      border: '1px solid #e5e7eb',
      borderRadius: '0.5rem',
      backgroundColor: 'white',
      padding: '1rem',
      position: 'relative'
    }}>
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
        <Wordcloud
          words={words}
          width={width}
          height={height}
          fontSize={fontSizeSetter}
          font="system-ui, -apple-system, sans-serif"
          fontWeight="bold"
          padding={2}
          spiral="archimedean"
          rotate={() => (Math.random() > 0.5 ? 0 : 90)}
          random={() => 0.5}
        >
          {(cloudWords) =>
            cloudWords.map((w, i) => (
              <Text
                key={w.text}
                fill={colors[i % colors.length]}
                textAnchor="middle"
                transform={`translate(${w.x}, ${w.y}) rotate(${w.rotate})`}
                fontSize={w.size}
                fontFamily={w.font}
                fontWeight={w.weight}
                style={{
                  cursor: 'pointer',
                  transition: 'opacity 0.2s',
                  opacity: hoveredWord && hoveredWord !== w.text ? 0.5 : 1
                }}
                onMouseEnter={() => setHoveredWord(w.text)}
                onMouseLeave={() => setHoveredWord(null)}
              >
                {w.text}
              </Text>
            ))
          }
        </Wordcloud>
      </svg>
      {hoveredWord && (
        <div style={{
          position: 'absolute',
          bottom: '1rem',
          left: '50%',
          transform: 'translateX(-50%)',
          background: '#1f2937',
          color: 'white',
          padding: '0.5rem 1rem',
          borderRadius: '0.375rem',
          fontSize: '0.875rem'
        }}>
          {hoveredWord}: {words.find(w => w.text === hoveredWord)?.value || 0} occurrences
        </div>
      )}
    </div>
  );
}

export default WordCloud;
