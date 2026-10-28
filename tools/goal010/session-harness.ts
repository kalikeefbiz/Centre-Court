// Vite source fixture only. Never a production entry or shipped mutation API.
import { lifecycle } from '../../src/main';
Object.assign(window, {
  sessionHarness: {
    finish(won = true) {
      const match = lifecycle.session?.match;
      if (!match) throw new Error('No session');
      // Use the existing scoring rules; shorten only test duration.
      for (let i = 0; i < 100 && match.score.winner === null; i++) match.score.award(won ? 0 : 1);
      match.phase = 'result';
    },
  },
});
