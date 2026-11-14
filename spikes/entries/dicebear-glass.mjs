import { createAvatar } from '@dicebear/core';
import * as style from '@dicebear/glass';
export default (key) => createAvatar(style, { seed: key }).toString();
