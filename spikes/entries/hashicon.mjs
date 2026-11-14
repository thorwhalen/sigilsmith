// Needs a canvas (HTMLCanvasElement); size measured, not rendered in Node.
import { hashicon } from '@emeraldpay/hashicon';
export default (key) => hashicon(key, 64).toDataURL();
