/**
 * The feedback tool (docs/FEEDBACK-LOOP.md, step 1) shows for a signed-in account with feedback.give, on a device where
 * Settings → Account → Feedback button is on. Reports go to the API, which saves them for an admin to review.
 *
 * Only an account kept on the device asks the API (GET /me, to pick up roles an admin changed): a player who never
 * signed in sends no request. The tool itself (FeedbackOn.tsx) is a chunk of its own, kept out of the main bundle that
 * every player's first load waits for.
 */
import { lazy, Suspense } from 'react';
import { useAccount } from '../account';
import { useStore } from '../store';

const FeedbackOn = lazy(() => import('./FeedbackOn').then((m) => ({ default: m.FeedbackOn })));

export function FeedbackTool(): JSX.Element | null {
  const { state } = useStore();
  return state.account.me && state.prefs.feedbackButton ? <SignedIn /> : null;
}

function SignedIn(): JSX.Element | null {
  const account = useAccount();
  const { dispatch } = useStore();
  if (!account.can('feedback.give')) return null;
  return (
    <Suspense fallback={null}>
      <FeedbackOn onHide={() => dispatch({ type: 'prefs', patch: { feedbackButton: false } })} />
    </Suspense>
  );
}
