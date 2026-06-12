const extractSection = (text, startMarker, endMarker) => {
  if (!text) return "";
  const regex = new RegExp(`${startMarker}([\\s\\S]*?)${endMarker}`);
  const match = text.match(regex);
  return match ? match[1].trim() : text.trim();
};

const text = `some text here
===PRE_PODCAST_START===
pre content
===PRE_PODCAST_END===
===POST_PODCAST_START===
post content
===POST_PODCAST_END===
`;

console.log("pre:", extractSection(text, "===PRE_PODCAST_START===", "===PRE_PODCAST_END==="));
console.log("post:", extractSection(text, "===POST_PODCAST_START===", "===POST_PODCAST_END==="));

const textNoMatch = "i did not include the markers";
console.log("no match pre:", extractSection(textNoMatch, "===PRE_PODCAST_START===", "===PRE_PODCAST_END==="));
