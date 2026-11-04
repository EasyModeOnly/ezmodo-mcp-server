/**
 * Review feedback on a task (E-302 #3444).
 *
 * When a reviewer sends a task back, the API moves it to in_progress and
 * stores the feedback as a knowledge item of type `context` tagged
 * `review-feedback`, with the reviewer as author (#3440). That contract was set
 * by the plugin's resume (#3445). The API writes the tag into `tagIds`; `tags`
 * is accepted too, since the review payload names the same field that way.
 */

export const REVIEW_FEEDBACK_TAG = 'review-feedback';

function isReviewFeedback(item) {
  if (!item || typeof item !== 'object') return false;
  const tags = [
    ...(Array.isArray(item.tagIds) ? item.tagIds : []),
    ...(Array.isArray(item.tags) ? item.tags : []),
  ];
  return tags.includes(REVIEW_FEEDBACK_TAG);
}

function timeOf(item) {
  const ms = Date.parse(item.addedAt);
  return Number.isNaN(ms) ? -Infinity : ms;
}

/**
 * The newest review-feedback item in a task's knowledge, as
 * `{content, addedBy, addedAt}`, or null when there is none. On equal (or
 * missing) timestamps the later item in the list wins, since knowledge is
 * appended.
 */
export function latestReviewFeedback(knowledge) {
  if (!Array.isArray(knowledge)) return null;
  let newest = null;
  for (const item of knowledge) {
    if (!isReviewFeedback(item)) continue;
    if (!newest || timeOf(item) >= timeOf(newest)) newest = item;
  }
  if (!newest) return null;
  return {
    content: newest.content,
    addedBy: newest.addedBy ?? null,
    addedAt: newest.addedAt ?? null,
  };
}

/** The first non-empty line of a note, whatever shape its content has. */
export function firstLine(content) {
  if (content === undefined || content === null) return '';
  const text = typeof content === 'string' ? content : JSON.stringify(content);
  const line = text.split('\n').find((l) => l.trim() !== '');
  return line ? line.trim() : '';
}
