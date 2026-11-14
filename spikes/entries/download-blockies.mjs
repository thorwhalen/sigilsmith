// Needs a canvas: real integration is createIcon(...).toDataURL(). Host provides a DOM shim in Node.
import { createIcon } from '@download/blockies';
export default (key) => createIcon({ seed: key, scale: 8 }).toDataURL();
