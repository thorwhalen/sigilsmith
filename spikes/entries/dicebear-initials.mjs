import { createAvatar } from '@dicebear/core';
import * as style from '@dicebear/initials';
export default (key) => createAvatar(style, { seed: key }).toString();
