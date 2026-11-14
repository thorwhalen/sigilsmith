import { createAvatar } from '@dicebear/core';
import * as style from '@dicebear/shapes';
export default (key) => createAvatar(style, { seed: key }).toString();
