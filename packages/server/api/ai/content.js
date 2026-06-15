function extractTextContent(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((item) => {
      if (typeof item === 'string') return item;
      if (item?.type === 'text') return item.text || '';
      if (typeof item?.text === 'string') return item.text;
      if (typeof item?.content === 'string') return item.content;
      if (typeof item?.value === 'string') return item.value;
      return '';
    })
    .join('\n');
}

function firstTextValue(candidates, options = {}) {
  const preserveWhitespace = options.preserveWhitespace === true;
  for (const candidate of candidates) {
    const text = extractTextContent(candidate);
    if (preserveWhitespace) {
      if (text.length > 0) return text;
    } else if (text.trim()) {
      return text.trim();
    }
  }
  return '';
}

module.exports = {
  extractTextContent,
  firstTextValue
};
