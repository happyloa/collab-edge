export { BoardRoom } from '../worker/durable-objects/BoardRoom';
export { AuthRateLimiter } from '../worker/durable-objects/AuthRateLimiter';
export default {
  fetch() {
    return new Response('Test worker');
  },
};
