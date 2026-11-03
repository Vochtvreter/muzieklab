/** The badge icon of each achievement (App design canvas, Progress, Achievements); a locked badge shows `lock`. */
import type { AchievementId } from '../../game/storage';
import type { IconName } from '../components/Icon';

export const ACHIEVEMENT_ICONS: Record<AchievementId, IconName> = {
  streak7: 'calendarCheck',
  perfectBar: 'target',
  noReplays: 'speakerCheck',
  firstSixteenths: 'sixteenths',
  tempo160: 'gauge',
};
