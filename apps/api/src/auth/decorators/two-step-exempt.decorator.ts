import { SetMetadata } from '@nestjs/common';

export const TWO_STEP_EXEMPT_KEY = 'twoStepExempt';

/**
 * Open to a member of a workspace that requires two-step verification before
 * they have set it up: what they need to see that, set it up, or switch away.
 */
export const TwoStepExempt = () => SetMetadata(TWO_STEP_EXEMPT_KEY, true);
