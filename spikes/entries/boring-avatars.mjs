// React element factory; react is external (renderToStaticMarkup is done by the host).
import { createElement } from 'react';
import Avatar from 'boring-avatars';
export default (key) => createElement(Avatar, { name: key, size: 64, variant: 'beam' });
